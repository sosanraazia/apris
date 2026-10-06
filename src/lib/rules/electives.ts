import { courseKey, isLabCode } from "./keys";
import type { ElectiveCategory, ElectiveMapRow, PosCourseRow } from "./types";

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };

export interface SlotId {
  category: ElectiveCategory;
  slot: number;
}

/** "University Elective II", "Uni Elective-1", "CySec Elective-3 Lab", "SE Elective VI 137" → category + slot number. Not an elective (e.g. "Fehm-e-Quran – I") → null. */
export function classifyElectiveSlot(title: string): SlotId | null {
  const m = title.match(/^\s*(uni(?:versity)?|se|cys(?:ec)?)[\s-]*elective[\s-]*([ivx]+|\d+)\b/i);
  if (!m) return null;
  const n = /^\d+$/.test(m[2]) ? Number(m[2]) : ROMAN[m[2].toUpperCase()];
  if (!n) return null;
  return { category: /^uni/i.test(m[1]) ? "UNIVERSITY" : "DOMAIN", slot: n };
}

/** A POS row is an elective slot when its code is a pattern (SE-4XXX) or when its title says so even though the POS printed a concrete code (BS-CYS-2024 prints "CYS-3306 CySec Elective-5"). */
export const isElectiveSlotRow = (title: string, isPlaceholder: boolean) => isPlaceholder || classifyElectiveSlot(title) !== null;

export const slotLabel = (id: SlotId) => `${id.category === "UNIVERSITY" ? "University" : "Domain"} elective ${id.slot}`;

/** The mapping row for a POS placeholder row, if the placeholder is an elective slot with a mapping. */
export function mappingFor(row: PosCourseRow, map: ElectiveMapRow[]): ElectiveMapRow | null {
  if (!row.isPlaceholder) return null;
  const id = classifyElectiveSlot(row.title);
  return id ? (map.find((m) => m.category === id.category && m.slot === id.slot) ?? null) : null;
}

/** Key an attempt/offering must have to fill the mapped slot (lab placeholder rows want the mapped course's lab). */
export const mappedKey = (m: ElectiveMapRow, isLab: boolean): string | null => (m.titleKey ? (isLab ? `${m.titleKey}#lab` : m.titleKey) : null);

export const keyOfTitle = (title: string) => courseKey("X-0000", title);
export { isLabCode };

/**
 * Elective assignments as announced by the departments, per POS. courseTitle null = "N/A" (no course announced yet).
 * Slot numbers follow the order the POS lists each category.
 */
export const DEFAULT_ELECTIVES: Record<string, { category: ElectiveCategory; slot: number; semester: number; title: string | null }[]> = {
  "BS-SE-2020": [
    { category: "UNIVERSITY", slot: 1, semester: 2, title: "Organizational Behavior" },
    { category: "UNIVERSITY", slot: 2, semester: 3, title: "Foreign Language" },
    { category: "UNIVERSITY", slot: 3, semester: 4, title: "Management Information System" },
    { category: "UNIVERSITY", slot: 4, semester: 8, title: null },
    { category: "DOMAIN", slot: 1, semester: 6, title: "DevOps" },
    { category: "DOMAIN", slot: 2, semester: 7, title: "Artificial Intelligence" },
    { category: "DOMAIN", slot: 3, semester: 7, title: "Mobile Application Development" },
  ],
  "BS-SE-2024": [
    { category: "UNIVERSITY", slot: 1, semester: 3, title: "Financial Accounting" },
    { category: "UNIVERSITY", slot: 2, semester: 8, title: null },
    { category: "DOMAIN", slot: 1, semester: 5, title: "DevOps" },
    { category: "DOMAIN", slot: 2, semester: 5, title: "Introduction to Data Science" },
    { category: "DOMAIN", slot: 3, semester: 6, title: null },
    { category: "DOMAIN", slot: 4, semester: 7, title: null },
    { category: "DOMAIN", slot: 5, semester: 7, title: null },
    { category: "DOMAIN", slot: 6, semester: 8, title: null },
    { category: "DOMAIN", slot: 7, semester: 8, title: null },
  ],
  "BS-CYS-2020": [
    { category: "UNIVERSITY", slot: 1, semester: 5, title: "Management Information System" },
    { category: "UNIVERSITY", slot: 2, semester: 6, title: "Financial Accounting" },
    { category: "UNIVERSITY", slot: 3, semester: 7, title: null },
    { category: "UNIVERSITY", slot: 4, semester: 8, title: null },
    { category: "DOMAIN", slot: 1, semester: 4, title: "Ethical Hacking & Penetration Testing" },
    { category: "DOMAIN", slot: 2, semester: 5, title: "Blockchain Technologies" },
    { category: "DOMAIN", slot: 3, semester: 6, title: "Cloud Security" },
    { category: "DOMAIN", slot: 4, semester: 6, title: "Cyber Law & Cyber Crime (Cyber Warfare)" },
  ],
  "BS-CYS-2024": [
    { category: "UNIVERSITY", slot: 1, semester: 3, title: "Financial Accounting" },
    { category: "UNIVERSITY", slot: 2, semester: 8, title: null },
    { category: "DOMAIN", slot: 1, semester: 5, title: "Ethical Hacking & Penetration Testing" },
    { category: "DOMAIN", slot: 2, semester: 5, title: "Blockchain Technologies" },
    { category: "DOMAIN", slot: 3, semester: 5, title: "Cyber Law & Cyber Crime (Cyber Warfare)" },
    { category: "DOMAIN", slot: 4, semester: 7, title: null },
    { category: "DOMAIN", slot: 5, semester: 7, title: null },
    { category: "DOMAIN", slot: 6, semester: 7, title: null },
  ],
};

/**
 * POS rows the departments now treat as an elective slot although the printed POS has a fixed course there.
 * BS-CYS-2024 semester 3 prints "Organizational Behaviour"; the department offers Financial Accounting in that place (University Elective-I).
 */
export const SLOT_OVERRIDES: Record<string, { semester: number; title: string; slotTitle: string }[]> = {
  "BS-CYS-2024": [{ semester: 3, title: "Organizational Behaviour", slotTitle: "University Elective-I" }],
};

/** Apply SLOT_OVERRIDES to the POS rows of one POS code. */
export function applySlotOverrides(posCode: string, rows: PosCourseRow[]): PosCourseRow[] {
  const ov = SLOT_OVERRIDES[posCode];
  if (!ov) return rows;
  return rows.map((r) => {
    const o = ov.find((x) => x.semester === r.semester && keyOfTitle(x.title) === keyOfTitle(r.title));
    return o ? { ...r, title: o.slotTitle, isPlaceholder: true, alsoAccepts: r.title } : r;
  });
}
