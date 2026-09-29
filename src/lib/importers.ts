import readXlsx from "read-excel-file/node";
import { CODE_RE, normCode } from "./parsers/common";
import type { OfferingRow, PrereqRow } from "./rules/types";

const SECTION_RE = /^[A-Z]{2,4}-\d[A-Z]$/;
const isSection = (v: string) => SECTION_RE.test(v.toUpperCase().replace(/\s+/g, ""));
const isCode = (v: string) => CODE_RE.test(v.toUpperCase().replace(/\s+/g, "").replace(/^([A-Z]+)(\d)/, "$1-$2").replace(/-+/g, "-")) || /^[A-Z]{2,4}-?[0-9X]{4} ?L?$/i.test(v);

const str = (v: unknown) => (v == null ? "" : String(v).trim());

export interface OfferingImport {
  rows: Omit<OfferingRow, "id">[];
  normalizedCount: number;
  notes: string[];
}

/** Course-offering workbook → normalised rows. Never trusts column order (PRD §23). */
export async function parseOfferingWorkbook(input: Buffer | string): Promise<OfferingImport> {
  const sheets = await readXlsx(input);
  const rows: OfferingImport["rows"] = [];
  const notes: string[] = [];
  let normalizedCount = 0;

  for (const { sheet, data } of sheets) {
    const prog = sheet.match(/^(SE|CYS)/i)?.[1]?.toUpperCase() as "SE" | "CYS" | undefined;
    for (const r of data.slice(1)) {
      const [cbaRaw, a, b, nameRaw] = r as unknown[];
      const name = str(nameRaw);
      if (!name && !str(a) && !str(b)) continue;
      let code = str(a);
      let section: string | null = str(b) || null;
      const issues: string[] = [];
      if (isSection(code) && section && !isSection(section)) {
        [code, section] = [section, code];
        issues.push("Columns swapped in source — normalised");
        normalizedCount++;
      }
      const cba = cbaRaw == null || cbaRaw === "" ? null : String(Math.trunc(Number(cbaRaw)));
      rows.push({
        sheet,
        program: prog ?? null,
        courseCode: normCode(code),
        courseName: name,
        section: section ? section.toUpperCase().replace(/\s+/g, "") : null,
        cbaCode: cba && cba !== "NaN" ? cba : null,
        preMedOnly: /pre-?\s?med/i.test(name),
        issues,
      });
    }
  }
  // duplicate CBA codes across different course/section rows
  const byCba = new Map<string, typeof rows>();
  for (const r of rows) if (r.cbaCode) byCba.set(r.cbaCode, [...(byCba.get(r.cbaCode) ?? []), r]);
  byCba.forEach((list, cba) => {
    if (new Set(list.map((r) => r.courseCode + "|" + r.section)).size > 1) {
      list.forEach((r) => r.issues.push(`Duplicate CBA ${cba} shared by ${list.map((x) => `${x.courseCode}/${x.section}`).join(", ")}`));
      notes.push(`CBA ${cba} is used by more than one course/section`);
    }
  });
  for (const r of rows) if (!isCode(r.courseCode)) r.issues.push(`Unrecognised course code "${r.courseCode}"`);
  if (normalizedCount) notes.unshift(`${normalizedCount} rows normalised automatically — please review before publishing.`);
  return { rows, normalizedCount, notes };
}

export async function parsePrereqWorkbook(input: Buffer | string): Promise<PrereqRow[]> {
  const data = (await readXlsx(input))[0].data;
  return data
    .slice(1)
    .map((r) => ({ course: str(r[0]), prerequisite: str(r[1]), rule: str(r[2]) || "Must Pass" }))
    .filter((r) => r.course && r.prerequisite);
}
