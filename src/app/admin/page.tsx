import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { Badge, Card, btnGhost, input, td, th } from "@/components/ui";
import { SettingsForm } from "@/components/SettingsForm";
import { fixOfferingAction } from "./actions";
import { PhaseForm } from "@/components/PhaseForm";
import { effectivePhase, PHASE_LABEL } from "@/lib/services/phase";

export default async function Admin() {
  await requireRole("ADMIN");
  const settings = await getSettings();
  const sem = await db.semester.findFirst({ where: { active: true } });
  const offerings = await db.offering.findMany({ where: { semesterId: sem?.id ?? -1 }, orderBy: [{ sheet: "asc" }, { courseCode: "asc" }, { section: "asc" }] });
  const bad = offerings.filter((o) => !o.cbaCode || !o.section || JSON.parse(o.issues).some((i: string) => i.startsWith("Duplicate")));
  const [pos, prereq, logs, users] = await Promise.all([
    db.pos.findMany({ orderBy: [{ program: "asc" }, { year: "asc" }, { variant: "asc" }], include: { _count: { select: { students: true } } } }),
    db.prerequisite.findMany(),
    db.auditLog.findMany({ orderBy: { id: "desc" }, take: 40 }),
    db.user.findMany(),
  ]);
  const uname = new Map(users.map((u) => [u.id, u.name]));

  const Row = ({ o }: { o: (typeof offerings)[number] }) => (
    <tr>
      <td className={td}>{o.sheet}</td><td className={`${td} font-mono`}>{o.courseCode}</td><td className={td}>{o.courseName}</td>
      <td colSpan={3} className={td}>
        <form action={fixOfferingAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={o.id} />
          <input name="section" defaultValue={o.section ?? ""} placeholder="Section" className={`${input} w-28`} aria-label="Section" />
          <input name="cbaCode" defaultValue={o.cbaCode ?? ""} placeholder="CBA code" className={`${input} w-28`} aria-label="CBA code" />
          <button className={btnGhost}>Save</button>
          <span className="text-xs text-amber-700">{(JSON.parse(o.issues) as string[]).filter((i) => !i.startsWith("Columns")).join("; ")}</span>
        </form>
      </td>
    </tr>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">Admin</h1><Link href="/admin/users" className={btnGhost}>Manage users</Link></div>
      {sem && (
        <Card title={`Registration phase — ${sem.name}`} right={<Badge tone={effectivePhase(sem) === "CLOSED" ? "red" : effectivePhase(sem) === "ADD_DROP" ? "amber" : "green"}>{PHASE_LABEL[effectivePhase(sem)]}</Badge>}>
          <PhaseForm phase={sem.phase} ends={sem.addDropEnds ? sem.addDropEnds.toISOString().slice(0, 10) : ""} />
        </Card>
      )}
      <Card title="Academic rule settings"><SettingsForm values={settings} /></Card>
      <Card title={`Offering rows needing attention — ${sem?.name ?? ""} (${bad.length})`}>
        <p className="mb-3 text-sm text-slate-600">Rows without a CBA code or section can be recommended but can&apos;t be exported. Enter the values from the source ERP; duplicates are re-checked after each save.</p>
        <div className="-mx-5 overflow-x-auto"><table className="w-full"><thead><tr><th className={th}>Sheet</th><th className={th}>Code</th><th className={th}>Course</th><th className={th} colSpan={3}>Fix</th></tr></thead><tbody className="divide-y divide-slate-100">{bad.map((o) => <Row key={o.id} o={o} />)}{!bad.length && <tr><td className={`${td} py-6 text-center text-emerald-700`} colSpan={6}>All offering rows are export-ready.</td></tr>}</tbody></table></div>
        <details className="mt-4"><summary className="cursor-pointer text-sm text-slate-600">All {offerings.length} offering rows</summary>
          <div className="-mx-5 mt-2 overflow-x-auto"><table className="w-full"><tbody className="divide-y divide-slate-100">{offerings.map((o) => <Row key={o.id} o={o} />)}</tbody></table></div></details>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Plans of Study (${pos.length} variants, all published)`}>
          <ul className="space-y-1 text-sm">{pos.map((p) => (<li key={p.id} className="flex justify-between"><span>{p.posCode} <span className="text-slate-500">{p.variant.replaceAll("_", " ").toLowerCase()}</span></span><span className="text-slate-500">{p.totalRequired} CH · {p._count.students} students</span></li>))}</ul>
        </Card>
        <Card title={`Prerequisites (${prereq.length})`}>
          <ul className="space-y-1 text-sm">{prereq.map((p) => (<li key={p.id}><span className="font-medium">{p.course}</span> <span className="text-slate-500">requires</span> {p.prerequisite} <Badge>{p.rule}</Badge></li>))}</ul>
          <p className="mt-3 text-xs text-slate-500">Names are matched across POS versions using an alias table (e.g. “Cyber Security” in BS-CYS-2024 = “Introduction to Cyber Security”). Multiple prerequisites for one course are all required (AND).</p>
        </Card>
      </div>
      <Card title="Recent audit log (all activity)">
        <div className="-m-5 overflow-x-auto"><table className="w-full"><thead><tr><th className={th}>When</th><th className={th}>Who</th><th className={th}>Action</th><th className={th}>Student</th><th className={th}>Reason</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{logs.map((l) => (<tr key={l.id}><td className={`${td} whitespace-nowrap`}>{l.at.toLocaleString()}</td><td className={td}>{uname.get(l.userId ?? -1) ?? "system"}</td><td className={td}><Badge>{l.action.toLowerCase()}</Badge></td><td className={`${td} font-mono`}>{l.studentRegId}</td><td className={td}>{l.reason}</td></tr>))}</tbody></table></div>
      </Card>
    </div>
  );
}
