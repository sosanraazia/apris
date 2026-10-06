import { PrismaClient } from "@prisma/client";
import { seedDefaultElectives, slotViews } from "../src/lib/services/electives";

const db = new PrismaClient();
(async () => {
  const added = await seedDefaultElectives(db);
  console.log(`added ${added} assignment(s)\n`);
  const offs = await db.offering.findMany({ where: { active: true } });
  const { courseKey } = await import("../src/lib/rules/keys");
  const offered = new Map<string, string[]>();
  for (const o of offs) {
    const k = courseKey(o.courseCode, o.courseName);
    offered.set(k, [...(offered.get(k) ?? []), `${o.courseCode}@${o.sheet}${o.section ?? ""}`]);
  }
  for (const v of await slotViews(offered)) {
    console.log(`${v.posCode.padEnd(12)} ${v.category.padEnd(10)} ${String(v.slot).padEnd(2)} sem ${String(v.semester ?? "?").padEnd(2)} ${(v.posRow ?? "— no such slot in stored POS —").padEnd(42)} → ${(v.courseTitle ?? "N/A").padEnd(40)} ${v.offeredAs.length ? "offered: " + [...new Set(v.offeredAs)].join(", ") : ""}`);
  }
})().finally(() => db.$disconnect());
