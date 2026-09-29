// Dev helper: removes the SE251093 sample student (and its registrations) so flow-check.ts can be re-run.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
(async () => { const st = await db.student.findUnique({ where: { registrationId: "SE251093" } }); if (st) { await db.registration.deleteMany({ where: { studentId: st.id } }); await db.snapshot.deleteMany({ where: { studentId: st.id } }); } return db.student.deleteMany({ where: { registrationId: "SE251093" } }); })().then((r) => console.log("deleted:", r.count)).finally(() => db.$disconnect());
