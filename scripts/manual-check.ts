// Dev check: probation/relegation manual registration. Run on a COPY of the DB after scripts/flow-check.ts.
import { PrismaClient } from "@prisma/client";
import { computeForStudent } from "../src/lib/services/recommendation";
import { saveDraft } from "../src/lib/services/registration";

const db = new PrismaClient();
const ok = (c: boolean, m: string) => console.log(c ? "✔" : "✖", m);
(async () => {
  const adv = await db.user.findFirstOrThrow({ where: { role: "ADVISOR" } });
  const sess = { userId: adv.id, username: adv.username, name: adv.name, role: "ADVISOR" as const, mustChange: false };
  const st = await db.student.findFirstOrThrow({ where: { registrationId: "SE251093" } });
  await db.registration.deleteMany({ where: { studentId: st.id } });
  await db.student.update({ where: { id: st.id }, data: { standing: "PROBATION" } });
  const ctx = (await computeForStudent(st.id))!;
  ok(!ctx.rec.items.some((i) => i.status === "RECOMMENDED"), "probation: nothing is auto-recommended");
  ok(ctx.rec.warnings.some((w) => /registered manually/.test(w)), "probation: advisor is told it is manual");
  const off = (code: string, sec: string) => ctx.offerings.find((o) => o.courseCode === code && o.section === sec)!.dbId;
  const items = [{ offeringId: off("CS-2201", "SE-3A") }, { offeringId: off("CS-2201L", "SE-3A") }]; // 4 CH — below the 12 CH minimum

  const t = async (label: string, fn: () => Promise<unknown>, want: RegExp | null) => { try { const r = await fn(); ok(want === null, `${label} → ${JSON.stringify(r)}`); } catch (e) { ok(!!want && want.test((e as Error).message), `${label} → ${(e as Error).message.slice(0, 100)}`); } };
  await t("no approval reference is refused", () => saveDraft(sess, st.id, { items, removals: [] }), /approval reference/);
  await t("with approval: 4 CH is accepted (no minimum-load rule, no per-course reasons)", () => saveDraft(sess, st.id, { items, removals: [], manualApproval: "HoD decision 12 Oct" }), null);
  const saved = await db.registrationItem.findMany({ where: { registration: { studentId: st.id } } });
  ok(saved.length === 2 && saved.every((i) => /Manual registration \(probation\): HoD decision 12 Oct/.test(i.overrideReason ?? "")), "every course carries the approval reference");
  const log = await db.auditLog.findFirst({ where: { action: "REGISTRATION_DRAFT_SAVED" }, orderBy: { id: "desc" } });
  ok(/MANUAL \(probation\) approval: HoD decision 12 Oct/.test(log?.reason ?? ""), "audit log records it as a manual registration with the approval reference");
  // every "A" section offering across SE-3 / SE-5 / SE-7 → far more than 21 CH; approval must NOT bypass the absolute ceiling
  const seen = new Set<string>();
  const many = ctx.offerings.filter((o) => o.program === "SE" && o.section?.endsWith("A") && !o.preMedOnly && !seen.has(o.courseName) && !!seen.add(o.courseName));
  await t("the absolute 21 CH ceiling still applies to manual registrations", () => saveDraft(sess, st.id, { items: many.map((o) => ({ offeringId: o.dbId })), removals: [], manualApproval: "x-ref", loadReason: "approved" }), /absolute 21 CH ceiling/);
  await db.student.update({ where: { id: st.id }, data: { standing: "NORMAL" } });
  await t("a normal student is unaffected by the approval field", () => saveDraft(sess, st.id, { items, removals: [{ code: "CS-1003", reason: "x" }, { code: "BS-1302", reason: "x" }, { code: "CS-2007", reason: "x" }, { code: "CS-2007L", reason: "x" }, { code: "CS-2801", reason: "x" }], loadReason: "low" }), null);
  await db.$disconnect();
})();
