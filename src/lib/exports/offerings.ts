import writeXlsxFile from "write-excel-file/node";
import { db } from "../db";
import type { OfferingLite } from "./byCba";

export const OFFERING_COLUMNS = ["CBA Code", "Course Code", "Class & Section", "Course Name"] as const;
export interface OfferingExportRow { sheet: string; cbaCode: string | null; courseCode: string; section: string | null; courseName: string }

const text = (v: string) => ({ value: v, type: String });

/** The offering workbook as APRIS holds it now (including edits made in APRIS): one sheet per class, same columns as the upload, so it can be uploaded again. */
export async function buildOfferingsWorkbook(rows: OfferingExportRow[]): Promise<Buffer> {
  const sheets = [...new Set(rows.map((r) => r.sheet))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const data = sheets.map((name) => ({
    sheet: name,
    columns: [{ width: 12 }, { width: 14 }, { width: 16 }, { width: 52 }],
    data: [
      OFFERING_COLUMNS.map((h) => ({ value: h, type: String, fontWeight: "bold" as const })),
      ...rows
        .filter((r) => r.sheet === name)
        .sort((a, b) => (a.section ?? "").localeCompare(b.section ?? "") || a.courseCode.localeCompare(b.courseCode))
        .map((r) => [r.cbaCode && /^\d{1,15}$/.test(r.cbaCode) ? { value: Number(r.cbaCode), type: Number } : text(r.cbaCode ?? ""), text(r.courseCode), text(r.section ?? ""), text(r.courseName)]),
    ],
  }));
  const file = writeXlsxFile(data);
  return Buffer.from(await file.toBuffer());
}

/** The active semester's current offering rows (including edits made in APRIS). */
export async function loadOfferingLite(): Promise<OfferingLite[]> {
  const sem = await db.semester.findFirst({ where: { active: true } });
  if (!sem) return [];
  return (await db.offering.findMany({ where: { semesterId: sem.id, active: true } })).map((o) => ({ sheet: o.sheet, cbaCode: o.cbaCode, courseCode: o.courseCode, section: o.section, courseName: o.courseName }));
}
