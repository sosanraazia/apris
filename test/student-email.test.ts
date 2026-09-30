import { describe, it, expect } from "vitest";
import { isValidRegistrationId, studentEmail } from "../src/lib/studentEmail";

describe("student email address rule: <RegistrationID>@dsu.edu.pk", () => {
  it("is the Registration ID, lowercased, at dsu.edu.pk", () => {
    expect(studentEmail("SE251093")).toBe("se251093@dsu.edu.pk");
    expect(studentEmail("cys241007")).toBe("cys241007@dsu.edu.pk");
    expect(studentEmail("  SE251053 ")).toBe("se251053@dsu.edu.pk");
  });
  it("refuses anything that isn't a Registration ID (so no address can be smuggled in)", () => {
    for (const bad of ["", "SE25", "se251093@evil.example", "SE251093, attacker@evil.example", "SE251093\r\nBcc: x@y.z", "12345678", "SE 251093", "SE251093@dsu.edu.pk"])
      expect(() => studentEmail(bad), JSON.stringify(bad)).toThrow();
    expect(isValidRegistrationId("SE251093")).toBe(true);
    expect(isValidRegistrationId("not-an-id")).toBe(false);
  });
});
