/** Fixed columns of the IT hand-over; one "Student n" column per registered student follows. */
export const IT_COLUMNS = ["CBA Code", "Course Code", "Class & Section", "Course Name"] as const;

/** Hand-over layout for IT: one row per CBA code (a course in a section), the registered students' IDs across the columns. */
export interface CbaRow {
  cbaCode: string;
  courseCode: string;
  section: string;
  courseName: string;
  students: string[]; // Registration IDs, sorted
}

export function groupByCba(regs: { registrationId: string; items: { cbaCode: string; courseCode: string; section: string; courseName: string }[] }[]): { rows: CbaRow[]; maxStudents: number } {
  const byCba = new Map<string, CbaRow>();
  for (const r of regs)
    for (const i of r.items) {
      const cur = byCba.get(i.cbaCode);
      if (!cur) byCba.set(i.cbaCode, { cbaCode: i.cbaCode, courseCode: i.courseCode, section: i.section, courseName: i.courseName, students: [r.registrationId] });
      else {
        if (!cur.students.includes(r.registrationId)) cur.students.push(r.registrationId);
        // a CBA code shared by two course rows (an IT-side duplicate): keep one row, show both courses
        if (!cur.courseCode.split(" / ").includes(i.courseCode)) { cur.courseCode += ` / ${i.courseCode}`; cur.courseName += ` / ${i.courseName}`; }
      }
    }
  const rows = [...byCba.values()].sort((a, b) => Number(a.cbaCode) - Number(b.cbaCode) || a.cbaCode.localeCompare(b.cbaCode));
  rows.forEach((r) => r.students.sort());
  return { rows, maxStudents: rows.reduce((m, r) => Math.max(m, r.students.length), 0) };
}

export const studentHeaders = (n: number) => Array.from({ length: n }, (_, i) => `Student ${i + 1}`);

export interface OfferingLite { sheet: string; cbaCode: string | null; courseCode: string; section: string | null; courseName: string }
const UNLISTED = "Not in offering list";
export interface CbaSheet { name: string; rows: CbaRow[]; maxStudents: number }

const cbaOrder = (a: string, b: string) => Number(a) - Number(b) || a.localeCompare(b);

/**
 * The hand-over in the shape of IT's own offering workbook: one sheet per class (SE-3, CYS-6 …), one row per CBA code
 * (a CBA code appears once even if the offering list repeats it), the registered students' IDs in columns after the course name.
 * `onlyRegistered` drops rows nobody registered for (single-student downloads). Registered CBA codes that are no longer in the
 * offering list are kept on an extra sheet rather than lost.
 */
export function buildCbaSheets(offerings: OfferingLite[], regs: { registrationId: string; items: { cbaCode: string; courseCode: string; section: string; courseName: string }[] }[], opts: { onlyRegistered: boolean }): CbaSheet[] {
  const students = new Map<string, Set<string>>();
  const fallback = new Map<string, { courseCode: string; section: string; courseName: string }>();
  for (const r of regs)
    for (const i of r.items) {
      students.set(i.cbaCode, (students.get(i.cbaCode) ?? new Set()).add(r.registrationId));
      if (!fallback.has(i.cbaCode)) fallback.set(i.cbaCode, i);
    }
  const sheets = new Map<string, Map<string, CbaRow>>();
  const add = (sheet: string, o: { cbaCode: string; courseCode: string; section: string | null; courseName: string }) => {
    const rows = sheets.get(sheet) ?? new Map<string, CbaRow>();
    sheets.set(sheet, rows);
    const key = o.cbaCode || `row${rows.size}`;
    const cur = rows.get(key);
    if (!cur) rows.set(key, { cbaCode: o.cbaCode, courseCode: o.courseCode, section: o.section ?? "", courseName: o.courseName, students: [] });
    else if (!cur.courseCode.split(" / ").includes(o.courseCode)) { cur.courseCode += ` / ${o.courseCode}`; cur.courseName += ` / ${o.courseName}`; } // IT-side duplicate CBA: one row, both courses
  };
  for (const o of offerings) add(o.sheet, { ...o, cbaCode: o.cbaCode ?? "" });
  // registered CBA codes the offering list no longer has
  const listed = new Set(offerings.map((o) => o.cbaCode));
  for (const [cba, i] of fallback) if (!listed.has(cba)) add(UNLISTED, { cbaCode: cba, ...i });
  // each registered CBA code's students go on the first row that carries it
  const given = new Set<string>();
  for (const rows of sheets.values())
    for (const r of rows.values())
      if (r.cbaCode && !given.has(r.cbaCode)) { r.students = [...(students.get(r.cbaCode) ?? [])].sort(); given.add(r.cbaCode); }
  const out: CbaSheet[] = [];
  for (const [name, m] of [...sheets].sort((a, b) => (a[0] === UNLISTED ? 1 : b[0] === UNLISTED ? -1 : a[0].localeCompare(b[0], undefined, { numeric: true })))) {
    let rows = [...m.values()].sort((a, b) => cbaOrder(a.cbaCode, b.cbaCode));
    if (opts.onlyRegistered) rows = rows.filter((r) => r.students.length);
    if (rows.length) out.push({ name, rows, maxStudents: rows.reduce((x, r) => Math.max(x, r.students.length), 0) });
  }
  return out;
}
