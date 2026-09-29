import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { courseKey, theoryKeyOf } from "@/lib/rules/keys";
import { Badge, Card } from "@/components/ui";
import { PublishToggle } from "@/components/PosForms";

export default async function PosDetail({ params }: PageProps<"/admin/pos/[id]">) {
  await requireRole("ADMIN");
  const id = Number((await params).id);
  const pos = await db.pos.findUnique({ where: { id }, include: { courses: { orderBy: [{ semester: "asc" }, { seq: "asc" }] }, _count: { select: { students: true } } } });
  if (!pos) notFound();
  const prereq = await db.prerequisite.findMany();
  const ruleKeys = new Set(prereq.map((p) => courseKey("X-0000", p.course)));
  const covered = pos.courses.filter((c) => !c.isPlaceholder && ruleKeys.has(theoryKeyOf(courseKey(c.code, c.title)))).length;
  const sems = [...new Set(pos.courses.map((c) => c.semester))];
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4"><div><Link href="/admin/pos" className="text-sm text-slate-500 hover:underline">← Plans of Study</Link><h1 className="text-xl font-semibold">{pos.posCode} · {pos.variant.replaceAll("_", " ").toLowerCase()}</h1><p className="text-sm text-slate-500">{pos.courses.length} courses · {pos.totalRequired} CH · {pos._count.students} student(s) · {covered} course(s) covered by prerequisite rules</p></div>
        <div className="flex items-center gap-3">{pos.published ? <Badge tone="green">published</Badge> : <Badge tone="amber">unpublished</Badge>}<PublishToggle posId={pos.id} published={pos.published} locked={pos._count.students > 0} /></div></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{sems.map((sem) => (
        <Card key={sem} title={`Semester ${sem}`} right={<span className="text-xs text-slate-500">{pos.courses.filter((c) => c.semester === sem).reduce((a, c) => a + c.ch, 0)} CH</span>}>
          <ul className="space-y-1.5 text-sm">{pos.courses.filter((c) => c.semester === sem).map((c) => (<li key={c.id} className="flex justify-between gap-2"><span>{c.title} <span className="font-mono text-xs text-slate-400">{c.code}</span></span><span className="text-slate-500">{c.ch}</span></li>))}</ul></Card>))}</div>
    </div>
  );
}
