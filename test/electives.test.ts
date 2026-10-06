import { describe, it, expect } from "vitest";
import { applySlotOverrides, classifyElectiveSlot, isElectiveSlotRow, keyOfTitle } from "../src/lib/rules/electives";
import { findUnmatchedAttempts, posProgress, recommend } from "../src/lib/rules/engine";
import { DEFAULT_SETTINGS } from "../src/lib/rules/types";
import type { AttemptRow, ElectiveMapRow, OfferingRow, StudentInput } from "../src/lib/rules/types";

// Invented student/offerings only.
describe("classifyElectiveSlot", () => {
  it("reads category and slot number from the many POS spellings", () => {
    expect(classifyElectiveSlot("University Elective III")).toEqual({ category: "UNIVERSITY", slot: 3 });
    expect(classifyElectiveSlot("Uni Elective-1")).toEqual({ category: "UNIVERSITY", slot: 1 });
    expect(classifyElectiveSlot("Uni-Elective-2")).toEqual({ category: "UNIVERSITY", slot: 2 });
    expect(classifyElectiveSlot("University Elective-I (OB)")).toEqual({ category: "UNIVERSITY", slot: 1 });
    expect(classifyElectiveSlot("University Elective IV 130")).toEqual({ category: "UNIVERSITY", slot: 4 });
    expect(classifyElectiveSlot("SE Elective VI 137")).toEqual({ category: "DOMAIN", slot: 6 });
    expect(classifyElectiveSlot("CySec Elective-2 Lab")).toEqual({ category: "DOMAIN", slot: 2 });
  });
  it("ignores placeholders that are not elective slots", () => {
    expect(classifyElectiveSlot("Fehm-e-Quran – I")).toBeNull();
    expect(classifyElectiveSlot("Entrepreneurship 134")).toBeNull();
  });
});

describe("isElectiveSlotRow", () => {
  it("treats a titled elective with a concrete printed code as a slot", () => {
    expect(isElectiveSlotRow("CySec Elective-5", false)).toBe(true);
    expect(isElectiveSlotRow("Elective Supporting", false)).toBe(false);
    expect(isElectiveSlotRow("Fehm-e-Quran – I", true)).toBe(true); // pattern codes stay placeholders
  });
});

const map = (category: "UNIVERSITY" | "DOMAIN", slot: number, title: string | null): ElectiveMapRow => ({ category, slot, semester: null, courseTitle: title, titleKey: title ? keyOfTitle(title) : null });
const off = (id: number, code: string, name: string, section = "SE-7A"): OfferingRow => ({ id: String(id), sheet: "SE-7", program: "SE", courseCode: code, courseName: name, section, cbaCode: String(10000 + id), preMedOnly: false, issues: [] });
const pass = (code: string, title: string, termOrder = 1): AttemptRow => ({ term: `T${termOrder}`, termOrder, code, title, grade: "B", gradePoint: 3, ch: 3 });

const student = (attempts: AttemptRow[], electives: ElectiveMapRow[]): StudentInput => ({
  registrationId: "SE230000", program: "SE", posVariant: "REGULAR", homeSection: "SE-7A", standing: "NORMAL",
  pos: [
    { semester: 6, code: "SE-XXXX", title: "SE Elective I", ch: 3, isPlaceholder: true },
    { semester: 7, code: "SE-XXXX", title: "SE Elective II", ch: 3, isPlaceholder: true },
    { semester: 7, code: "SE-XXXX", title: "SE Elective III", ch: 3, isPlaceholder: true },
    { semester: 8, code: "UE-XXXX", title: "University Elective IV", ch: 3, isPlaceholder: true },
  ],
  electives,
  attempts,
});
const E = [map("DOMAIN", 1, "DevOps"), map("DOMAIN", 2, "Artificial Intelligence"), map("DOMAIN", 3, "Mobile Application Development"), map("UNIVERSITY", 4, null)];
const offerings = [off(1, "SE-3304", "Devops", "SE-5A"), off(2, "SE-4306", "Artificial Intelligence"), off(3, "SE-4308", "Mobile Application Development"), off(4, "MS-1202", "Financial Accounting")];

