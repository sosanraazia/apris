import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { Badge, Card, btn, btnGhost, input, td, th } from "@/components/ui";
import { effectivePhase, PHASE_LABEL } from "@/lib/services/phase";

const REG_TONE: Record<string, string> = { NOT_STARTED: "slate", DRAFT: "amber", MODIFIED: "amber", FINALIZED: "green", EXPORTED: "blue" };

export default async function Students({ searchParams }: PageProps<"/students">) {
  const s = await requireRole();
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim();
  const showArchived = s.role === "ADMIN" && sp.archived === "1";
  const sem = await db.semester.findFirst({ where: { active: true } });
  const students = await db.student.findMany({
    where: { ...(showArchived ? { archivedAt: { not: null } } : { archivedAt: null }), ...(s.role === "ADVISOR" ? { advisorId: s.userId } : {}), ...(q ? { OR: [{ registrationId: { contains: q.toUpperCase() } }, { name: { contains: q } }] } : {}) },
    include: { pos: true, snapshots: { where: { active: true }, take: 1 }, registrations: { where: { semesterId: sem?.id ?? -1 }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } } },
    orderBy: { registrationId: "asc" },
    take: 200,
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div><h1 className="text-xl font-semibold">Students</h1>{sem && <p className="text-xs text-slate-500">{sem.name} · <Badge tone={effectivePhase(sem) === "CLOSED" ? "red" : effectivePhase(sem) === "ADD_DROP" ? "amber" : "green"}>{PHASE_LABEL[effectivePhase(sem)]}</Badge></p>}</div>
        <form className="ml-auto flex gap-2"><input name="q" defaultValue={q} placeholder="Search Registration ID or name" className={`${input} w-72`} /><button className={btn}>Search</button></form>
        {s.role === "ADMIN" && <Link href={showArchived ? "/students" : "/students?archived=1"} className={btnGhost}>{showArchived ? "Show active" : "Show archived"}</Link>}
        {s.role !== "HOD" && <Link href="/students/new" className={btn}>+ Add New Student</Link>}
      </div>
      <Card>
        <div className="-m-5 overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-100"><tr><th className={th}>Registration ID</th><th className={th}>Name</th><th className={th}>Program / POS</th><th className={th}>Home section</th><th className={`${th} hidden xl:table-cell`}>CGPA</th><th className={`${th} hidden xl:table-cell`}>Completed CH</th><th className={`${th} hidden xl:table-cell`}>Standing</th><th className={th}>{sem?.name ?? "Semester"}</th><th className={th}>Registered</th><th className={th}></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((st) => {
                const snap = st.snapshots[0];
                const rs = st.registrations[0]?.status ?? "NOT_STARTED";
                return (
                  <tr key={st.id} className="hover:bg-slate-50">
                    <td className={`${td} font-mono`}><Link className="text-brand underline-offset-2 hover:underline" href={`/students/${st.id}`}>{st.registrationId}</Link></td>
                    <td className={td}>{st.name}</td>
                    <td className={td}>{st.program} · {st.pos?.posCode.replace("BS-", "")} <span className="text-slate-400">{st.pos?.variant.replaceAll("_", " ").toLowerCase()}</span></td>
                    <td className={td}>{st.homeSection ?? "—"}</td>
                    <td className={`${td} hidden xl:table-cell`}>{snap?.cgpa?.toFixed(2) ?? "—"}</td>
                    <td className={`${td} hidden xl:table-cell`}>{snap ? `${snap.completedCH} / ${snap.requiredCH ?? "?"}` : "—"}</td>
                    <td className={`${td} hidden xl:table-cell`}>{st.standing === "NORMAL" ? <span className="text-slate-500">Normal</span> : <Badge tone="amber">{st.standing}</Badge>}</td>
                    <td className={td}><Badge tone={REG_TONE[rs]}>{rs.replace("_", " ").toLowerCase()}</Badge></td>
                    <td className={`${td} whitespace-nowrap text-slate-600`}>{(() => { const v = st.registrations[0]?.versions[0]; if (!v) return "—"; const items = JSON.parse(v.items) as { ch: number }[]; return `${items.length} courses · ${items.reduce((a, i) => a + i.ch, 0)} CH · v${v.version}`; })()}</td>
                    <td className={`${td} whitespace-nowrap text-right`}>
                      {s.role !== "HOD" && <Link className={`${btnGhost} mr-2 !px-2.5 !py-1`} href={`/students/${st.id}?tab=overview`}>Edit</Link>}
                      <Link className={`${btn} !px-2.5 !py-1`} href={`/students/${st.id}?tab=registration`}>{s.role === "HOD" ? "View" : rs === "NOT_STARTED" ? "Register" : effectivePhase(sem ?? { phase: "CLOSED", addDropEnds: null }) === "ADD_DROP" ? "Add / Drop" : "Registration"}</Link>
                    </td>
                  </tr>
                );
              })}
              {!students.length && <tr><td className={`${td} py-10 text-center text-slate-500`} colSpan={10}>No students yet. Use “+ Add New Student” to upload a student&apos;s Interim Transcript and POS Fulfillment Report.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
