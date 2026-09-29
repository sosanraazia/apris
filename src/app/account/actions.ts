"use server";
import { redirect } from "next/navigation";
import { createSession, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { audit } from "@/lib/services/audit";

export async function changePasswordAction(_: { error?: string } | undefined, form: FormData) {
  const s = await getSession(); // deliberately not requireRole: users who must change their password land here
  if (!s) redirect("/login");
  const current = String(form.get("current") ?? ""), next = String(form.get("next") ?? ""), confirm = String(form.get("confirm") ?? "");
  const user = await db.user.findUnique({ where: { id: s.userId } });
  if (!user?.passwordHash || !(await verifyPassword(current, user.passwordHash))) return { error: "Current password is incorrect" };
  if (next !== confirm) return { error: "New passwords don't match" };
  if (next === current) return { error: "Choose a different password" };
  const problem = passwordProblem(next, user.username);
  if (problem) return { error: problem };
  const updated = await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } });
  await audit({ userId: user.id, action: "PASSWORD_CHANGED" });
  await createSession(updated); // old sessions on other devices are now invalid
  redirect("/");
}
