// Emergency password reset, run on the server by someone with shell access (never exposed through the web app).
//   ADMIN_NEW_PASSWORD='...' npm run admin:reset -- <username>
// Sets a temporary password (12+ chars), forces a change at next login, signs the user out everywhere, and is audit-logged.
import { PrismaClient } from "@prisma/client";
import { hashPassword, passwordProblem } from "../src/lib/password";
import { audit } from "../src/lib/services/audit";

const db = new PrismaClient();
(async () => {
  const username = (process.argv[2] ?? "").trim().toLowerCase();
  const pw = process.env.ADMIN_NEW_PASSWORD ?? "";
  if (!username) throw new Error("Usage: ADMIN_NEW_PASSWORD='…' npm run admin:reset -- <username>");
  const problem = passwordProblem(pw);
  if (problem) throw new Error(`ADMIN_NEW_PASSWORD rejected: ${problem}`);
  const user = await db.user.findUnique({ where: { username } });
  if (!user) throw new Error(`No such user: ${username}`);
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(pw), mustChangePassword: true, active: true } });
  await audit({ action: "PASSWORD_RESET", reason: `server-side emergency reset for ${username}`, after: { username } });
  console.log(`Password reset for ${username}. They must change it at next login; existing sessions are invalid.`);
})().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
