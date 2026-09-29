import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";
import { burnTime, verifyPassword } from "./password";

export type Role = "ADMIN" | "HOD" | "ADVISOR";
export interface Session {
  userId: number;
  username: string;
  name: string;
  role: Role;
  mustChange: boolean;
}

const COOKIE = "apris_session";
const PLACEHOLDER = /change[-_ ]?me|dev-only|example|secret-secret/i;

function key() {
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  if (process.env.NODE_ENV === "production" && PLACEHOLDER.test(secret)) throw new Error("SESSION_SECRET is still a placeholder — generate a real one");
  return new TextEncoder().encode(secret);
}

// Ties a session token to the current password: changing or resetting a password signs that user out everywhere.
const fingerprint = (hash: string | null) => createHash("sha256").update(hash ?? "").digest("hex").slice(0, 16);

/**
 * Auth is provider-shaped: LOCAL today; LDAP / Entra ID later only need another
 * branch here that resolves the same User row (auth_provider + external_id).
 */
export async function authenticate(username: string, password: string) {
  const user = await db.user.findUnique({ where: { username: username.trim().toLowerCase() } });
  if (!user || !user.active || user.authProvider !== "LOCAL" || !user.passwordHash) {
    await burnTime(password);
    return null;
  }
  return (await verifyPassword(password, user.passwordHash)) ? user : null;
}

export async function createSession(user: { id: number; passwordHash: string | null }) {
  const token = await new SignJWT({ uid: user.id, fp: fingerprint(user.passwordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(key());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** Re-checks the user in the database on every request: disabling a user or changing a role takes effect immediately. */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    const user = await db.user.findUnique({ where: { id: Number(payload.uid) } });
    if (!user || !user.active || fingerprint(user.passwordHash) !== payload.fp) return null;
    return { userId: user.id, username: user.username, name: user.name, role: user.role as Role, mustChange: user.mustChangePassword };
  } catch {
    return null;
  }
}

/** Use at the top of every page and every server action. */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.mustChange) redirect("/account");
  if (roles.length && !roles.includes(s.role)) redirect("/?denied=1");
  return s;
}
