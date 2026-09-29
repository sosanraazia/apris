// Dev check for POS upload logic. Run on a COPY of the DB (set DATABASE_URL + STORAGE_DIR).
import { readFileSync, existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { applyPosDraft, buildPosDraft, PosError, setPosPublished } from "../src/lib/services/pos";

const db = new PrismaClient();
const ok = (c: boolean, m: string) => console.log(c ? "✔" : "✖", m);
const pdf = (f: string) => readFileSync(process.cwd() + "/data/" + f);
(async () => {
  const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const up = () => buildPosDraft({ createdBy: admin.id, fileName: "SE.pdf", buffer: pdf("SoftwareEngineering_PoS.pdf") });

  let d = await up();
  ok(d.items.length === 9 && d.items.every((i) => i.status === "IDENTICAL" && !i.problems.length), `re-uploading the SE PoS: ${d.items.length} variants, all identical, no problems`);

  // a variant that doesn't exist yet → NEW
  const gone = await db.pos.findFirstOrThrow({ where: { posCode: "BS-SE-2024", variant: "PREMED" } });
  await db.posCourse.deleteMany({ where: { posId: gone.id } }); await db.pos.delete({ where: { id: gone.id } });
  d = await up();
  const fresh = d.items.find((i) => i.key === "BS-SE-2024|PREMED")!;
  ok(fresh.status === "NEW" && d.items.filter((i) => i.status === "IDENTICAL").length === 8, "missing variant detected as NEW, the other 8 identical");
  let st = await applyPosDraft(d, { keys: [fresh.key], publish: false, userId: admin.id });
  const created = await db.pos.findFirstOrThrow({ where: { posCode: "BS-SE-2024", variant: "PREMED" }, include: { courses: true } });
  ok(st.created === 1 && created.published === false && created.courses.length === fresh.courses.length && created.totalRequired === 137, `imported UNPUBLISHED with ${created.courses.length} courses, total ${created.totalRequired} CH`);

  // publish gate: unpublished POS can't be assigned (ingest requires published) — verify flag, then publish
  await setPosPublished(admin.id, created.id, true);
  ok((await db.pos.findUniqueOrThrow({ where: { id: created.id } })).published, "publish works");

  // changed version, not in use → diff + replace
  const reg = await db.pos.findFirstOrThrow({ where: { posCode: "BS-SE-2024", variant: "REGULAR" } });
  const c0 = await db.posCourse.findFirstOrThrow({ where: { posId: reg.id, code: "CS-2007" } });
  await db.posCourse.update({ where: { id: c0.id }, data: { ch: 4 } });
  d = await up();
  const chg = d.items.find((i) => i.key === "BS-SE-2024|REGULAR")!;
  ok(chg.status === "CHANGED" && chg.diff.length === 2 && !chg.problems.length, `changed course shows a diff (${chg.diff.join(" | ")})`);
  st = await applyPosDraft(d, { keys: [chg.key], publish: false, userId: admin.id });
  ok(st.replaced === 1 && (await db.posCourse.findFirstOrThrow({ where: { posId: reg.id, code: "CS-2007" } })).ch === 3, "replace restores the document's values");

  // in use by a student → cannot overwrite or unpublish
  await db.student.create({ data: { registrationId: "SE259999", name: "Test", program: "SE", posId: reg.id, email: "se259999@dsu.edu.pk" } });
  await db.posCourse.update({ where: { id: (await db.posCourse.findFirstOrThrow({ where: { posId: reg.id, code: "CS-2007" } })).id }, data: { ch: 4 } });
  d = await up();
  const used = d.items.find((i) => i.key === "BS-SE-2024|REGULAR")!;
  ok(used.problems.length === 1 && /in use by 1 student/.test(used.problems[0]), "overwriting a POS in use is blocked");
  try { await applyPosDraft(d, { keys: [used.key], publish: false, userId: admin.id }); ok(false, "apply should refuse"); } catch (e) { ok(e instanceof PosError, "apply refuses too (server-side)"); }
  try { await setPosPublished(admin.id, reg.id, false); ok(false, "unpublish should refuse"); } catch (e) { ok(e instanceof PosError, "unpublishing a POS in use is refused"); }

  // bad files
  try { await buildPosDraft({ createdBy: admin.id, fileName: "x.pdf", buffer: Buffer.from("not a pdf") }); ok(false, "text file accepted"); } catch (e) { ok(e instanceof PosError, "non-PDF rejected"); }
  const cyc = await buildPosDraft({ createdBy: admin.id, fileName: "CYS.pdf", buffer: pdf("CyberSecurity_PoS.pdf") });
  ok(cyc.items.length === 8 && cyc.items.every((i) => i.sum === i.totalRequired), "CYS PoS: 8 variants, every total cross-checks");
  if (existsSync(process.cwd() + "/data/sample/students-2.pdf")) {
    try { await buildPosDraft({ createdBy: admin.id, fileName: "t.pdf", buffer: readFileSync(process.cwd() + "/data/sample/students-2.pdf") }); ok(false, "transcript accepted as POS"); } catch (e) { ok(e instanceof PosError && /No Plan of Study/.test((e as Error).message), "a transcript uploaded by mistake is rejected with a clear message"); }
  }
  await db.$disconnect();
})();
