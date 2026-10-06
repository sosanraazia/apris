import { db } from "../db";
import { batchOf, splitBatches } from "../batches";

/** The advisor who advises this student's batch (batches belong to one advisor each), if any. */
export async function advisorForBatch(registrationId: string): Promise<number | null> {
  const batch = batchOf(registrationId);
  if (!batch) return null;
  const advisors = await db.user.findMany({ where: { role: "ADVISOR", active: true, batches: { contains: batch } }, select: { id: true, batches: true } });
  return advisors.find((a) => splitBatches(a.batches).includes(batch))?.id ?? null;
}

/** Give the advisor every non-archived student of their batches who has no advisor yet. Returns how many were assigned. */
export async function assignUnassignedInBatches(advisorId: number, batches: string[]): Promise<number> {
  let n = 0;
  for (const b of batches) {
    const r = await db.student.updateMany({ where: { advisorId: null, archivedAt: null, registrationId: { startsWith: b } }, data: { advisorId } });
    n += r.count;
  }
  return n;
}

/** Which other advisor already has one of these batches, if any (a batch belongs to one advisor). */
export async function batchConflict(batches: string[], exceptUserId?: number): Promise<{ batch: string; name: string } | null> {
  const others = await db.user.findMany({ where: { role: "ADVISOR", batches: { not: "" }, ...(exceptUserId ? { NOT: { id: exceptUserId } } : {}) }, select: { name: true, batches: true } });
  for (const b of batches) {
    const o = others.find((x) => splitBatches(x.batches).includes(b));
    if (o) return { batch: b, name: o.name };
  }
  return null;
}
