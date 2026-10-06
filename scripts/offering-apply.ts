// Applies an offering workbook the same way Admin → Upload course offerings does (review it first with offering-preview.ts).
import { readFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { applyOfferingDraft, buildOfferingDraft } from "../src/lib/services/offerings";
import { audit } from "../src/lib/services/audit";

(async () => {
  const f = process.argv[2];
  const admin = await db.user.findFirst({ where: { role: "ADMIN" } });
  const draft = await buildOfferingDraft({ createdBy: admin!.id, fileName: f.split("/").pop()!, buffer: readFileSync(f) });
  const stats = await applyOfferingDraft(draft, { removeMissing: true });
  await audit({ userId: admin!.id, action: "OFFERINGS_APPLIED", reason: `${draft.fileName}: ${JSON.stringify(stats)}` });
  console.log(stats);
  process.exit(0);
})();
