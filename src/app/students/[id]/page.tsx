import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { courseKey } from "@/lib/rules/keys";
import { computeForStudent } from "@/lib/services/recommendation";
import type { TranscriptCourse, TranscriptTerm } from "@/lib/parsers/transcript";
import { Badge, Card, Notice, td, th } from "@/components/ui";
import { UploadForm } from "@/components/UploadForm";
import { RegistrationEditor } from "@/components/RegistrationEditor";
import { SetStanding } from "@/components/SetStanding";
import { SetHomeSection } from "@/components/SetHomeSection";
import { EditDetails } from "@/components/EditDetails";
import { AssignAdvisor } from "@/components/AssignAdvisor";
import { canEdit, effectivePhase, PHASE_LABEL } from "@/lib/services/phase";
import { recordStudentView } from "@/lib/services/audit";
import { ArchiveStudent } from "@/components/ArchiveStudent";

const TABS = [["overview", "Overview"], ["history", "Academic history"], ["pos", "POS progress"], ["registration", "Registration"], ["documents", "Documents"], ["audit", "Audit trail"]] as const;
const PROG_TONE = { COMPLETED: "green", FAILED: "red", PENDING: "amber", FUTURE: "slate" } as const;

export default async function StudentPage({ params, searchParams }: PageProps<"/students/[id]">) {
  const s = await requireRole();
  const id = Number((await params).id);
  const tab = String((await searchParams).tab ?? "overview");
  const st = await db.student.findUnique({ where: { id }, include: { pos: true, advisor: true, snapshots: { orderBy: { id: "desc" } } } });
  if (!st || (s.role === "ADVISOR" && st.advisorId !== s.userId) || (st.archivedAt && s.role !== "ADMIN")) notFound();
  await recordStudentView(s.userId, st.registrationId); // who looked at which student's record
  const ctx = await computeForStudent(id);
  const snap = st.snapshots.find((x) => x.active);
  const courses: TranscriptCourse[] = snap ? JSON.parse(snap.courses) : [];
  const terms: TranscriptTerm[] = snap ? JSON.parse(snap.terms) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-slate-500"><Link href="/students" className="hover:underline">Students</Link> / <span className="font-mono">{st.registrationId}</span></div>
          <h1 className="text-xl font-semibold">{st.name}</h1>
          <p className="text-sm text-slate-500">{st.email} · Advisor: {st.advisor?.name ?? "unassigned"}</p>
        </div>
        <div className="flex gap-2">
          <Badge tone="blue">{st.program}</Badge>
          <Badge>{st.pos?.posCode} {st.pos?.variant.replaceAll("_", " ").toLowerCase()}</Badge>
          <Badge tone={st.standing === "NORMAL" ? "green" : "amber"}>{st.standing.toLowerCase()}</Badge>
        </div>
      </div>

      {st.archivedAt && <Notice tone="red"><b>Archived</b> on {st.archivedAt.toLocaleDateString()} — {st.archivedReason}. Hidden from advisors and lists; nothing was deleted.</Notice>}
      <nav className="flex gap-1 border-b border-slate-200">
        {TABS.map(([k, l]) => (<Link key={k} href={`?tab=${k}`} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-brand font-medium text-brand" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{l}</Link>))}
      </nav>

      {tab === "overview" && ctx && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Academic summary">
            <dl className="space-y-2 text-sm">
              {[["Home section", st.homeSection ?? "—"], ["Admission", st.admission ?? "—"], ["CGPA", snap?.cgpa?.toFixed(2) ?? "—"], ["Completed CH", `${ctx.rec.completedCH} of ${st.pos?.totalRequired}`], ["Target semester", ctx.rec.targetSemester ?? "—"]].map(([k, v]) => (<div key={String(k)} className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>))}
            </dl>
          </Card>
          <Card title="FYP-I status">
            <p className="text-sm"><Badge tone={ctx.rec.fypEligible ? "green" : "amber"}>{ctx.rec.fypEligible ? "eligible" : "not eligible"}</Badge></p>
            <p className="mt-2 text-sm text-slate-600">{ctx.rec.completedCH} of {ctx.settings.fypThresholdCH} required credit hours completed.</p>
          </Card>
          {s.role !== "HOD" && <Card title="Student details"><EditDetails studentId={id} name={st.name} fatherName={st.fatherName} /></Card>}
          {s.role === "ADMIN" && <Card title="Profile record"><ArchiveStudent studentId={id} archived={!!st.archivedAt} /></Card>}
          {s.role === "ADMIN" && <Card title="Advisor"><AssignAdvisor studentId={id} current={st.advisorId} advisors={(await db.user.findMany({ where: { role: "ADVISOR", active: true }, orderBy: { name: "asc" } })).map((a) => ({ id: a.id, name: a.name }))} /></Card>}
          {s.role !== "HOD" && <Card title="Home section"><SetHomeSection studentId={id} current={st.homeSection} /></Card>}
          {s.role === "ADMIN" && <Card title="Academic standing"><SetStanding studentId={id} current={st.standing} /></Card>}
          {s.role !== "HOD" && (
            <Card title="Update profile for a new semester" className="lg:col-span-3">
              <UploadForm studentId={id} />
            </Card>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-4">
          {terms.map((t) => (
            <Card key={t.term} title={t.term} right={<span className="text-xs text-slate-500">SGPA {t.sgpa?.toFixed(2)} · CGPA {t.cgpa?.toFixed(2)}</span>}>
              <div className="-m-5"><table className="w-full"><thead><tr><th className={th}>Code</th><th className={th}>Title</th><th className={th}>Grade</th><th className={th}>CH</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{courses.filter((c) => c.term === t.term).map((c, i) => (<tr key={i}><td className={`${td} font-mono`}>{c.code}</td><td className={td}>{c.title}</td><td className={td}><Badge tone={c.gradePoint >= 1 ? "green" : "red"}>{c.grade}</Badge></td><td className={td}>{c.ch}</td></tr>))}</tbody></table></div>
            </Card>
          ))}
          {!terms.length && <Notice tone="blue">No transcript uploaded yet.</Notice>}
        </div>
      )}

      {tab === "pos" && ctx && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[...new Set(ctx.progress.map((p) => p.semester))].map((sem) => (
            <Card key={sem} title={`Semester ${sem}`} right={<span className="text-xs text-slate-500">{ctx.progress.filter((p) => p.semester === sem).reduce((a, p) => a + p.ch, 0)} CH</span>}>
              <ul className="space-y-1.5 text-sm">{ctx.progress.filter((p) => p.semester === sem).map((p) => (<li key={p.key} className="flex items-start justify-between gap-2"><span>{p.title} <span className="font-mono text-xs text-slate-400">{p.code}</span></span><Badge tone={PROG_TONE[p.state]}>{p.grade ?? p.state.toLowerCase()}</Badge></li>))}</ul>
            </Card>
          ))}
        </div>
      )}

      {tab === "registration" && ctx && <RegistrationTab studentId={id} role={s.role} ctx={ctx} />}

      {tab === "documents" && (
        <Card title="Uploaded official documents (private)">
          <table className="w-full"><thead><tr><th className={th}>Snapshot</th><th className={th}>Uploaded</th><th className={th}>CGPA</th><th className={th}>Completed CH</th><th className={th}>Files</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{st.snapshots.map((x) => (<tr key={x.id}><td className={td}>#{x.id} {x.active && <Badge tone="green">latest active</Badge>}</td><td className={td}>{x.createdAt.toLocaleString()}</td><td className={td}>{x.cgpa?.toFixed(2)}</td><td className={td}>{x.completedCH}</td><td className={`${td} space-x-3`}><a className="text-brand underline" href={`/students/${id}/document?snap=${x.id}&type=transcript`}>Transcript</a><a className="text-brand underline" href={`/students/${id}/document?snap=${x.id}&type=fulfillment`}>Fulfillment report</a></td></tr>))}</tbody></table>
        </Card>
      )}

      {tab === "audit" && <AuditTab regId={st.registrationId} />}
    </div>
  );
}

async function AuditTab({ regId }: { regId: string }) {
  const logs = await db.auditLog.findMany({ where: { studentRegId: regId }, orderBy: { id: "desc" }, take: 100 });
  const users = new Map((await db.user.findMany()).map((u) => [u.id, u.name]));
  return (
    <Card title="Audit trail">
      <div className="-m-5 overflow-x-auto"><table className="w-full"><thead><tr><th className={th}>When</th><th className={th}>Who</th><th className={th}>Action</th><th className={th}>Change</th><th className={th}>Reason</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{logs.map((l) => (<tr key={l.id}><td className={`${td} whitespace-nowrap`}>{l.at.toLocaleString()}</td><td className={td}>{users.get(l.userId ?? -1) ?? "system"}</td><td className={td}><Badge>{l.action.toLowerCase()}</Badge></td><td className={`${td} max-w-md break-words font-mono text-xs text-slate-600`}>{l.before && <>{l.before} → </>}{l.after}</td><td className={td}>{l.reason}</td></tr>))}</tbody></table></div>
    </Card>
  );
}

async function RegistrationTab({ studentId, role, ctx }: { studentId: number; role: string; ctx: NonNullable<Awaited<ReturnType<typeof computeForStudent>>> }) {
  if (!ctx.semester) return <Notice tone="red">No active semester is configured.</Notice>;
  if (!ctx.offerings.length)
    return (
      <Notice tone="amber">
        <p className="font-semibold">{ctx.semester.name} isn&apos;t open for registration yet.</p>
        <p className="mt-1">Course offerings haven&apos;t been uploaded, so there is nothing to suggest. {role === "ADMIN" ? <>Upload the workbook in <Link className="underline" href="/admin">Admin</Link>.</> : "An Admin needs to upload this semester's course offering workbook — suggestions start as soon as it is applied."}</p>
      </Notice>
    );
  const stale = !!ctx.semester.openedAt && !(await db.snapshot.findFirst({ where: { studentId, active: true, createdAt: { gte: ctx.semester.openedAt } } }));
  const phase = effectivePhase(ctx.semester);
  const perm = canEdit(role as "ADMIN" | "HOD" | "ADVISOR", phase);
  const reg = await db.registration.findUnique({ where: { studentId_semesterId: { studentId, semesterId: ctx.semester.id } }, include: { items: true, versions: { orderBy: { version: "desc" } } } });
  const users = new Map((await db.user.findMany()).map((u) => [u.id, u.name]));
  const chRows = await db.posCourse.findMany({ select: { code: true, title: true, ch: true } });
  const chMap = new Map(chRows.map((r) => [courseKey(r.code, r.title), r.ch]));
  const allOfferings = ctx.offerings.map((o) => ({ id: o.dbId, courseCode: o.courseCode, courseName: o.courseName, section: o.section, cbaCode: o.cbaCode, ch: chMap.get(courseKey(o.courseCode, o.courseName)) ?? (/L$/.test(o.courseCode) ? 1 : 3) }));
  return (
    <div className="space-y-4">
      {stale && <Notice tone="amber"><b>Documents are from before {ctx.semester.name} opened.</b> Upload the latest Interim Transcript and POS Fulfillment Report (Overview → Update profile) and confirm the home section, so the suggestions use current results.</Notice>}
      <RegistrationEditor
        studentId={studentId}
        readOnly={!perm.allowed}
        phase={phase}
        phaseLabel={PHASE_LABEL[phase]}
        lateAdmin={perm.late && perm.allowed}
        items={ctx.rec.items}
        offerings={allOfferings}
        saved={(reg?.items ?? []).map((i) => ({ offeringId: i.offeringId, overrideReason: i.overrideReason }))}
        savedRemovals={reg ? JSON.parse(reg.removals) : []}
        status={reg?.status ?? "NOT_STARTED"}
        version={reg?.version ?? 0}
        limits={ctx.rec.load}
        warnings={ctx.rec.warnings}
      />
      {reg && reg.versions.length > 0 && (
        <Card title="Registration versions">
          <ul className="space-y-3 text-sm">{reg.versions.map((v) => {
            const ch = JSON.parse(v.changes) as { added: string[]; removed: string[]; sectionChanged: { course: string; from: string; to: string }[] };
            const items = JSON.parse(v.items) as { courseCode: string; section: string; courseName: string }[];
            return (<li key={v.id} className="rounded-md border border-slate-100 p-3"><div className="flex flex-wrap items-center gap-2"><Badge tone="green">v{v.version}</Badge>{v.phase !== "REGISTRATION" && <Badge tone={v.phase === "ADD_DROP" ? "amber" : "red"}>{v.phase.replaceAll("_", " ").toLowerCase()}</Badge>}<span>{v.createdAt.toLocaleString()} by {users.get(v.userId)}</span><span className="text-slate-500">— {v.reason}</span><Badge>email: {v.notification.toLowerCase()}</Badge></div>
              <div className="mt-2 text-xs text-slate-600">{ch.added.length > 0 && <>Added: {ch.added.join(", ")}. </>}{ch.removed.length > 0 && <>Removed: {ch.removed.join(", ")}. </>}{ch.sectionChanged.map((c) => `${c.course}: ${c.from} → ${c.to}. `)}</div>
              <div className="mt-1 text-xs text-slate-500">{items.map((i) => `${i.courseCode} (${i.section})`).join(" · ")}</div></li>);
          })}</ul>
        </Card>
      )}
    </div>
  );
}
