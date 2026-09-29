import { db } from "../db";
import type { Session } from "../auth";
import { courseKey, theoryKeyOf } from "../rules/keys";
import type { RecItem } from "../rules/types";
import { audit } from "./audit";
import { canEdit, effectivePhase } from "./phase";
import { computeForStudent } from "./recommendation";

export interface DraftPayload {
  items: { offeringId: number; overrideReason?: string }[];
  removals: { code: string; reason: string }[];
  loadReason?: string;
  /** Probation / relegation are registered manually for now: one approval reference covers the whole registration. */
  manualApproval?: string;
}

export class RegistrationError extends Error {}

export async function assertStudentAccess(session: Session, studentId: number) {
  const st = await db.student.findUnique({ where: { id: studentId } });
  if (!st) throw new RegistrationError("Student not found");
  if (st.archivedAt && session.role !== "ADMIN") throw new RegistrationError("Student not found");
  if (st.archivedAt) throw new RegistrationError("This student is archived — restore the profile before changing anything");
  if (session.role === "ADVISOR" && st.advisorId !== session.userId) throw new RegistrationError("Not your advisee");
  return st;
}

async function chLookup() {
  const rows = await db.posCourse.findMany({ select: { code: true, title: true, ch: true } });
  const m = new Map<string, number>();
  for (const r of rows) m.set(courseKey(r.code, r.title), r.ch);
  return m;
}

