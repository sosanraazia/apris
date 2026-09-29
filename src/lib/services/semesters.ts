import { db } from "../db";
import type { Session } from "../auth";
import { audit } from "./audit";

export const SEMESTER_NAME = /^(fall|spring|summer) (20\d{2})$/i;

export class SemesterError extends Error {}

export interface Readiness {
  semester: { id: number; name: string; phase: string } | null;
  offeringCount: number;
  rowsNeedingFixes: number;
  students: number;
  profilesCurrent: number; // students whose latest documents were uploaded after this semester opened (or all, for legacy semesters)
  ready: boolean; // offerings applied → suggestions are live
  registrationsOpen: boolean; // an Admin has opened registrations (phase is not SETUP)
}

export async function semesterReadiness(): Promise<Readiness> {
  const sem = await db.semester.findFirst({ where: { active: true } });
  if (!sem) return { semester: null, offeringCount: 0, rowsNeedingFixes: 0, students: 0, profilesCurrent: 0, ready: false, registrationsOpen: false };
  const [offeringCount, rowsNeedingFixes, students] = await Promise.all([
    db.offering.count({ where: { semesterId: sem.id, active: true } }),
    db.offering.count({ where: { semesterId: sem.id, active: true, OR: [{ cbaCode: null }, { section: null }] } }),
    db.student.findMany({ where: { archivedAt: null }, include: { snapshots: { where: { active: true }, take: 1 } } }),
  ]);
  const current = students.filter((s) => !sem.openedAt || (s.snapshots[0] && s.snapshots[0].createdAt >= sem.openedAt)).length;
  return { semester: { id: sem.id, name: sem.name, phase: sem.phase }, offeringCount, rowsNeedingFixes, students: students.length, profilesCurrent: current, ready: offeringCount > 0, registrationsOpen: sem.phase !== "SETUP" };
}

/** Close the current semester and open a new one. No offerings exist yet, so no suggestions are produced until an Admin uploads them. */
export async function openSemester(session: Session, name: string, opts: { force: boolean }) {
  if (session.role !== "ADMIN") throw new SemesterError("Only an Admin can open a semester");
  const n = name.trim().replace(/\s+/g, " ");
  const m = n.match(SEMESTER_NAME);
  if (!m) throw new SemesterError('Use the form "Fall 2026", "Spring 2027" or "Summer 2027"');
  const canonical = `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`;
  if (await db.semester.findUnique({ where: { name: canonical } })) throw new SemesterError(`${canonical} already exists`);

  const current = await db.semester.findFirst({ where: { active: true } });
  if (current) {
    const unexported = await db.registration.count({ where: { semesterId: current.id, status: { in: ["FINALIZED", "MODIFIED"] }, version: { gt: 0 } } });
    const drafts = await db.registration.count({ where: { semesterId: current.id, status: "DRAFT" } });
    if ((unexported || drafts) && !opts.force)
      throw new SemesterError(`${current.name} still has ${unexported} finalized registration(s) that were never exported and ${drafts} unfinished draft(s). Export them first, or tick "open anyway".`);
  }
  const sem = await db.$transaction(async (tx) => {
    if (current) await tx.semester.update({ where: { id: current.id }, data: { active: false, phase: "CLOSED", addDropEnds: null } });
    return tx.semester.create({ data: { name: canonical, active: true, phase: "SETUP", openedAt: new Date() } });
  });
  await audit({ userId: session.userId, action: "SEMESTER_OPENED", before: current ? { closed: current.name } : undefined, after: { opened: sem.name }, reason: opts.force ? "opened with unexported registrations" : undefined });
  return sem;
}

/** Admin explicitly opens registrations: advisors can now save and finalize. Needs offerings; missing CBA/section rows only warn. */
export async function openRegistrations(session: Session) {
  if (session.role !== "ADMIN") throw new SemesterError("Only an Admin can open registrations");
  const sem = await db.semester.findFirst({ where: { active: true } });
  if (!sem) throw new SemesterError("There is no active semester");
  if (sem.phase !== "SETUP") throw new SemesterError(`Registrations for ${sem.name} are already open`);
  const offerings = await db.offering.count({ where: { semesterId: sem.id, active: true } });
  if (!offerings) throw new SemesterError(`Upload ${sem.name}'s course offerings first — there is nothing to register in yet`);
  const incomplete = await db.offering.count({ where: { semesterId: sem.id, active: true, OR: [{ cbaCode: null }, { section: null }] } });
  await db.semester.update({ where: { id: sem.id }, data: { phase: "REGISTRATION", addDropEnds: null } });
  await audit({ userId: session.userId, action: "SEMESTER_REGISTRATION_OPENED", after: { semester: sem.name, offerings, rowsMissingCbaOrSection: incomplete } });
  return { semester: sem.name, offerings, incomplete };
}
