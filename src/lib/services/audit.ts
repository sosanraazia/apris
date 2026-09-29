import { db } from "../db";

export async function audit(a: { userId?: number | null; action: string; studentRegId?: string | null; before?: unknown; after?: unknown; reason?: string | null }) {
  await db.auditLog.create({
    data: {
      userId: a.userId ?? null,
      action: a.action,
      studentRegId: a.studentRegId ?? null,
      before: a.before === undefined ? null : JSON.stringify(a.before),
      after: a.after === undefined ? null : JSON.stringify(a.after),
      reason: a.reason ?? null,
    },
  });
}
