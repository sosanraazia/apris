import { describe, it, expect } from "vitest";
import { checkStaffEmail } from "../src/lib/userEmail";

describe("staff email addresses (where replies to student emails go)", () => {
  it("accepts university addresses and normalises case/whitespace", () => {
    expect(checkStaffEmail("  Ali.Khan@DSU.edu.pk ")).toEqual({ ok: true, email: "ali.khan@dsu.edu.pk" });
    expect(checkStaffEmail("registrar@cs.dsu.edu.pk")).toMatchObject({ ok: true });
  });
  it("rejects other domains, look-alikes, lists and injection attempts", () => {
    for (const bad of ["", "ali", "ali@gmail.com", "ali@dsu.edu.pk.evil.com", "ali@notdsu.edu.pk", "a@dsu.edu.pk, b@dsu.edu.pk", "ali@dsu.edu.pk\r\nBcc: x@y.z", "<ali@dsu.edu.pk>", "ali@@dsu.edu.pk"])
      expect(checkStaffEmail(bad).ok, JSON.stringify(bad)).toBe(false);
  });
});
