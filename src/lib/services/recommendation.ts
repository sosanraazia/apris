import { db } from "../db";
import { getSettings } from "../settings";
import { posProgress, recommend } from "../rules/engine";
import type { AttemptRow, OfferingRow, PrereqRow, StudentInput, Standing } from "../rules/types";
import type { PosVariant, ProgramCode } from "../parsers/common";
import type { TranscriptCourse } from "../parsers/transcript";

export async function activeSemester() {
  return db.semester.findFirst({ where: { active: true } });
}

export async function loadStudentInput(studentId: number): Promise<{ input: StudentInput; snapshotId: number | null } | null> {
  const st = await db.student.findUnique({
    where: { id: studentId },
    include: { pos: { include: { courses: { orderBy: [{ semester: "asc" }, { seq: "asc" }] } } }, snapshots: { where: { active: true }, orderBy: { id: "desc" }, take: 1 } },
  });
  if (!st || !st.pos) return null;
  const snap = st.snapshots[0];
  const attempts: AttemptRow[] = snap ? (JSON.parse(snap.courses) as TranscriptCourse[]) : [];
  return {
    snapshotId: snap?.id ?? null,
    input: {
      registrationId: st.registrationId,
      program: st.program as ProgramCode,
      posVariant: st.pos.variant as PosVariant,
      homeSection: st.homeSection,
      standing: st.standing as Standing,
      pos: st.pos.courses.map((c) => ({ semester: c.semester, code: c.code, title: c.title, ch: c.ch, isPlaceholder: c.isPlaceholder })),
      attempts,
    },
  };
}

export async function loadOfferings(semesterId: number): Promise<(OfferingRow & { dbId: number })[]> {
  const rows = await db.offering.findMany({ where: { semesterId, active: true } });
  return rows.map((o) => ({
    id: String(o.id),
    dbId: o.id,
    sheet: o.sheet,
    program: o.program as ProgramCode | null,
    courseCode: o.courseCode,
    courseName: o.courseName,
    section: o.section,
    cbaCode: o.cbaCode,
    preMedOnly: o.preMedOnly,
    issues: JSON.parse(o.issues) as string[],
  }));
}

export async function loadPrereqs(): Promise<PrereqRow[]> {
  return (await db.prerequisite.findMany()).map((p) => ({ course: p.course, prerequisite: p.prerequisite, rule: p.rule }));
}

export async function computeForStudent(studentId: number) {
  const [loaded, sem, prereqs, settings] = await Promise.all([loadStudentInput(studentId), activeSemester(), loadPrereqs(), getSettings()]);
  if (!loaded) return null;
  const offerings = sem ? await loadOfferings(sem.id) : [];
  return {
    semester: sem,
    settings,
    input: loaded.input,
    offerings,
    progress: posProgress(loaded.input, settings),
    rec: recommend(loaded.input, prereqs, offerings, settings),
  };
}
