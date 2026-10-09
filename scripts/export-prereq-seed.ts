// Rewrites data/PreReqRules.xlsx (what fresh installs seed from) from the rules currently in the database. Contains no student data.
//   npx tsx scripts/export-prereq-seed.ts
import { writeFileSync } from "node:fs";
import writeXlsxFile from "write-excel-file/node";
import { db } from "../src/lib/db";
(async () => {
  const rules = await db.prerequisite.findMany({ orderBy: { id: "asc" } });
  if (!rules.length) throw new Error("No rules to write.");
  const t = (v: string) => ({ value: v, type: String });
  const data = [["Course", "Prerequisite", "Rule"].map((h) => ({ value: h, type: String, fontWeight: "bold" as const })), ...rules.map((r) => [t(r.course), t(r.prerequisite), t(r.rule)])];
  writeFileSync(`${__dirname}/../data/PreReqRules.xlsx`, Buffer.from(await writeXlsxFile(data, { sheet: "Sheet1", columns: [{ width: 46 }, { width: 36 }, { width: 12 }] }).toBuffer()));
  console.log(`wrote ${rules.length} rules to data/PreReqRules.xlsx`);
  process.exit(0);
})();
