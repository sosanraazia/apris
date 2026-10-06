import { pdfPages } from "./pdfText";
import { CODE_RE, ProgramCode, normCode, programFromText, repairWrappedCodes } from "./common";

export interface TranscriptCourse {
  term: string; // "Fall 2025"
  termOrder: number;
  code: string;
  title: string;
  grade: string;
  gradePoint: number;
  ch: number;
  gpEarned: number;
}

export interface TranscriptTerm {
  term: string;
  termOrder: number;
  sgpa: number | null;
  cgpa: number | null;
}

export interface Transcript {
  registrationId: string;
  name: string;
  fatherName: string | null;
  program: ProgramCode;
  admission: string | null;
  programStatus: string | null;
  requiredCH: number | null;
  completedCH: number | null;
  terms: TranscriptTerm[];
  courses: TranscriptCourse[];
  cgpa: number | null;
  warnings: string[];
}

const ROW = /^(\S+) (.+) (\S+) (\d\.\d{2}) (\d) (\d+\.\d{2})$/;
const TERM = /^(Fall|Spring|Summer) Semester (\d{4})$/i;
const SEASON: Record<string, number> = { spring: 1, summer: 2, fall: 3 };

export async function parseTranscriptPdf(input: Buffer | string): Promise<Transcript> {
  const pages = await pdfPages(input);
  return parseTranscriptContent(pages.flatMap((p) => p.flat), pages.flatMap((p) => p.cols));
}

