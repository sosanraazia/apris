import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { Badge, Card, Notice, td, th } from "@/components/ui";
import { PosUploadForm } from "@/components/PosForms";

export default async function PosList({ searchParams }: PageProps<"/admin/pos">) {
  await requireRole("ADMIN");
  const imported = (await searchParams).imported === "1";
  const list = await db.pos.findMany({ orderBy: [{ program: "asc" }, { year: "desc" }, { variant: "asc" }], include: { _count: { select: { students: true, courses: true } } } });
  return (
    <div className="space-y-6">
      <div><Link href="/admin" className="text-sm text-slate-500 hover:underline">← Admin</Link><h1 className="text-xl font-semibold">Plans of Study</h1></div>
      {imported && <Notice tone="green">Imported. Review each plan, then publish it so it can be assigned to students.</Notice>}
      <Card title="Upload a new Plan of Study"><PosUploadForm /></Card>
      <Card title={`All Plans of Study (${list.length})`}>
        <div className="-m-5 overflow-x-auto"><table className="w-full"><thead><tr><th className={th}>POS</th><th className={th}>Variant</th><th className={th}>Courses</th><th className={th}>Total CH</th><th className={th}>Students</th><th className={th}>Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{list.map((p) => (
            <tr key={p.id}><td className={`${td} font-medium`}><Link className="text-brand hover:underline" href={`/admin/pos/${p.id}`}>{p.posCode}</Link></td><td className={td}>{p.variant.replaceAll("_", " ").toLowerCase()}</td><td className={td}>{p._count.courses}</td><td className={td}>{p.totalRequired}</td><td className={td}>{p._count.students}</td>
              <td className={td}>{p.published ? <Badge tone="green">published</Badge> : <Badge tone="amber">unpublished</Badge>}</td></tr>))}</tbody></table></div>
      </Card>
    </div>
  );
}
