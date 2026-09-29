import { db } from "@/lib/db";

// Used by the deploy script to decide whether a new build came up healthy. Reveals nothing but ok/not ok.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
