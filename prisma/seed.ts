import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";
import { hashPassword, passwordProblem, randomPassword } from "../src/lib/password";
import { parsePosPdf } from "../src/lib/parsers/fulfillment";
import { parseOfferingWorkbook, parsePrereqWorkbook } from "../src/lib/importers";
import { DEFAULT_SETTINGS } from "../src/lib/rules/types";

const db = new PrismaClient();
const data = (f: string) => `${__dirname}/../data/${f}`;

const PROD = process.env.NODE_ENV === "production";
// Modes: default (dev) = full reset of reference data + dev accounts with RANDOM passwords.
//        --init = production-safe: only fills what is missing, never overwrites Admin edits.
const INIT = process.argv.includes("--init");

// No passwords live in source. Dev accounts get random passwords written to a git-ignored file;
// the production admin's password comes from the environment (INITIAL_ADMIN_PASSWORD) and must be changed at first login.
const DEV_USERS = [
  { username: "admin", name: "APRIS Admin", role: "ADMIN" },
  { username: "hod", name: "Head of Department", role: "HOD" },
  { username: "advisor", name: "Academic Advisor", role: "ADVISOR" },
];
const USERS = (PROD || INIT ? DEV_USERS.slice(0, 1) : DEV_USERS).map((u) => ({
  ...u,
  password: PROD || INIT ? (process.env.INITIAL_ADMIN_PASSWORD ?? "") : randomPassword(),
}));

async function main() {
  for (const u of USERS) {
    if (INIT && (await db.user.findUnique({ where: { username: u.username } }))) continue; // never reset an existing password
    const problem = passwordProblem(u.password, u.username);
    if (problem) throw new Error(`INITIAL_ADMIN_PASSWORD rejected: ${problem}`);
    const passwordHash = await hashPassword(u.password);
    await db.user.upsert({
      where: { username: u.username },
      create: { username: u.username, name: u.name, role: u.role, email: `${u.username}@dsu.edu.pk`, passwordHash, department: "Computing", mustChangePassword: PROD || INIT },
      update: INIT ? {} : { passwordHash, role: u.role },
    });
  }

  if (!PROD && !INIT) {
    writeFileSync(`${__dirname}/../.dev-credentials.txt`, USERS.map((u) => `${u.username}  ${u.password}`).join("\n") + "\n", { mode: 0o600 });
    console.log("Dev logins written to .dev-credentials.txt (git-ignored).");
  }

  for (const [k, v] of Object.entries(DEFAULT_SETTINGS))
    await db.setting.upsert({ where: { key: k }, create: { key: k, value: JSON.stringify(v) }, update: {} });

  // POS variants from the official PDFs (all published; POS files are fixed)
  let posCount = 0;
  for (const f of ["SoftwareEngineering_PoS.pdf", "CyberSecurity_PoS.pdf"]) {
    for (const p of await parsePosPdf(data(f))) {
      const pos = await db.pos.upsert({
        where: { posCode_variant: { posCode: p.posCode, variant: p.variant } },
        create: { posCode: p.posCode, program: p.program, year: p.year, variant: p.variant, totalRequired: p.totalRequired ?? 0, published: true },
        update: { totalRequired: p.totalRequired ?? 0 },
      });
      await db.posCourse.deleteMany({ where: { posId: pos.id } });
      await db.posCourse.createMany({ data: p.courses.map((c, i) => ({ posId: pos.id, seq: i, semester: c.semester, code: c.code, title: c.title, ch: c.ch, isPlaceholder: c.isPlaceholder })) });
      posCount++;
    }
  }

  const pr = await parsePrereqWorkbook(data("PreReqRules.xlsx"));
  if (!INIT || (await db.prerequisite.count()) === 0) {
    await db.prerequisite.deleteMany();
    await db.prerequisite.createMany({ data: pr });
  }

  const sem = await db.semester.upsert({ where: { name: "Fall 2026" }, create: { name: "Fall 2026", active: true }, update: INIT ? {} : { active: true } });
  const off = await parseOfferingWorkbook(data("Fall2026CourseOffering.xlsx"));
  if (!INIT || (await db.offering.count({ where: { semesterId: sem.id } })) === 0) {
    await db.offering.deleteMany({ where: { semesterId: sem.id } });
    await db.offering.createMany({ data: off.rows.map((r) => ({ ...r, semesterId: sem.id, issues: JSON.stringify(r.issues) })) });
  }

  console.log(`Seeded: ${posCount} POS variants, ${pr.length} prerequisites, ${off.rows.length} offerings (${off.normalizedCount} normalised)`);
}

main().finally(() => db.$disconnect());
