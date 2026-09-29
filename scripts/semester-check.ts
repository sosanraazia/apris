// Dev check: open a new semester → no suggestions → upload offerings → suggestions start. Run on a COPY of the DB.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { computeForStudent } from "../src/lib/services/recommendation";
import { applyOfferingDraft, buildOfferingDraft } from "../src/lib/services/offerings";
import { openSemester, semesterReadiness, SemesterError } from "../src/lib/services/semesters";

const db = new PrismaClient();
const ok = (c: boolean, m: string) => console.log(c ? "✔" : "✖", m);
(async () => {
  const a = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const admin = { userId: a.id, username: a.username, name: a.name, role: "ADMIN" as const, mustChange: false };
  const advisor = await db.user.findFirstOrThrow({ where: { role: "ADVISOR" } });
  const st = await db.student.findFirstOrThrow({ where: { registrationId: "SE251093" } });
  const before = await semesterReadiness();
  ok(before.ready && before.semester?.name === "Fall 2026", `Fall 2026 ready with ${before.offeringCount} offerings`);

  const expect = async (label: string, fn: () => Promise<unknown>, re: RegExp) => { try { await fn(); ok(false, label + " (no error)"); } catch (e) { ok(e instanceof SemesterError && re.test(e.message), `${label} → ${(e as Error).message.slice(0, 90)}`); } };
  await expect("bad name rejected", () => openSemester(admin, "Winter 26", { force: true }), /Use the form/);
  await expect("duplicate rejected", () => openSemester(admin, "Fall 2026", { force: true }), /already exists/);
  await expect("advisor cannot open", () => openSemester({ ...admin, role: "ADVISOR" }, "Spring 2027", { force: true }), /Only an Admin/);
  const unexported = await db.registration.count({ where: { status: { in: ["FINALIZED", "MODIFIED"] }, version: { gt: 0 } } });
  if (unexported) await expect("blocked while registrations are unexported", () => openSemester(admin, "Spring 2027", { force: false }), /never exported/);

  const sem = await openSemester(admin, "  spring   2027 ", { force: true });
  ok(sem.name === "Spring 2027" && sem.active && sem.phase === "REGISTRATION", "opened 'Spring 2027' (name normalised)");
  ok(!(await db.semester.findUniqueOrThrow({ where: { name: "Fall 2026" } })).active, "Fall 2026 closed & no longer active");
  ok((await db.semester.findUniqueOrThrow({ where: { name: "Fall 2026" } })).phase === "CLOSED", "Fall 2026 phase = CLOSED; its registrations are kept");
  ok((await db.registration.count({ where: { semester: { name: "Fall 2026" } } })) > 0, "old registrations still on record");

  let r = await semesterReadiness();
  ok(!r.ready && r.offeringCount === 0, "Spring 2027: not ready, 0 offerings");
  let ctx = (await computeForStudent(st.id))!;
  ok(ctx.offerings.length === 0, "no offerings loaded → UI shows 'not open yet' instead of suggestions");
  ok(r.profilesCurrent === 0, `profiles need refreshing before suggestions are accurate (${r.profilesCurrent}/${r.students} current)`);

  const d = await buildOfferingDraft({ createdBy: advisor.id, fileName: "spring.xlsx", buffer: readFileSync(process.cwd() + "/data/Fall2026CourseOffering.xlsx") });
  ok(d.diff.added.length === d.rows.length && d.diff.updated.length === 0, `first upload = all ${d.rows.length} rows are new for the new semester`);
  await applyOfferingDraft(d, { removeMissing: true });
  r = await semesterReadiness();
  ok(r.ready && r.offeringCount === d.rows.length, `after applying: ready, ${r.offeringCount} offerings`);
  ctx = (await computeForStudent(st.id))!;
  ok(ctx.semester?.name === "Spring 2027" && ctx.rec.items.some((i) => i.status === "RECOMMENDED"), "suggestions are live for Spring 2027");
  ok((await db.registration.count({ where: { studentId: st.id, semester: { name: "Spring 2027" } } })) === 0, "student starts Spring 2027 with a clean registration");
  await db.$disconnect();
})();