export async function saveDraft(session: Session, studentId: number, payload: DraftPayload) {
  if (session.role === "HOD") throw new RegistrationError("HoD has read-only access");
  const st = await assertStudentAccess(session, studentId);
  const ctx = await computeForStudent(studentId);
  if (!ctx || !ctx.semester) throw new RegistrationError("No active semester or student profile is incomplete");
  const { rec, settings, semester } = ctx;
  if (!ctx.offerings.length) throw new RegistrationError(`${semester.name} has no course offerings yet — an Admin must upload them first.`);
  const phase = effectivePhase(semester);
  if (!canEdit(session.role, phase).allowed) throw new RegistrationError("Registration for this semester is closed. Ask an Admin to reopen the add/drop window.");

  // Probation / relegation: no automatic recommendation yet (limits not configured) → advisor registers manually,
  // recorded against an approval reference. This switches off automatic rules (per-course reasons, minimum load).
  const manual = ["PROBATION", "RELEGATION"].includes(st.standing) && rec.load.applicableMax == null;
  const approval = payload.manualApproval?.trim() ?? "";
  if (manual && approval.length < 3) throw new RegistrationError(`${st.standing.toLowerCase()} students are registered manually — enter the approval reference (e.g. HoD / committee decision) for this registration.`);

  const ids = [...new Set(payload.items.map((i) => i.offeringId))];
  if (ids.length !== payload.items.length) throw new RegistrationError("The same offering was selected twice");
  const offerings = await db.offering.findMany({ where: { id: { in: ids }, semesterId: semester.id, active: true } });
  if (offerings.length !== ids.length) throw new RegistrationError("One or more selected offerings are not part of the active semester");

  const chMap = await chLookup();
  const passed = new Set(ctx.progress.filter((p) => p.state === "COMPLETED").map((p) => courseKey(p.code, p.title)));
  const seenCourses = new Set<string>();
  const resolved: { offeringId: number; code: string; ch: number; reason: string; override: string | null; recommended: boolean; recItem?: RecItem }[] = [];

  for (const item of payload.items) {
    const o = offerings.find((x) => x.id === item.offeringId)!;
    const key = courseKey(o.courseCode, o.courseName);
    if (seenCourses.has(key)) throw new RegistrationError(`${o.courseName} is selected twice`);
    seenCourses.add(key);
    if (passed.has(key)) throw new RegistrationError(`${o.courseName} is already passed — it can't be registered again`);

    const recItem = rec.items.find((r) => r.choices.some((c) => c.offeringId === String(o.id)));
    const ch = recItem?.ch ?? chMap.get(key) ?? (/L$/.test(o.courseCode) ? 1 : 3);
    const standard =
      !!recItem &&
      (recItem.status === "RECOMMENDED" || recItem.status === "ELECTIVE_CHOICE") &&
      (recItem.suggested == null || recItem.suggested.offeringId === String(o.id));
    const override = item.overrideReason?.trim() || (manual ? `Manual registration (${st.standing.toLowerCase()}): ${approval}` : null);
    if (!standard && !override)
      throw new RegistrationError(`${o.courseCode} ${o.courseName}: a reason is required (${recItem ? recItem.status.replaceAll("_", " ").toLowerCase() : "not in the recommendation"}${recItem?.suggested ? " / section changed" : ""}).`);
    resolved.push({ offeringId: o.id, code: o.courseCode, ch, reason: recItem?.reason ?? "Added by advisor", override: standard ? null : override, recommended: standard, recItem });
  }

  // recommended courses the advisor dropped must be explained
  const chosenKeys = new Set(resolved.map((r) => r.recItem?.key));
  const removals: { code: string; title: string; reason: string }[] = [];
  for (const r of rec.items.filter((i) => i.status === "RECOMMENDED" && !chosenKeys.has(i.key))) {
    const reason = payload.removals.find((x) => x.code === r.code)?.reason?.trim();
    if (!reason) throw new RegistrationError(`${r.code} ${r.title} was recommended but is not selected — give a reason for leaving it out.`);
    removals.push({ code: r.code, title: r.title, reason });
  }

  // credit-hour rules (hard ceiling can't be overridden)
  const total = resolved.reduce((a, r) => a + r.ch, 0);
  if (total > settings.overloadMaxCH) throw new RegistrationError(`Total ${total} CH exceeds the absolute ${settings.overloadMaxCH} CH ceiling.`);
  const applicable = rec.load.applicableMax ?? settings.regularMaxCH;
  if (total > applicable && !payload.loadReason?.trim())
    throw new RegistrationError(`Total ${total} CH is above the ${applicable} CH limit — record the overload approval reference.`);
  if (!manual && total < settings.minLoadCH && resolved.length && !payload.loadReason?.trim())
    throw new RegistrationError(`Total ${total} CH is below the ${settings.minLoadCH} CH minimum — record the reason.`);

  // Hard rule: a lab must sit in the same section as its theory course (when both are registered together).
  const secOf = new Map(offerings.map((o) => [o.id, o] as const));
  for (const lab of resolved.filter((r) => /L$/.test(r.code))) {
    const lo = secOf.get(lab.offeringId)!;
    const theory = resolved.find((r) => !/L$/.test(r.code) && courseKey(r.code, secOf.get(r.offeringId)!.courseName) === theoryKeyOf(courseKey(lo.courseCode, lo.courseName)));
    const to = theory && secOf.get(theory.offeringId);
    if (to && to.section !== lo.section)
      throw new RegistrationError(`${to.courseName}: the lab must be in the same section as the theory course (theory is in ${to.section ?? "no section"}, lab is in ${lo.section ?? "no section"}).`);
  }
  const warnings: string[] = [];

  const labels = new Map((await db.offering.findMany({ where: { semesterId: semester.id } })).map((o) => [o.id, `${o.courseCode} ${o.courseName} [${o.section ?? "no section"} · CBA ${o.cbaCode ?? "—"}]`]));
  const label = (i: { offeringId: number }) => labels.get(i.offeringId) ?? `offering #${i.offeringId}`;
  const reg = await db.registration.upsert({
    where: { studentId_semesterId: { studentId, semesterId: semester.id } },
    create: { studentId, semesterId: semester.id },
    update: {},
  });
  const before = await db.registrationItem.findMany({ where: { registrationId: reg.id } });
  await db.$transaction([
    db.registrationItem.deleteMany({ where: { registrationId: reg.id } }),
    db.registrationItem.createMany({
      data: resolved.map((r) => ({ registrationId: reg.id, posCourseCode: r.code, offeringId: r.offeringId, recommended: r.recommended, reason: r.reason, overrideReason: r.override })),
    }),
    db.registration.update({ where: { id: reg.id }, data: { status: reg.version > 0 ? "MODIFIED" : "DRAFT", removals: JSON.stringify(removals) } }),
  ]);
  await audit({
    userId: session.userId,
    action: "REGISTRATION_DRAFT_SAVED",
    studentRegId: st.registrationId,
    before: before.map(label),
    after: resolved.map((r) => label({ offeringId: r.offeringId })),
    reason: [manual ? `MANUAL (${st.standing.toLowerCase()}) approval: ${approval}` : null, ...resolved.filter((r) => r.override && !manual).map((r) => `${r.code}: ${r.override}`), ...removals.map((r) => `removed ${r.code}: ${r.reason}`), payload.loadReason].filter(Boolean).join(" | ") || null,
  });
  return { total, count: resolved.length, warnings };
}

interface FinalItem {
  courseCode: string;
  courseName: string;
  cbaCode: string;
  section: string;
  ch: number;
}

