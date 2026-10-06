import writeXlsxFile from "write-excel-file/node";
import type { Slip } from "./slips";

/** The agreed IT format: one row per student-course, the Registration ID repeated on every row. */
export const IT_COLUMNS = ["Student Registration ID", "CBA Code", "Course Code", "Class & Section", "Course Name"] as const;

const text = (v: string) => ({ value: v, type: String });

export async function buildItWorkbook(slips: Slip[]): Promise<Buffer> {
  const data = [
    IT_COLUMNS.map((h) => ({ value: h, type: String, fontWeight: "bold" as const })),
    ...slips.flatMap((s) =>
      s.items.map((i) => [
        text(s.registrationId),
        /^\d{1,15}$/.test(i.cbaCode) ? { value: Number(i.cbaCode), type: Number } : text(i.cbaCode), // CBA codes are numbers in the source workbook
        text(i.courseCode),
        text(i.section),
        text(i.courseName), // always written as text, so a name starting with "=" can never become a formula
      ]),
    ),
  ];
  const file = writeXlsxFile(data, { sheet: "Registrations", columns: [{ width: 24 }, { width: 12 }, { width: 14 }, { width: 18 }, { width: 52 }] });
  return Buffer.from(await file.toBuffer());
}
