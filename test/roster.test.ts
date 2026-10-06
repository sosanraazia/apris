import { describe, it, expect } from "vitest";
import { batchOf, isRegularForSection, parseAwardListLines, suggestFromAdmission, suggestFromCohort, suggestHomeSection, termIndex, type RosterEntry } from "../src/lib/rosterRules";

// Invented data only — never real students.
const header = (section: string, term = "Spring 2026") => [
  "DHA SUFFA UNIVERSITY", "Award List", `End Semester Examination (${term} Semester)`,
  `Department: Computer Science Class and Section: BS-${section}`, "Course Title: Discrete Structures Course Code: CS-1003",
  "Name of Course Instructor: Mr. Example Credit Hours: 3", "S. No. Reg. No. Name Grade",
];
const rows = (ids: string[]) => ids.map((id, i) => `${i + 1} ${id} Student Name ${i} B+`);

describe("terms and batches", () => {
  it("orders terms and rejects nonsense", () => {
    expect(termIndex("Spring 2026")!).toBeLessThan(termIndex("Fall 2026")!);
    expect(termIndex("Fall 2026")!).toBeLessThan(termIndex("Spring 2027")!);
    expect(termIndex("Autumn 2026")).toBeNull();
  });
  it("reads the batch from the Registration ID", () => {
    expect(batchOf("se259093")).toBe(25);
    expect(batchOf("CYS249007")).toBe(24);
    expect(batchOf("nonsense")).toBeNull();
  });
  it("a student is 'regular' only when their batch matches the section's semester", () => {
    // Spring 2026: semester 2 = batch 25, 4 = 24, 6 = 23, 8 = 22
    expect(isRegularForSection("se259001", "Spring 2026", 2)).toBe(true);
    expect(isRegularForSection("se249017", "Spring 2026", 2)).toBe(false); // an older batch retaking
    expect(isRegularForSection("se249017", "Spring 2026", 4)).toBe(true);
    expect(isRegularForSection("se239001", "Spring 2026", 6)).toBe(true);
    expect(isRegularForSection("se229001", "Spring 2026", 8)).toBe(true);
    // Fall 2026: semester 3 = batch 25, semester 1 = batch 26
    expect(isRegularForSection("se259001", "Fall 2026", 3)).toBe(true);
    expect(isRegularForSection("se269001", "Fall 2026", 1)).toBe(true);
  });
});

describe("reading an Award List", () => {
  it("extracts term, section, course and the Registration IDs", () => {
    const l = parseAwardListLines([...header("SE-2A"), ...rows(["se259001", "se259003", "se249017"]), "Teacher's Signature ____ HOD's Signature ____"]);
    expect(l).toMatchObject({ term: "Spring 2026", program: "SE", semester: 2, letter: "A", section: "SE-2A", courseCode: "CS-1003", courseTitle: "Discrete Structures" });
    expect(l.registrationIds).toEqual(["SE259001", "SE259003", "SE249017"]);
    expect(l.warnings).toEqual([]);
  });
  it("works for Cyber Security and different terms", () => {
    const l = parseAwardListLines([...header("CYS-4B", "Fall 2026"), ...rows(["cys249001"])]);
    expect(l).toMatchObject({ term: "Fall 2026", program: "CYS", section: "CYS-4B" });
  });
  it("warns when row numbers skip (a row may have been missed) and on duplicates", () => {
    const l = parseAwardListLines([...header("SE-2A"), "1 se259001 A B", "2 se259002 A B", "4 se259004 A B", "5 se259004 A B"]);
    expect(l.warnings.join(" ")).toMatch(/not continuous/);
    expect(l.warnings.join(" ")).toMatch(/Duplicate/);
  });
  it("refuses documents that are not Award Lists", () => {
    expect(() => parseAwardListLines(["INTERIM TRANSCRIPT", "Registration No: SE259093"])).toThrow(/Class and Section/);
    expect(() => parseAwardListLines([...header("SE-2A")])).toThrow(/No student rows/);
    expect(() => parseAwardListLines(header("SE-2A").filter((x) => !x.includes("Examination")).concat(rows(["se259001"])))).toThrow(/term/);
  });
});

