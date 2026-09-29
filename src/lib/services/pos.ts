import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../db";
import { parsePosPdf, type PosDoc } from "../parsers/fulfillment";
import type { PlanCourse } from "../parsers/common";
import { STORAGE_ROOT } from "./ingest";
import { audit } from "./audit";

export class PosError extends Error {}

export interface PosDraftItem {
  key: string; // "BS-SE-2026|MINORITIES"
  posCode: string;
  program: string;
  year: number;
  variant: string;
  courses: PlanCourse[];
  totalRequired: number | null;
  sum: number;
  status: "NEW" | "IDENTICAL" | "CHANGED";
  existingId?: number;
  studentsAssigned: number;
  diff: string[]; // human-readable differences vs the stored version
  problems: string[]; // block importing this item
  warnings: string[];
}
export interface PosDraft {
  id: string;
  createdBy: number;
  fileName: string;
  items: PosDraftItem[];
}

const UUID = /^[0-9a-f-]{36}$/;
const dir = () => path.join(STORAGE_ROOT, "pos-drafts");
const sig = (c: PlanCourse) => `${c.semester}|${c.code}|${c.title.toLowerCase()}|${c.ch}`;

export async function buildPosDraft(opts: { createdBy: number; fileName: string; buffer: Buffer }): Promise<PosDraft> {
  if (opts.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") throw new PosError("That isn't a PDF file.");
  if (opts.buffer.length > 15e6) throw new PosError("PDF too large (15 MB max).");
  let docs: PosDoc[];
  try {
    docs = await parsePosPdf(opts.buffer);
  } catch (e) {
    throw new PosError(`The PDF could not be read: ${(e as Error).message}`);
  }
  if (!docs.length) throw new PosError("No Plan of Study pages were recognised. Each page should start with the program name and a POS code such as BS-SE-2026, followed by “Semester 1” tables.");

  const items: PosDraftItem[] = [];
  const seen = new Set<string>();
  for (const d of docs) {
    const key = `${d.posCode}|${d.variant}`;
    const problems: string[] = [];
    const warnings: string[] = [];
    if (seen.has(key)) problems.push("This PDF contains the same POS code and variant more than once.");
    seen.add(key);
    const sum = d.courses.reduce((a, c) => a + c.ch, 0);
    if (!d.courses.length) problems.push("No courses were extracted.");
    if (d.totalRequired == null) warnings.push("The stated total credit hours was not found on the page, so the total could not be cross-checked.");
    else if (d.totalRequired !== sum) problems.push(`Extracted courses add up to ${sum} CH but the document states ${d.totalRequired} CH — extraction is incomplete or the document is inconsistent.`);
    const sems = [...new Set(d.courses.map((c) => c.semester))];
    for (const [sem, stated] of Object.entries(d.semesterTotals)) {
      const got = d.courses.filter((c) => c.semester === Number(sem)).reduce((a, c) => a + c.ch, 0);
      if (got !== stated) problems.push(`Semester ${sem}: extracted courses add up to ${got} CH but the document prints a total of ${stated} CH — courses may be filed under the wrong semester.`);
    }
    if (sems.length !== 8) warnings.push(`${sems.length} semesters found (expected 8).`);
    const codes = d.courses.filter((c) => !c.isPlaceholder).map((c) => c.code);
    const dup = codes.filter((c, i) => codes.indexOf(c) !== i);
    if (dup.length) warnings.push(`Duplicate course codes: ${[...new Set(dup)].join(", ")}`);
    for (const s of sems) {
      const load = d.courses.filter((c) => c.semester === s).reduce((a, c) => a + c.ch, 0);
      if (load > 21) warnings.push(`Semester ${s} has ${load} CH (above the 21 CH ceiling).`);
    }

    const existing = await db.pos.findUnique({ where: { posCode_variant: { posCode: d.posCode, variant: d.variant } }, include: { courses: true, _count: { select: { students: true } } } });
    let status: PosDraftItem["status"] = "NEW";
    const diff: string[] = [];
    if (existing) {
      const a = new Set(existing.courses.map(sig)), b = new Set(d.courses.map(sig));
      for (const c of d.courses) if (!a.has(sig(c))) diff.push(`+ semester ${c.semester}: ${c.code} ${c.title} (${c.ch} CH)`);
      for (const c of existing.courses) if (!b.has(sig(c))) diff.push(`− semester ${c.semester}: ${c.code} ${c.title} (${c.ch} CH)`);
      status = diff.length ? "CHANGED" : "IDENTICAL";
      if (status === "CHANGED" && existing._count.students > 0) problems.push(`Already in use by ${existing._count.students} student(s) — it can't be overwritten. Import it under a new POS code/version instead.`);
    }
    items.push({ key, posCode: d.posCode, program: d.program, year: d.year, variant: d.variant, courses: d.courses, totalRequired: d.totalRequired, sum, status, existingId: existing?.id, studentsAssigned: existing?._count.students ?? 0, diff, problems, warnings });
  }
  const draft: PosDraft = { id: randomUUID(), createdBy: opts.createdBy, fileName: opts.fileName.slice(0, 120), items };
  await mkdir(dir(), { recursive: true });
  await writeFile(path.join(dir(), `${draft.id}.json`), JSON.stringify(draft));
  return draft;
}

export async function loadPosDraft(id: string): Promise<PosDraft | null> {
  if (!UUID.test(id)) return null;
  try {
    return JSON.parse(await readFile(path.join(dir(), `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

/** Import the selected items. Nothing becomes assignable to students until it is published. */
export async function applyPosDraft(draft: PosDraft, opts: { keys: string[]; publish: boolean; userId: number }) {
  const chosen = draft.items.filter((i) => opts.keys.includes(i.key));
  if (!chosen.length) throw new PosError("Select at least one Plan of Study to import.");
  const stats = { created: 0, replaced: 0, skipped: 0 };
  await db.$transaction(async (tx) => {
    for (const i of chosen) {
      if (i.problems.length) throw new PosError(`${i.posCode} (${i.variant.toLowerCase()}) has problems that must be resolved first.`);
      if (i.status === "IDENTICAL") { stats.skipped++; continue; }
      const rows = i.courses.map((c, seq) => ({ seq, semester: c.semester, code: c.code, title: c.title, ch: c.ch, isPlaceholder: c.isPlaceholder }));
      if (i.status === "NEW") {
        const pos = await tx.pos.create({ data: { posCode: i.posCode, program: i.program, year: i.year, variant: i.variant, totalRequired: i.sum, published: opts.publish } });
        await tx.posCourse.createMany({ data: rows.map((r) => ({ ...r, posId: pos.id })) });
        stats.created++;
      } else {
        const inUse = await tx.student.count({ where: { posId: i.existingId! } }); // re-check at apply time
        if (inUse) throw new PosError(`${i.posCode} is now in use by ${inUse} student(s) and can't be overwritten.`);
        await tx.posCourse.deleteMany({ where: { posId: i.existingId! } });
        await tx.posCourse.createMany({ data: rows.map((r) => ({ ...r, posId: i.existingId! })) });
        await tx.pos.update({ where: { id: i.existingId! }, data: { totalRequired: i.sum, ...(opts.publish ? { published: true } : {}) } });
        stats.replaced++;
      }
    }
  });
  await audit({ userId: opts.userId, action: "POS_IMPORTED", reason: `${draft.fileName}: ${chosen.map((i) => `${i.posCode} ${i.variant.toLowerCase()} (${i.status.toLowerCase()})`).join("; ")}`, after: { ...stats, published: opts.publish } });
  return stats;
}

export async function setPosPublished(userId: number, posId: number, publish: boolean) {
  const pos = await db.pos.findUnique({ where: { id: posId }, include: { _count: { select: { students: true } } } });
  if (!pos) throw new PosError("Plan of Study not found");
  if (pos.published === publish) return pos;
  if (!publish && pos._count.students > 0) throw new PosError(`${pos._count.students} student(s) use this Plan of Study, so it can't be unpublished.`);
  await db.pos.update({ where: { id: posId }, data: { published: publish } });
  await audit({ userId, action: publish ? "POS_PUBLISHED" : "POS_UNPUBLISHED", reason: `${pos.posCode} ${pos.variant.toLowerCase()}` });
  return pos;
}
