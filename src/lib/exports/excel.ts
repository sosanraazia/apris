import writeXlsxFile from "write-excel-file/node";
import { IT_COLUMNS, groupByCba, studentHeaders } from "./byCba";
import type { Slip } from "./slips";

export { IT_COLUMNS };

/** The agreed IT format: one row per CBA code, then one column per registered student holding that student's Registration ID. */
const text = (v: string) => ({ value: v, type: String });

export async function buildItWorkbook(slips: Slip[]): Promise<Buffer> {
  const { rows, maxStudents } = groupByCba(slips);
  const header = [...IT_COLUMNS, ...studentHeaders(maxStudents)];
  const data = [
    header.map((h) => ({ value: h, type: String, fontWeight: "bold" as const })),
    ...rows.map((r) => [
      /^\d{1,15}$/.test(r.cbaCode) ? { value: Number(r.cbaCode), type: Number } : text(r.cbaCode), // CBA codes are numbers in the source workbook
      text(r.courseCode),
      text(r.section),
      text(r.courseName), // always written as text, so a name starting with "=" can never become a formula
      ...Array.from({ length: maxStudents }, (_, i) => (r.students[i] ? text(r.students[i]) : null)),
    ]),
  ];
  const file = writeXlsxFile(data, { sheet: "Registrations", columns: [{ width: 12 }, { width: 18 }, { width: 18 }, { width: 46 }, ...Array.from({ length: maxStudents }, () => ({ width: 14 }))] });
  return Buffer.from(await file.toBuffer());
}
