import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { loadOfferingDraft } from "@/lib/services/offerings";
import { Badge, Card, Notice, Stat, td, th } from "@/components/ui";
import { ApplyOfferingsForm } from "@/components/OfferingForms";

export default async function ReviewOfferings({ params }: PageProps<"/admin/offerings/[id]">) {
  const s = await requireRole("ADMIN");
  const d = await loadOfferingDraft((await params).id);
  if (!d || d.createdBy !== s.userId) return <Notice tone="red">This upload was not found or has expired. <Link className="underline" href="/admin">Back to Admin</Link></Notice>;
  const { diff } = d;
  const noCba = d.rows.filter((r) => !r.cbaCode).length;
  const noSection = d.rows.filter((r) => !r.section).length;
  const nothing = !diff.added.length && !diff.updated.length && !diff.missing.length;
  return (
    <div className="space-y-4">
      <div><Link href="/admin" className="text-sm text-slate-500 hover:underline">← Admin</Link><h1 className="text-xl font-semibold">Review offering upload — {d.semesterName}</h1><p className="text-sm text-slate-500">{d.fileName} · {d.rows.length} rows</p></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="New rows" value={diff.added.length} />
        <Stat label="Changed rows" value={diff.updated.length} />
        <Stat label="Unchanged" value={diff.unchanged} />
        <Stat label="In system but not in file" value={diff.missing.length} tone={diff.missing.length ? "amber" : undefined} />
      </div>
      {d.notes.map((n) => <Notice key={n} tone="amber">{n}</Notice>)}
      {diff.registeredChanges.length > 0 && (
        <Notice tone="red">
          <p className="font-semibold">These changes affect courses students are already registered in:</p>
          <ul className="mt-1 list-disc pl-5">{diff.registeredChanges.map((c) => <li key={c}>{c}</li>)}</ul>
          <p className="mt-1">Already-finalized versions keep the CBA/section they were exported with; make any corrections through Add / Drop.</p>
        </Notice>
      )}
      {(noCba > 0 || noSection > 0) && <Notice tone="amber">{noCba} row(s) in this file have no CBA code and {noSection} have no section — they can be recommended but not exported. A blank cell never erases a value an Admin already entered.</Notice>}
      {nothing && <Notice tone="green">This workbook matches what&apos;s already in the system — nothing to apply.</Notice>}

      {diff.updated.length > 0 && (
        <Card title={`Changed rows (${diff.updated.length})`}><div className="-m-5 max-h-80 overflow-auto"><table className="w-full"><thead><tr><th className={th}>Sheet</th><th className={th}>Course</th><th className={th}>Section</th><th className={th}>Change</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{diff.updated.map((u) => (<tr key={u.id}><td className={td}>{u.row.sheet}</td><td className={td}><span className="font-mono">{u.row.courseCode}</span> {u.row.courseName}</td><td className={td}>{u.row.section ?? "—"}</td><td className={td}>{u.changes.join("; ")}</td></tr>))}</tbody></table></div></Card>
      )}
      {diff.added.length > 0 && (
        <Card title={`New rows (${diff.added.length})`}><div className="-m-5 max-h-80 overflow-auto"><table className="w-full"><thead><tr><th className={th}>Sheet</th><th className={th}>Course</th><th className={th}>Section</th><th className={th}>CBA</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{diff.added.map((r, i) => (<tr key={i}><td className={td}>{r.sheet}</td><td className={td}><span className="font-mono">{r.courseCode}</span> {r.courseName}</td><td className={td}>{r.section ?? "—"}</td><td className={td}>{r.cbaCode ?? "—"}</td></tr>))}</tbody></table></div></Card>
      )}
      {diff.missing.length > 0 && (
        <Card title={`In the system but not in this file (${diff.missing.length})`}><div className="-m-5 max-h-64 overflow-auto"><table className="w-full"><tbody className="divide-y divide-slate-100">{diff.missing.map((m) => (<tr key={m.id}><td className={td}><span className="font-mono">{m.courseCode}</span> {m.courseName}</td><td className={td}>{m.section ?? "—"}</td><td className={td}>{m.inUse ? <Badge tone="amber">used by a registration — will be switched off, not deleted</Badge> : <Badge>will be deleted</Badge>}</td></tr>))}</tbody></table></div></Card>
      )}
      {!nothing && <Card title="Apply"><ApplyOfferingsForm draftId={d.id} hasMissing={diff.missing.length > 0} /></Card>}
    </div>
  );
}
