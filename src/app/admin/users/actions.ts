"use server";
import { hashPassword, passwordProblem } from "@/lib/password";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/services/audit";
import { checkStaffEmail } from "@/lib/userEmail";

type R = { ok?: string; error?: string } | undefined;
const USERNAME = /^[a-z0-9._-]{3,32}$/;

export async function createUserAction(_: R, form: FormData): Promise<R> {
  const s = await requireRole("ADMIN");
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim();
  const role = String(form.get("role"));
  const password = String(form.get("password") ?? "");
  if (!USERNAME.test(username)) return { error: "Username: 3–32 chars, letters, digits, . _ -" };
  if (!name) return { error: "Full name is required" };
  if (!["ADMIN", "HOD", "ADVISOR"].includes(role)) return { error: "Choose a role" };
  const problem = passwordProblem(password, username);
  if (problem) return { error: problem };
  if (await db.user.findUnique({ where: { username } })) return { error: "That username already exists" };
  // Advisors must have a real university address: student replies are delivered to it. Others may leave it blank for now.
  const rawEmail = String(form.get("email") ?? "").trim();
  let email: string;
  if (rawEmail || role === "ADVISOR") {
    const chk = checkStaffEmail(rawEmail);
    if (!chk.ok) return { error: role === "ADVISOR" ? `Advisor email: ${chk.error} — replies to student emails are delivered to it.` : chk.error };
    email = chk.email;
  } else email = `${username}@dsu.edu.pk`;
  if (await db.user.findUnique({ where: { email } })) return { error: "Another account already uses that email address" };
  await db.user.create({ data: { username, name, role, email, department: String(form.get("department") ?? "").trim() || null, passwordHash: await hashPassword(password), mustChangePassword: true } });
  await audit({ userId: s.userId, action: "USER_CREATED", after: { username, role } });
  revalidatePath("/admin/users");
  return { ok: `Created ${role.toLowerCase()} “${username}”.` };
}

export async function resetPasswordAction(_: R, form: FormData): Promise<R> {
  const s = await requireRole("ADMIN");
  const id = Number(form.get("id"));
  const password = String(form.get("password") ?? "");
  const u = await db.user.findUnique({ where: { id } });
  if (!u) return { error: "User not found" };
  const problem = passwordProblem(password, u.username);
  if (problem) return { error: problem };
  await db.user.update({ where: { id }, data: { passwordHash: await hashPassword(password), mustChangePassword: true } });
  await audit({ userId: s.userId, action: "PASSWORD_RESET", after: { username: u.username } });
  return { ok: `Password reset for ${u.username}.` };
}

export async function toggleUserAction(form: FormData) {
  const s = await requireRole("ADMIN");
  const id = Number(form.get("id"));
  if (id === s.userId) return; // can't lock yourself out
  const u = await db.user.findUnique({ where: { id } });
  if (!u) return;
  if (u.role === "ADMIN" && u.active && (await db.user.count({ where: { role: "ADMIN", active: true } })) <= 1) return; // keep one admin
  await db.user.update({ where: { id }, data: { active: !u.active } });
  await audit({ userId: s.userId, action: u.active ? "USER_DEACTIVATED" : "USER_ACTIVATED", after: { username: u.username } });
  revalidatePath("/admin/users");
}

export async function changeRoleAction(form: FormData) {
  const s = await requireRole("ADMIN");
  const id = Number(form.get("id"));
  const role = String(form.get("role"));
  if (!["ADMIN", "HOD", "ADVISOR"].includes(role) || id === s.userId) return; // can't change your own role
  const u = await db.user.findUnique({ where: { id } });
  if (!u || u.role === role) return;
  if (u.role === "ADMIN" && u.active && (await db.user.count({ where: { role: "ADMIN", active: true } })) <= 1) return; // keep one admin
  await db.user.update({ where: { id }, data: { role } });
  await audit({ userId: s.userId, action: "USER_ROLE_CHANGED", before: { username: u.username, role: u.role }, after: { username: u.username, role } });
  revalidatePath("/admin/users");
}

export async function updateUserEmailAction(_: R, form: FormData): Promise<R> {
  const s = await requireRole("ADMIN");
  const id = Number(form.get("id"));
  const chk = checkStaffEmail(String(form.get("email") ?? ""));
  if (!chk.ok) return { error: chk.error };
  const u = await db.user.findUnique({ where: { id } });
  if (!u) return { error: "User not found" };
  if (u.email === chk.email) return { ok: "No change" };
  if (await db.user.findFirst({ where: { email: chk.email, NOT: { id } } })) return { error: "Another account already uses that email address" };
  await db.user.update({ where: { id }, data: { email: chk.email } });
  await audit({ userId: s.userId, action: "USER_EMAIL_CHANGED", before: { username: u.username, email: u.email }, after: { username: u.username, email: chk.email } });
  revalidatePath("/admin/users");
  return { ok: "Email updated. It applies to registrations committed from now on." };
}
