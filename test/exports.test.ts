import { describe, it, expect } from "vitest";
import readXlsx from "read-excel-file/node";
import { buildItWorkbook, IT_COLUMNS } from "../src/lib/exports/excel";
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

describe("Excel for IT", () => {
  it("has exactly the agreed columns and one row per student-course, ID repeated on every row", async () => {
    const [sheet] = await readXlsx(await buildItWorkbook([a, b]));
    expect(sheet.sheet).toBe("Registrations");
    expect(sheet.data[0]).toEqual([...IT_COLUMNS]);
    expect(IT_COLUMNS).toEqual(["Student Registration ID", "CBA Code", "Course Code", "Class & Section", "Course Name"]);
    expect(sheet.data).toHaveLength(1 + 3 + 2);
    expect(sheet.data[1]).toEqual(["SE259001", 17343, "CS-2007", "SE-3A", "Data Structures & Algorithms"]);
    expect(sheet.data.slice(1).map((r) => r[0])).toEqual(["SE259001", "SE259001", "SE259001", "SE259002", "SE259002"]);
    expect(sheet.data[5]).toEqual(["SE259002", 17348, "CS-2007L", "SE-3B", "Data Structures & Algorithms Lab"]);
  });
  it("never turns text into a formula and keeps non-numeric CBA codes as text", async () => {
    const evil = slip("SE259003", "X", [item("CS-1", "=HYPERLINK(\"http://evil\",\"x\")", "SE-3A", "ABC1", 3)]);
    const [sheet] = await readXlsx(await buildItWorkbook([evil]));
    expect(sheet.data[1][4]).toBe('=HYPERLINK("http://evil","x")'); // stored as plain text
    expect(sheet.data[1][1]).toBe("ABC1");
  });
  it("an empty set still produces a valid file with just the header", async () => {
    const [sheet] = await readXlsx(await buildItWorkbook([]));
    expect(sheet.data).toHaveLength(1);
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
