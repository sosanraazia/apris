export type ProgramCode = "SE" | "CYS";

const CODE_TOKEN = "[A-Z]{2,4}-?[0-9X]{4}(?: ?L)?";
export const CODE_RE = new RegExp(`^${CODE_TOKEN}$`);

/** CYS1001L / CYS-3403 L / cs-2007l → CYS-1001L / CYS-3403L / CS-2007L */
export function normCode(raw: string): string {
  const c = raw.toUpperCase().replace(/\s+/g, "");
  return c.replace(/^([A-Z]{2,4})-?([0-9X]{4}L?)$/, "$1-$2");
}

/** Normalise a course title for cross-POS matching (codes differ between POS versions, names don't). */
export function normTitle(s: string): string {
  return s
    .replace(/([a-z])-([a-z])/g, "$1$2")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function programFromText(text: string): ProgramCode | null {
  if (/CYBER\s*SECURITY/i.test(text)) return "CYS";
  if (/SOFTWARE\s*ENGINEERING/i.test(text)) return "SE";
  return null;
}

export interface PlanCourse {
  semester: number;
  code: string;
  title: string;
  ch: number;
  isPlaceholder: boolean;
}

const PLAN_ROW = new RegExp(`^(\\d+) (${CODE_TOKEN}) (.+) (\\d)$`);
const SKIP = /^(S\. No\.|Course Course Title|Code Hours|Total\b|Powered by|Page \d+ of|Date of Issue|Reg No|Name:)/i;

/**
 * Some reports print the course code in a column too narrow for it, so the code wraps: a lab "CYS1001L" arrives as
 * "CYS1001 …" with a lone "L" on the next line, and "CYS-1003" as "CYS-100 …" with a lone "3" below. Rejoin them,
 * leaving any title text that shares the continuation line. (Without this a lab looks like a duplicate theory course.)
 */
export function repairWrappedCodes(lines: string[]): string[] {
  const out = [...lines];
  const short = /^((?:\d{1,3} )?)([A-Z]{2,4}-\d{3})(\s.*)$/; // a 3-digit code: its last digit wrapped
  const full = /^((?:\d{1,3} )?)([A-Z]{2,4}-?\d{4})(\s.*)$/; // a 4-digit code: a lab "L" may have wrapped
  for (let i = 0; i < out.length - 1; i++) {
    const next = out[i + 1];
    const m3 = out[i].match(short);
    if (m3) {
      // a lone digit, optionally followed by title text, but NOT the serial number of the next row ("4 CYS1001 …")
      const d = next.match(/^(\d)(?:\s+(?![A-Z]{2,4}-?\d)(.+))?$/);
      if (d) {
        out[i] = `${m3[1]}${m3[2]}${d[1]}${m3[3]}`;
        if (d[2]) out[i + 1] = d[2];
        else out.splice(i + 1, 1);
        continue;
      }
    }
    const m4 = out[i].match(full);
    if (m4 && !/L$/.test(m4[2])) {
      const l = next.match(/^L(?:\s+(.+))?$/);
      if (l) {
        out[i] = `${m4[1]}${m4[2]}L${m4[3]}`;
        if (l[1]) out[i + 1] = l[1];
        else out.splice(i + 1, 1);
      }
    }
  }
  return out;
}

export interface ParsedPlan {
  courses: PlanCourse[];
  /** Each semester's printed "Total N" line, used to cross-check the extracted courses. */
  semesterTotals: Record<number, number>;
}

/** Parse "Semester N" blocks of course rows (used by POS PDFs and Fulfillment Reports). */
export function parsePlan(rawLines: string[]): ParsedPlan {
  const lines = repairWrappedCodes(rawLines);
  const courses: PlanCourse[] = [];
  const semesterTotals: Record<number, number> = {};
  let sem = 0;
  for (const raw of lines) {
    let line = raw.trim();
    // A semester's "Total N" can land on the same text line as the next heading or row (they sit at nearly the same
    // height). Peel it off first so the heading/row is still recognised.
    const lead = line.match(/^Total (\d+)\s+(?=\S)/);
    if (lead) { if (sem) semesterTotals[sem] = Number(lead[1]); line = line.slice(lead[0].length); }
    const trail = line.match(/^(.*\S)\s+Total (\d+)$/);
    if (trail && (/^Semester \d+$/.test(trail[1]) || /^\d+ \S+ .+ \d$/.test(trail[1]))) { if (sem) semesterTotals[sem] = Number(trail[2]); line = trail[1]; }
    const alone = line.match(/^Total (\d+)$/);
    if (alone) { if (sem) semesterTotals[sem] = Number(alone[1]); continue; }

    const sm = line.match(/^Semester (\d+)$/);
    if (sm) { sem = Number(sm[1]); continue; }
    if (!sem) continue;
    const m = line.match(PLAN_ROW);
    if (m) {
      const code = normCode(m[2]);
      // footer values ("137 30") can bleed onto the last row of a page; strip stray trailing numbers
      const title = m[3].replace(/(?: \d{2,3}){1,2}$/, "").trim();
      courses.push({ semester: sem, code, title, ch: Number(m[4]), isPlaceholder: /X/.test(code) });
      continue;
    }
    if (SKIP.test(line) || !courses.length) continue;
    if (/^\d+ /.test(line)) continue;
    courses[courses.length - 1].title += " " + line;
  }
  return { courses, semesterTotals };
}

export const parsePlanCourses = (lines: string[]) => parsePlan(lines).courses;

export type PosVariant = "REGULAR" | "MINORITIES" | "PREMED" | "MINORITIES_PREMED" | "SPECIAL";

/** "BS-SE-2024 (Minorities)" + "PreMed" → { code:"BS-SE-2024", year:2024, variant } */
export function parsePosLabel(headerText: string) {
  const m = headerText.match(/BS-(SE|CYS)-(\d{4})/);
  if (!m) return null;
  const minorities = /Minorit/i.test(headerText);
  const premed = /Pre-?\s?Med/i.test(headerText);
  const special = /Special/i.test(headerText);
  const variant: PosVariant = special
    ? "SPECIAL"
    : minorities && premed
      ? "MINORITIES_PREMED"
      : minorities
        ? "MINORITIES"
        : premed
          ? "PREMED"
          : "REGULAR";
  return { program: m[1] as ProgramCode, posCode: `BS-${m[1]}-${m[2]}`, year: Number(m[2]), variant };
}
