import { db } from "../db";
import { entryHash } from "../auditChain";

const json = (v: unknown) => (v === undefined ? null : JSON.stringify(v));

/**
 * The single place audit entries are written. Each entry stores the hash of the previous one
 * (see auditChain.ts), so deleting or editing history is detectable. Nothing in the app updates or deletes audit rows.
 */
export async function audit(a: { userId?: number | null; action: string; studentRegId?: string | null; before?: unknown; after?: unknown; reason?: string | null }) {
  await db.$transaction(async (tx) => {
    const last = await tx.auditLog.findFirst({ orderBy: { id: "desc" }, select: { hash: true } });
    const fields = {
      at: new Date(),
      userId: a.userId ?? null,
      action: a.action,
      studentRegId: a.studentRegId ?? null,
      before: json(a.before),
      after: json(a.after),
      reason: a.reason ?? null,
    };
    const prevHash = last?.hash ?? null;
    await tx.auditLog.create({ data: { ...fields, prevHash, hash: entryHash(prevHash, fields) } });
  });
}

export async function verifyAuditChain() {
  const { verifyChain } = await import("../auditChain");
  const rows = await db.auditLog.findMany({ orderBy: { id: "asc" } });
  return verifyChain(rows);
}

/** Logs that a user opened a student's record — at most once per user+student per 30 minutes, to keep the log readable. */
export async function recordStudentView(userId: number, studentRegId: string) {
  const recent = await db.auditLog.findFirst({ where: { userId, action: "STUDENT_VIEWED", studentRegId, at: { gte: new Date(Date.now() - 30 * 60 * 1000) } }, select: { id: true } });
  if (!recent) await audit({ userId, action: "STUDENT_VIEWED", studentRegId });
}
