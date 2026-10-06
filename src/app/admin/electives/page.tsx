import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { courseKey } from "@/lib/rules/keys";
import { slotViews } from "@/lib/services/electives";
import { Badge, Card, Notice, btn, input, td, th } from "@/components/ui";
import { setElectiveAction } from "../actions";

export default async function Electives() {
  await requireRole("ADMIN");
  const sem = await db.semester.findFirst({ where: { active: true } });
  const offerings = sem ? await db.offering.findMany({ where: { semesterId: sem.id, active: true } }) : [];
  const offered = new Map<string, string[]>();
  const names = new Map<string, string>();
  for (const o of offerings) {
    const k = courseKey(o.courseCode, o.courseName);
    names.set(k, o.courseName.replace(/ lab$/i, ""));
    offered.set(k, [...(offered.get(k) ?? []), `${o.courseCode} ${o.section ?? "?"}`]);
  }
  const [views, posCourses] = await Promise.all([slotViews(offered), db.posCourse.findMany({ where: { isPlaceholder: false }, select: { code: true, title: true } })]);
  const assigned = new Set(views.map((v) => (v.courseTitle ? courseKey("X-0000", v.courseTitle) : "")).filter(Boolean));
  const regular = new Set(posCourses.map((c) => courseKey(c.code, c.title)));
  // offered, not a regular course of any POS, and not assigned to any elective slot
  const unmapped = [...names.entries()].filter(([k]) => !k.endsWith("#lab") && !regular.has(k) && !assigned.has(k)).sort((a, b) => a[1].localeCompare(b[1]));
  const byPos = [...new Set(views.map((v) => v.posCode))];

  return (
    <div className="space-y-6">
      <div><Link href="/admin" className="text-sm text-slate-500 hover:underline">← Admin</Link><h1 className="text-xl font-semibold">Elective assignments</h1>
        <p className="text-sm text-slate-500">Which course fills each elective slot of a Plan of Study. A slot with an assigned course is only offered that course; leave it empty (N/A) until the department announces one. Changes apply to the next recommendation computed.</p></div>

      <Card title={`Offered ${sem?.name ?? ""} courses not assigned to any slot (${unmapped.length})`}>
        {unmapped.length ? <ul className="flex flex-wrap gap-2 text-sm">{unmapped.map(([k, n]) => <li key={k}><Badge tone="amber">{n}</Badge> <span className="text-xs text-slate-500">{[...new Set(offered.get(k))].slice(0, 3).join(", ")}</span></li>)}</ul> : <p className="text-sm text-slate-500">Every offered non-POS course is assigned to a slot.</p>}
        <p className="mt-3 text-xs text-slate-500">Type one of these into a slot below to make it selectable for students on that Plan of Study.</p>
      </Card>

      <datalist id="offered-titles">{[...names.values()].sort().map((n) => <option key={n} value={n} />)}</datalist>
      {byPos.map((pc) => (
        <Card key={pc} title={pc}>
          <div className="-m-5 overflow-x-auto"><table className="w-full"><thead><tr><th className={th}>Slot</th><th className={th}>Sem</th><th className={th}>POS row</th><th className={th}>Assigned course</th><th className={th}>Offered now</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{views.filter((v) => v.posCode === pc).map((v) => (
              <tr key={`${v.category}${v.slot}`}>
                <td className={`${td} whitespace-nowrap`}>{v.category === "UNIVERSITY" ? "University" : "Domain"} {v.slot}</td>
                <td className={td}>{v.semester ?? "—"}</td>
                <td className={`${td} text-slate-600`}>{v.posRow ?? <Badge tone="amber">no such slot in the stored POS</Badge>}</td>
                <td className={td}>
                  <form action={setElectiveAction} className="flex gap-2">
                    <input type="hidden" name="posCode" value={pc} /><input type="hidden" name="category" value={v.category} /><input type="hidden" name="slot" value={v.slot} />
                    <input name="courseTitle" list="offered-titles" defaultValue={v.courseTitle ?? ""} placeholder="N/A" className={`${input} min-w-64`} />
                    <button className={btn}>Save</button>
                  </form>
                </td>
                <td className={`${td} text-xs text-slate-600`}>{v.offeredAs.length ? [...new Set(v.offeredAs)].join(", ") : v.courseTitle ? <span className="text-slate-400">not offered this semester</span> : ""}</td>
              </tr>))}</tbody></table></div>
        </Card>
      ))}
      {!byPos.length && <Notice tone="amber">No assignments stored yet. Run the seed to load the department list.</Notice>}
    </div>
  );
}
