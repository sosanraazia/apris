import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { STORAGE_ROOT } from "@/lib/services/ingest";
import { audit } from "@/lib/services/audit";

export async function GET(req: Request, ctx: RouteContext<"/students/[id]/document">) {
  const s = await getSession();
  if (!s || s.mustChange) return new Response("Unauthorized", { status: 401 });
  const id = Number((await ctx.params).id);
  const url = new URL(req.url);
  const snap = await db.snapshot.findUnique({ where: { id: Number(url.searchParams.get("snap")) }, include: { student: true } });
  if (!snap || snap.studentId !== id) return new Response("Not found", { status: 404 });
  if (s.role === "ADVISOR" && snap.student.advisorId !== s.userId) return new Response("Forbidden", { status: 403 });
  const rel = url.searchParams.get("type") === "fulfillment" ? snap.fulfillmentFile : snap.transcriptFile;
  if (!rel) return new Response("Not found", { status: 404 });
  const root = STORAGE_ROOT;
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) return new Response("Forbidden", { status: 403 });
  await audit({ userId: s.userId, action: "DOCUMENT_VIEWED", studentRegId: snap.student.registrationId, reason: `${url.searchParams.get("type")} (snapshot #${snap.id})` });
  return new Response(await readFile(abs), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${snap.student.registrationId}-${url.searchParams.get("type")}.pdf"`, "Cache-Control": "private, no-store" } });
}
