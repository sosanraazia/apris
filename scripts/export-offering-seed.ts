// Rewrites data/Fall2026CourseOffering.xlsx (the file fresh installs seed from) from the offerings currently in APRIS.
// Contains no student data. Run after the offering list is corrected in the app: npx tsx scripts/export-offering-seed.ts
import { writeFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { buildOfferingsWorkbook } from "../src/lib/exports/offerings";

(async () => {
  const sem = await db.semester.findFirst({ where: { active: true } });
  const rows = sem ? await db.offering.findMany({ where: { semesterId: sem.id, active: true } }) : [];
  if (!rows.length) throw new Error("No active offerings to write.");
  writeFileSync(`${__dirname}/../data/Fall2026CourseOffering.xlsx`, await buildOfferingsWorkbook(rows));
  console.log(`wrote ${rows.length} offering rows for ${sem!.name}`);
  process.exit(0);
})();
