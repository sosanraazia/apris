import { buildSlipsPdf } from "@/lib/exports/pdf";
import { guardExport, safeName } from "@/lib/exports/guard";
import { loadSlips } from "@/lib/exports/slips";
import { audit } from "@/lib/services/audit";

export async function POST(req: Request) {
  const g = await guardExport(req);
  if ("response" in g) return g.response;
  const set = await loadSlips(g.session, { scope: g.scope, studentId: g.studentId });
  if (!set || !set.slips.length) return new Response(g.scope === "new" ? "Nothing new or changed since the last Excel export." : "No finalized registrations to export.", { status: 404 });

  const buffer = await buildSlipsPdf(set.slips, { semester: set.semester, generatedAt: set.generatedAt });
  await audit({ userId: g.session.userId, action: "EXPORT_PDF", studentRegId: g.studentId ? set.slips[0].registrationId : null, reason: `${set.slips.length} student(s)${g.studentId ? "" : `, scope ${g.scope}`}` });
  const name = g.studentId ? `registration-slip-${set.slips[0].registrationId}.pdf` : `registration-slips-${safeName(set.semester)}.pdf`;
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
