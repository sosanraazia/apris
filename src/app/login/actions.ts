"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate, createSession, destroySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/services/audit";
import { clearFailures, isLocked, recordFailure } from "@/lib/throttle";

export async function loginAction(_: { error?: string } | undefined, form: FormData) {
  const h = await headers();
  // nginx sets X-Real-IP from the real socket address; never trust a client-supplied X-Forwarded-For
  const ip = h.get("x-real-ip") ?? "local";
  const username = String(form.get("username") ?? "").trim().toLowerCase().slice(0, 64);
  const password = String(form.get("password") ?? "").slice(0, 200);
  if (isLocked(ip, username)) return { error: "Too many failed attempts. Try again in 10 minutes." };
  const user = await authenticate(username, password);
  if (!user) {
    recordFailure(ip, username);
    // only record the name if it's a real account — people sometimes paste a password into the username box
    const known = await db.user.findUnique({ where: { username }, select: { username: true } });
    await audit({ action: "LOGIN_FAILED", reason: known ? `${known.username} from ${ip}` : `unknown user from ${ip}` });
    return { error: "Invalid username or password" };
  }
  clearFailures(ip, username);
  await createSession(user);
  await audit({ userId: user.id, action: "LOGIN" });
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
