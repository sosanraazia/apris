import { getSession } from "@/lib/auth";
import { buildExportCsv } from "@/lib/services/registration";

// POST, not GET: exporting marks registrations as exported, so it must not be triggerable by a link or image on another site.
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return new Response("Forbidden", { status: 403 });
  const s = await getSession();
  if (!s || s.mustChange) return new Response("Unauthorized", { status: 401 });
  const { csv, rows, semester } = await buildExportCsv(s, { markExported: true });
  if (!rows) return new Response("No finalized registrations to export", { status: 404 });
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="registration-${semester.replace(/\s+/g, "-")}.csv"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
