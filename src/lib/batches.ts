/** A batch is the program letters plus the two-digit intake year of the Registration ID: CYS232001 → CYS23, SE251093 → SE25. */
export const batchOf = (registrationId: string): string | null => registrationId.toUpperCase().match(/^([A-Z]+)(\d{2})/)?.slice(1).join("") ?? null;

const BATCH = /^[A-Z]{2,4}\d{2}$/;

/** "cys 23, CYS-24;se23" → ["CYS23","CYS24","SE23"]; the first unrecognisable entry is reported. */
export function parseBatches(raw: string): { batches: string[] } | { error: string } {
  const out: string[] = [];
  for (const part of raw.split(/[,;\s]+/).filter(Boolean)) {
    // allow "CYS 23" typed with a space: join a letters-only token with a following digits-only token
    out.push(part.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  }
  const joined: string[] = [];
  for (let i = 0; i < out.length; i++) {
    if (/^[A-Z]+$/.test(out[i]) && /^\d{2}$/.test(out[i + 1] ?? "")) joined.push(out[i] + out[++i]);
    else joined.push(out[i]);
  }
  for (const b of joined) if (!BATCH.test(b)) return { error: `“${b}” is not a batch — use the program and intake year, like CYS23 or SE24.` };
  return { batches: [...new Set(joined)].sort() };
}

export const splitBatches = (stored: string): string[] => stored.split(",").filter(Boolean);
