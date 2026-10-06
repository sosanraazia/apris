import { normTitle } from "../parsers/common";

/** Titles that differ between POS versions/programs but are the same course. Keys are normTitle() forms. */
const ALIASES: Record<string, string> = {
  "data structures": "data structures and algorithms",
  "operating system": "operating systems",
  "operating system lab": "operating systems lab",
  "cyber security": "introduction to cyber security", // BS-CYS-2024 names it "Cyber Security"
  "cyber security lab": "introduction to cyber security lab",
  "parallel and distributed computing": "parallel and distributed computing",
  "final year project 1": "final year project i",
  "final year project 2": "final year project ii",
  "organizational behavior": "organizational behaviour",
  "management information systems": "management information system",
  "discrete structure": "discrete structures", // typo in Fall 2026 offering sheet
  "probability and stattistics": "probability and statistics", // typo in BS-CYS-2024 PoS
};

export const isLabCode = (code: string) => /L$/.test(code);

/** Canonical identity of a course across POS versions: alias-resolved title, labs tagged separately. */
export function courseKey(code: string, title: string): string {
  let t = normTitle(title);
  // a lab is a lab by its code (…L) or by its title (…Lab), so a transcript that lost the "L" still matches the lab row
  const lab = isLabCode(code) || / lab$/.test(t);
  if (lab) t = t.replace(/ (lab|l)$/, "");
  t = ALIASES[t] ?? t;
  return lab ? `${t}#lab` : t;
}

/** Key of the theory course a lab belongs to (labs inherit the theory course's prerequisites). */
export const theoryKeyOf = (key: string) => key.replace(/#lab$/, "");

/** POS placeholder code (e.g. "SE-4XXX", "MG-2XXX", "CYS-3XXXL") → matcher for real/offered codes. */
export function placeholderMatches(placeholder: string, code: string): boolean {
  const a = placeholder.toUpperCase();
  const b = code.toUpperCase();
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && a[i] !== "X" && b[i] !== "X") return false;
  return true;
}
