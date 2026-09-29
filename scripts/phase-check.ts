// Dev check: add/drop phase enforcement against the SE251093 sample registration (run scripts/flow-check.ts first).
import { PrismaClient } from "@prisma/client";
import { computeForStudent } from "../src/lib/services/recommendation";
import { saveDraft, finalize } from "../src/lib/services/registration";
const db = new PrismaClient();
(async () => {
  const st = await db.student.findUniqueOrThrow({ where: { registrationId: "SE251093" } });
  const mk = async (u: string, role: "ADVISOR" | "ADMIN") => { const x = await db.user.findUniqueOrThrow({ where: { username: u } }); return { userId: x.id, username: u, name: x.name, role, mustChange: false }; };
  const advisor = await mk("advisor", "ADVISOR"), admin = await mk("admin", "ADMIN");
  const sem = await db.semester.findFirstOrThrow({ where: { active: true } });
  const ctx = (await computeForStudent(st.id))!;
  const curItems = await db.registrationItem.findMany({ where: { registration: { studentId: st.id } } });
  const drop = ctx.offerings.find((o) => o.courseCode === "CS-2801")!.dbId; // drop Software Engineering
  const payload = { items: curItems.filter((i) => i.offeringId !== drop).map((i) => ({ offeringId: i.offeringId, overrideReason: i.overrideReason ?? undefined })), removals: [{ code: "CS-1003", reason: "x" }, { code: "BS-1302", reason: "x" }, { code: "CS-2801", reason: "Student dropped" }], loadReason: "drop leaves 8 CH" };
  const t = async (label: string, fn: () => Promise<unknown>) => { try { console.log("✔", label, JSON.stringify(await fn())); } catch (e) { console.log("✖", label, "→", (e as Error).message); } };

  await db.semester.update({ where: { id: sem.id }, data: { phase: "CLOSED", addDropEnds: null } });
  await t("CLOSED: advisor save", () => saveDraft(advisor, st.id, payload));
  await db.semester.update({ where: { id: sem.id }, data: { phase: "ADD_DROP", addDropEnds: new Date(Date.now() - 86400000) } });
  await t("ADD_DROP but end date passed (auto-closed): advisor save", () => saveDraft(advisor, st.id, payload));
  await db.semester.update({ where: { id: sem.id }, data: { phase: "ADD_DROP", addDropEnds: new Date(Date.now() + 86400000) } });
  await t("ADD_DROP open: advisor save (drop CS-2801)", () => saveDraft(advisor, st.id, payload));
  await t("ADD_DROP: finalize without reason", () => finalize(advisor, st.id, ""));
  await t("ADD_DROP: finalize with reason", () => finalize(advisor, st.id, "Student requested drop"));
  const v = await db.registrationVersion.findFirst({ where: { registration: { studentId: st.id } }, orderBy: { version: "desc" } });
  console.log("latest version:", v?.version, "phase:", v?.phase);
  await db.semester.update({ where: { id: sem.id }, data: { phase: "CLOSED", addDropEnds: null } });
  await t("CLOSED: admin late finalize w/o reason", () => finalize(admin, st.id, ""));
  await db.semester.update({ where: { id: sem.id }, data: { phase: "REGISTRATION", addDropEnds: null } }); // restore
  await db.$disconnect();
})();
