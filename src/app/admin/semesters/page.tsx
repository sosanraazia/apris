import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { semesterReadiness } from "@/lib/services/semesters";
import { effectivePhase, PHASE_LABEL } from "@/lib/services/phase";
import { Badge, Card, td, th } from "@/components/ui";
import { OpenSemesterForm } from "@/components/OpenSemesterForm";
import { OfferingUploadForm } from "@/components/OfferingForms";
import { OpenRegistrationsButton } from "@/components/OpenRegistrationsButton";

export default async function Semesters() {
  await requireRole("ADMIN");
  const [sems, ready] = await Promise.all([
    db.semester.findMany({ orderBy: { id: "desc" }, include: { _count: { select: { offerings: true, registrations: true } }, registrations: { select: { status: true } } } }),
    semesterReadiness(),
  ]);
  return (
    <div className="space-y-6">
      <div><Link href="/admin" className="text-sm text-slate-500 hover:underline">← Admin</Link><h1 className="text-xl font-semibold">Semesters</h1></div>
      <Card title="Open a new semester"><OpenSemesterForm current={ready.semester?.name ?? null} /></Card>
      {ready.semester && (
        <Card title={`${ready.semester.name}: offerings and registration`} right={<Badge tone={ready.registrationsOpen ? "green" : "amber"}>{ready.registrationsOpen ? "registrations open" : ready.ready ? "offerings uploaded, registrations not open" : "waiting for offerings"}</Badge>}>
          <div className="space-y-5">
            <div><h3 className="mb-2 text-sm font-medium">1. Upload course offerings</h3><OfferingUploadForm /></div>
            {!ready.registrationsOpen && <div><h3 className="mb-2 text-sm font-medium">2. Open registrations for advisors</h3><OpenRegistrationsButton disabledReason={ready.ready ? undefined : "Upload and apply the course offerings first."} /></div>}
          </div>
        </Card>
      )}
      <Card title="All semesters">
        <div className="-m-5 overflow-x-auto"><table className="w-full"><thead><tr><th className={th}>Semester</th><th className={th}>Status</th><th className={th}>Phase</th><th className={th}>Offerings</th><th className={th}>Registrations</th><th className={th}>Finalized</th><th className={th}>Exported</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{sems.map((s) => (
            <tr key={s.id}><td className={`${td} font-medium`}>{s.name}</td><td className={td}>{s.active ? <Badge tone="green">active</Badge> : <Badge>past</Badge>}</td><td className={td}>{PHASE_LABEL[effectivePhase(s)]}</td>
              <td className={td}>{s._count.offerings || <span className="text-amber-700">none yet</span>}</td><td className={td}>{s._count.registrations}</td>
              <td className={td}>{s.registrations.filter((r) => ["FINALIZED", "MODIFIED", "EXPORTED"].includes(r.status)).length}</td><td className={td}>{s.registrations.filter((r) => r.status === "EXPORTED").length}</td></tr>))}</tbody></table></div>
      </Card>
    </div>
  );
}
