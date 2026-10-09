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
