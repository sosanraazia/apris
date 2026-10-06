// Pure rules for turning Award Lists (per-section gradebooks) into home-section suggestions. No database, no files.

/** "Spring 2026" → comparable index. Spring Y = 2Y, Summer Y = 2Y+0.5, Fall Y = 2Y+1. */
export function termIndex(term: string): number | null {
  const m = term.trim().match(/^(Spring|Summer|Fall) (\d{4})$/i);
  if (!m) return null;
  const y = Number(m[2]);
  const season = m[1].toLowerCase();
  return y * 2 + (season === "fall" ? 1 : season === "summer" ? 0.5 : 0);
}

/** "se251093" → 25 (the two digits after the program letters are the admission year). */
export function batchOf(registrationId: string): number | null {
  const m = registrationId.trim().match(/^[A-Za-z]{2,4}(\d{2})\d{3,6}$/);
  return m ? Number(m[1]) : null;
}

/**
 * Is this student a *regular* member of a class in `semester` during `term`, judging by their admission batch?
 * Fall intake: in Spring 2026 semester 2 is the Fall 2025 batch ("25"), semester 4 is "24", and so on.
 * A student from another batch in the list is a backlog attendee: their own home section is somewhere else.
 */
export function isRegularForSection(registrationId: string, term: string, semester: number): boolean {
  const idx = termIndex(term);
  const batch = batchOf(registrationId);
  if (idx == null || batch == null) return false;
  const a = (idx - semester) / 2; // admission year if the batch started in Fall
  const years = new Set([Math.floor(a) % 100, Math.ceil(a) % 100]);
  return years.has(batch);
}

export interface AwardList {
  term: string;
  program: string; // SE | CYS
  semester: number;
  letter: string;
  section: string; // SE-2A
  courseCode: string | null;
  courseTitle: string | null;
  registrationIds: string[]; // upper-case, in list order
  warnings: string[];
}

/** Parse the text lines of one Award List PDF. Throws when it is not an Award List. */
export function parseAwardListLines(lines: string[]): AwardList {
  const text = lines.join("\n");
  const sec = text.match(/Class and Section:\s*(?:BS-)?([A-Z]{2,4})-(\d{1,2})([A-Z])\b/);
  const term = text.match(/\((Spring|Summer|Fall) (\d{4}) Semester\)/i);
  if (!sec) throw new Error('No "Class and Section" found — this does not look like an Award List');
  if (!term) throw new Error("No term (e.g. “Spring 2026 Semester”) found in the heading");
  const warnings: string[] = [];

  const ids: string[] = [];
  const serials: number[] = [];
  for (const l of lines) {
    const m = l.match(/^(\d{1,3}) ([a-z]{2,4}\d{5,8})\s/i);
    if (m) { serials.push(Number(m[1])); ids.push(m[2].toUpperCase()); }
  }
  if (!ids.length) throw new Error("No student rows were found");
  if (serials.some((n, i) => n !== i + 1)) warnings.push("Row numbers are not continuous (1, 2, 3, …) — some rows may have been missed or the list was edited.");
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) warnings.push(`Duplicate Registration IDs in this list: ${[...new Set(dup)].join(", ")}`);

  const program = sec[1].toUpperCase();
  const semester = Number(sec[2]);
  return {
    term: `${term[1][0].toUpperCase()}${term[1].slice(1).toLowerCase()} ${term[2]}`,
    program,
    semester,
    letter: sec[3],
    section: `${program}-${semester}${sec[3]}`,
    courseCode: text.match(/Course Code:\s*(\S+)/)?.[1] ?? null,
    courseTitle: text.match(/Course Title:\s*(.+?)\s+Course Code:/)?.[1]?.trim() ?? null,
    registrationIds: [...new Set(ids)],
    warnings,
  };
}

export interface RosterEntry {
  term: string;
  sourceSection: string; // SE-2A
  regular: boolean;
  program: string;
}

export interface SectionSuggestion {
  kind: "suggested" | "none" | "conflict" | "graduating";
  /** Present when kind === "suggested". */
  section?: string;
  /** Human explanation shown next to the field. */
  note: string;
}

/**
 * Suggest the home section for `activeTerm` from the student's known (regular) section in an earlier term:
 * the same letter, advanced by the number of regular semesters since that list (Spring 2026 SE-2A → Fall 2026 SE-3A).
 * This promotion rule is an assumption (BACKLOG R-05); the advisor always confirms or changes the value.
 */
export function suggestHomeSection(entries: RosterEntry[], program: string, activeTerm: string): SectionSuggestion {
  const mine = entries.filter((e) => e.program === program);
  if (!entries.length) return { kind: "none", note: "Not found in the uploaded section lists." };
  const regular = mine.filter((e) => e.regular && termIndex(e.term) != null);
  if (!regular.length) {
    const where = [...new Set(mine.map((e) => e.sourceSection))].join(", ");
    return { kind: "none", note: mine.length ? `Only appears as a backlog attendee (${where}) — home section can't be taken from the lists.` : `Not found in the ${program} section lists.` };
  }
  const latest = Math.max(...regular.map((e) => termIndex(e.term)!));
  const latestRows = regular.filter((e) => termIndex(e.term) === latest);
  const sections = [...new Set(latestRows.map((e) => e.sourceSection))];
  if (sections.length > 1) return { kind: "conflict", note: `Listed as a regular member of more than one section (${sections.join(", ")}) in ${latestRows[0].term} — choose by hand.` };

  const m = sections[0].match(/^([A-Z]{2,4})-(\d{1,2})([A-Z])$/);
  const now = termIndex(activeTerm);
  if (!m || now == null) return { kind: "none", note: "Could not work out the section." };
  const elapsed = Math.max(0, Math.round(now - latest));
  const semester = Number(m[2]) + elapsed;
  if (semester > 8) return { kind: "graduating", note: `Was in ${sections[0]} (${latestRows[0].term}), the final semester — no next section to suggest.` };
  const section = `${m[1]}-${semester}${m[3]}`;
  return { kind: "suggested", section, note: `From the ${latestRows[0].term} section list: ${sections[0]}${elapsed ? ` → ${section} (moved up ${elapsed} semester${elapsed > 1 ? "s" : ""}, same letter)` : ""}. Confirm or change.` };
}
