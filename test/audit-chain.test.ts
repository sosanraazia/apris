import { describe, it, expect } from "vitest";
import { entryHash, verifyChain, type ChainRow } from "../src/lib/auditChain";

function build(n: number): ChainRow[] {
  const rows: ChainRow[] = [];
  let prev: string | null = null;
  for (let i = 1; i <= n; i++) {
    const f = { at: new Date(Date.UTC(2026, 8, 29, 10, i)), userId: 7, action: "REGISTRATION_FINALIZED", studentRegId: `SE25${1000 + i}`, before: null, after: `["CS-200${i}"]`, reason: `r${i}` };
    const hash = entryHash(prev, f);
    rows.push({ id: i, ...f, prevHash: prev, hash });
    prev = hash;
  }
  return rows;
}

describe("audit hash chain", () => {
  it("accepts an untouched chain", () => {
    expect(verifyChain(build(6))).toMatchObject({ ok: true, checked: 6 });
  });
  it("detects an edited entry (e.g. an advisor's reason rewritten)", () => {
    const rows = build(6);
    rows[3].reason = "nothing to see";
    expect(verifyChain(rows)).toMatchObject({ ok: false, brokenAtId: 4 });
  });
  it("detects a changed student or course in an entry", () => {
    const rows = build(5);
    rows[1].after = '["CS-9999"]';
    expect(verifyChain(rows).ok).toBe(false);
    const rows2 = build(5);
    rows2[2].studentRegId = "SE259999";
    expect(verifyChain(rows2)).toMatchObject({ ok: false, brokenAtId: 3 });
  });
  it("detects a deleted entry", () => {
    const rows = build(6);
    rows.splice(2, 1);
    expect(verifyChain(rows)).toMatchObject({ ok: false, brokenAtId: 4 });
  });
  it("detects reordered entries and a forged timestamp", () => {
    const rows = build(5);
    [rows[1], rows[2]] = [rows[2], rows[1]];
    expect(verifyChain(rows).ok).toBe(false);
    const rows2 = build(5);
    rows2[2].at = new Date(Date.UTC(2020, 0, 1));
    expect(verifyChain(rows2).ok).toBe(false);
  });
  it("detects truncating the tail only when a later entry is re-linked — and a rewritten hash breaks the next link", () => {
    const rows = build(5);
    rows[2].hash = "0".repeat(64); // attacker overwrites a hash to hide an edit
    expect(verifyChain(rows).ok).toBe(false);
  });
  it("treats pre-hash legacy rows as unprotected but still verifies the rest", () => {
    const legacy: ChainRow[] = [{ id: 1, at: new Date(), userId: 1, action: "LOGIN", studentRegId: null, before: null, after: null, reason: null, prevHash: null, hash: null }];
    const rows = build(3).map((r) => ({ ...r, id: r.id + 1 }));
    expect(verifyChain([...legacy, ...rows])).toMatchObject({ ok: true, checked: 3, legacyUnprotected: 1 });
  });
});
