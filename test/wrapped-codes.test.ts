import { describe, it, expect } from "vitest";
import { parsePlan, repairWrappedCodes } from "../src/lib/parsers/common";

// Invented layouts that mimic a report whose code column is too narrow: codes wrap onto the next line.

describe("repairWrappedCodes", () => {
  it("rejoins a lab 'L' that wrapped onto its own line", () => {
    expect(repairWrappedCodes(["4 CYS1001 Programming Fundamentals Lab 1", "L", "5 CYS-1002 Next Course 3"])).toEqual(["4 CYS1001L Programming Fundamentals Lab 1", "5 CYS-1002 Next Course 3"]);
  });
  it("keeps the title text that shares the continuation line", () => {
    expect(repairWrappedCodes(["CYS1201 Application of Information & B+ 3.33 1 3.33", "L Communication Technologies", "Lab"])).toEqual(["CYS1201L Application of Information & B+ 3.33 1 3.33", "Communication Technologies", "Lab"]);
  });
  it("rejoins a 3-digit code whose last digit wrapped, alone or with title text", () => {
    expect(repairWrappedCodes(["3 CYS-100 Discrete Structures 3", "3", "4 CYS-1002 X 3"])).toEqual(["3 CYS-1003 Discrete Structures 3", "4 CYS-1002 X 3"]);
    expect(repairWrappedCodes(["7 CYS-120 Application of Information and Communication 2", "1 Technologies"])).toEqual(["7 CYS-1201 Application of Information and Communication 2", "Technologies"]);
  });
  it("never swallows the serial number of the next row, or touches normal rows", () => {
    const rows = ["3 CYS-100 Discrete Structures 3", "4 CYS1001 Programming Fundamentals Lab 1"];
    expect(repairWrappedCodes(rows)[1]).toBe("4 CYS1001 Programming Fundamentals Lab 1"); // '4' is a serial, followed by a code
    const normal = ["1 BS-1301 Calculus 3", "2 CYS-1003 Discrete Structures 3", "3 CYS-1001L Lab 1"];
    expect(repairWrappedCodes(normal)).toEqual(normal);
  });
  it("does not turn a theory course followed by its own lab into one row", () => {
    const rows = ["CYS-2003 Computer Networks A 4.00 3 12.00", "CYS2003 Computer Networks Lab A 4.00 1 4.00", "L"];
    expect(repairWrappedCodes(rows)).toEqual(["CYS-2003 Computer Networks A 4.00 3 12.00", "CYS2003L Computer Networks Lab A 4.00 1 4.00"]);
  });
});

describe("a wrapped-code Plan of Study page", () => {
  const lines = [
    "Semester 1", "S. No. Course Course Title Credit", "Code Hours",
    "1 BS-1301 Calculus and Analytical Geometry 3",
    "3 CYS-100 Discrete Structures 3", "3",
    "4 CYS1001 Programming Fundamentals Lab 1", "L",
    "5 CYS-100 Programming Fundamentals 3", "1",
    "6 CYS-120 Application of Information and Communication 2", "1 Technologies",
    "Total 12",
    "Semester 2", "1 HU-1001 Communication 3", "Total 3",
  ];
  it("reads every course with the right code, lab suffix, title and semester", () => {
    const { courses, semesterTotals } = parsePlan(lines);
    expect(courses.map((c) => c.code)).toEqual(["BS-1301", "CYS-1003", "CYS-1001L", "CYS-1001", "CYS-1201", "HU-1001"]);
    expect(courses.find((c) => c.code === "CYS-1201")!.title).toBe("Application of Information and Communication Technologies");
    expect(courses.filter((c) => c.semester === 1).reduce((a, c) => a + c.ch, 0)).toBe(12);
    expect(semesterTotals).toEqual({ 1: 12, 2: 3 });
  });
});
