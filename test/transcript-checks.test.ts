import { describe, it, expect } from "vitest";
import { parseTranscriptContent } from "../src/lib/parsers/transcript";
import { courseKey } from "../src/lib/rules/keys";
import { findUnmatchedAttempts, posProgress } from "../src/lib/rules/engine";
import { DEFAULT_SETTINGS, type AttemptRow, type StudentInput } from "../src/lib/rules/types";

// Invented transcripts only.
const flat = (title = "INTERIM TRANSCRIPT") => [
  "DHA SUFFA UNIVERSITY", title, "PROGRAM: BACHELOR OF SCIENCE IN CYBER SECURITY", "Registration No: CYS249001", "Name: Test Student",
  "Father's Name: Test Father Enrolled in the Program: Fall 2024",
  "1. Program Status: Incomplete 2. Total Credit Hours required to complete the program: 130 3. Credit Hours completed: 4",
];
const head = ["Fall Semester 2025", "Course Course Title Grade Grade Credit GP", "Code Point Hours Earned"];

describe("transcript reading checks", () => {
  it("a lab whose 'L' wrapped onto the next line is read as a lab (the failure that gave wrong recommendations)", () => {
    const t = parseTranscriptContent(flat(), [...head, "CYS-2003 Computer Networks A 4.00 3 12.00", "CYS2003 Computer Networks Lab A 4.00 1 4.00", "L", "SGPA: 4.00 CGPA: 4.00"]);
    expect(t.courses.map((c) => c.code)).toEqual(["CYS-2003", "CYS-2003L"]);
    expect(t.warnings).toEqual([]);
  });
  it("a lab that merely lost its 'L' is restored from its title, and the advisor is told", () => {
    const t = parseTranscriptContent(flat(), [...head, "CYS-2003 Computer Networks A 4.00 3 12.00", "CYS-2003 Computer Networks Lab A 4.00 1 4.00", "SGPA: 4.00 CGPA: 4.00"]);
    expect(t.courses.map((c) => c.code)).toEqual(["CYS-2003", "CYS-2003L"]);
    expect(t.warnings.join(" ")).toMatch(/Lab code restored: CYS-2003 → CYS-2003L/);
  });
  it("flags a term whose rows do not reproduce the printed SGPA (a row was missed or misread)", () => {
    const t = parseTranscriptContent(flat(), [...head, "CYS-2003 Computer Networks A 4.00 3 12.00", "SGPA: 3.00 CGPA: 3.00"]);
    expect(t.warnings.join(" ")).toMatch(/Fall 2025: the courses read give SGPA 4.00 but the transcript prints 3.00/);
  });
  it("flags duplicate codes in one term", () => {
    const t = parseTranscriptContent(flat(), [...head, "CYS-2003 Computer Networks A 4.00 3 12.00", "CYS-2003 Computer Networks A 4.00 3 12.00", "SGPA: 4.00 CGPA: 4.00"]);
    expect(t.warnings.join(" ")).toMatch(/CYS-2003 appears twice/);
  });
  it("a row-shaped line that could not be read is reported, not glued onto the previous course's title", () => {
    const t = parseTranscriptContent(flat(), [...head, "CYS-2003 Computer Networks A 4.00 3 12.00", "??? Mystery Course B 3.00 3 9.00", "SGPA: 3.50 CGPA: 3.50"]);
    expect(t.warnings.join(" ")).toMatch(/1 row\(s\) look like course rows but could not be read/);
    expect(t.courses).toHaveLength(1);
    expect(t.courses[0].title).toBe("Computer Networks"); // not "Computer Networks ??? Mystery Course …"
  });
  it("puts semesters in date order and takes the CGPA from the latest one (columns are read out of order)", () => {
    const t = parseTranscriptContent(flat(), [
      "Fall Semester 2025", ...head.slice(1), "CYS-2003 Computer Networks A 4.00 3 12.00", "SGPA: 4.00 CGPA: 3.96",
      "Spring Semester 2024", ...head.slice(1), "CYS-1003 Discrete Structures A 4.00 3 12.00", "SGPA: 4.00 CGPA: 3.87",
    ]);
    expect(t.terms.map((x) => x.term)).toEqual(["Spring 2024", "Fall 2025"]);
    expect(t.cgpa).toBe(3.96);
  });
  it("rejects the wrong kind of document with a clear message", () => {
    expect(() => parseTranscriptContent(["DHA SUFFA UNIVERSITY", "Current Enrollment Report", "Reg No: CYS249001"], [])).toThrow(/not an Interim Transcript.*Current Enrollment Report/);
  });
});

describe("matching a lab by title as well as by code", () => {
  it("a lab keeps the same identity whether or not its code carries the L", () => {
    expect(courseKey("CYS-2003", "Computer Networks Lab")).toBe(courseKey("CYS-2003L", "Computer Networks Lab"));
    expect(courseKey("CYS-2003L", "Computer Networks Lab")).toBe("computer networks#lab");
    expect(courseKey("CYS-2003", "Computer Networks")).toBe("computer networks"); // the theory course is unaffected
  });

  const pos = [
    { semester: 4, code: "CYS-2003", title: "Computer Networks", ch: 3, isPlaceholder: false },
    { semester: 4, code: "CYS-2003L", title: "Computer Networks Lab", ch: 1, isPlaceholder: false },
    { semester: 5, code: "UE-XXXX", title: "Uni Elective-1", ch: 3, isPlaceholder: true },
  ];
  const att = (code: string, title: string, ch: number, grade = "A", gp = 4): AttemptRow => ({ term: "Fall 2025", termOrder: 20253, code, title, grade, gradePoint: gp, ch });
  const student = (attempts: AttemptRow[]): StudentInput => ({ registrationId: "CYS249001", program: "CYS", posVariant: "REGULAR", homeSection: "CYS-6A", standing: "NORMAL", pos, attempts });

  it("even if a lab reaches the engine with its theory code, it still counts as passed (no false 'backlog' lab)", () => {
    const progress = posProgress(student([att("CYS-2003", "Computer Networks", 3), att("CYS-2003", "Computer Networks Lab", 1)]), DEFAULT_SETTINGS);
    expect(progress.filter((p) => p.semester === 4).map((p) => p.state)).toEqual(["COMPLETED", "COMPLETED"]);
  });
  it("courses that match nothing in the Plan of Study are flagged (misread transcript or wrong POS) — free electives are not", () => {
    const ok = findUnmatchedAttempts(student([att("CYS-2003", "Computer Networks", 3), att("CYS-2003L", "Computer Networks Lab", 1), att("UE-2105", "Some Free Elective", 3)]), DEFAULT_SETTINGS);
    expect(ok).toEqual([]);
    const odd = findUnmatchedAttempts(student([att("CYS-2003", "Computer Networks", 3), att("SE-4401", "Software Project Management", 3)]), DEFAULT_SETTINGS);
    expect(odd.map((a) => a.code)).toEqual(["SE-4401"]);
  });
});
