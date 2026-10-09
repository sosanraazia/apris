import { db } from "../db";
import { courseKey } from "../rules/keys";
import { checkRule } from "../rules/prereqRules";

/** One title per course that exists in some Plan of Study (theory courses only), spelled as the plan spells it. */
export async function knownCourses(): Promise<Map<string, string>> {
  const rows = await db.posCourse.findMany({ where: { isPlaceholder: false }, select: { code: true, title: true }, orderBy: { id: "asc" } });
  const m = new Map<string, string>();
  for (const r of rows) {
    const k = courseKey(r.code, r.title);
    if (!k.endsWith("#lab") && !m.has(k)) m.set(k, r.title);
  }
  return m;
}

export async function validateRule(course: string, prerequisite: string, exceptId?: number): Promise<{ error: string } | { course: string; prerequisite: string }> {
  const known = await knownCourses();
  const rules = (await db.prerequisite.findMany()).filter((r) => r.id !== exceptId);
  const error = checkRule({ course, prerequisite }, new Set(known.keys()), rules);
  if (error) return { error };
  return { course: known.get(courseKey("X-0000", course))!, prerequisite: known.get(courseKey("X-0000", prerequisite))! };
}

export interface PrereqViolation { studentId: number; registrationId: string; courseCode: string; courseName: string; reason: string }

/**
 * Finalized registrations (active semester) that contain a course whose prerequisite the student has not passed under the rules in force now,
 * for example after a rule is corrected. Courses an advisor deliberately kept with a recorded reason are not listed (they show as overrides).
 */
export async function registeredWithoutPrerequisite(): Promise<PrereqViolation[]> {
  const sem = await db.semester.findFirst({ where: { active: true } });
  if (!sem) return [];
  const regs = await db.registration.findMany({
    where: { semesterId: sem.id, version: { gt: 0 }, student: { archivedAt: null } },
    include: { student: true, items: true, versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  const { computeForStudent } = await import("./recommendation"); // loaded lazily: it pulls in the whole rules engine
  const out: PrereqViolation[] = [];
  for (const r of regs) {
    const ctx = await computeForStudent(r.studentId);
    if (!ctx) continue;
    const blocked = ctx.rec.items.filter((i) => i.status === "BLOCKED" && /prerequisite/i.test(i.reason));
    const kept = new Set(r.items.filter((i) => i.overrideReason).map((i) => i.posCourseCode));
    for (const it of JSON.parse(r.versions[0].items) as { courseCode: string; courseName: string }[]) {
      const k = courseKey(it.courseCode, it.courseName);
      const b = blocked.find((x) => courseKey(x.code, x.title) === k);
      if (b && !kept.has(it.courseCode)) out.push({ studentId: r.studentId, registrationId: r.student.registrationId, courseCode: it.courseCode, courseName: it.courseName, reason: b.reason });
    }
  }
  return out;
}
