// Dev check on a COPY of the DB: real audit() writes chain correctly; tampering is caught; students with records can't be deleted.
import { PrismaClient } from "@prisma/client";
import { audit, verifyAuditChain } from "../src/lib/services/audit";

const db = new PrismaClient();
const ok = (c: boolean, m: string) => console.log(c ? "✔" : "✖", m);
(async () => {
  await audit({ userId: 1, action: "TEST_ONE", studentRegId: "SE251093", after: ["CS-2007 [SE-3A]"], reason: "check" });
  await audit({ userId: 1, action: "TEST_TWO", studentRegId: "SE251093", reason: "check 2" });
  let c = await verifyAuditChain();
  ok(c.ok, `fresh chain verifies (${c.checked} protected, ${c.legacyUnprotected} legacy)`);

  const last = await db.auditLog.findFirstOrThrow({ orderBy: { id: "desc" }, skip: 1 });
  await db.auditLog.update({ where: { id: last.id }, data: { reason: "rewritten by someone" } });
  c = await verifyAuditChain();
  ok(!c.ok && c.brokenAtId === last.id, `edited entry #${last.id} detected (${c.reason})`);
  await db.auditLog.update({ where: { id: last.id }, data: { reason: "check" } });
  ok((await verifyAuditChain()).ok, "restoring the original text makes the chain valid again");

  const gone = await db.auditLog.findFirstOrThrow({ where: { action: "TEST_ONE" } });
  await db.auditLog.delete({ where: { id: gone.id } });
  c = await verifyAuditChain();
  ok(!c.ok, `deleted entry detected (${c.reason})`);

  const st = await db.student.findFirstOrThrow({ where: { registrations: { some: {} } } });
  try { await db.student.delete({ where: { id: st.id } }); ok(false, "student with registrations was deleted!"); }
  catch { ok(true, `database REFUSES to delete ${st.registrationId} while registrations/snapshots exist`); }
  ok((await db.student.count({ where: { id: st.id } })) === 1, "student record still there");
  await db.$disconnect();
})();
