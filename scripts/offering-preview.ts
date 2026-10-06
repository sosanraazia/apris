import { readFileSync } from "node:fs";
import { buildOfferingDraft } from "../src/lib/services/offerings";

(async () => {
  const f = process.argv[2];
  const admin = await (await import("../src/lib/db")).db.user.findFirst({ where: { role: "ADMIN" } });
  const d = await buildOfferingDraft({ createdBy: admin!.id, fileName: f.split("/").pop()!, buffer: readFileSync(f) });
  console.log(`rows ${d.rows.length}, normalised ${d.normalizedCount}, notes ${d.notes.length}`);
  d.notes.forEach((n) => console.log("  note:", n));
  console.log(`added ${d.diff.added.length}, updated ${d.diff.updated.length}, unchanged ${d.diff.unchanged}, missing ${d.diff.missing.length}, registeredChanges ${d.diff.registeredChanges.length}`);
  d.diff.added.forEach((r) => console.log("  +", r.sheet, r.courseCode, r.courseName, r.section, r.cbaCode));
  d.diff.updated.forEach((u) => console.log("  ~", u.row.sheet, u.row.courseCode, u.row.section, u.changes.join("; ")));
  d.diff.missing.forEach((m) => console.log("  -", m.courseCode, m.courseName, m.section, m.inUse ? "(IN USE)" : ""));
  d.diff.registeredChanges.forEach((c) => console.log("  !", c));
  console.log("draft", d.id);
  process.exit(0);
})();
