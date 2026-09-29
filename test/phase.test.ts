import { describe, it, expect } from "vitest";
import { canEdit, effectivePhase } from "../src/lib/services/phase";

describe("registration phases", () => {
  it("only Admin (flagged as late) can change registrations once closed", () => {
    expect(canEdit("ADVISOR", "CLOSED")).toEqual({ allowed: false, late: true });
    expect(canEdit("ADMIN", "CLOSED")).toEqual({ allowed: true, late: true });
  });
  it("nobody can register during SETUP — suggestions are preview-only until an Admin opens registrations", () => {
    for (const role of ["ADVISOR", "ADMIN", "HOD"] as const) expect(canEdit(role, "SETUP").allowed).toBe(false);
  });
  it("advisors and admins can register in REGISTRATION and ADD_DROP; HoD never", () => {
    for (const phase of ["REGISTRATION", "ADD_DROP"] as const) {
      expect(canEdit("ADVISOR", phase)).toEqual({ allowed: true, late: false });
      expect(canEdit("ADMIN", phase)).toEqual({ allowed: true, late: false });
      expect(canEdit("HOD", phase).allowed).toBe(false);
    }
  });
  it("add/drop closes itself after its end date; unknown values fail closed", () => {
    expect(effectivePhase({ phase: "ADD_DROP", addDropEnds: new Date(Date.now() - 1000) })).toBe("CLOSED");
    expect(effectivePhase({ phase: "ADD_DROP", addDropEnds: new Date(Date.now() + 86400000) })).toBe("ADD_DROP");
    expect(effectivePhase({ phase: "SETUP", addDropEnds: null })).toBe("SETUP");
    expect(effectivePhase({ phase: "bogus", addDropEnds: null })).toBe("CLOSED");
  });
});
