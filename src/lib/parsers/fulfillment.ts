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
  const sum = pos.courses.reduce((a, c) => a + c.ch, 0);
  if (required && Number(required) !== sum) warnings.push(`POS course credits (${sum}) ≠ required CH (${required})`);

  return { registrationId: reg, name, program, pos, completedCH: completed ? Number(completed) : null, requiredCH: required ? Number(required) : null, warnings };
}
