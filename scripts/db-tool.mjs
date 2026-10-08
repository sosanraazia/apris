// Cross-platform database helper (used by the Windows deployment, works anywhere Node runs; no sqlite3 binary needed).
//   node scripts/db-tool.mjs backup <database-file> <destination-file>   consistent copy, safe while the app is running
//   node scripts/db-tool.mjs check  <database-file>                      integrity check; exits 1 unless the file is healthy
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import pkg from "@prisma/client";

const { PrismaClient } = pkg;
const [cmd, src, dest] = process.argv.slice(2);
const url = (p) => `file:${resolve(p).replace(/\\/g, "/")}`;
const fail = (m) => { console.error(m); process.exit(1); };

if (!["backup", "check"].includes(cmd) || !src || (cmd === "backup" && !dest)) fail("usage: db-tool.mjs backup <db> <dest> | check <db>");
if (!existsSync(src)) fail(`No such database: ${src}`);

const db = new PrismaClient({ datasourceUrl: url(src), log: [] });
try {
  if (cmd === "check") {
    const rows = await db.$queryRawUnsafe("PRAGMA integrity_check");
    const ok = rows.length === 1 && Object.values(rows[0])[0] === "ok";
    console.log(ok ? "ok" : `damaged: ${JSON.stringify(rows).slice(0, 300)}`);
    process.exitCode = ok ? 0 : 1;
  } else {
    mkdirSync(dirname(resolve(dest)), { recursive: true });
    rmSync(dest, { force: true }); // VACUUM INTO refuses to overwrite
    await db.$executeRawUnsafe(`VACUUM INTO '${resolve(dest).replace(/\\/g, "/").replace(/'/g, "''")}'`);
    console.log(`backup written: ${dest}`);
  }
} catch (e) {
  fail(`db-tool failed: ${e.message.split("\n").pop()}`);
} finally {
  await db.$disconnect();
}