/** Pure parsing step (also used by the tests with invented layouts). */
export function parseTranscriptContent(flat: string[], colsRaw: string[]): Transcript {
  if (!flat.slice(0, 10).some((l) => /transcript/i.test(l))) {
    const heading = flat.slice(0, 10).find((l) => /report|list|plan of study|enrol/i.test(l));
    throw new Error(`This is not an Interim Transcript${heading ? ` (it is: "${heading.slice(0, 50)}")` : ""}`);
  }
  const cols = repairWrappedCodes(colsRaw);
  const text = flat.join("\n");
  const warnings: string[] = [];
  const unreadRows: string[] = [];

  const reg = text.match(/Registration No:?\s*([A-Z]{2,4}\d{5,8})/i)?.[1]?.toUpperCase();
  const name = text.match(/^Name:\s*(.+?)(?:\s+Enrolled in the Program:.*)?$/m)?.[1]?.trim();
  const father = text.match(/^Father'?s Name:\s*(.+?)(?:\s+Graduated In:.*)?$/m)?.[1]?.trim() || null;
  const program = programFromText(flat.find((l) => /PROGRAM:/i.test(l)) ?? "");
  if (!reg || !name || !program) throw new Error("Unreadable transcript (registration no, name or program missing)");

  const courses: TranscriptCourse[] = [];
  const terms: TranscriptTerm[] = [];
  let term: TranscriptTerm | null = null;
  let rowOpen = false; // true only right after a course row: only then may a following line continue its title
  for (const line of cols) {
    const tm = line.match(TERM);
    if (tm) {
      rowOpen = false;
      const season = tm[1].toLowerCase();
      term = { term: `${tm[1][0].toUpperCase()}${season.slice(1)} ${tm[2]}`, termOrder: Number(tm[2]) * 10 + SEASON[season], sgpa: null, cgpa: null };
      terms.push(term);
      continue;
    }
    if (!term) continue;
    const gp = line.match(/^SGPA:\s*(\d\.\d+)\s*CGPA:\s*(\d\.\d+)/i);
    if (gp) {
      term.sgpa = Number(gp[1]);
      term.cgpa = Number(gp[2]);
      rowOpen = false; // whatever follows the SGPA line is page furniture, never part of a course title
      continue;
    }
    const m = line.match(ROW);
    if (m && CODE_RE.test(m[1].toUpperCase())) {
      rowOpen = true;
      courses.push({ term: term.term, termOrder: term.termOrder, code: normCode(m[1]), title: m[2].trim(), grade: m[3], gradePoint: Number(m[4]), ch: Number(m[5]), gpEarned: Number(m[6]) });
      continue;
    }
    // a line that ends like a data row (grade points, credit hours, points earned) but did not match is NOT a title fragment
    if (/\s\d\.\d{2}\s+\d\s+\d+\.\d{2}$/.test(line)) {
      unreadRows.push(line.slice(0, 48));
      continue;
    }
    const pageFurniture = /^(Course|Code|SGPA|\d\.|Checked|Date|University|Powered|Controller)/i.test(line) || /^\d+$/.test(line) || (line.length >= 8 && line === line.toUpperCase());
    if (rowOpen && !pageFurniture && courses.length && courses[courses.length - 1].term === term.term) courses[courses.length - 1].title += " " + line.trim();
    else if (pageFurniture) rowOpen = false;
  }

  const num = (re: RegExp) => {
    const v = text.match(re)?.[1];
    return v ? Number(v) : null;
  };
  const requiredCH = num(/required to complete the program:?\s*(\d+)/i) ?? num(/^(\d{2,3}) 3\. Credit Hours/m);
  const completedCH = num(/Credit Hours completed:?\s*(\d+)/i);
  const passedCH = courses.filter((c) => !/^(F|W|I)/i.test(c.grade)).reduce((a, c) => a + c.ch, 0);
  if (completedCH != null && completedCH !== passedCH) warnings.push(`Stated completed CH (${completedCH}) ≠ sum of passed courses (${passedCH})`);
  if (!courses.length) warnings.push("No course rows found");

  // ---- reading checks: these catch layout surprises that totals alone cannot (e.g. a lab read as a second copy of its theory course)
  for (const c of courses) {
    if (/\b(Lab|Laboratory)$/i.test(c.title.trim()) && /^[A-Z]{2,4}-\d{4}$/.test(c.code)) {
      warnings.push(`Lab code restored: ${c.code} → ${c.code}L ("${c.title.slice(0, 40)}")`);
      c.code += "L";
    } else if (/^[A-Z]{2,4}-\d{4}L$/.test(c.code) && !/\b(Lab|Laboratory|L)$/i.test(c.title.trim())) {
      warnings.push(`${c.code} has a lab code but the title does not say Lab ("${c.title.slice(0, 40)}")`);
    }
  }
  const seen = new Set<string>();
  for (const c of courses) {
    const k = `${c.term}|${c.code}`;
    if (seen.has(k)) warnings.push(`${c.term}: ${c.code} appears twice`);
    seen.add(k);
  }
  for (const t of terms) {
    const rows = courses.filter((c) => c.term === t.term);
    if (t.sgpa == null || !rows.length || rows.some((c) => /^(W|I)/i.test(c.grade))) continue; // withdrawn/incomplete rows are treated differently in SGPA
    const ch = rows.reduce((a, c) => a + c.ch, 0);
    const gp = rows.reduce((a, c) => a + c.gpEarned, 0);
    if (ch > 0 && Math.abs(gp / ch - t.sgpa) > 0.02) warnings.push(`${t.term}: the courses read give SGPA ${(gp / ch).toFixed(2)} but the transcript prints ${t.sgpa.toFixed(2)} — a course may be missing or misread`);
  }
  if (unreadRows.length) warnings.push(`${unreadRows.length} row(s) look like course rows but could not be read: ${unreadRows.slice(0, 3).map((r) => `"${r}"`).join(", ")}`);

  // semesters are laid out in columns, so they are read in column order — put them in date order before using "the latest"
  terms.sort((x, y) => x.termOrder - y.termOrder);
  courses.sort((x, y) => x.termOrder - y.termOrder);
  return {
    registrationId: reg,
    name,
    fatherName: father,
    program,
    admission: text.match(/Enrolled in the Program:\s*((?:Fall|Spring|Summer) \d{4})/i)?.[1] ?? null,
    programStatus: text.match(/Program Status:\s*(\w+)/i)?.[1] ?? null,
    requiredCH,
    completedCH,
    terms,
    courses,
    cgpa: [...terms].reverse().find((t) => t.cgpa != null)?.cgpa ?? null,
    warnings,
  };
}
