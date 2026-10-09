"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { saveSetting } from "@/lib/settings";
import { redirect } from "next/navigation";
import { SemesterError, openRegistrations, openSemester } from "@/lib/services/semesters";
import { RosterError, applyRosterDraft, buildRosterDraft, loadRosterDraft } from "@/lib/services/roster";
import { PosError, applyPosDraft, buildPosDraft, loadPosDraft, setPosPublished } from "@/lib/services/pos";
import { audit } from "@/lib/services/audit";
import { setElectiveCourse } from "@/lib/services/electives";
import { validateRule } from "@/lib/services/prerequisites";
import { applyOfferingDraft, buildOfferingDraft, loadOfferingDraft, refreshIssues } from "@/lib/services/offerings";
import type { Settings } from "@/lib/rules/types";

const NUMERIC: (keyof Settings)[] = ["fypThresholdCH", "minLoadCH", "regularMaxCH", "overloadMaxCH", "summerMaxCH", "minPassGradePoint"];
const NULLABLE: (keyof Settings)[] = ["probationMaxCH", "relegationMaxCH", "finalSemesterMaxCH"];

export async function saveSettingsAction(_: { ok?: string; error?: string } | undefined, form: FormData) {
  const s = await requireRole("ADMIN");
  const out: Partial<Record<keyof Settings, number | null>> = {};
  for (const k of NUMERIC) {
    const v = Number(form.get(k));
    if (!Number.isFinite(v) || v < 0 || v > 200) return { error: `${k}: enter a valid number` };
    out[k] = v;
  }
  for (const k of NULLABLE) {
    const raw = String(form.get(k) ?? "").trim();
    if (raw === "") out[k] = null;
    else {
      const v = Number(raw);
      if (!Number.isFinite(v) || v < 0 || v > 30) return { error: `${k}: enter a number or leave blank (not configured)` };
      out[k] = v;
    }
  }
  if ((out.minLoadCH as number) > (out.regularMaxCH as number) || (out.regularMaxCH as number) > (out.overloadMaxCH as number)) return { error: "Limits must satisfy minimum ≤ regular max ≤ overload max" };
  const before = Object.fromEntries((await db.setting.findMany()).map((r) => [r.key, JSON.parse(r.value)]));
  for (const [k, v] of Object.entries(out)) await saveSetting(k as keyof Settings, v as number | null);
  await audit({ userId: s.userId, action: "SETTINGS_CHANGED", before, after: out });
  revalidatePath("/admin");
  return { ok: "Settings saved." };
}

