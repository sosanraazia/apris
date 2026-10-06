import writeXlsxFile from "write-excel-file/node";
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { parseTranscriptPdf } from "../src/lib/parsers/transcript";
import { parseFulfillmentPdf, parsePosPdf } from "../src/lib/parsers/fulfillment";
import { parseOfferingWorkbook, parsePrereqWorkbook } from "../src/lib/importers";
import { recommend } from "../src/lib/rules/engine";
import { DEFAULT_SETTINGS } from "../src/lib/rules/types";
import type { OfferingRow, StudentInput } from "../src/lib/rules/types";

const d = (f: string) => `${__dirname}/../data/${f}`;
// Real student PDFs are never committed (personal data). Tests that need them run locally only.
const HAS_SAMPLES = existsSync(d("sample/students.pdf")) && existsSync(d("sample/students-2.pdf"));

async function sample(homeSection = "SE-3A", standing: StudentInput["standing"] = "NORMAL") {
  const t = await parseTranscriptPdf(d("sample/students-2.pdf"));
  const f = await parseFulfillmentPdf(d("sample/students.pdf"));
  const student: StudentInput = { registrationId: t.registrationId, program: t.program, posVariant: f.pos.variant, homeSection, standing, pos: f.pos.courses, attempts: t.courses };
  const off = (await parseOfferingWorkbook(d("Fall2026CourseOffering.xlsx"))).rows.map((r, i): OfferingRow => ({ ...r, id: String(i) }));
  return { t, f, student, off, prereqs: await parsePrereqWorkbook(d("PreReqRules.xlsx")) };
}

describe("parsers", () => {
  it.skipIf(!HAS_SAMPLES)("reads the sample transcript and fulfillment report consistently", async () => {
    const { t, f } = await sample();
    expect(t.registrationId).toBe("SE251093");
    expect(f.registrationId).toBe(t.registrationId);
    expect(t.courses).toHaveLength(16);
    expect(t.warnings).toEqual([]);
    expect(f.pos.posCode).toBe("BS-SE-2024");
    expect(f.pos.variant).toBe("MINORITIES_PREMED");
    expect(f.pos.courses.reduce((a, c) => a + c.ch, 0)).toBe(137);
  });
  it("parses all 17 POS variants with credit hours that add up", async () => {
    const all = [...(await parsePosPdf(d("SoftwareEngineering_PoS.pdf"))), ...(await parsePosPdf(d("CyberSecurity_PoS.pdf")))];
    expect(all).toHaveLength(17);
    for (const p of all) expect(p.courses.reduce((a, c) => a + c.ch, 0), p.posCode + p.variant).toBe(p.totalRequired);
  });
});

describe("offering import", () => {
  it("the seed workbook is complete: every row has its own CBA code and a section", async () => {
    const { rows, notes } = await parseOfferingWorkbook(d("Fall2026CourseOffering.xlsx"));
    expect(rows.length).toBeGreaterThan(70);
    expect(rows.every((r) => r.cbaCode && r.section)).toBe(true);
    const ai = rows.find((r) => r.sheet === "SE-5" && r.courseCode === "CS-3301" && r.section === "SE-5A")!;
    expect(ai.cbaCode).toBe("17362");
    expect(new Set(rows.map((r) => r.cbaCode)).size).toBe(rows.length); // every row has its own CBA code
    expect(notes).toEqual([]);
  });
  it("normalises swapped columns in a workbook (invented rows)", async () => {
    const buf = Buffer.from(await writeXlsxFile([{ sheet: "SE-5", data: [
      ["CBA Code", "Course Code", "Class & Section", "Course Name"],
      [17001, "SE-5A", "CS-3301", "Artificial Intelligence"], // section and course code swapped
      [17002, "CS-3301", "SE-5B", "Artificial Intelligence"],
    ].map((r) => r.map((v) => (typeof v === "number" ? { value: v, type: Number } : { value: v, type: String }))) }]).toBuffer());
    const { rows, normalizedCount } = await parseOfferingWorkbook(buf);
    expect(normalizedCount).toBe(1);
    expect(rows.map((r) => [r.courseCode, r.section])).toEqual([["CS-3301", "SE-5A"], ["CS-3301", "SE-5B"]]);
  });
});

