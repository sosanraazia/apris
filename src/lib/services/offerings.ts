import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../db";
import { parseOfferingWorkbook, type OfferingImport } from "../importers";
import { normTitle } from "../parsers/common";
import { STORAGE_ROOT } from "./ingest";

export const offeringKey = (r: { courseCode: string; section: string | null; courseName: string }) => `${r.courseCode}|${r.section ?? ""}|${normTitle(r.courseName)}`;

type Row = OfferingImport["rows"][number];
export interface OfferingDiff {
  added: Row[];
  updated: { id: number; row: Row; changes: string[] }[];
  unchanged: number;
  missing: { id: number; courseCode: string; courseName: string; section: string | null; inUse: boolean }[]; // in the system, not in the upload
  /** Offerings already used by a registration whose CBA / section would change. */
  registeredChanges: string[];
}
export interface OfferingDraft {
  id: string;
  createdBy: number;
  semesterId: number;
  semesterName: string;
  fileName: string;
  rows: Row[];
  notes: string[];
  normalizedCount: number;
  diff: OfferingDiff;
}

const UUID = /^[0-9a-f-]{36}$/;
const dir = () => path.join(STORAGE_ROOT, "offering-drafts");

/** Re-derive duplicate-CBA flags for a semester after any change; keeps import-time notes. */
export async function refreshIssues(semesterId: number) {
  const rows = await db.offering.findMany({ where: { semesterId } });
  const byCba = new Map<string, typeof rows>();
  for (const r of rows.filter((x) => x.active)) if (r.cbaCode) byCba.set(r.cbaCode, [...(byCba.get(r.cbaCode) ?? []), r]);
  for (const r of rows) {
    const keep = (JSON.parse(r.issues) as string[]).filter((i) => !i.startsWith("Duplicate CBA"));
    const group = r.active && r.cbaCode ? byCba.get(r.cbaCode)! : [];
    if (new Set(group.map((x) => x.courseCode + "|" + x.section)).size > 1) keep.push(`Duplicate CBA ${r.cbaCode} shared by ${group.map((x) => `${x.courseCode}/${x.section}`).join(", ")}`);
    if (JSON.stringify(keep) !== r.issues) await db.offering.update({ where: { id: r.id }, data: { issues: JSON.stringify(keep) } });
  }
}

export async function buildOfferingDraft(opts: { createdBy: number; fileName: string; buffer: Buffer }): Promise<OfferingDraft> {
  if (opts.buffer.subarray(0, 2).toString("latin1") !== "PK") throw new Error("That isn't an .xlsx workbook.");
  if (opts.buffer.length > 5e6) throw new Error("Workbook too large (5 MB max).");
  let imp: OfferingImport;
  try {
    imp = await parseOfferingWorkbook(opts.buffer);
  } catch {
    throw new Error("The workbook could not be read. Expected sheets like SE-3 / CYS-5 with columns: CBA Code, Course Code, Class & Section, Course Name.");
  }
  if (!imp.rows.length) throw new Error("No course rows found in the workbook.");
  const sem = await db.semester.findFirst({ where: { active: true } });
  if (!sem) throw new Error("No active semester.");

  const existing = await db.offering.findMany({ where: { semesterId: sem.id } });
  const used = new Set((await db.registrationItem.findMany({ select: { offeringId: true } })).map((i) => i.offeringId));
  const byKey = new Map(existing.map((e) => [offeringKey(e), e]));
  const seen = new Set<string>();
  const diff: OfferingDiff = { added: [], updated: [], unchanged: 0, missing: [], registeredChanges: [] };

  for (const row of imp.rows) {
    const key = offeringKey(row);
    const cur = byKey.get(key);
    if (!cur) { diff.added.push(row); continue; }
    seen.add(key);
    const changes: string[] = [];
    const newCba = row.cbaCode ?? cur.cbaCode; // a blank cell never erases a CBA an Admin entered by hand
    const newSection = row.section ?? cur.section;
    if (newCba !== cur.cbaCode) changes.push(`CBA ${cur.cbaCode ?? "—"} → ${newCba}`);
    if (newSection !== cur.section) changes.push(`section ${cur.section ?? "—"} → ${newSection}`);
    if (!cur.active) changes.push("re-activated");
    if (!changes.length) diff.unchanged++;
    else {
      diff.updated.push({ id: cur.id, row, changes });
      if (used.has(cur.id) && (newCba !== cur.cbaCode || newSection !== cur.section)) diff.registeredChanges.push(`${cur.courseCode} ${cur.section ?? ""}: ${changes.join(", ")}`);
    }
  }
  for (const e of existing) if (e.active && !seen.has(offeringKey(e))) diff.missing.push({ id: e.id, courseCode: e.courseCode, courseName: e.courseName, section: e.section, inUse: used.has(e.id) });

  const draft: OfferingDraft = { id: randomUUID(), createdBy: opts.createdBy, semesterId: sem.id, semesterName: sem.name, fileName: opts.fileName.slice(0, 120), rows: imp.rows, notes: imp.notes, normalizedCount: imp.normalizedCount, diff };
  await mkdir(dir(), { recursive: true });
  await writeFile(path.join(dir(), `${draft.id}.json`), JSON.stringify(draft));
  return draft;
}

export async function loadOfferingDraft(id: string): Promise<OfferingDraft | null> {
  if (!UUID.test(id)) return null;
  try {
    return JSON.parse(await readFile(path.join(dir(), `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

/** Apply a reviewed upload. Registrations keep working: rows are updated in place, and rows dropped from the file are
 *  deactivated (not deleted) if any registration uses them. */
export async function applyOfferingDraft(draft: OfferingDraft, opts: { removeMissing: boolean }) {
  const sem = await db.semester.findFirst({ where: { active: true } });
  if (!sem || sem.id !== draft.semesterId) throw new Error("The active semester changed since this upload — upload again.");
  const stats = { added: 0, updated: 0, deactivated: 0, deleted: 0 };
  const rows = new Map(draft.rows.map((r) => [offeringKey(r), r]));

  await db.$transaction(async (tx) => {
    for (const u of draft.diff.updated) {
      const cur = await tx.offering.findUnique({ where: { id: u.id } });
      if (!cur) continue;
      await tx.offering.update({ where: { id: u.id }, data: { cbaCode: u.row.cbaCode ?? cur.cbaCode, section: u.row.section ?? cur.section, active: true, issues: JSON.stringify(u.row.issues), preMedOnly: u.row.preMedOnly } });
      stats.updated++;
    }
    for (const r of draft.diff.added) {
      await tx.offering.create({ data: { semesterId: draft.semesterId, sheet: r.sheet, program: r.program, courseCode: r.courseCode, courseName: r.courseName, section: r.section, cbaCode: r.cbaCode, preMedOnly: r.preMedOnly, issues: JSON.stringify(r.issues) } });
      stats.added++;
    }
    if (opts.removeMissing) {
      for (const m of draft.diff.missing) {
        const inUse = (await tx.registrationItem.count({ where: { offeringId: m.id } })) > 0; // re-check at apply time
        if (inUse) { await tx.offering.update({ where: { id: m.id }, data: { active: false } }); stats.deactivated++; }
        else { await tx.offering.delete({ where: { id: m.id } }); stats.deleted++; }
      }
    }
  });
  void rows;
  await refreshIssues(draft.semesterId);
  return stats;
}
