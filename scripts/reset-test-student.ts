// Dev helper: removes the SE251093 sample student (and its registrations) so flow-check.ts can be re-run.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
db.student.deleteMany({ where: { registrationId: "SE251093" } }).then((r) => console.log("deleted:", r.count)).finally(() => db.$disconnect());
