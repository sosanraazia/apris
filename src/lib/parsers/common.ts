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

/** Parse "Semester N" blocks of course rows (used by POS PDFs and Fulfillment Reports). */
export function parsePlanCourses(lines: string[]): PlanCourse[] {
  const out: PlanCourse[] = [];
  let sem = 0;
  for (const line of lines) {
    const sm = line.match(/^Semester (\d+)$/);
    if (sm) {
      sem = Number(sm[1]);
      continue;
    }
    if (!sem) continue;
    const m = line.match(PLAN_ROW);
    if (m) {
      const code = normCode(m[2]);
      // footer values ("137 30") can bleed onto the last row of a page; strip stray trailing numbers
      const title = m[3].replace(/(?: \d{2,3}){1,2}$/, "").trim();
      out.push({ semester: sem, code, title, ch: Number(m[4]), isPlaceholder: /X/.test(code) });
      continue;
    }
    if (SKIP.test(line) || /^Total/i.test(line) || !out.length) continue;
    if (/^\d+ /.test(line)) continue;
    out[out.length - 1].title += " " + line.trim();
  }
  return out;
}

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
