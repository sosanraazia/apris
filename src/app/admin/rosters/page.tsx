import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { rosterSummary, suggestFor } from "@/lib/services/roster";
import { Badge, Card, Notice, btn, input, label, td, th } from "@/components/ui";
import { RosterUploadForm } from "@/components/RosterForms";

export default async function Rosters({ searchParams }: PageProps<"/admin/rosters">) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toUpperCase().slice(0, 20) : "";
  const [rows, sem] = await Promise.all([rosterSummary(), db.semester.findFirst({ where: { active: true } })]);
  const lookup = q ? { rows: await db.sectionRoster.findMany({ where: { registrationId: q }, orderBy: [{ term: "desc" }] }), suggestion: await suggestFor(q, q.replace(/\d.*$/, "")) } : null;
  const total = rows.reduce((a, r) => a + r.students, 0);
  return (
    <div className="space-y-6">
      <div><Link href="/admin" className="text-sm text-slate-500 hover:underline">← Admin</Link><h1 className="text-xl font-semibold">Section lists</h1>
        <p className="text-sm text-slate-500">When an advisor adds a student, APRIS pre-fills the home section from these lists. They always confirm or change it.</p></div>
      {sp.imported === "1" && <Notice tone="green">Section lists saved. New students will now get a suggested home section.</Notice>}
      <Card title="Upload Award Lists"><RosterUploadForm /></Card>

      <Card title="Check a student">
        <form className="flex items-end gap-2" method="get"><div className="w-64"><label className={label} htmlFor="q">Registration ID</label><input id="q" name="q" defaultValue={q} className={`${input} font-mono`} placeholder="SE251093" /></div><button className={btn}>Look up</button></form>
        {lookup && (
          <div className="mt-4 space-y-2 text-sm">
            {lookup.rows.length ? <ul className="space-y-1">{lookup.rows.map((r) => <li key={r.id}><span className="font-mono">{r.sourceSection}</span> in {r.term} <Badge tone={r.regular ? "green" : "amber"}>{r.regular ? "regular member" : "backlog attendee"}</Badge></li>)}</ul> : <p className="text-slate-500">Not in any uploaded list.</p>}
            <Notice tone={lookup.suggestion.kind === "suggested" ? "green" : "amber"}>{lookup.suggestion.section ? <b>Suggested for {sem?.name}: {lookup.suggestion.section}. </b> : null}{lookup.suggestion.note}</Notice>
          </div>
        )}
      </Card>

      <Card title={`Stored lists — ${rows.length} section(s), ${total.toLocaleString()} student rows`}>
        <div className="-m-5 overflow-x-auto"><table className="w-full"><thead><tr><th className={th}>Term</th><th className={th}>Section</th><th className={th}>Students</th><th className={th}>Regular members</th><th className={th}>Backlog attendees</th><th className={th}>Uploaded</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map((r) => (<tr key={`${r.term}${r.section}`}><td className={td}>{r.term}</td><td className={`${td} font-mono`}>{r.section}</td><td className={td}>{r.students}</td><td className={td}>{r.regular}</td><td className={td}>{r.students - r.regular}</td><td className={`${td} whitespace-nowrap`}>{r.uploadedAt?.toLocaleDateString()}</td></tr>))}
            {!rows.length && <tr><td colSpan={6} className={`${td} py-8 text-center text-slate-500`}>No lists uploaded yet.</td></tr>}</tbody></table></div>
      </Card>
    </div>
  );
}
