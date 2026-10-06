import { db } from "@/lib/db";
import { buildOfferingsWorkbook } from "@/lib/exports/offerings";
import { safeName } from "@/lib/exports/guard";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/services/audit";

// POST, same-origin, Admin only. Read-only, but it exposes the whole offering sheet, so it gets the same checks as the other downloads.
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return new Response("Forbidden", { status: 403 });
  const s = await getSession();
  if (!s || s.mustChange) return new Response("Unauthorized", { status: 401 });
  if (s.role !== "ADMIN") return new Response("Forbidden", { status: 403 });
  const sem = await db.semester.findFirst({ where: { active: true } });
  if (!sem) return new Response("No active semester", { status: 404 });
  const rows = await db.offering.findMany({ where: { semesterId: sem.id, active: true }, orderBy: [{ sheet: "asc" }, { section: "asc" }, { courseCode: "asc" }] });
  if (!rows.length) return new Response("No course offerings to download.", { status: 404 });
  const buffer = await buildOfferingsWorkbook(rows);
  await audit({ userId: s.userId, action: "EXPORT_OFFERINGS", reason: `${sem.name}: ${rows.length} rows` });
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="course-offerings-${safeName(sem.name)}.xlsx"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
