import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../db";
import { parseFulfillmentPdf, type FulfillmentReport } from "../parsers/fulfillment";
import { parseTranscriptPdf, type Transcript } from "../parsers/transcript";
import type { PosVariant } from "../parsers/common";
import { findUnmatchedAttempts } from "../rules/engine";
import { getSettings } from "../settings";

const ROOT = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.join(process.cwd(), "storage");
export const STORAGE_ROOT = ROOT;
const UUID = /^[0-9a-f-]{36}$/;

export interface Draft {
  id: string;
  /** User who uploaded it; only they (or an Admin) may view / confirm it. */
  createdBy: number;
  enteredRegId: string | null;
  homeSection: string | null;
  existingStudentId: number | null;
  transcript: Transcript;
  fulfillment: FulfillmentReport;
  posId: number | null;
  /** Blocking problems — profile can't be created until re-uploaded / fixed. */
  conflicts: string[];
  /** Non-blocking notes shown for verification. */
  warnings: string[];
  /** Possible problems READING the documents (not about the student). When present the advisor must tick that the table was checked. */
  readingIssues: string[];
}

const PDF_MAGIC = "%PDF-";
const isPdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === PDF_MAGIC;

/** Unconfirmed uploads contain personal data — delete any older than a day. */
async function purgeStaleDrafts() {
  const dir = path.join(ROOT, "drafts");
  try {
    for (const name of await readdir(dir)) {
      if (!UUID.test(name)) continue;
      const st = await stat(path.join(dir, name));
      if (Date.now() - st.mtimeMs > 24 * 3600 * 1000) await rm(path.join(dir, name), { recursive: true, force: true });
    }
  } catch {
    /* no drafts dir yet */
  }
}

