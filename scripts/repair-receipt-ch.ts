// Recomputes the credit hours stored in each registration's latest finalized version from the student's own plan
// (the old finalize step looked courses up by title across all plans). Dry run by default; --apply writes the fix and audits it.
//   npx tsx scripts/repair-receipt-ch.ts [--apply]
import { db } from "../src/lib/db";
import { courseKey } from "../src/lib/rules/keys";
import { computeForStudent } from "../src/lib/services/recommendation";
import { audit } from "../src/lib/services/audit";

const APPLY = process.argv.includes("--apply");
type Item = { courseCode: string; courseName: string; cbaCode: string; section: string; ch: number };
(async () => {
  const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const regs = await db.registration.findMany({ where: { version: { gt: 0 } }, include: { student: { include: { pos: { include: { courses: true } } } }, versions: { orderBy: { version: "desc" }, take: 1 }, items: true } });
  let changed = 0;
  for (const r of regs) {
    const ctx = await computeForStudent(r.studentId);
    const v = r.versions[0];
    const items = JSON.parse(v.items) as Item[];
    const own = new Map(r.student.pos!.courses.map((c) => [courseKey(c.code, c.title), c.ch]));
    const fixed = items.map((i) => {
      const rec = ctx?.rec.items.find((x) => x.choices.some((c) => c.courseCode === i.courseCode));
      return { ...i, ch: rec?.ch ?? own.get(courseKey(i.courseCode, i.courseName)) ?? (/L$/.test(i.courseCode) ? 1 : 3) };
    });
    const diffs = fixed.flatMap((f, n) => (f.ch !== items[n].ch ? [`${f.courseCode} ${items[n].ch}→${f.ch}`] : []));
    const before = items.reduce((a, i) => a + i.ch, 0), after = fixed.reduce((a, i) => a + i.ch, 0);
    if (!diffs.length) continue;
    changed++;
    console.log(`${r.student.registrationId}: ${before} → ${after} CH (${diffs.join(", ")})`);
    if (APPLY) {
      await db.$transaction([
        db.registrationVersion.update({ where: { id: v.id }, data: { items: JSON.stringify(fixed) } }),
        ...r.items.map((it) => db.registrationItem.update({ where: { id: it.id }, data: { ch: fixed.find((f) => { const o = f.courseCode; return o === it.posCourseCode; })?.ch ?? it.ch } })),
      ]);
      await audit({ userId: admin.id, action: "RECEIPT_CH_CORRECTED", studentRegId: r.student.registrationId, before: { ch: before }, after: { ch: after }, reason: `credit hours recomputed from the student's own plan: ${diffs.join(", ")}` });
    }
  }
  console.log(changed ? (APPLY ? `Corrected ${changed} registration(s).` : `${changed} registration(s) would change. Re-run with --apply.`) : "All receipts already match the students' plans.");
  process.exit(0);
})();
