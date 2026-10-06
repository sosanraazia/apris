import type { Session } from "../auth";
import { db } from "../db";

export interface SlipItem {
  cbaCode: string;
  courseCode: string;
  section: string;
  courseName: string;
  ch: number;
}
export interface Slip {
  studentId: number;
  registrationId: string;
  name: string;
  program: string;
  homeSection: string | null;
  advisor: string | null;
  version: number;
  status: string;
  committedAt: Date;
  items: SlipItem[];
  totalCH: number;
}
export interface SlipSet {
  semester: string;
  generatedAt: Date;
  slips: Slip[];
  /** Registration rows included (used to mark them exported after an Excel hand-over). */
  registrationIds: { id: number; status: string }[];
}

export type Scope = "all" | "new";

/**
 * The committed (latest finalized) version of every registration in the active semester, scoped to what the user may see:
 * advisors get their own students; Admin / HoD get everyone. `scope: "new"` = finalized but not yet handed to IT
 * (new, or changed since the last Excel export).
 */
export async function loadSlips(session: Session, opts: { scope?: Scope; studentId?: number } = {}): Promise<SlipSet | null> {
  const sem = await db.semester.findFirst({ where: { active: true } });
  if (!sem) return null;
  const regs = await db.registration.findMany({
    where: {
      semesterId: sem.id,
      version: { gt: 0 },
      status: opts.scope === "new" ? "FINALIZED" : { in: ["FINALIZED", "EXPORTED", "MODIFIED"] },
      student: { archivedAt: null, ...(session.role === "ADVISOR" ? { advisorId: session.userId } : {}), ...(opts.studentId ? { id: opts.studentId } : {}) },
    },
    include: { student: { include: { advisor: true } }, versions: { orderBy: { version: "desc" }, take: 1 } },
    orderBy: { student: { registrationId: "asc" } },
  });
  const slips: Slip[] = regs.map((r) => {
    const v = r.versions[0];
    const items = (JSON.parse(v.items) as SlipItem[]).map((i) => ({ cbaCode: i.cbaCode, courseCode: i.courseCode, section: i.section, courseName: i.courseName, ch: i.ch ?? 0 }));
    return {
      studentId: r.studentId,
      registrationId: r.student.registrationId,
      name: r.student.name,
      program: r.student.program,
      homeSection: r.student.homeSection,
      advisor: r.student.advisor?.name ?? null,
      version: v.version,
      status: r.status,
      committedAt: v.createdAt,
      items,
      totalCH: items.reduce((a, i) => a + i.ch, 0),
    };
  });
  return { semester: sem.name, generatedAt: new Date(), slips, registrationIds: regs.map((r) => ({ id: r.id, status: r.status })) };
}
