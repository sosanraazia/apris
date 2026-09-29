import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

// Framework-free so the seed script and server actions share one policy.
const ROUNDS = 12;
export const hashPassword = (pw: string) => bcrypt.hash(pw, ROUNDS);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

let dummy: Promise<string> | null = null;
/** Compared against when the username doesn't exist, so response time doesn't reveal which usernames are real. */
export const burnTime = async (pw: string) => {
  dummy ??= bcrypt.hash("not-a-real-password", ROUNDS);
  await bcrypt.compare(pw, await dummy);
};

export function passwordProblem(pw: string, username = ""): string | null {
  if (pw.length < 12) return "Password must be at least 12 characters";
  if (pw.length > 128) return "Password is too long";
  if (username && pw.toLowerCase().includes(username.toLowerCase())) return "Password must not contain the username";
  if (/^(.)\1+$/.test(pw) || /^(password|12345678|qwertyuiop)/i.test(pw)) return "Password is too easy to guess";
  return null;
}

export const randomPassword = () => randomBytes(15).toString("base64url"); // 20 chars
