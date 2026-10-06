import { describe, it, expect } from "vitest";
import { passwordProblem } from "../src/lib/password";
import { batchOf, parseBatches } from "../src/lib/batches";

describe("password policy", () => {
  it("accepts any password of 6 or more characters, with no other conditions", () => {
    for (const pw of ["abcdef", "123456", "aaaaaa", "password", "admin1", "qwerty"]) expect(passwordProblem(pw)).toBeNull();
    expect(passwordProblem("hod123")).toBeNull(); // may contain the username
  });
  it("rejects shorter than 6", () => {
    expect(passwordProblem("abcde")).toMatch(/at least 6/);
    expect(passwordProblem("")).toMatch(/at least 6/);
  });
});

describe("batches", () => {
  it("takes the batch from the registration ID", () => {
    expect(batchOf("CYS239001")).toBe("CYS23");
    expect(batchOf("se251093")).toBe("SE25");
    expect(batchOf("12345")).toBeNull();
  });
  it("parses the ways an Admin might type them", () => {
    expect(parseBatches("CYS23, CYS24")).toEqual({ batches: ["CYS23", "CYS24"] });
    expect(parseBatches("cys-23 se 24;SE23 cys23")).toEqual({ batches: ["CYS23", "SE23", "SE24"] });
    expect(parseBatches("")).toEqual({ batches: [] });
  });
  it("rejects things that are not a batch", () => {
    expect(parseBatches("CYS")).toHaveProperty("error");
    expect(parseBatches("23")).toHaveProperty("error");
    expect(parseBatches("CYS2023")).toHaveProperty("error");
  });
});
