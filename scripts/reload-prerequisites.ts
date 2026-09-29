// Replaces ONLY the prerequisite rules with the contents of data/PreReqRules.xlsx (or the file given as an argument).
// Safe to run on a live system: rules are evaluated live, no student/registration data is touched.
//   npm run prereq:reload [-- path/to/PreReqRules.xlsx]
import { PrismaClient } from "@prisma/client";
import { parsePrereqWorkbook } from "../src/lib/importers";
import { audit } from "../src/lib/services/audit";

const db = new PrismaClient();
(async () => {
  const file = process.argv[2] ?? `${process.cwd()}/data/PreReqRules.xlsx`;
  const rows = await parsePrereqWorkbook(file);
  if (!rows.length) throw new Error(`No rules found in ${file} (expected columns: Course, Prerequisite, Rule)`);
  const before = await db.prerequisite.count();
  await db.$transaction([db.prerequisite.deleteMany(), db.prerequisite.createMany({ data: rows })]);
  await audit({ action: "PREREQUISITES_RELOADED", reason: `${file}: ${before} → ${rows.length} rules` });
  console.log(`Prerequisites reloaded: ${before} → ${rows.length} rules.`);
})().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
