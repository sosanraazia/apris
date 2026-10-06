"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { advisorForBatch } from "@/lib/services/batches";
import { requireRole } from "@/lib/auth";
import { archiveDraft, createDraft, loadDraft } from "@/lib/services/ingest";
import { assertStudentAccess } from "@/lib/services/registration";
import { audit } from "@/lib/services/audit";
import { studentEmail } from "@/lib/studentEmail";

const SECTION = /^[A-Z]{2,4}-\d[A-Z]$/;

export async function uploadDocumentsAction(_: { error?: string } | undefined, form: FormData) {
  const s = await requireRole("ADVISOR", "ADMIN");
  const t = form.get("transcript"), f = form.get("fulfillment");
  if (!(t instanceof File) || !(f instanceof File) || !t.size || !f.size) return { error: "Please upload both PDFs." };
  const existingId = form.get("studentId") ? Number(form.get("studentId")) : undefined;
  let id: string;
  try {
    if (existingId) await assertStudentAccess(s, existingId); // advisors may only update their own advisees
    const draft = await createDraft({
      createdBy: s.userId,
      transcript: Buffer.from(await t.arrayBuffer()),
      fulfillment: Buffer.from(await f.arrayBuffer()),
      existingStudentId: existingId,
    });
    id = draft.id;
    await audit({ userId: s.userId, action: "DOCUMENTS_UPLOADED", studentRegId: draft.transcript.registrationId, after: { conflicts: draft.conflicts.length } });
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect(`/students/verify/${id}`);
}

export async function confirmProfileAction(_: { error?: string } | undefined, form: FormData) {
  const s = await requireRole("ADVISOR", "ADMIN");
  const draft = await loadDraft(String(form.get("draftId") ?? ""));
  if (!draft || (draft.createdBy !== s.userId && s.role !== "ADMIN")) return { error: "This upload has expired — please upload the documents again." };
  if (draft.conflicts.length || !draft.posId) return { error: "Document conflicts must be resolved before creating the profile." };
  if (draft.readingIssues?.length && form.get("ack") !== "on") return { error: "Please tick the box to confirm you checked the extracted course table against the PDF." };
  const homeRaw = String(form.get("homeSection") ?? "").trim().toUpperCase();
  if (homeRaw && !SECTION.test(homeRaw)) return { error: "Home section must look like SE-3A (or leave it blank to set later)." };
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Student name is required." };
  const father = String(form.get("fatherName") ?? "").trim() || null;

  const { transcript: t, fulfillment: f } = draft;
  const regId = t.registrationId;
  const existing = await db.student.findUnique({ where: { registrationId: regId } });
  // an advisor can't take over or overwrite a student who belongs to someone else
  if (existing && s.role === "ADVISOR" && existing.advisorId !== s.userId && existing.advisorId !== null) return { error: "This student is assigned to another advisor." };
  const files = await archiveDraft(draft, regId);
  const email = studentEmail(regId); // <RegistrationID>@dsu.edu.pk — never typed by anyone
  const batchOwner = s.role === "ADVISOR" ? null : await advisorForBatch(regId); // an Admin adding a student: the advisor of that batch gets them
  const home = homeRaw || existing?.homeSection || null; // blank → keep the current section, or leave unset for new students

  const student = existing
    ? await db.student.update({ where: { id: existing.id }, data: { name, fatherName: father, homeSection: home, posId: draft.posId, admission: t.admission, email, ...(existing.advisorId === null ? (s.role === "ADVISOR" ? { advisorId: s.userId } : (batchOwner ? { advisorId: batchOwner } : {})) : {}) } })
    : await db.student.create({ data: { registrationId: regId, name, fatherName: father, program: t.program, admission: t.admission, homeSection: home, posId: draft.posId, advisorId: s.role === "ADVISOR" ? s.userId : batchOwner, email } });

  await db.snapshot.updateMany({ where: { studentId: student.id, active: true }, data: { active: false } });
  const completedCH = t.completedCH ?? f.completedCH ?? 0;
  const snap = await db.snapshot.create({
    data: {
      studentId: student.id, verifiedById: s.userId, cgpa: t.cgpa, completedCH, requiredCH: t.requiredCH ?? f.requiredCH, homeSection: home,
      courses: JSON.stringify(t.courses), terms: JSON.stringify(t.terms), warnings: JSON.stringify(draft.readingIssues ?? [...t.warnings, ...f.warnings]),
      transcriptFile: files.transcriptFile, fulfillmentFile: files.fulfillmentFile,
    },
  });
  await audit({
    userId: s.userId, action: existing ? "SNAPSHOT_CREATED" : "STUDENT_CREATED", studentRegId: regId,
    before: existing ? { homeSection: existing.homeSection, posId: existing.posId } : undefined,
    after: { homeSection: home, posId: draft.posId, snapshotId: snap.id, completedCH },
  });
  redirect(`/students/${student.id}`);
}
