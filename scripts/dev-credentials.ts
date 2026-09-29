// Dev helper: sets fresh random passwords for the dev accounts and writes them to .dev-credentials.txt (git-ignored).
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { hashPassword, randomPassword } from "../src/lib/password";

const db = new PrismaClient();
(async () => {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run in production");
  const lines: string[] = [];
  for (const username of ["admin", "hod", "advisor"]) {
    const pw = randomPassword();
    const r = await db.user.updateMany({ where: { username }, data: { passwordHash: await hashPassword(pw), mustChangePassword: false } });
    if (r.count) lines.push(`${username}  ${pw}`);
  }
  writeFileSync(`${__dirname}/../.dev-credentials.txt`, lines.join("\n") + "\n", { mode: 0o600 });
  console.log(`Fresh dev passwords for ${lines.length} accounts written to .dev-credentials.txt`);
})().finally(() => db.$disconnect());