export async function finalize(session: Session, studentId: number, changeReason?: string) {
  if (session.role === "HOD") throw new RegistrationError("HoD has read-only access");
  const st = await assertStudentAccess(session, studentId);
  const sem = await db.semester.findFirst({ where: { active: true } });
  if (!sem) throw new RegistrationError("No active semester");
  const phase = effectivePhase(sem);
  const perm = canEdit(session.role, phase);
  if (!perm.allowed) throw new RegistrationError("Registration for this semester is closed. Ask an Admin to reopen the add/drop window.");
  if (perm.late && !changeReason?.trim()) throw new RegistrationError("Registration is closed — a reason is required for a late Admin change");
  const reg = await db.registration.findUnique({ where: { studentId_semesterId: { studentId, semesterId: sem.id } }, include: { items: true, versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!reg || !reg.items.length) throw new RegistrationError("Nothing to finalize — save a draft first");

  const offs = await db.offering.findMany({ where: { id: { in: reg.items.map((i) => i.offeringId) } } });
  const chMap = await chLookup();
  const problems: string[] = [];
  const finalItems: FinalItem[] = [];
  for (const o of offs) {
    const issues = JSON.parse(o.issues) as string[];
    if (!o.cbaCode) problems.push(`${o.courseCode} (${o.section ?? "no section"}): missing CBA code`);
    if (!o.section) problems.push(`${o.courseCode}: missing section`);
    if (issues.some((i) => i.startsWith("Duplicate CBA"))) problems.push(`${o.courseCode} (${o.section}): CBA ${o.cbaCode} is duplicated in the offering sheet`);
    finalItems.push({ courseCode: o.courseCode, courseName: o.courseName, cbaCode: o.cbaCode ?? "", section: o.section ?? "", ch: chMap.get(courseKey(o.courseCode, o.courseName)) ?? 0 });
  }
  if (problems.length) throw new RegistrationError("Can't finalize — offering data is incomplete. Ask an Admin to fix: " + problems.join("; "));

  const prev: FinalItem[] = reg.versions[0] ? JSON.parse(reg.versions[0].items) : [];
  const key = (i: FinalItem) => courseKey(i.courseCode, i.courseName);
  const changes = {
    added: finalItems.filter((i) => !prev.some((p) => key(p) === key(i))).map((i) => i.courseCode),
    removed: prev.filter((p) => !finalItems.some((i) => key(i) === key(p))).map((p) => p.courseCode),
    sectionChanged: finalItems.flatMap((i) => {
      const p = prev.find((x) => key(x) === key(i));
      return p && p.section !== i.section ? [{ course: i.courseCode, from: p.section, to: i.section }] : [];
    }),
  };
  const isChange = reg.versions.length > 0;
  if (isChange && !changes.added.length && !changes.removed.length && !changes.sectionChanged.length) throw new RegistrationError("No changes since the last finalized version");
  if (isChange && !changeReason?.trim()) throw new RegistrationError("A reason is required for changes to a finalized registration");

  const version = reg.version + 1;
  await db.$transaction([
    db.registrationVersion.create({ data: { registrationId: reg.id, version, items: JSON.stringify(finalItems), changes: JSON.stringify(changes), reason: changeReason?.trim() || "Initial registration", phase: perm.late ? "LATE_ADMIN_CHANGE" : phase, userId: session.userId, notification: "DEFERRED" } }),
    db.registration.update({ where: { id: reg.id }, data: { status: "FINALIZED", version } }),
  ]);
  await audit({ userId: session.userId, action: perm.late ? "REGISTRATION_LATE_CHANGE" : phase === "ADD_DROP" ? "REGISTRATION_ADD_DROP" : "REGISTRATION_FINALIZED", studentRegId: st.registrationId, before: prev.map((p) => `${p.courseCode} ${p.section} (CBA ${p.cbaCode})`), after: finalItems.map((i) => `${i.courseCode} ${i.section} (CBA ${i.cbaCode})`), reason: changeReason ?? `version ${version}` });
  return { version, changes };
}

// Cells starting with = + @ (or tab/CR) can be executed as formulas by spreadsheet tools — neutralise them.
const csvCell = (raw: string) => {
  const v = /^[=+@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

/** One row per student-course enrollment; the student's Registration ID repeats on every row (locked PRD requirement). */
export async function buildExportCsv(session: Session, opts: { markExported: boolean }) {
  const sem = await db.semester.findFirst({ where: { active: true } });
  if (!sem) throw new RegistrationError("No active semester");
  const regs = await db.registration.findMany({
    where: { semesterId: sem.id, status: { in: ["FINALIZED", "EXPORTED"] }, version: { gt: 0 }, ...(session.role === "ADVISOR" ? { student: { advisorId: session.userId } } : {}) },
    include: { student: true, versions: { orderBy: { version: "desc" }, take: 1 } },
    orderBy: { student: { registrationId: "asc" } },
  });
  const lines = ["Student Registration ID,CBA Code,Course Code,Class & Section,Course Name"];
  let rows = 0;
  for (const r of regs) {
    for (const i of JSON.parse(r.versions[0].items) as FinalItem[]) {
      lines.push([r.student.registrationId, i.cbaCode, i.courseCode, i.section, i.courseName].map(csvCell).join(","));
      rows++;
    }
  }
  if (opts.markExported && regs.length) {
    await db.registration.updateMany({ where: { id: { in: regs.map((r) => r.id) } }, data: { status: "EXPORTED" } });
    await audit({ userId: session.userId, action: "CSV_EXPORT", reason: `${regs.length} students, ${rows} rows`, after: regs.map((r) => r.student.registrationId) });
  }
  return { csv: lines.join("\r\n") + "\r\n", students: regs.length, rows, semester: sem.name };
}
