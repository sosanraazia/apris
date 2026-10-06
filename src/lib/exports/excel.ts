import writeXlsxFile from "write-excel-file/node";
import { IT_COLUMNS, buildCbaSheets, studentHeaders, type OfferingLite } from "./byCba";
import type { Slip } from "./slips";

export { IT_COLUMNS };

const text = (v: string) => ({ value: v, type: String });

/**
 * The agreed IT format, the same shape as IT's own offering workbook: one sheet per class, one row per CBA code,
 * and the registered students' Registration IDs in the columns after the course name (Student 1, Student 2, …).
 */
export async function buildItWorkbook(slips: Slip[], offerings: OfferingLite[], opts: { onlyRegistered?: boolean } = {}): Promise<Buffer> {
  let sheets = buildCbaSheets(offerings, slips, { onlyRegistered: opts.onlyRegistered ?? false });
  if (!sheets.length) sheets = [{ name: "Registrations", rows: [], maxStudents: 0 }];
  const file = writeXlsxFile(
    sheets.map((sh) => ({
      sheet: sh.name,
      columns: [{ width: 12 }, { width: 18 }, { width: 18 }, { width: 46 }, ...Array.from({ length: sh.maxStudents }, () => ({ width: 14 }))],
      data: [
        [...IT_COLUMNS, ...studentHeaders(sh.maxStudents)].map((h) => ({ value: h, type: String, fontWeight: "bold" as const })),
        ...sh.rows.map((r) => [
          /^\d{1,15}$/.test(r.cbaCode) ? { value: Number(r.cbaCode), type: Number } : text(r.cbaCode), // CBA codes are numbers in the source workbook
          text(r.courseCode),
          text(r.section),
          text(r.courseName), // always written as text, so a name starting with "=" can never become a formula
          ...Array.from({ length: sh.maxStudents }, (_, i) => (r.students[i] ? text(r.students[i]) : null)),
        ]),
      ],
    })),
  );
  return Buffer.from(await file.toBuffer());
}
