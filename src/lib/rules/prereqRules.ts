import { courseKey } from "./keys";

export interface Rule { course: string; prerequisite: string }

/**
 * Checks a proposed prerequisite rule. `known` = course keys that exist in a Plan of Study; `rules` = the other rules in force.
 * Returns a message for the Admin, or null when the rule is fine.
 */
export function checkRule(rule: Rule, known: Set<string>, rules: Rule[]): string | null {
  const c = courseKey("X-0000", rule.course);
  const p = courseKey("X-0000", rule.prerequisite);
  if (!rule.course.trim() || !rule.prerequisite.trim()) return "Choose both the course and its prerequisite.";
  if (c.endsWith("#lab") || p.endsWith("#lab")) return "Use the theory course: a lab follows its theory course's rules automatically.";
  if (!known.has(c)) return `“${rule.course}” is not a course in any Plan of Study — pick it from the list.`;
  if (!known.has(p)) return `“${rule.prerequisite}” is not a course in any Plan of Study — pick it from the list.`;
  if (c === p) return "A course cannot be its own prerequisite.";
  if (rules.some((r) => courseKey("X-0000", r.course) === c && courseKey("X-0000", r.prerequisite) === p)) return "That rule already exists.";
  // a cycle (A needs B, B needs A, directly or through others) would make both courses impossible to register
  const needs = new Map<string, string[]>();
  for (const r of rules) {
    const k = courseKey("X-0000", r.course);
    needs.set(k, [...(needs.get(k) ?? []), courseKey("X-0000", r.prerequisite)]);
  }
  const seen = new Set<string>();
  const stack = [p];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === c) return `That would make a loop: “${rule.prerequisite}” already depends on “${rule.course}”.`;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(needs.get(cur) ?? []));
  }
  return null;
}