export async function createDraft(opts: { createdBy: number; transcript: Buffer; fulfillment: Buffer; enteredRegId?: string; homeSection?: string; existingStudentId?: number }): Promise<Draft> {
  if (!isPdf(opts.transcript) || !isPdf(opts.fulfillment)) throw new Error("Both uploads must be PDF files.");
  if (opts.transcript.length > 10e6 || opts.fulfillment.length > 10e6) throw new Error("PDF too large (10 MB max).");

  let transcript: Transcript, fulfillment: FulfillmentReport;
  try {
    transcript = await parseTranscriptPdf(opts.transcript);
  } catch (e) {
    throw new Error(`Interim Transcript could not be read: ${(e as Error).message}`);
  }
  try {
    fulfillment = await parseFulfillmentPdf(opts.fulfillment);
  } catch (e) {
    throw new Error(`POS Fulfillment Report could not be read: ${(e as Error).message}`);
  }

  const entered = opts.enteredRegId?.trim().toUpperCase() || null;
  const conflicts: string[] = [];
  const warnings: string[] = [];
  const readingIssues: string[] = [...transcript.warnings, ...fulfillment.warnings];

  if (entered && entered !== transcript.registrationId) conflicts.push(`Entered Registration ID ${entered} ≠ transcript ${transcript.registrationId}`);
  if (transcript.registrationId !== fulfillment.registrationId) conflicts.push(`Transcript Registration ID ${transcript.registrationId} ≠ fulfillment report ${fulfillment.registrationId}`);
  if (transcript.program !== fulfillment.program) conflicts.push(`Transcript program ${transcript.program} ≠ fulfillment report program ${fulfillment.program}`);
  if (transcript.name.toLowerCase() !== fulfillment.name.toLowerCase()) warnings.push(`Name differs: "${transcript.name}" (transcript) vs "${fulfillment.name}" (fulfillment)`);
  if (transcript.completedCH != null && fulfillment.completedCH != null && transcript.completedCH !== fulfillment.completedCH)
    conflicts.push(`Completed CH differs: transcript ${transcript.completedCH} vs fulfillment ${fulfillment.completedCH}`);

  let existingStudentId = opts.existingStudentId ?? null;
  const existing = await db.student.findUnique({ where: { registrationId: transcript.registrationId } });
  if (opts.existingStudentId && existing?.id !== opts.existingStudentId) conflicts.push(`Documents belong to ${transcript.registrationId}, not the selected student`);
  if (existing?.archivedAt) conflicts.push(`Student ${existing.registrationId} is archived — an Admin must restore the profile first`);
  if (!opts.existingStudentId && existing) {
    existingStudentId = existing.id;
    warnings.push(`Student ${existing.registrationId} already exists — this upload will create a new academic snapshot.`);
  }

  const pos = await db.pos.findUnique({ where: { posCode_variant: { posCode: fulfillment.pos.posCode, variant: fulfillment.pos.variant } } });
  if (!pos) conflicts.push(`Unknown POS ${fulfillment.pos.posCode} (${fulfillment.pos.variant}) — Admin review required`);
  else if (!pos.published) conflicts.push(`POS ${pos.posCode} (${pos.variant}) is not published`);
  else if (pos.totalRequired !== fulfillment.pos.totalRequired) warnings.push(`Fulfillment report POS totals ${fulfillment.pos.totalRequired} CH but stored POS has ${pos.totalRequired} CH`);

  // Cross-check: every transcript course should correspond to something in this student's Plan of Study (or be a free elective).
  // Courses that match nothing point to a misread transcript or a wrong POS.
  if (pos) {
    const posRows = await db.posCourse.findMany({ where: { posId: pos.id }, orderBy: [{ semester: "asc" }, { seq: "asc" }] });
    const unmatched = findUnmatchedAttempts(
      { registrationId: transcript.registrationId, program: transcript.program, posVariant: pos.variant as PosVariant, homeSection: null, standing: "NORMAL", pos: posRows.map((c) => ({ semester: c.semester, code: c.code, title: c.title, ch: c.ch, isPlaceholder: c.isPlaceholder })), attempts: transcript.courses },
      await getSettings(),
    );
    if (unmatched.length)
      readingIssues.push(`${unmatched.length} transcript course(s) match nothing in ${pos.posCode} (${pos.variant.replaceAll("_", " ").toLowerCase()}): ${unmatched.slice(0, 6).map((a) => `${a.code} "${a.title.slice(0, 32)}"`).join(", ")}${unmatched.length > 6 ? ", …" : ""}. Check that this is the right Plan of Study and that the transcript was read correctly.`);
  }

  await purgeStaleDrafts();
  const id = randomUUID();
  const dir = path.join(ROOT, "drafts", id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "transcript.pdf"), opts.transcript);
  await writeFile(path.join(dir, "fulfillment.pdf"), opts.fulfillment);
  const draft: Draft = { id, createdBy: opts.createdBy, enteredRegId: entered, homeSection: opts.homeSection?.trim().toUpperCase() || null, existingStudentId, transcript, fulfillment, posId: pos?.id ?? null, conflicts, warnings, readingIssues };
  await writeFile(path.join(dir, "draft.json"), JSON.stringify(draft));
  return draft;
}

export async function loadDraft(id: string): Promise<Draft | null> {
  if (!UUID.test(id)) return null;
  try {
    return JSON.parse(await readFile(path.join(ROOT, "drafts", id, "draft.json"), "utf8"));
  } catch {
    return null;
  }
}

/** Move a confirmed draft's PDFs into permanent, per-student storage. Returns relative file paths. */
export async function archiveDraft(draft: Draft, regId: string): Promise<{ transcriptFile: string; fulfillmentFile: string }> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rel = path.join("students", regId, stamp);
  await mkdir(path.join(ROOT, rel), { recursive: true });
  await rename(path.join(ROOT, "drafts", draft.id, "transcript.pdf"), path.join(ROOT, rel, "transcript.pdf"));
  await rename(path.join(ROOT, "drafts", draft.id, "fulfillment.pdf"), path.join(ROOT, rel, "fulfillment.pdf"));
  return { transcriptFile: path.join(rel, "transcript.pdf"), fulfillmentFile: path.join(rel, "fulfillment.pdf") };
}
