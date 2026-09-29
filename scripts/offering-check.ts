// Dev check for the offering re-upload logic. Run against a COPY of the DB (set DATABASE_URL + STORAGE_DIR).
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { applyOfferingDraft, buildOfferingDraft } from "../src/lib/services/offerings";

const db = new PrismaClient();
const buf = readFileSync(process.cwd() + "/data/Fall2026CourseOffering.xlsx");
const ok = (c: boolean, m: string) => console.log(c ? "✔" : "✖", m);

(async () => {
  const sem = await db.semester.findFirstOrThrow({ where: { active: true } });
  const base = await db.offering.count({ where: { semesterId: sem.id } });
  const user = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const up = () => buildOfferingDraft({ createdBy: user.id, fileName: "t.xlsx", buffer: buf });

  let d = await up();
  ok(d.diff.added.length === 0 && d.diff.updated.length === 0 && d.diff.missing.length === 0, `re-upload of the same file changes nothing (unchanged=${d.diff.unchanged}/${base})`);

  // Admin hand-fixed a CBA that is blank in the workbook → must survive a re-upload
  const blank = await db.offering.findFirstOrThrow({ where: { semesterId: sem.id, cbaCode: null, courseCode: "MG-2XXX", section: "SE-3A" } });
  await db.offering.update({ where: { id: blank.id }, data: { cbaCode: "99001" } });
  d = await up();
  ok(d.diff.updated.length === 0, "blank CBA in file does not erase Admin's manual CBA");
  await applyOfferingDraft(d, { removeMissing: true });
  ok((await db.offering.findUniqueOrThrow({ where: { id: blank.id } })).cbaCode === "99001", "…and it is still 99001 after applying");

  // Workbook differs from the system: changed CBA (used by a registration), a row deleted, an extra row present
  const dsa = await db.offering.findFirstOrThrow({ where: { semesterId: sem.id, courseCode: "CS-2007", section: "SE-3A" } });
  const used = (await db.registrationItem.count({ where: { offeringId: dsa.id } })) > 0;
  await db.offering.update({ where: { id: dsa.id }, data: { cbaCode: "11111" } });
  const gone = await db.offering.findFirstOrThrow({ where: { semesterId: sem.id, courseCode: "CS-2801", section: "SE-3C" } });
  await db.offering.delete({ where: { id: gone.id } });
  const extra = await db.offering.create({ data: { semesterId: sem.id, sheet: "SE-3", program: "SE", courseCode: "CS-9999", courseName: "Old Course", section: "SE-3A", cbaCode: "5" } });
  const inUseExtra = await db.offering.create({ data: { semesterId: sem.id, sheet: "SE-3", program: "SE", courseCode: "CS-9998", courseName: "Old Used Course", section: "SE-3A", cbaCode: "6" } });
  const reg = await db.registration.findFirstOrThrow({});
  await db.registrationItem.create({ data: { registrationId: reg.id, offeringId: inUseExtra.id, posCourseCode: "CS-9998" } });

  d = await up();
  ok(d.diff.added.length === 1 && d.diff.added[0].courseCode === "CS-2801", "deleted row shows as NEW");
  ok(d.diff.updated.length === 1 && d.diff.updated[0].changes[0].includes("11111 → 17343"), `changed CBA detected (${d.diff.updated[0]?.changes[0]})`);
  ok(d.diff.missing.length === 2 && d.diff.missing.some((m) => m.inUse), "rows not in file listed; the used one flagged");
  ok(!used || d.diff.registeredChanges.length === 1, `registered-course change is called out (${d.diff.registeredChanges.length})`);

  const stats = await applyOfferingDraft(d, { removeMissing: true });
  ok(JSON.stringify(stats) === '{"added":1,"updated":1,"deactivated":1,"deleted":1}', "apply → " + JSON.stringify(stats));
  ok((await db.offering.findUnique({ where: { id: extra.id } })) === null, "unused stale row deleted");
  const kept = await db.offering.findUniqueOrThrow({ where: { id: inUseExtra.id } });
  ok(kept.active === false, "stale row used by a registration is switched off, not deleted");
  ok((await db.registrationItem.count({ where: { offeringId: inUseExtra.id } })) === 1, "registration item still intact");
  d = await up();
  ok(d.diff.added.length === 0 && d.diff.updated.length === 0, "second upload is a clean no-op");
  await db.$disconnect();
})();
