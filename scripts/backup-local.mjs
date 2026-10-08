// Dated backup of the LOCAL development database: ./backups/apris-YYYY-MM-DD-HHMM.db  (git-ignored; holds student records, keep it private)
//   npm run db:backup
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const d = new Date(), p = (n) => String(n).padStart(2, "0");
const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
mkdirSync("backups", { recursive: true });
const out = `backups/apris-${stamp}.db`;
execFileSync("node", ["scripts/db-tool.mjs", "backup", process.env.DB ?? "prisma/dev.db", out], { stdio: "inherit" });
execFileSync("node", ["scripts/db-tool.mjs", "check", out], { stdio: "inherit" });
console.log(`Keep ${out} private: it contains student records.`);