describe("suggesting the home section", () => {
  const e = (term: string, sourceSection: string, regular = true, program = "SE"): RosterEntry => ({ term, sourceSection, regular, program });

  it("Spring 2026 SE-2A → Fall 2026 SE-3A (next semester, same letter)", () => {
    const s = suggestHomeSection([e("Spring 2026", "SE-2A")], "SE", "Fall 2026");
    expect(s).toMatchObject({ kind: "suggested", section: "SE-3A" });
    expect(s.note).toContain("SE-2A");
  });
  it("moves up two semesters when the list is a year old", () => {
    expect(suggestHomeSection([e("Spring 2026", "SE-4B")], "SE", "Spring 2027").section).toBe("SE-6B");
  });
  it("keeps the section when the list is from the same term", () => {
    expect(suggestHomeSection([e("Fall 2026", "SE-3C")], "SE", "Fall 2026").section).toBe("SE-3C");
  });
  it("uses the most recent regular list", () => {
    expect(suggestHomeSection([e("Spring 2026", "SE-2A"), e("Fall 2026", "SE-3B")], "SE", "Spring 2027").section).toBe("SE-4B");
  });
  it("ignores backlog appearances: such a student has no derivable home section", () => {
    const s = suggestHomeSection([e("Spring 2026", "SE-2A", false)], "SE", "Fall 2026");
    expect(s.kind).toBe("none");
    expect(s.note).toMatch(/backlog attendee/);
  });
  it("a backlog appearance does not override the regular one", () => {
    expect(suggestHomeSection([e("Spring 2026", "SE-2A", false), e("Spring 2026", "SE-4B", true)], "SE", "Fall 2026").section).toBe("SE-5B");
  });
  it("final semester → no next section", () => {
    expect(suggestHomeSection([e("Spring 2026", "SE-8A")], "SE", "Fall 2026").kind).toBe("graduating");
  });
  it("conflicting regular sections in the same term → no guess", () => {
    expect(suggestHomeSection([e("Spring 2026", "SE-2A"), e("Spring 2026", "SE-2B")], "SE", "Fall 2026").kind).toBe("conflict");
  });
  it("never crosses programs and says so when the student isn't listed", () => {
    expect(suggestHomeSection([e("Spring 2026", "CYS-2A", true, "CYS")], "SE", "Fall 2026").kind).toBe("none");
    expect(suggestHomeSection([], "SE", "Fall 2026")).toMatchObject({ kind: "none", note: expect.stringContaining("Not found") });
  });
});

describe("single-section programs (CYS): the section follows from the admission term", () => {
  it("Fall 2025 admission is semester 3 in Fall 2026 → CYS-3A", () => {
    expect(suggestFromAdmission("CYS", "Fall 2025", "Fall 2026")).toMatchObject({ kind: "suggested", section: "CYS-3A" });
  });
  it("tracks the semester as time passes and for older batches", () => {
    expect(suggestFromAdmission("CYS", "Fall 2025", "Spring 2027").section).toBe("CYS-4A");
    expect(suggestFromAdmission("CYS", "Fall 2024", "Fall 2026").section).toBe("CYS-5A");
    expect(suggestFromAdmission("CYS", "Fall 2023", "Fall 2026").section).toBe("CYS-7A");
    expect(suggestFromAdmission("CYS", "Fall 2026", "Fall 2026").section).toBe("CYS-1A");
  });
  it("beyond semester 8 or before admission → no suggestion", () => {
    expect(suggestFromAdmission("CYS", "Fall 2022", "Fall 2026").kind).toBe("graduating");
    expect(suggestFromAdmission("CYS", "Fall 2027", "Fall 2026").kind).toBe("none");
  });
  it("never guesses for programs with several sections (SE)", () => {
    expect(suggestFromAdmission("SE", "Fall 2025", "Fall 2026").kind).toBe("none");
  });
  it("needs a readable admission term", () => {
    expect(suggestFromAdmission("CYS", null, "Fall 2026").kind).toBe("none");
    expect(suggestFromAdmission("CYS", "Autumn 2025", "Fall 2026").kind).toBe("none");
  });
});

describe("single-section programs: follow the batch-mates before doing date arithmetic", () => {
  const mates = (section: string, n: number, term = "Spring 2026") => Array.from({ length: n }, () => ({ term, sourceSection: section }));
  it("batch 23 sat in CYS-5A last term (a semester behind the dates) → CYS-6A, not CYS-7A", () => {
    const s = suggestFromCohort(mates("CYS-5A", 28), "CYS", "Fall 2026", 23);
    expect(s).toMatchObject({ kind: "suggested", section: "CYS-6A" });
    expect(s.note).toContain("28 of 28");
    // the plain date arithmetic would have said semester 7:
    expect(suggestFromAdmission("CYS", "Fall 2023", "Fall 2026").section).toBe("CYS-7A");
  });
  it("needs at least 3 batch-mates and a clear majority, otherwise no guess", () => {
    expect(suggestFromCohort(mates("CYS-5A", 2), "CYS", "Fall 2026", 23).kind).toBe("none");
    expect(suggestFromCohort([...mates("CYS-5A", 3), ...mates("CYS-4A", 3)], "CYS", "Fall 2026", 23).kind).toBe("none");
    expect(suggestFromCohort([...mates("CYS-5A", 8), ...mates("CYS-4A", 2)], "CYS", "Fall 2026", 23).section).toBe("CYS-6A");
  });
  it("uses the latest term and never applies to multi-section programs", () => {
    expect(suggestFromCohort([...mates("CYS-3A", 10, "Fall 2025"), ...mates("CYS-5A", 10, "Spring 2026")], "CYS", "Fall 2026", 23).section).toBe("CYS-6A");
    expect(suggestFromCohort(mates("SE-2A", 30), "SE", "Fall 2026", 25).kind).toBe("none");
  });
});