describe.skipIf(!HAS_SAMPLES)("recommendation for the sample student", () => {
  it("recommends the SE-3 block in home section SE-3A and explains the rest", async () => {
    const { student, off, prereqs } = await sample();
    const rec = recommend(student, prereqs, off, DEFAULT_SETTINGS);
    expect(rec.targetSemester).toBe(3);
    expect(rec.completedCH).toBe(30);
    expect(rec.fypEligible).toBe(false);
    const by = (code: string) => rec.items.find((i) => i.code === code)!;
    expect(by("CS-2007").status).toBe("RECOMMENDED");
    expect(by("CS-2007").suggested?.section).toBe("SE-3A");
    expect(by("CS-2007").suggested?.cbaCode).toBe("17343");
    expect(by("CS-2007L").suggested?.cbaCode).toBe("17347");
    expect(by("CS-2201").suggested?.cbaCode).toBe("17350");
    expect(by("CS-2801").suggested?.section).toBe("SE-3A");
    // backlog Discrete Structures: not offered for SE, only cross-program
    expect(by("CS-1003").isBacklog).toBe(true);
    expect(by("CS-1003").suggested).toBeNull();
    expect(by("CS-1003").status).toBe("RECOMMENDED");
    expect(by("CS-1003").priority).toBe(1);
    expect(by("CS-1003").choices.length).toBeGreaterThan(0);
    expect(by("CS-1003").choices.every((c) => c.crossProgram)).toBe(true);
    // only the student's own semester sheet is offered as "ahead of POS"
    expect(rec.items.filter((i) => i.status === "OPTIONAL").map((i) => i.code)).toEqual(["BS-2301"]);
    expect(rec.recommendedCH).toBeLessThanOrEqual(18);
  });
  it("blocks courses with unmet prerequisites and enforces the FYP threshold", async () => {
    const { student, off, prereqs } = await sample("SE-7A");
    const rec = recommend(student, prereqs, off, DEFAULT_SETTINGS);
    const fyp = rec.items.find((i) => /Final Year Project-I$/.test(i.title))!;
    expect(fyp.status).toBe("NOT_ELIGIBLE");
    expect(fyp.reason).toContain("30 of 90");
  });
  it("does not auto-recommend for probation when the limit is unset", async () => {
    const { student, off, prereqs } = await sample("SE-3A", "PROBATION");
    const rec = recommend(student, prereqs, off, DEFAULT_SETTINGS);
    expect(rec.warnings.join(" ")).toMatch(/registered manually/);
    expect(rec.items.some((i) => i.status === "RECOMMENDED")).toBe(false);
  });
});

