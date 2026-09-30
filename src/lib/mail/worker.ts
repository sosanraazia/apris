import { processDue } from "./queue";

const g = globalThis as unknown as { __aprisMailTimer?: ReturnType<typeof setInterval> };

async function tick() {
  try {
    await processDue();
  } catch (e) {
    console.error("[mail] worker error:", (e as Error).message);
  }
}

/** Background loop, started once per server process (guarded so dev hot-reloads don't stack timers). */
export function startMailWorker() {
  if (g.__aprisMailTimer) return;
  g.__aprisMailTimer = setInterval(tick, 30_000);
  setTimeout(tick, 10_000);
}

/** Try to send soon after a registration is committed, without making the user wait. */
export function kickMailWorker() {
  setTimeout(tick, 300);
}
