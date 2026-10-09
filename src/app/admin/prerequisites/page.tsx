import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { knownCourses } from "@/lib/services/prerequisites";
import { Card, btnGhost, td, th } from "@/components/ui";
import { AddPrerequisiteForm, EditPrerequisiteForm } from "@/components/PrerequisiteForms";
import { removePrerequisiteAction } from "../actions";

export default async function Prerequisites() {
  await requireRole("ADMIN");
  const [rules, known] = await Promise.all([db.prerequisite.findMany({ orderBy: [{ course: "asc" }, { prerequisite: "asc" }] }), knownCourses()]);
  return (
    <div className="space-y-6">
      <div><Link href="/admin" className="text-sm text-slate-500 hover:underline">← Admin</Link><h1 className="text-xl font-semibold">Prerequisites</h1>
        <p className="text-sm text-slate-500">A student must have <b>passed</b> the prerequisite before the course is recommended. Changes apply to the next recommendation computed; registrations already finalized are not touched. Labs follow their theory course, so only theory courses are listed.</p></div>
      <datalist id="pr-titles">{[...known.values()].sort().map((t) => <option key={t} value={t} />)}</datalist>
      <Card title={`Rules (${rules.length})`}>
        <div className="-m-5 overflow-x-auto"><table className="w-full"><thead><tr><th className={th}>Course</th><th className={th}>Must have passed</th><th className={th}></th></tr></thead>
          <tbody className="divide-y divide-slate-100">{rules.map((r) => (
            <tr key={r.id}>
              <td className={`${td} font-medium`}>{r.course}</td>
              <td className={td}><EditPrerequisiteForm id={r.id} prerequisite={r.prerequisite} /></td>
              <td className={td}><form action={removePrerequisiteAction}><input type="hidden" name="id" value={r.id} /><button className={btnGhost}>Remove</button></form></td>
            </tr>))}
            {!rules.length && <tr><td colSpan={3} className={`${td} py-8 text-center text-slate-500`}>No rules yet.</td></tr>}</tbody></table></div>
      </Card>
      <Card title="Add a rule"><AddPrerequisiteForm /></Card>
    </div>
  );
}
