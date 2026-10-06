import { describe, it, expect } from "vitest";
import readXlsx from "read-excel-file/node";
import { buildItWorkbook, IT_COLUMNS } from "../src/lib/exports/excel";
import { OFFERING_COLUMNS, buildOfferingsWorkbook } from "../src/lib/exports/offerings";
import { buildSlipsPdf, pdfSafe } from "../src/lib/exports/pdf";
import type { Slip, SlipItem } from "../src/lib/exports/slips";
import { pdfPages } from "../src/lib/parsers/pdfText";

// Invented students only.
const item = (code: string, name: string, section: string, cba: string, ch: number): SlipItem => ({ courseCode: code, courseName: name, section, cbaCode: cba, ch });
const slip = (id: string, name: string, items: SlipItem[], extra: Partial<Slip> = {}): Slip => ({
  studentId: 1, registrationId: id, name, program: "SE", homeSection: "SE-3A", advisor: "Ayesha Malik", version: 1, status: "FINALIZED",
  committedAt: new Date("2026-10-01T09:00:00Z"), items, totalCH: items.reduce((a, i) => a + i.ch, 0), ...extra,
});
const a = slip("SE259001", "Test Student One", [item("CS-2007", "Data Structures & Algorithms", "SE-3A", "17343", 3), item("CS-2007L", "Data Structures & Algorithms Lab", "SE-3A", "17347", 1), item("CS-2201", "Computer Networks", "SE-3A", "17350", 3)]);
const b = slip("SE259002", "Test Student Two", [item("CS-2007", "Data Structures & Algorithms", "SE-3B", "17344", 3), item("CS-2007L", "Data Structures & Algorithms Lab", "SE-3B", "17348", 1)], { homeSection: "SE-3B", version: 2 });

const O = (sheet: string, cba: string | null, code: string, section: string | null, name: string) => ({ sheet, cbaCode: cba, courseCode: code, section, courseName: name });
const offered = [
  O("SE-3", "17343", "CS-2007", "SE-3A", "Data Structures & Algorithms"),
  O("SE-3", "17344", "CS-2007", "SE-3B", "Data Structures & Algorithms"),
  O("SE-3", "17347", "CS-2007L", "SE-3A", "Data Structures & Algorithms Lab"),
  O("SE-3", "17348", "CS-2007L", "SE-3B", "Data Structures & Algorithms Lab"),
  O("SE-3", "17350", "CS-2201", "SE-3A", "Computer Networks"),
  O("SE-3", "17351", "CS-2201", "SE-3B", "Computer Networks"), // nobody registered
  O("SE-5", "17400", "SE-3304", "SE-5A", "Devops"), // nobody registered
];

describe("Excel for IT", () => {
  it("follows the offering workbook: one sheet per class, one row per CBA code, student IDs in the columns after the course name", async () => {
    const c = slip("SE259003", "Test Student Three", [item("CS-2007", "Data Structures & Algorithms", "SE-3A", "17343", 3)]);
    const sheets = await readXlsx(await buildItWorkbook([a, b, c], offered));
    expect(sheets.map((s) => s.sheet)).toEqual(["SE-3", "SE-5"]);
    const se3 = sheets[0].data;
    expect([...IT_COLUMNS]).toEqual(["CBA Code", "Course Code", "Class & Section", "Course Name"]);
    expect(se3[0]).toEqual(["CBA Code", "Course Code", "Class & Section", "Course Name", "Student 1", "Student 2"]);
    expect(se3.slice(1).map((r) => r[0])).toEqual([17343, 17344, 17347, 17348, 17350, 17351]); // every offered CBA code once, in order
    expect(se3[1]).toEqual([17343, "CS-2007", "SE-3A", "Data Structures & Algorithms", "SE259001", "SE259003"]);
    expect(se3[2]).toEqual([17344, "CS-2007", "SE-3B", "Data Structures & Algorithms", "SE259002", null]);
    expect(se3[6]).toEqual([17351, "CS-2201", "SE-3B", "Computer Networks", null, null]); // offered, nobody registered
    expect(sheets[1].data[1]).toEqual([17400, "SE-3304", "SE-5A", "Devops"]);
  });
  it("a single-student download lists only the rows that student registered for", async () => {
    const sheets = await readXlsx(await buildItWorkbook([b], offered, { onlyRegistered: true }));
    expect(sheets).toHaveLength(1);
    expect(sheets[0].data.slice(1).map((r) => [r[0], r[4]])).toEqual([[17344, "SE259002"], [17348, "SE259002"]]);
  });
  it("a CBA code the offering list repeats stays one row, and one that is no longer offered goes on its own sheet", async () => {
    const dup = [O("SE-3", "17349", "CS-1", "SE-3C", "Theory"), O("SE-3", "17349", "CS-1L", "SE-3C", "Lab")];
    const x = slip("SE259001", "X", [item("CS-1", "Theory", "SE-3C", "17349", 3), item("CS-9", "Gone", "SE-3A", "19999", 3)]);
    const sheets = await readXlsx(await buildItWorkbook([x], dup));
    expect(sheets.map((s) => s.sheet)).toEqual(["SE-3", "Not in offering list"]);
    expect(sheets[0].data).toHaveLength(2);
    expect(sheets[0].data[1]).toEqual([17349, "CS-1 / CS-1L", "SE-3C", "Theory / Lab", "SE259001"]);
    expect(sheets[1].data[1]).toEqual([19999, "CS-9", "SE-3A", "Gone", "SE259001"]);
  });
  it("never turns text into a formula and keeps non-numeric CBA codes as text", async () => {
    const evil = slip("SE259003", "X", [item("CS-1", "=HYPERLINK(\"http://evil\",\"x\")", "SE-3A", "ABC1", 3)]);
    const [sheet] = await readXlsx(await buildItWorkbook([evil], [], { onlyRegistered: true }));
    expect(sheet.data[1][3]).toBe('=HYPERLINK("http://evil","x")'); // stored as plain text
    expect(sheet.data[1][0]).toBe("ABC1");
  });
  it("an empty set still produces a valid file with just the header", async () => {
    const [sheet] = await readXlsx(await buildItWorkbook([], []));
    expect(sheet.data).toHaveLength(1);
  });
});

