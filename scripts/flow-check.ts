import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { createDraft } from "../src/lib/services/ingest";
import { computeForStudent } from "../src/lib/services/recommendation";
import { saveDraft, finalize, buildExportCsv, type DraftPayload } from "../src/lib/services/registration";
const db = new PrismaClient();
const D = process.cwd() + "/data/sample/";
(async () => {
  const adv = await db.user.findUniqueOrThrow({ where: { username: "advisor" } });
  const sess = { userId: adv.id, username: adv.username, name: adv.name, role: "ADVISOR" as const, mustChange: false };
  const draft = await createDraft({ createdBy: adv.id, transcript: readFileSync(D + "students-2.pdf"), fulfillment: readFileSync(D + "students.pdf"), enteredRegId: "se251093", homeSection: "SE-3A" });
  console.log("conflicts:", draft.conflicts, "warnings:", draft.warnings, "posId", draft.posId);
  // mismatch protection
  const bad = await createDraft({ createdBy: adv.id, transcript: readFileSync(D + "students-2.pdf"), fulfillment: readFileSync(D + "students.pdf"), enteredRegId: "SE999999", homeSection: "SE-3A" });
  console.log("mismatch conflicts:", bad.conflicts);

  await db.student.deleteMany({ where: { registrationId: "SE251093" } });
  const st = await db.student.create({ data: { registrationId: "SE251093", name: draft.transcript.name, program: "SE", admission: "Fall 2025", homeSection: "SE-3A", posId: draft.posId, advisorId: adv.id, email: "se251093@dsu.edu.pk" } });
  await db.snapshot.create({ data: { studentId: st.id, cgpa: draft.transcript.cgpa, completedCH: draft.transcript.completedCH!, requiredCH: 137, homeSection: "SE-3A", courses: JSON.stringify(draft.transcript.courses), terms: JSON.stringify(draft.transcript.terms) } });

  const ctx = (await computeForStudent(st.id))!;
  const offer = (code: string, sec: string) => ctx.offerings.find((o) => o.courseCode === code && o.section === sec)!.dbId;
  const ok = ["CS-2007", "CS-2007L", "CS-2201", "CS-2201L", "CS-2801"].map((c) => ({ offeringId: offer(c, "SE-3A") }));

  const attempt = async (label: string, payload: DraftPayload) => { try { const r = await saveDraft(sess, st.id, payload); console.log("✔", label, r); } catch (e) { console.log("✖", label, "→", (e as Error).message); } };
  await attempt("omit recommended Discrete+LA w/o reason", { items: ok, removals: [] });
  await attempt("valid: 5 courses + reasons for removed", { items: ok, removals: [{ code: "CS-1003", reason: "Section clash" }, { code: "BS-1302", reason: "CBA missing in sheet" }], loadReason: "below min accepted" });
  try { await finalize(sess, st.id); console.log("finalize v1 ok"); } catch (e) { console.log("finalize:", (e as Error).message); }
  await attempt("wrong section without reason", { items: [{ offeringId: offer("CS-2007", "SE-3B") }, ...ok.slice(1)], removals: [{ code: "CS-1003", reason: "x" }, { code: "BS-1302", reason: "x" }], loadReason: "low" });
  await attempt("passed course re-registration", { items: [...ok, { offeringId: ctx.offerings.find((o) => o.courseCode === "BS-2301")!.dbId, overrideReason: "ahead" }, { offeringId: 1 }], removals: [] });
  // change section w/ reason, finalize v2
  await attempt("section change w/ reason", { items: [{ offeringId: offer("CS-2007", "SE-3B"), overrideReason: "SE-3A full" }, ...ok.slice(1)], removals: [{ code: "CS-1003", reason: "clash" }, { code: "BS-1302", reason: "no CBA" }], loadReason: "low" });
  try { await finalize(sess, st.id); } catch (e) { console.log("finalize w/o reason:", (e as Error).message); }
  try { console.log("finalize v2:", JSON.stringify(await finalize(sess, st.id, "Section full"))); } catch (e) { console.log("finalize v2 err:", (e as Error).message); }
  const out = await buildExportCsv(sess, { markExported: false });
  console.log(out.csv);
  console.log((await db.auditLog.count()), "audit rows");
  await db.$disconnect();
})();
