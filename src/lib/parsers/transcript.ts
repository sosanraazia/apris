import { pdfPages } from "./pdfText";
import { CODE_RE, ProgramCode, normCode, programFromText } from "./common";

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
  const flat = pages.flatMap((p) => p.flat);
  const cols = pages.flatMap((p) => p.cols);
  const text = flat.join("\n");
  const warnings: string[] = [];

  const reg = text.match(/Registration No:?\s*([A-Z]{2,4}\d{5,8})/i)?.[1]?.toUpperCase();
  const name = text.match(/^Name:\s*(.+?)(?:\s+Enrolled in the Program:.*)?$/m)?.[1]?.trim();
  const father = text.match(/^Father'?s Name:\s*(.+?)(?:\s+Graduated In:.*)?$/m)?.[1]?.trim() || null;
  const program = programFromText(flat.find((l) => /PROGRAM:/i.test(l)) ?? "");
  if (!reg || !name || !program) throw new Error("Unreadable transcript (registration no, name or program missing)");

  const courses: TranscriptCourse[] = [];
  const terms: TranscriptTerm[] = [];
  let term: TranscriptTerm | null = null;
  for (const line of cols) {
    const tm = line.match(TERM);
    if (tm) {
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
      continue;
    }
    const m = line.match(ROW);
    if (m && CODE_RE.test(m[1].toUpperCase())) {
      courses.push({ term: term.term, termOrder: term.termOrder, code: normCode(m[1]), title: m[2].trim(), grade: m[3], gradePoint: Number(m[4]), ch: Number(m[5]), gpEarned: Number(m[6]) });
      continue;
    }
    if (courses.length && !/^(Course|Code|SGPA|\d\.|Checked|Date|University|Powered|Controller)/i.test(line) && courses[courses.length - 1].term === term.term)
      courses[courses.length - 1].title += " " + line.trim();
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
