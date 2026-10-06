import { db } from "@/lib/db";
import { buildItWorkbook } from "@/lib/exports/excel";
import { groupByCba } from "@/lib/exports/byCba";
import { loadOfferingLite } from "@/lib/exports/offerings";
import { guardExport, safeName } from "@/lib/exports/guard";
import { loadSlips } from "@/lib/exports/slips";
import { audit } from "@/lib/services/audit";

// POST (not GET): handing a batch to IT marks those registrations as exported, so a link on another site must not trigger it.
export async function POST(req: Request) {
  const g = await guardExport(req);
  if ("response" in g) return g.response;
  const set = await loadSlips(g.session, { scope: g.scope, studentId: g.studentId });
  if (!set || !set.slips.length) return new Response(g.scope === "new" ? "Nothing new or changed since the last Excel export." : "No finalized registrations to export.", { status: 404 });

  const buffer = await buildItWorkbook(set.slips, await loadOfferingLite(), { onlyRegistered: !!g.studentId });
  const rows = groupByCba(set.slips).rows.length;
  // a batch hand-over marks the newly finalized registrations as exported; a single-student download does not
  if (!g.studentId) {
    const ids = set.registrationIds.filter((r) => r.status === "FINALIZED").map((r) => r.id);
    if (ids.length) await db.registration.updateMany({ where: { id: { in: ids } }, data: { status: "EXPORTED" } });
  }
  await audit({ userId: g.session.userId, action: "EXPORT_EXCEL", studentRegId: g.studentId ? set.slips[0].registrationId : null, reason: `${set.slips.length} student(s), ${rows} CBA row(s)${g.studentId ? "" : `, scope ${g.scope}`}` });
  const name = g.studentId ? `registration-${set.slips[0].registrationId}.xlsx` : `registrations-${safeName(set.semester)}-for-IT.xlsx`;
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
