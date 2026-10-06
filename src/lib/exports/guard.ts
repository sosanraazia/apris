import { getSession, type Session } from "../auth";
import type { Scope } from "./slips";

/** Shared checks for the download routes: same-origin POST, signed-in user, and the parsed options. */
export async function guardExport(req: Request): Promise<{ session: Session; scope: Scope; studentId?: number } | { response: Response }> {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return { response: new Response("Forbidden", { status: 403 }) };
  const session = await getSession();
  if (!session || session.mustChange) return { response: new Response("Unauthorized", { status: 401 }) };
  const form = await req.formData().catch(() => null);
  const scope: Scope = form?.get("scope") === "new" ? "new" : "all";
  const sid = Number(form?.get("studentId"));
  return { session, scope, studentId: Number.isInteger(sid) && sid > 0 ? sid : undefined };
}

export const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "-");
