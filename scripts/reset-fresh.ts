// One-time "start fresh" for a dev/staging copy: removes all student, registration, audit and uploaded-file data,
// keeps reference data (users, POS, prerequisites, settings, semester, offerings). NEVER run against production data.
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
(async () => {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run with NODE_ENV=production");
  if (!process.argv.includes("--yes")) throw new Error("Pass --yes to confirm you want to delete all student data");

  // children first — foreign keys on students are RESTRICT on purpose
  const r = await db.$transaction([
    db.registrationItem.deleteMany(),
    db.registrationVersion.deleteMany(),
    db.registration.deleteMany(),
    db.snapshot.deleteMany(),
    db.student.deleteMany(),
    db.auditLog.deleteMany(),
    db.semester.updateMany({ data: { phase: "REGISTRATION", addDropEnds: null } }),
  ]);
  console.log("removed → items:%d versions:%d registrations:%d snapshots:%d students:%d audit:%d", r[0].count, r[1].count, r[2].count, r[3].count, r[4].count, r[5].count);

  const root = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.join(process.cwd(), "storage");
  for (const sub of ["students", "drafts", "offering-drafts"]) await rm(path.join(root, sub), { recursive: true, force: true });
  console.log("storage now:", (await readdir(root).catch(() => [])).join(", ") || "(empty)");
})().finally(() => db.$disconnect());
