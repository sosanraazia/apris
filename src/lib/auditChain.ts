import { createHash } from "node:crypto";

/** The fields an audit entry commits to. Changing any of them after the fact breaks the chain. */
export interface AuditFields {
  at: Date;
  userId: number | null;
  action: string;
  studentRegId: string | null;
  before: string | null;
  after: string | null;
  reason: string | null;
}

export function entryHash(prevHash: string | null, f: AuditFields): string {
  const canonical = JSON.stringify([prevHash ?? "GENESIS", f.at.toISOString(), f.userId, f.action, f.studentRegId, f.before, f.after, f.reason]);
  return createHash("sha256").update(canonical).digest("hex");
}

export interface ChainRow extends AuditFields {
  id: number;
  prevHash: string | null;
  hash: string | null;
}

export interface ChainResult {
  ok: boolean;
  checked: number;
  legacyUnprotected: number; // rows written before hashing existed
  brokenAtId?: number;
  reason?: string;
}

/** Walks rows in id order and confirms every entry still matches its hash and links to the one before it. */
export function verifyChain(rows: ChainRow[]): ChainResult {
  let prev: string | null = null;
  let checked = 0;
  let legacy = 0;
  for (const r of rows) {
    if (r.hash == null) {
      if (checked > 0) return { ok: false, checked, legacyUnprotected: legacy, brokenAtId: r.id, reason: "an entry without a hash appears after protected entries" };
      legacy++;
      continue;
    }
    if (r.prevHash !== prev) return { ok: false, checked, legacyUnprotected: legacy, brokenAtId: r.id, reason: "an entry was removed or reordered before this one" };
    if (entryHash(r.prevHash, r) !== r.hash) return { ok: false, checked, legacyUnprotected: legacy, brokenAtId: r.id, reason: "this entry was modified after it was written" };
    prev = r.hash;
    checked++;
  }
  return { ok: true, checked, legacyUnprotected: legacy };
}
