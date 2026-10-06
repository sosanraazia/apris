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

/**
 * Programs that run a single section per semester, so the section letter is known without any list.
 * (CYS has only section A. Add a program here if it also becomes single-section; SE has A/B/C so it is not listed.)
 */
export const SINGLE_SECTION_PROGRAMS: Record<string, string> = { CYS: "A" };

/**
 * For a single-section program the home section follows from the admission term alone:
 * Fall 2025 admission → Fall 2026 is semester 3 → "CYS-3A". Assumes no frozen terms (the advisor confirms).
 */
export function suggestFromAdmission(program: string, admission: string | null | undefined, activeTerm: string): SectionSuggestion {
  const letter = SINGLE_SECTION_PROGRAMS[program];
  if (!letter) return { kind: "none", note: `${program} has several sections, so the section can't be worked out from the admission term.` };
  const a = admission ? termIndex(admission) : null;
  const now = termIndex(activeTerm);
  if (a == null || now == null) return { kind: "none", note: "Admission term or current semester unknown." };
  const semester = Math.round(now - a) + 1;
  if (semester < 1) return { kind: "none", note: `Admitted ${admission}, after ${activeTerm}.` };
  if (semester > 8) return { kind: "graduating", note: `Admitted ${admission} — would be semester ${semester}, beyond the 8-semester program, so no section is suggested.` };
  const section = `${program}-${semester}${letter}`;
  return { kind: "suggested", section, note: `${program} has a single section (${letter}). Admitted ${admission} → semester ${semester} in ${activeTerm} → ${section}. Confirm or change.` };
}

/**
 * For a single-section program, a student on no list follows their batch-mates: if most regular members of the same
 * admission batch were in CYS-5A last term, this student is too (→ CYS-6A now). This copes with cohorts that run a
 * semester behind the admission-date arithmetic (e.g. batch 23 sitting in CYS-5A in Spring 2026).
 * Needs at least 3 batch-mates in the latest list term, and 60% of them in one section.
 */
export function suggestFromCohort(cohort: { term: string; sourceSection: string }[], program: string, activeTerm: string, batch: number): SectionSuggestion {
  if (!SINGLE_SECTION_PROGRAMS[program]) return { kind: "none", note: `${program} has several sections.` };
  const dated = cohort.filter((c) => termIndex(c.term) != null);
  if (dated.length < 3) return { kind: "none", note: `Too few batch ${batch} students in the section lists to follow them.` };
  const latest = Math.max(...dated.map((c) => termIndex(c.term)!));
  const rows = dated.filter((c) => termIndex(c.term) === latest);
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.sourceSection, (counts.get(r.sourceSection) ?? 0) + 1);
  const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (rows.length < 3 || n / rows.length < 0.6) return { kind: "none", note: `Batch ${batch} students are spread across several sections in the lists.` };
  const promoted = suggestHomeSection([{ term: rows[0].term, sourceSection: top, regular: true, program }], program, activeTerm);
  if (promoted.kind !== "suggested") return promoted;
  return { kind: "suggested", section: promoted.section, note: `Not on a list, but ${n} of ${rows.length} batch ${batch} students were in ${top} (${rows[0].term}) → ${promoted.section}. Confirm or change.` };
}
