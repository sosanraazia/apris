import { describe, it, expect } from "vitest";
import { checkRule } from "../src/lib/rules/prereqRules";
import { courseKey } from "../src/lib/rules/keys";
import { recommend } from "../src/lib/rules/engine";
import { DEFAULT_SETTINGS } from "../src/lib/rules/types";
import type { AttemptRow, OfferingRow, StudentInput } from "../src/lib/rules/types";

const known = new Set(["programming fundamentals", "object oriented programming", "data structures and algorithms", "analysis of algorithms"].map((t) => courseKey("X-0000", t)));
const rules = [
  { course: "Object Oriented Programming", prerequisite: "Programming Fundamentals" },
  { course: "Analysis of Algorithms", prerequisite: "Data Structures" },
];

describe("checkRule", () => {
  it("accepts a sensible rule (and spellings that resolve to the same course)", () => {
    expect(checkRule({ course: "Data Structures", prerequisite: "Object Oriented Programming" }, known, rules)).toBeNull();
    expect(checkRule({ course: "Data Structures & Algorithms", prerequisite: "object oriented programming" }, known, rules)).toBeNull();
  });
  it("refuses unknown courses, labs, itself, duplicates and loops", () => {
    expect(checkRule({ course: "Basket Weaving", prerequisite: "Programming Fundamentals" }, known, rules)).toMatch(/not a course/);
    expect(checkRule({ course: "Data Structures", prerequisite: "Programming Fundamentals Lab" }, known, rules)).toMatch(/theory course/);
    expect(checkRule({ course: "Data Structures", prerequisite: "Data Structures" }, known, rules)).toMatch(/own prerequisite/);
    expect(checkRule({ course: "Object Oriented Programming", prerequisite: "Programming Fundamentals" }, known, rules)).toMatch(/already exists/);
    expect(checkRule({ course: "Programming Fundamentals", prerequisite: "Object Oriented Programming" }, known, rules)).toMatch(/loop/); // OOP already needs PF
    expect(checkRule({ course: "Data Structures", prerequisite: "Analysis of Algorithms" }, known, rules)).toMatch(/loop/); // Analysis already needs DS
    expect(checkRule({ course: "", prerequisite: "Programming Fundamentals" }, known, rules)).toMatch(/both/);
  });
});

describe("the Data Structures rule drives the recommendation", () => {
  const pass = (code: string, title: string): AttemptRow => ({ term: "T1", termOrder: 1, code, title, grade: "B", gradePoint: 3, ch: 3 });
  const ds: OfferingRow = { id: "1", sheet: "SE-3", program: "SE", courseCode: "CS-2007", courseName: "Data Structures & Algorithms", section: "SE-3A", cbaCode: "17343", preMedOnly: false, issues: [] };
  const student = (attempts: AttemptRow[]): StudentInput => ({
    registrationId: "SE259030", program: "SE", posVariant: "REGULAR", homeSection: "SE-3A", standing: "NORMAL",
    pos: [
      { semester: 1, code: "CS-1002", title: "Programming Fundamentals", ch: 3, isPlaceholder: false },
      { semester: 2, code: "CS-1004", title: "Object Oriented Programming", ch: 3, isPlaceholder: false },
      { semester: 3, code: "CS-2007", title: "Data Structures & Algorithms", ch: 3, isPlaceholder: false },
    ], attempts,
  });
  const status = (attempts: AttemptRow[], r: { course: string; prerequisite: string }[]) =>
    recommend(student(attempts), r.map((x) => ({ ...x, rule: "Must Pass" })), [ds], DEFAULT_SETTINGS).items.find((i) => i.code === "CS-2007")!;

  it("with 'needs Object Oriented Programming': passing only Programming Fundamentals is not enough", () => {
    const r = [{ course: "Data Structures", prerequisite: "Object Oriented Programming" }];
    expect(status([pass("CS-1002", "Programming Fundamentals")], r).status).toBe("BLOCKED");
    expect(status([pass("CS-1002", "Programming Fundamentals"), pass("CS-1004", "Object Oriented Programming")], r).status).toBe("RECOMMENDED");
  });
});
