// In-memory login throttle (single-process deployment). Locks per IP+username after 5 failures, and per IP after 25.
const fails = new Map<string, { n: number; until: number }>();
const LOCK_MS = 10 * 60 * 1000;

function bump(key: string, max: number) {
  const f = fails.get(key);
  const n = f && f.until === 0 ? f.n + 1 : f && f.until > Date.now() ? f.n : 1;
  fails.set(key, n >= max ? { n: 0, until: Date.now() + LOCK_MS } : { n, until: 0 });
}
const locked = (key: string) => (fails.get(key)?.until ?? 0) > Date.now();

export const isLocked = (ip: string, username: string) => locked(`u:${ip}:${username}`) || locked(`ip:${ip}`);
export function recordFailure(ip: string, username: string) {
  bump(`u:${ip}:${username}`, 5);
  bump(`ip:${ip}`, 25);
  if (fails.size > 5000) fails.clear(); // bound memory
}
export const clearFailures = (ip: string, username: string) => fails.delete(`u:${ip}:${username}`);
