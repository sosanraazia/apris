import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { loadRosterDraft } from "@/lib/services/roster";
import { Badge, Card, Notice, td, th } from "@/components/ui";
import { ApplyRosterForm } from "@/components/RosterForms";

export default async function ReviewRoster({ params }: PageProps<"/admin/rosters/review/[id]">) {
  const s = await requireRole("ADMIN");
  const d = await loadRosterDraft((await params).id);
  if (!d || d.createdBy !== s.userId) return <Notice tone="red">This upload was not found or has expired. <Link className="underline" href="/admin/rosters">Back</Link></Notice>;
  const ok = d.items.filter((i) => !i.problem);
  const students = new Set(ok.flatMap((i) => i.students.map((x) => x.registrationId))).size;
  const regularStudents = new Set(ok.flatMap((i) => i.students.filter((x) => x.regular).map((x) => x.registrationId))).size;
  return (
    <div className="space-y-4">
      <div><Link href="/admin/rosters" className="text-sm text-slate-500 hover:underline">← Section lists</Link><h1 className="text-xl font-semibold">Review section lists</h1>
        <p className="text-sm text-slate-500">{ok.length} of {d.items.length} file(s) readable · {students} distinct students · {regularStudents} with a known regular section</p></div>
      {d.notes.map((n) => <Notice key={n} tone="amber">{n}</Notice>)}
      <Notice tone="blue"><b>Regular member</b> = the student&apos;s batch matches the class (e.g. batch 25 in a semester-2 section in Spring 2026). <b>Backlog attendee</b> = a student from another batch sitting in that class; the list says nothing about their own home section, so they get no suggestion from it.</Notice>
      <Card>
        <div className="-m-5 overflow-x-auto"><table className="w-full"><thead><tr><th className={th}>File</th><th className={th}>Term</th><th className={th}>Section</th><th className={th}>Course</th><th className={th}>Students</th><th className={th}>Regular</th><th className={th}>Backlog</th><th className={th}>Result</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{d.items.map((i, n) => (
            <tr key={n}><td className={`${td} max-w-40 truncate`}>{i.fileName}</td><td className={td}>{i.term}</td><td className={`${td} font-mono`}>{i.section}</td><td className={td}>{i.courseCode}</td><td className={td}>{i.students.length}</td><td className={td}>{i.regularCount}</td><td className={td}>{i.backlogCount}</td>
              <td className={td}>{i.problem ? <><Badge tone="red">skipped</Badge><div className="mt-1 text-xs text-rose-700">{i.problem}</div></> : <><Badge tone={i.replaces ? "amber" : "green"}>{i.replaces ? `replaces ${i.replaces} stored rows` : "new"}</Badge>{i.warnings.map((w) => <div key={w} className="mt-1 max-w-xs text-xs text-amber-700">{w}</div>)}</>}</td></tr>))}</tbody></table></div>
      </Card>
      <Card title="Save"><ApplyRosterForm draftId={d.id} disabled={!ok.length} /></Card>
    </div>
  );
}
