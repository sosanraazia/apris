"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { RegistrationError, finalize, saveDraft, type DraftPayload } from "@/lib/services/registration";
import { assertStudentAccess } from "@/lib/services/registration";
import { audit } from "@/lib/services/audit";

type Result = { ok?: string; error?: string };

async function guard<T>(fn: () => Promise<T>): Promise<{ error: string } | T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof RegistrationError) return { error: e.message };
    throw e;
  }
}

export async function saveDraftAction(studentId: number, payload: DraftPayload): Promise<Result> {
  const s = await requireRole("ADVISOR", "ADMIN");
  const r = await guard(() => saveDraft(s, studentId, payload));
  if ("error" in r) return r;
  revalidatePath(`/students/${studentId}`);
  return { ok: `Draft saved — ${r.count} courses, ${r.total} CH.${r.warnings.length ? " Note: " + r.warnings.join(" ") : ""}` };
}

export async function finalizeAction(studentId: number, reason: string): Promise<Result> {
  const s = await requireRole("ADVISOR", "ADMIN");
  const r = await guard(() => finalize(s, studentId, reason));
  if ("error" in r) return r;
  revalidatePath(`/students/${studentId}`);
  return { ok: `Registration finalized (version ${r.version}).` };
}

const STANDINGS = ["NORMAL", "PROBATION", "RELEGATION", "FROZEN", "INACTIVE", "WITHDRAWN", "GRADUATED"];

export async function setStandingAction(studentId: number, standing: string, reason: string): Promise<Result> {
  const s = await requireRole("ADMIN");
  if (!STANDINGS.includes(standing)) return { error: "Unknown standing" };
  if (!reason.trim()) return { error: "A reason / source reference is required" };
  const st = await assertStudentAccess(s, studentId);
  await db.student.update({ where: { id: studentId }, data: { standing } });
  await audit({ userId: s.userId, action: "STANDING_CHANGED", studentRegId: st.registrationId, before: st.standing, after: standing, reason });
  revalidatePath(`/students/${studentId}`);
  return { ok: `Standing set to ${standing}.` };
}

export async function setHomeSectionAction(studentId: number, section: string): Promise<Result> {
  const s = await requireRole("ADVISOR", "ADMIN");
  const v = section.trim().toUpperCase();
  if (!/^[A-Z]{2,4}-\d[A-Z]$/.test(v)) return { error: "Section must look like SE-3A or CYS-5B" };
  const st = await assertStudentAccess(s, studentId);
  if (!v.startsWith(st.program)) return { error: `Section must belong to program ${st.program}` };
  await db.student.update({ where: { id: studentId }, data: { homeSection: v } });
  await audit({ userId: s.userId, action: "HOME_SECTION_SET", studentRegId: st.registrationId, before: st.homeSection, after: v });
  revalidatePath(`/students/${studentId}`);
  return { ok: `Home section set to ${v}.` };
}

export async function updateStudentDetailsAction(studentId: number, name: string, fatherName: string): Promise<Result> {
  const s = await requireRole("ADVISOR", "ADMIN");
  const n = name.trim();
  if (!n) return { error: "Name is required" };
  const st = await assertStudentAccess(s, studentId);
  await db.student.update({ where: { id: studentId }, data: { name: n, fatherName: fatherName.trim() || null } });
  await audit({ userId: s.userId, action: "STUDENT_DETAILS_EDITED", studentRegId: st.registrationId, before: { name: st.name, fatherName: st.fatherName }, after: { name: n, fatherName: fatherName.trim() || null } });
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
  return { ok: "Details updated. (Grades and credit hours can only change by uploading new official documents.)" };
}

export async function assignAdvisorAction(studentId: number, advisorId: number | null): Promise<Result> {
  const s = await requireRole("ADMIN");
  const st = await assertStudentAccess(s, studentId);
  if (advisorId != null) {
    const a = await db.user.findUnique({ where: { id: advisorId } });
    if (!a || a.role !== "ADVISOR" || !a.active) return { error: "Choose an active advisor" };
  }
  await db.student.update({ where: { id: studentId }, data: { advisorId } });
  await audit({ userId: s.userId, action: "ADVISOR_ASSIGNED", studentRegId: st.registrationId, before: st.advisorId, after: advisorId });
  revalidatePath(`/students/${studentId}`);
  return { ok: "Advisor updated." };
}
