// One-off for the local database: Data Structures needs Object Oriented Programming (not Programming Fundamentals).
import { db } from "../src/lib/db";
import { validateRule } from "../src/lib/services/prerequisites";
import { audit } from "../src/lib/services/audit";
(async () => {
  const cur = await db.prerequisite.findFirst({ where: { course: "Data Structures" } });
  if (!cur) throw new Error("No Data Structures rule found");
  const v = await validateRule(cur.course, "Object Oriented Programming", cur.id);
  if ("error" in v) throw new Error(v.error);
  if (cur.prerequisite === v.prerequisite) { console.log("already correct"); process.exit(0); }
  await db.prerequisite.update({ where: { id: cur.id }, data: { prerequisite: v.prerequisite } });
  const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  await audit({ userId: admin.id, action: "PREREQUISITE_CHANGED", before: { course: cur.course, prerequisite: cur.prerequisite }, after: { course: cur.course, prerequisite: v.prerequisite } });
  console.log(`${cur.course}: ${cur.prerequisite} → ${v.prerequisite}`);
  process.exit(0);
})();
