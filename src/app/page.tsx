import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { Card, Stat, btn, Notice } from "@/components/ui";
import { effectivePhase, PHASE_LABEL } from "@/lib/services/phase";

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const s = await requireRole();
  const sp = await searchParams;
  const scope = s.role === "ADVISOR" ? { advisorId: s.userId } : {};
  const settings = await getSettings();
  const sem = await db.semester.findFirst({ where: { active: true } });
  const students = await db.student.findMany({
    where: scope,
    include: { snapshots: { where: { active: true }, take: 1 }, registrations: { where: { semesterId: sem?.id ?? -1 } } },
  });
  const status = (st: (typeof students)[number]) => st.registrations[0]?.status ?? "NOT_STARTED";
  const count = (f: (st: (typeof students)[number]) => boolean) => students.filter(f).length;
  const finalized = count((x) => ["FINALIZED", "EXPORTED"].includes(status(x)));
  const overrides = await db.registrationItem.count({ where: { overrideReason: { not: null }, registration: { student: scope, semesterId: sem?.id ?? -1 } } });
  const unknownIssues = await db.offering.count({ where: { semesterId: sem?.id ?? -1, OR: [{ cbaCode: null }, { section: null }] } });

  return (
    <div className="space-y-6">
      {sp.denied && <Notice tone="red">You don&apos;t have access to that page.</Notice>}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{s.role === "ADVISOR" ? "Advisor dashboard" : s.role === "HOD" ? "Department dashboard" : "Admin dashboard"}</h1>
          <p className="text-sm text-slate-500">Registration cycle: <span className="font-medium">{sem?.name ?? "none active"}</span>{sem && <> · phase: <span className="font-medium">{PHASE_LABEL[effectivePhase(sem)]}</span></>}</p>
        </div>
        {s.role !== "HOD" && <Link href="/students/new" className={btn}>+ Add New Student</Link>}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        <Stat label={s.role === "ADVISOR" ? "Total advisees" : "Total students"} value={students.length} href="/students" />
        <Stat label="Registration not started" value={count((x) => status(x) === "NOT_STARTED")} />
        <Stat label="Draft / modified" value={count((x) => ["DRAFT", "MODIFIED"].includes(status(x)))} />
        <Stat label="Finalized" value={finalized} />
        <Stat label="Exported" value={count((x) => status(x) === "EXPORTED")} />
        <Stat label="Probation" value={count((x) => x.standing === "PROBATION")} tone={count((x) => x.standing === "PROBATION") ? "amber" : undefined} />
        <Stat label="Relegation" value={count((x) => x.standing === "RELEGATION")} />
        <Stat label={`FYP-I eligible (≥ ${settings.fypThresholdCH} CH)`} value={count((x) => (x.snapshots[0]?.completedCH ?? 0) >= settings.fypThresholdCH)} />
        <Stat label="Advisor overrides" value={overrides} />
        {s.role !== "ADVISOR" && <Stat label="Offering rows needing fixes" value={unknownIssues} tone={unknownIssues ? "amber" : undefined} href={s.role === "ADMIN" ? "/admin" : undefined} />}
      </div>

      {s.role !== "HOD" && finalized > 0 && (
        <Card title="Export">
          <p className="mb-3 text-sm text-slate-600">{finalized} finalized registration(s) are ready. The CSV has one row per student-course enrollment.</p>
          <form method="post" action="/api/export"><button className={btn}>Download registration CSV</button></form>
        </Card>
      )}
    </div>
  );
}