describe("offerings download", () => {
  it("writes one sheet per class with the upload's columns", async () => {
    const sheets = await readXlsx(await buildOfferingsWorkbook([
      { sheet: "SE-5", cbaCode: "17400", courseCode: "SE-3304", section: "SE-5A", courseName: "Devops" },
      { sheet: "SE-3", cbaCode: "17343", courseCode: "CS-2007", section: "SE-3A", courseName: "Data Structures & Algorithms" },
      { sheet: "SE-3", cbaCode: null, courseCode: "CS-2201", section: null, courseName: "Computer Networks" },
    ]));
    expect(sheets.map((s) => s.sheet)).toEqual(["SE-3", "SE-5"]);
    expect(sheets[0].data[0]).toEqual([...OFFERING_COLUMNS]);
    expect(sheets[0].data).toHaveLength(3);
    expect(sheets[1].data[1]).toEqual([17400, "SE-3304", "SE-5A", "Devops"]);
  });
});

describe("combined PDF", () => {
  const text = async (buf: Buffer) => (await pdfPages(buf)).map((p) => p.flat.join("\n"));
  const meta = { semester: "Fall 2026", generatedAt: new Date("2026-10-06T10:00:00Z") };

  it("is a real PDF with one page per student showing name, ID, courses, sections and total", async () => {
    const buf = await buildSlipsPdf([a, b], meta);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const pages = await text(buf);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain("Test Student One");
    expect(pages[0]).toContain("SE259001");
    expect(pages[0]).toContain("Fall 2026");
    expect(pages[0]).toContain("Data Structures & Algorithms");
    expect(pages[0]).toContain("SE-3A");
    expect(pages[0]).toContain("17343");
    expect(pages[0]).toContain("Total credit hours: 7");
    expect(pages[0]).not.toContain("Test Student Two"); // students never share a page
    expect(pages[1]).toContain("Test Student Two");
    expect(pages[1]).toContain("SE-3B");
    expect(pages[1]).toMatch(/Registration version\s+2\s+\(finalized\)/); // the registration version is on the slip
    expect(pages[0]).toContain("page 1 of 2");
    expect(pages[1]).toContain("page 2 of 2");
  });
  it("does not break on characters the PDF font cannot draw", async () => {
    const odd = slip("SE259004", "Zoë محمد — O’Neil", [item("CS-9", "Course → with اردو text", "SE-3A", "1", 3)]);
    const pages = await text(await buildSlipsPdf([odd], meta));
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain("SE259004");
    expect(pdfSafe("a—b’cا")).toBe("a-b'c?");
  });
  it("truncates very long names instead of overflowing, and paginates unusually long registrations", async () => {
    const long = slip("SE259005", "N".repeat(200), Array.from({ length: 45 }, (_, i) => item(`CS-${1000 + i}`, "Course ".repeat(30), "SE-3A", String(17000 + i), 1)));
    const pages = await text(await buildSlipsPdf([long], meta));
    expect(pages.length).toBeGreaterThan(1); // the 45-course student continues on a second page
    expect(pages[0]).toContain("...");
    expect(pages[1]).toContain("(continued)");
    expect(pages.every((p) => p.includes("SE259005"))).toBe(true);
  });
  it("an empty set still yields a valid one-page PDF", async () => {
    expect(await text(await buildSlipsPdf([], meta))).toHaveLength(1);
  });
});