describe("assigned elective slots", () => {
  it("offers only the assigned course for each slot, even when its code does not match the placeholder", () => {
    const rec = recommend(student([], E), [], offerings, DEFAULT_SETTINGS);
    const slot = (title: string) => rec.items.find((i) => i.title === title)!;
    expect(slot("SE Elective I").choices.map((c) => c.courseName)).toEqual(["Devops"]);
    expect(slot("SE Elective II").choices.map((c) => c.courseName)).toEqual(["Artificial Intelligence"]);
    expect(slot("SE Elective III").choices.map((c) => c.courseName)).toEqual(["Mobile Application Development"]);
    expect(slot("SE Elective II").status).toBe("ELECTIVE_CHOICE");
  });
  it("a passed assigned course fills its slot and is no longer offered", () => {
    const s = student([pass("SE-3304", "DevOps")], E);
    expect(posProgress(s, DEFAULT_SETTINGS).find((p) => p.title === "SE Elective I")?.state).toBe("COMPLETED");
    const rec = recommend(s, [], offerings, DEFAULT_SETTINGS);
    expect(rec.items.some((i) => i.title === "SE Elective I")).toBe(false);
    expect(findUnmatchedAttempts(s, DEFAULT_SETTINGS)).toHaveLength(0);
  });
  it("an assigned course only fills its own slot, not another one by code pattern", () => {
    const s = student([pass("SE-3304", "DevOps")], E);
    const progress = posProgress(s, DEFAULT_SETTINGS);
    expect(progress.filter((p) => p.state === "COMPLETED")).toHaveLength(1);
  });
  it("an N/A slot says no course is assigned instead of 'not offered'", () => {
    const s = student([], E);
    const rec = recommend({ ...s, homeSection: "SE-8A" }, [], offerings, DEFAULT_SETTINGS);
    const item = rec.items.find((i) => i.title === "University Elective IV")!;
    expect(item.status).toBe("NOT_OFFERED");
    expect(item.reason).toMatch(/no course assigned yet/);
  });
  it("without a mapping the old code-pattern behaviour still applies", () => {
    const rec = recommend(student([], []), [], [off(5, "SE-4999", "Some Elective")], DEFAULT_SETTINGS);
    expect(rec.items.find((i) => i.title === "SE Elective II")?.choices.map((c) => c.courseName)).toEqual(["Some Elective"]);
  });
  it("a course assigned to one slot is not offered to a different unassigned slot", () => {
    const e = [map("DOMAIN", 1, "DevOps")]; // slots 2 and 3 unassigned
    const rec = recommend(student([], e), [], offerings, DEFAULT_SETTINGS);
    for (const t of ["SE Elective II", "SE Elective III"]) expect(rec.items.find((i) => i.title === t)?.choices.some((c) => c.courseName === "Devops")).toBe(false);
  });
});

describe("CYS-2024 semester-3 University Elective-I (Financial Accounting replaces Organizational Behaviour)", () => {
  const pos = applySlotOverrides("BS-CYS-2024", [
    { semester: 3, code: "MS-3106", title: "Organizational Behaviour", ch: 2, isPlaceholder: false },
    { semester: 3, code: "CS-2801", title: "Software Engineering", ch: 3, isPlaceholder: false },
  ]);
  const input = (attempts: AttemptRow[]): StudentInput => ({ registrationId: "CYS240000", program: "CYS", posVariant: "REGULAR", homeSection: "CYS-3A", standing: "NORMAL", pos, electives: [map("UNIVERSITY", 1, "Financial Accounting")], attempts });
  const fa: OfferingRow = { id: "9", sheet: "CYS-3", program: "CYS", courseCode: "MS-1202", courseName: "Financial Accounting", section: "CYS-3A", cbaCode: "20001", preMedOnly: false, issues: [] };
  it("turns the fixed row into the University Elective-I slot and leaves other rows alone", () => {
    expect(pos[0]).toMatchObject({ title: "University Elective-I", isPlaceholder: true });
    expect(pos[1].isPlaceholder).toBe(false);
  });
  it("offers Financial Accounting for it, not Organizational Behaviour", () => {
    const item = recommend(input([]), [], [fa], DEFAULT_SETTINGS).items.find((i) => i.title === "University Elective-I")!;
    expect(item.choices.map((c) => c.courseName)).toEqual(["Financial Accounting"]);
  });
  it("a pass in either Financial Accounting or the printed Organizational Behaviour completes the slot", () => {
    for (const a of [pass("MS-1202", "Financial Accounting"), pass("MS-3106", "Organizational Behaviour")]) {
      const s = input([a]);
      expect(posProgress(s, DEFAULT_SETTINGS).find((p) => p.title === "University Elective-I")?.state).toBe("COMPLETED");
      expect(findUnmatchedAttempts(s, DEFAULT_SETTINGS)).toHaveLength(0);
    }
  });
});
