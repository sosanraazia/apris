import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/services/audit";
import { parseFilter, toWhere } from "@/lib/services/auditQuery";

const cell = (raw: string | null | undefined) => {
  const v = raw ?? "";
  const safe = /^[=+@\t\r-]/.test(v) ? `'${v}` : v; // neutralise spreadsheet formulas
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

// POST + origin check, like the registration export: it is logged, so it must not be triggerable cross-site.
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return new Response("Forbidden", { status: 403 });
  const s = await getSession();
  if (!s || s.mustChange) return new Response("Unauthorized", { status: 401 });
  if (s.role === "ADVISOR") return new Response("Forbidden", { status: 403 });

  const f = parseFilter(Object.fromEntries(new URL(req.url).searchParams));
  const [rows, users] = await Promise.all([db.auditLog.findMany({ where: toWhere(f), orderBy: { id: "asc" }, take: 100000 }), db.user.findMany()]);
  const name = new Map(users.map((u) => [u.id, `${u.name} (${u.username})`]));
  const lines = ["id,time,user,action,student,before,after,reason,hash"];
  for (const r of rows) lines.push([String(r.id), r.at.toISOString(), name.get(r.userId ?? -1) ?? "", r.action, r.studentRegId, r.before, r.after, r.reason, r.hash].map(cell).join(","));
  await audit({ userId: s.userId, action: "AUDIT_EXPORTED", reason: `${rows.length} entries` });
  return new Response(lines.join("\r\n") + "\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="audit-log.csv"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
