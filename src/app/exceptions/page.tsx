import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { Badge, Card, td, th } from "@/components/ui";

export default async function Exceptions() {
  const s = await requireRole("ADMIN", "HOD");
  const settings = await getSettings();
  const sem = await db.semester.findFirst({ where: { active: true } });
  const [students, overrides, offeringIssues] = await Promise.all([
    db.student.findMany({ where: { archivedAt: null }, include: { snapshots: { where: { active: true }, take: 1 } } }),
    db.registrationItem.findMany({ where: { overrideReason: { not: null }, registration: { semesterId: sem?.id ?? -1 } }, include: { registration: { include: { student: true } } } }),
    db.offering.count({ where: { semesterId: sem?.id ?? -1, OR: [{ cbaCode: null }, { section: null }] } }),
  ]);
  type Ex = { student: string; id: number; kind: string; severity: "High" | "Medium" | "Low"; owner: string; detail: string };
  const ex: Ex[] = [];
  for (const st of students) {
    const warn = st.snapshots[0] ? (JSON.parse(st.snapshots[0].warnings) as string[]) : [];
    warn.forEach((w) => ex.push({ student: st.registrationId, id: st.id, kind: "Extraction warning", severity: "Medium", owner: "Advisor", detail: w }));
    if ((st.standing === "PROBATION" && settings.probationMaxCH == null) || (st.standing === "RELEGATION" && settings.relegationMaxCH == null))
      ex.push({ student: st.registrationId, id: st.id, kind: "Standing limit not configured", severity: "High", owner: "Admin", detail: `${st.standing} CH limit is unset — no automatic recommendation` });
    if (["FROZEN", "INACTIVE", "WITHDRAWN"].includes(st.standing)) ex.push({ student: st.registrationId, id: st.id, kind: "Non-active standing", severity: "Low", owner: "Advisor", detail: st.standing });
  }
  for (const o of overrides) ex.push({ student: o.registration.student.registrationId, id: o.registration.studentId, kind: "Advisor override", severity: "Low", owner: "HoD", detail: `${o.posCourseCode}: ${o.overrideReason}` });
  const tone = { High: "red", Medium: "amber", Low: "slate" } as const;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Exception queue</h1>
      {offeringIssues > 0 && <Card title="Offering data"><p className="text-sm">{offeringIssues} offering row(s) are missing a CBA code or section. {s.role === "ADMIN" ? <Link className="text-brand underline" href="/admin">Fix in Admin</Link> : "Ask an Admin to fix them."}</p></Card>}
      <Card>
        <div className="-m-5 overflow-x-auto"><table className="w-full"><thead><tr><th className={th}>Student</th><th className={th}>Exception</th><th className={th}>Severity</th><th className={th}>Owner</th><th className={th}>Detail</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{ex.map((e, i) => (<tr key={i}><td className={`${td} font-mono`}><Link className="text-brand underline" href={`/students/${e.id}`}>{e.student}</Link></td><td className={td}>{e.kind}</td><td className={td}><Badge tone={tone[e.severity]}>{e.severity}</Badge></td><td className={td}>{e.owner}</td><td className={td}>{e.detail}</td></tr>))}{!ex.length && <tr><td colSpan={5} className={`${td} py-8 text-center text-slate-500`}>No open exceptions.</td></tr>}</tbody></table></div>
      </Card>
    </div>
  );
}
