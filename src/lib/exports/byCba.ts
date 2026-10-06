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
