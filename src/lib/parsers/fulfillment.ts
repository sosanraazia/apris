import { pdfPages } from "./pdfText";
import { PlanCourse, ProgramCode, PosVariant, parsePlan, parsePosLabel, programFromText } from "./common";

export interface PosDoc {
  program: ProgramCode;
  posCode: string;
  year: number;
  variant: PosVariant;
  courses: PlanCourse[];
  totalRequired: number | null;
  /** Printed per-semester totals, for cross-checking the extraction. */
  semesterTotals: Record<number, number>;
}

/** Parse one Plan of Study page (also the body of a Fulfillment Report). */
function parsePlanPage(flat: string[], cols: string[]): PosDoc | null {
  const header = flat.slice(0, 9).join(" ");
  const label = parsePosLabel(header);
  if (!label) return null;
  const req = flat.join(" ").match(/Total Credit Hours Required:?\s*(\d+)/i);
  const plan = parsePlan(cols);
  return { ...label, courses: plan.courses, semesterTotals: plan.semesterTotals, totalRequired: req ? Number(req[1]) : null };
}

/** Plan of Study PDF: one POS variant per page. */
export async function parsePosPdf(input: Buffer | string): Promise<PosDoc[]> {
  const pages = await pdfPages(input);
  return pages.map((p) => parsePlanPage(p.flat, p.cols)).filter((d): d is PosDoc => !!d);
}

export interface FulfillmentReport {
  registrationId: string;
  name: string;
  program: ProgramCode;
  pos: PosDoc;
  completedCH: number | null;
  requiredCH: number | null;
  warnings: string[];
}

export async function parseFulfillmentPdf(input: Buffer | string): Promise<FulfillmentReport> {
  const pages = await pdfPages(input);
  const flat = pages.flatMap((p) => p.flat);
  const cols = pages.flatMap((p) => p.cols);
  const warnings: string[] = [];
  const text = flat.join("\n");
  if (!flat.slice(0, 10).some((l) => /fulfil+ment/i.test(l))) {
    const heading = flat.slice(0, 10).find((l) => /report|transcript|list|enrol/i.test(l));
    throw new Error(`This is not a Plan of Study Fulfillment Report${heading ? ` (it is: "${heading.slice(0, 50)}")` : ""}`);
  }

  const reg = text.match(/Reg(?:istration)? No:?\s*([A-Z]{2,4}\d{5,8})/i)?.[1]?.toUpperCase();
  const name = text.match(/^Name:\s*(.+?)(?:\s+(?:PreMed|Date of Issue).*)?$/m)?.[1]?.trim();
  const program = programFromText(text.split("\n").find((l) => /PROGRAM:/i.test(l)) ?? "");
  const pos = parsePlanPage(flat, cols);
  if (!reg) warnings.push("Registration ID not found");
  if (!name) warnings.push("Student name not found");
  if (!program) warnings.push("Program not found");
  if (!pos) warnings.push("POS code not found");
  if (!reg || !name || !program || !pos) throw new Error("Unreadable fulfillment report: " + warnings.join("; "));

  const completed = text.match(/Total Credit Hours Completed:?\s*(\d+)/i)?.[1];
  const required = text.match(/Total Credit Hours Required:?\s*(\d+)/i)?.[1];
  // The report's own course table is best-effort only (some layouts overlap one semester's table with the next heading).
  // Recommendations use the stored Plan of Study; the code, variant and stated total are what matter, and the stated total
  // is compared with the stored POS when the profile is created.

  return { registrationId: reg, name, program, pos, completedCH: completed ? Number(completed) : null, requiredCH: required ? Number(required) : null, warnings };
}
