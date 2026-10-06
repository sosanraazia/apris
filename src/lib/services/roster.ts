import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../db";
import { pdfPages } from "../parsers/pdfText";
import { isRegularForSection, parseAwardListLines, suggestHomeSection, type AwardList, type SectionSuggestion } from "../rosterRules";
import { audit } from "./audit";
import { STORAGE_ROOT } from "./ingest";

export class RosterError extends Error {}

export interface RosterDraftItem {
  fileName: string;
  term: string;
  program: string;
  section: string;
  courseCode: string | null;
  courseTitle: string | null;
  students: { registrationId: string; regular: boolean }[];
  regularCount: number;
  backlogCount: number;
  replaces: number; // rows already stored for this term + section
  warnings: string[];
  problem: string | null; // set when the file could not be read; the item is skipped
}
export interface RosterDraft {
  id: string;
  createdBy: number;
  items: RosterDraftItem[];
  notes: string[];
}

const UUID = /^[0-9a-f-]{36}$/;
const dir = () => path.join(STORAGE_ROOT, "roster-drafts");

/** Drafts hold Registration IDs (personal data) — delete any older than a day. */
async function purgeStale() {
  try {
    for (const f of await readdir(dir())) {
      const p = path.join(dir(), f);
      if (Date.now() - (await stat(p)).mtimeMs > 24 * 3600 * 1000) await rm(p, { force: true });
    }
  } catch {
    /* nothing to purge */
  }
}

export async function buildRosterDraft(opts: { createdBy: number; files: { name: string; buffer: Buffer }[] }): Promise<RosterDraft> {
  if (!opts.files.length) throw new RosterError("Choose at least one Award List PDF.");
  if (opts.files.length > 40) throw new RosterError("Upload at most 40 files at a time.");
  const items: RosterDraftItem[] = [];
  const lists: AwardList[] = [];

  for (const f of opts.files) {
    const base: RosterDraftItem = { fileName: f.name.slice(0, 100), term: "", program: "", section: "", courseCode: null, courseTitle: null, students: [], regularCount: 0, backlogCount: 0, replaces: 0, warnings: [], problem: null };
    try {
      if (f.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("Not a PDF file");
      if (f.buffer.length > 5e6) throw new Error("File too large (5 MB max)");
      const pages = await pdfPages(f.buffer);
      const list = parseAwardListLines(pages.flatMap((p) => p.flat));
      lists.push(list);
      const students = list.registrationIds.map((registrationId) => ({ registrationId, regular: isRegularForSection(registrationId, list.term, list.semester) }));
      const replaces = await db.sectionRoster.count({ where: { term: list.term, sourceSection: list.section, program: list.program } });
      items.push({ ...base, term: list.term, program: list.program, section: list.section, courseCode: list.courseCode, courseTitle: list.courseTitle, students, regularCount: students.filter((s) => s.regular).length, backlogCount: students.filter((s) => !s.regular).length, replaces, warnings: list.warnings });
    } catch (e) {
      items.push({ ...base, problem: (e as Error).message });
    }
  }

  const notes: string[] = [];
  const sections = lists.map((l) => `${l.term}|${l.section}`);
  const dup = sections.filter((s, i) => sections.indexOf(s) !== i);
  if (dup.length) notes.push(`More than one file for the same section: ${[...new Set(dup)].map((d) => d.replace("|", " ")).join(", ")} — the later file wins.`);
  if (new Set(lists.map((l) => l.term)).size > 1) notes.push(`These files cover more than one term (${[...new Set(lists.map((l) => l.term))].join(", ")}). That is fine, but check it is what you intended.`);
  const perTerm = new Map<string, Set<string>>(); // "ID|term" -> sections where the student is a regular member
  for (const l of lists) for (const id of l.registrationIds) if (isRegularForSection(id, l.term, l.semester)) { const k = `${id}|${l.term}`; perTerm.set(k, new Set([...(perTerm.get(k) ?? []), l.section])); }
  const clash = [...perTerm.values()].filter((v) => v.size > 1).length;
  if (clash) notes.push(`${clash} student(s) are a regular member of two sections in the same term — they will get no automatic suggestion.`);

  await purgeStale();
  const draft: RosterDraft = { id: randomUUID(), createdBy: opts.createdBy, items, notes };
  await mkdir(dir(), { recursive: true });
  await writeFile(path.join(dir(), `${draft.id}.json`), JSON.stringify(draft));
  return draft;
}

export async function loadRosterDraft(id: string): Promise<RosterDraft | null> {
  if (!UUID.test(id)) return null;
  try {
    return JSON.parse(await readFile(path.join(dir(), `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

/** Store the lists. A re-uploaded section of the same term replaces its earlier rows. The draft file is deleted afterwards. */
export async function applyRosterDraft(draft: RosterDraft, userId: number) {
  const good = draft.items.filter((i) => !i.problem);
  if (!good.length) throw new RosterError("Nothing to import: none of the files could be read.");
  const stats = { sections: 0, students: 0 };
  await db.$transaction(async (tx) => {
    for (const i of good) {
      await tx.sectionRoster.deleteMany({ where: { term: i.term, sourceSection: i.section, program: i.program } });
      await tx.sectionRoster.createMany({ data: i.students.map((s) => ({ registrationId: s.registrationId, program: i.program, term: i.term, sourceSection: i.section, regular: s.regular, courseCode: i.courseCode, uploadedById: userId })) });
      stats.sections++;
      stats.students += i.students.length;
    }
  });
  await audit({ userId, action: "ROSTER_APPLIED", reason: `${stats.sections} section list(s), ${stats.students} students: ${good.map((i) => `${i.term} ${i.section}`).join(", ")}`.slice(0, 500) });
  await rm(path.join(dir(), `${draft.id}.json`), { force: true });
  return stats;
}

/** Suggestion for a student's home section in the active semester, from the stored section lists. */
export async function suggestFor(registrationId: string, program: string): Promise<SectionSuggestion & { offered: boolean | null }> {
  const id = registrationId.trim().toUpperCase();
  const [rows, sem] = await Promise.all([db.sectionRoster.findMany({ where: { registrationId: id } }), db.semester.findFirst({ where: { active: true } })]);
  const s = suggestHomeSection(rows.map((r) => ({ term: r.term, sourceSection: r.sourceSection, regular: r.regular, program: r.program })), program, sem?.name ?? "");
  let offered: boolean | null = null;
  if (s.section && sem) {
    offered = (await db.offering.count({ where: { semesterId: sem.id, active: true, section: s.section } })) > 0;
    if (!offered) return { ...s, offered, note: `${s.note} Note: ${s.section} has no offerings in ${sem.name} — check it.` };
  }
  return { ...s, offered };
}

export async function rosterSummary() {
  const groups = await db.sectionRoster.groupBy({ by: ["term", "sourceSection", "program"], _count: { _all: true }, _max: { uploadedAt: true } });
  const regular = await db.sectionRoster.groupBy({ by: ["term", "sourceSection", "program"], where: { regular: true }, _count: { _all: true } });
  return groups
    .map((g) => ({ term: g.term, section: g.sourceSection, program: g.program, students: g._count._all, regular: regular.find((r) => r.term === g.term && r.sourceSection === g.sourceSection && r.program === g.program)?._count._all ?? 0, uploadedAt: g._max.uploadedAt }))
    .sort((a, b) => b.term.localeCompare(a.term) || a.section.localeCompare(b.section, undefined, { numeric: true }));
}