export async function fixOfferingAction(form: FormData) {
  const s = await requireRole("ADMIN");
  const id = Number(form.get("id"));
  const cba = String(form.get("cbaCode") ?? "").trim();
  const section = String(form.get("section") ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (cba && !/^\d{4,8}$/.test(cba)) return;
  if (section && !/^[A-Z]{2,4}-\d[A-Z]$/.test(section)) return;
  const o = await db.offering.findUnique({ where: { id } });
  if (!o) return;
  await db.offering.update({ where: { id }, data: { cbaCode: cba || null, section: section || null } });
  await refreshIssues(o.semesterId);
  await audit({ userId: s.userId, action: "OFFERING_EDITED", before: { cba: o.cbaCode, section: o.section }, after: { cba: cba || null, section: section || null }, reason: `${o.courseCode} ${o.courseName}` });
  revalidatePath("/admin");
}

export async function setPhaseAction(_: { ok?: string; error?: string } | undefined, form: FormData) {
  const s = await requireRole("ADMIN");
  const phase = String(form.get("phase"));
  if (!["SETUP", "REGISTRATION", "ADD_DROP", "CLOSED"].includes(phase)) return { error: "Unknown phase" };
  const endsRaw = String(form.get("addDropEnds") ?? "");
  const ends = phase === "ADD_DROP" && endsRaw ? new Date(endsRaw + "T23:59:59") : null;
  if (ends && Number.isNaN(ends.getTime())) return { error: "Invalid end date" };
  const sem = await db.semester.findFirst({ where: { active: true } });
  if (!sem) return { error: "No active semester" };
  await db.semester.update({ where: { id: sem.id }, data: { phase, addDropEnds: ends } });
  await audit({ userId: s.userId, action: "SEMESTER_PHASE_CHANGED", before: { phase: sem.phase, ends: sem.addDropEnds }, after: { phase, ends }, reason: sem.name });
  revalidatePath("/", "layout");
  return { ok: `${sem.name} is now in the ${phase.replace("_", " / ").toLowerCase()} phase.` };
}

export async function uploadOfferingsAction(_: { error?: string } | undefined, form: FormData) {
  const s = await requireRole("ADMIN");
  const f = form.get("workbook");
  if (!(f instanceof File) || !f.size) return { error: "Choose the course offering workbook (.xlsx)." };
  if (!/\.xlsx$/i.test(f.name)) return { error: "The file must be an .xlsx workbook." };
  let id: string;
  try {
    const draft = await buildOfferingDraft({ createdBy: s.userId, fileName: f.name, buffer: Buffer.from(await f.arrayBuffer()) });
    id = draft.id;
    await audit({ userId: s.userId, action: "OFFERINGS_UPLOADED", reason: `${draft.fileName}: +${draft.diff.added.length} ~${draft.diff.updated.length} -${draft.diff.missing.length}` });
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect(`/admin/offerings/${id}`);
}

export async function applyOfferingsAction(_: { error?: string } | undefined, form: FormData) {
  const s = await requireRole("ADMIN");
  const draft = await loadOfferingDraft(String(form.get("draftId") ?? ""));
  if (!draft || draft.createdBy !== s.userId) return { error: "This upload has expired — upload the workbook again." };
  try {
    const stats = await applyOfferingDraft(draft, { removeMissing: form.get("removeMissing") === "on" });
    await audit({ userId: s.userId, action: "OFFERINGS_APPLIED", reason: `${draft.fileName}: ${JSON.stringify(stats)}`, after: draft.diff.registeredChanges.length ? { registeredChanges: draft.diff.registeredChanges } : undefined });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/admin");
  redirect("/admin?offerings=applied");
}

export async function openSemesterAction(_: { ok?: string; error?: string } | undefined, form: FormData) {
  const s = await requireRole("ADMIN");
  try {
    const sem = await openSemester(s, String(form.get("name") ?? ""), { force: form.get("force") === "on" });
    revalidatePath("/", "layout");
    return { ok: `${sem.name} is open. Upload its course offerings to start suggestions.` };
  } catch (e) {
    if (e instanceof SemesterError) return { error: e.message };
    throw e;
  }
}

export async function openRegistrationsAction(): Promise<{ ok?: string; error?: string }> {
  const s = await requireRole("ADMIN");
  try {
    const r = await openRegistrations(s);
    revalidatePath("/", "layout");
    return { ok: `Registrations for ${r.semester} are open.${r.incomplete ? ` Note: ${r.incomplete} offering row(s) still lack a CBA code or section, so those courses can't be finalized yet.` : ""}` };
  } catch (e) {
    if (e instanceof SemesterError) return { error: e.message };
    throw e;
  }
}

export async function uploadPosAction(_: { error?: string } | undefined, form: FormData) {
  const s = await requireRole("ADMIN");
  const f = form.get("pdf");
  if (!(f instanceof File) || !f.size) return { error: "Choose a Plan of Study PDF." };
  if (!/\.pdf$/i.test(f.name)) return { error: "The file must be a PDF." };
  let id: string;
  try {
    const draft = await buildPosDraft({ createdBy: s.userId, fileName: f.name, buffer: Buffer.from(await f.arrayBuffer()) });
    id = draft.id;
    await audit({ userId: s.userId, action: "POS_UPLOADED", reason: `${draft.fileName}: ${draft.items.length} variant(s)` });
  } catch (e) {
    if (e instanceof PosError) return { error: e.message };
    throw e;
  }
  redirect(`/admin/pos/review/${id}`);
}

export async function applyPosAction(_: { error?: string } | undefined, form: FormData) {
  const s = await requireRole("ADMIN");
  const draft = await loadPosDraft(String(form.get("draftId") ?? ""));
  if (!draft || draft.createdBy !== s.userId) return { error: "This upload has expired — upload the PDF again." };
  try {
    await applyPosDraft(draft, { keys: form.getAll("key").map(String), publish: form.get("publish") === "on", userId: s.userId });
  } catch (e) {
    if (e instanceof PosError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/pos");
  redirect("/admin/pos?imported=1");
}

export async function setPosPublishedAction(posId: number, publish: boolean): Promise<{ ok?: string; error?: string }> {
  const s = await requireRole("ADMIN");
  try {
    await setPosPublished(s.userId, posId, publish);
  } catch (e) {
    if (e instanceof PosError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/pos");
  return { ok: publish ? "Published — it can now be assigned to students." : "Unpublished." };
}

export async function uploadRosterAction(_: { error?: string } | undefined, form: FormData) {
  const s = await requireRole("ADMIN");
  const files = form.getAll("pdfs").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Choose one or more Award List PDFs." };
  let id: string;
  try {
    const draft = await buildRosterDraft({ createdBy: s.userId, files: await Promise.all(files.map(async (f) => ({ name: f.name, buffer: Buffer.from(await f.arrayBuffer()) }))) });
    id = draft.id;
    await audit({ userId: s.userId, action: "ROSTER_UPLOADED", reason: `${files.length} file(s), ${draft.items.filter((i) => !i.problem).length} readable` });
  } catch (e) {
    if (e instanceof RosterError) return { error: e.message };
    throw e;
  }
  redirect(`/admin/rosters/review/${id}`);
}

export async function applyRosterAction(_: { error?: string } | undefined, form: FormData) {
  const s = await requireRole("ADMIN");
  const draft = await loadRosterDraft(String(form.get("draftId") ?? ""));
  if (!draft || draft.createdBy !== s.userId) return { error: "This upload has expired — upload the files again." };
  try {
    await applyRosterDraft(draft, s.userId);
  } catch (e) {
    if (e instanceof RosterError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/rosters");
  redirect("/admin/rosters?imported=1");
}

export async function setElectiveAction(form: FormData) {
  const s = await requireRole("ADMIN");
  const posCode = String(form.get("posCode") ?? "");
  const category = String(form.get("category") ?? "");
  const slot = Number(form.get("slot"));
  const title = String(form.get("courseTitle") ?? "").trim().slice(0, 120);
  if (!/^BS-[A-Z]+-\d{4}$/.test(posCode) || (category !== "UNIVERSITY" && category !== "DOMAIN") || !Number.isInteger(slot) || slot < 1 || slot > 12) return;
  const before = await db.electiveMapping.findUnique({ where: { posCode_category_slot: { posCode, category, slot } } });
  await setElectiveCourse(posCode, category, slot, title || null);
  await audit({ userId: s.userId, action: "ELECTIVE_MAPPING_CHANGED", before: { course: before?.courseTitle ?? null }, after: { course: title || null }, reason: `${posCode} ${category} elective ${slot}` });
  revalidatePath("/admin/electives");
}

type PrereqResult = { ok?: string; error?: string } | undefined;

export async function addPrerequisiteAction(_: PrereqResult, form: FormData): Promise<PrereqResult> {
  const s = await requireRole("ADMIN");
  const v = await validateRule(String(form.get("course") ?? "").trim(), String(form.get("prerequisite") ?? "").trim());
  if ("error" in v) return { error: v.error };
  await db.prerequisite.create({ data: { course: v.course, prerequisite: v.prerequisite, rule: "Must Pass" } });
  await audit({ userId: s.userId, action: "PREREQUISITE_ADDED", after: { course: v.course, prerequisite: v.prerequisite } });
  revalidatePath("/admin/prerequisites");
  return { ok: `Added: ${v.course} needs ${v.prerequisite}.` };
}

export async function updatePrerequisiteAction(_: PrereqResult, form: FormData): Promise<PrereqResult> {
  const s = await requireRole("ADMIN");
  const id = Number(form.get("id"));
  const cur = await db.prerequisite.findUnique({ where: { id } });
  if (!cur) return { error: "That rule no longer exists." };
  const v = await validateRule(cur.course, String(form.get("prerequisite") ?? "").trim(), id);
  if ("error" in v) return { error: v.error };
  if (v.prerequisite === cur.prerequisite) return { ok: "No change." };
  await db.prerequisite.update({ where: { id }, data: { prerequisite: v.prerequisite } });
  await audit({ userId: s.userId, action: "PREREQUISITE_CHANGED", before: { course: cur.course, prerequisite: cur.prerequisite }, after: { course: cur.course, prerequisite: v.prerequisite } });
  revalidatePath("/admin/prerequisites");
  return { ok: `${cur.course} now needs ${v.prerequisite}.` };
}

export async function removePrerequisiteAction(form: FormData) {
  const s = await requireRole("ADMIN");
  const id = Number(form.get("id"));
  const cur = await db.prerequisite.findUnique({ where: { id } });
  if (!cur) return;
  await db.prerequisite.delete({ where: { id } });
  await audit({ userId: s.userId, action: "PREREQUISITE_REMOVED", before: { course: cur.course, prerequisite: cur.prerequisite } });
  revalidatePath("/admin/prerequisites");
}
