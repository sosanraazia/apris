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

// Policy: at least 6 characters, nothing else required (decided by the department). Sign-in lockout and throttling still apply.
export const MIN_PASSWORD = 6;
export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters`;
  if (pw.length > 128) return "Password is too long";
  return null;
}

export const randomPassword = () => randomBytes(15).toString("base64url"); // 20 chars