describe.skipIf(!HAS_SAMPLES)("rules on synthetic students", () => {
  const att = (code: string, title: string, ch: number, grade = "A", gp = 4.0, term = "Fall 2025", termOrder = 20253) => ({ term, termOrder, code, title, grade, gradePoint: gp, ch });

  it("blocks a course whose prerequisite was failed, and explains why", async () => {
    const { student, off, prereqs } = await sample("SE-3A");
    // Programming Fundamentals failed (F) → DSA + OOP-dependent courses must block
    const attempts = student.attempts.map((a) => (a.code === "CS-1002" ? { ...a, grade: "F", gradePoint: 0 } : a));
    const rec = recommend({ ...student, attempts }, prereqs, off, DEFAULT_SETTINGS);
    const dsa = rec.items.find((i) => i.code === "CS-2007")!;
    expect(dsa.status).toBe("BLOCKED");
    expect(dsa.reason).toContain("Programming Fundamentals");
    // the Fall workbook has no semester-1 sheet, so the retake can't be scheduled — surfaced, not hidden
    expect(rec.items.find((i) => i.code === "CS-1002")?.status).toBe("NOT_OFFERED");
  });

  it("FYP-I eligibility switches exactly at the configured threshold", async () => {
    const { student, off, prereqs } = await sample("SE-7A");
    const pad = (ch: number) => [...student.attempts, att("XX-0001", "Padding Course", ch)];
    const at = (n: number) => recommend({ ...student, attempts: pad(n - 30) }, prereqs, off, DEFAULT_SETTINGS);
    expect(at(89).items.find((i) => /Final Year Project-I$/.test(i.title))?.status).toBe("NOT_ELIGIBLE");
    expect(at(90).fypEligible).toBe(true);
    // admin can raise the threshold
    expect(recommend({ ...student, attempts: pad(60) }, prereqs, off, { ...DEFAULT_SETTINGS, fypThresholdCH: 100 }).fypEligible).toBe(false);
  });

  it("FYP-II requires FYP-I to be passed", async () => {
    const { student, off, prereqs } = await sample("SE-7A");
    const pos = [...student.pos, { semester: 7, code: "CS-4014", title: "Final Year Project - II", ch: 3, isPlaceholder: false }];
    const rec = recommend({ ...student, pos, attempts: [...student.attempts, att("XX-0001", "Padding", 70)] }, prereqs, [...off, { id: "900", dbId: 900, sheet: "SE-7", program: "SE", courseCode: "CS-4014", courseName: "Final Year Project - II", section: "SE-7A", cbaCode: "1", preMedOnly: false, issues: [] } as OfferingRow], DEFAULT_SETTINGS);
    expect(rec.items.find((i) => i.code === "CS-4014")?.status).toBe("BLOCKED");
  });

  it("never lets the recommended load exceed the regular ceiling, and pairs labs with theory", async () => {
    const { student, off, prereqs } = await sample("SE-3A");
    const rec = recommend(student, prereqs, off, { ...DEFAULT_SETTINGS, regularMaxCH: 8 });
    expect(rec.recommendedCH).toBeLessThanOrEqual(8);
    const on = (code: string) => rec.items.find((i) => i.code === code)!.status === "RECOMMENDED";
    expect(on("CS-2007")).toBe(on("CS-2007L"));
    expect(on("CS-2201")).toBe(on("CS-2201L"));
  });

  it("a frozen student gets no recommendations", async () => {
    const { student, off, prereqs } = await sample("SE-3A", "FROZEN");
    expect(recommend(student, prereqs, off, DEFAULT_SETTINGS).items.some((i) => i.status === "RECOMMENDED")).toBe(false);
  });

  it("works with no home section: semester inferred from the transcript, no section auto-suggested", async () => {
    const { student, off, prereqs } = await sample(null as unknown as string);
    const rec = recommend({ ...student, homeSection: null }, prereqs, off, DEFAULT_SETTINGS);
    expect(rec.targetSemester).toBe(3); // two completed terms → semester 3
    const dsa = rec.items.find((i) => i.code === "CS-2007")!;
    expect(dsa.status).toBe("RECOMMENDED");
    expect(dsa.suggested).toBeNull();
    expect(dsa.sectionNote).toMatch(/not set yet/);
    expect(dsa.choices.length).toBe(3);
  });
});

describe("POS PDFs: every semester matches its printed total", () => {
  it("all 17 variants have 8 semesters and each semester's courses add up to that semester's printed Total", async () => {
    const all = [...(await parsePosPdf(d("SoftwareEngineering_PoS.pdf"))), ...(await parsePosPdf(d("CyberSecurity_PoS.pdf")))];
    expect(all).toHaveLength(17);
    for (const p of all) {
      const label = `${p.posCode} ${p.variant}`;
      const sems = [...new Set(p.courses.map((c) => c.semester))].sort((a, b) => a - b);
      expect(sems, label + " semesters").toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      for (const [sem, stated] of Object.entries(p.semesterTotals)) {
        const got = p.courses.filter((c) => c.semester === Number(sem)).reduce((a, c) => a + c.ch, 0);
        expect(got, `${label} semester ${sem}`).toBe(stated);
      }
      expect(Object.keys(p.semesterTotals).length, label + " printed totals found").toBe(8);
    }
  });
});
