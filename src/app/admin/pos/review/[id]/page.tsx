import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { loadPosDraft } from "@/lib/services/pos";
import { Badge, Card, Notice } from "@/components/ui";
import { ApplyPosForm } from "@/components/PosForms";

const TONE = { NEW: "blue", IDENTICAL: "slate", CHANGED: "amber" } as const;

export default async function ReviewPos({ params }: PageProps<"/admin/pos/review/[id]">) {
  const s = await requireRole("ADMIN");
  const d = await loadPosDraft((await params).id);
  if (!d || d.createdBy !== s.userId) return <Notice tone="red">This upload was not found or has expired. <Link className="underline" href="/admin/pos">Back to Plans of Study</Link></Notice>;
  return (
    <div className="space-y-4">
      <div><Link href="/admin/pos" className="text-sm text-slate-500 hover:underline">← Plans of Study</Link><h1 className="text-xl font-semibold">Review extracted Plans of Study</h1><p className="text-sm text-slate-500">{d.fileName} · {d.items.length} plan(s) found</p></div>
      <Notice tone="blue">Check each plan against the PDF. The credit-hour total is verified automatically: courses that don&apos;t add up to the stated total block the import.</Notice>
      {d.items.map((i) => (
        <Card key={i.key} title={`${i.posCode} · ${i.variant.replaceAll("_", " ").toLowerCase()}`} right={<Badge tone={i.problems.length ? "red" : TONE[i.status]}>{i.problems.length ? "blocked" : i.status.toLowerCase()}</Badge>}>
          <p className="text-sm text-slate-600">{i.courses.length} courses · {i.sum} CH{i.totalRequired != null && <> (document states {i.totalRequired} CH {i.totalRequired === i.sum ? "✓" : "✗"})</>}</p>
          {i.problems.map((p) => <div key={p} className="mt-2"><Notice tone="red">{p}</Notice></div>)}
          {i.warnings.map((w) => <div key={w} className="mt-2"><Notice tone="amber">{w}</Notice></div>)}
          {i.status === "IDENTICAL" && <p className="mt-2 text-sm text-slate-500">Identical to the version already in the system — nothing to import.</p>}
          {i.diff.length > 0 && <details className="mt-3 text-sm" open><summary className="cursor-pointer font-medium">Differences from the stored version ({i.diff.length})</summary><ul className="mt-2 space-y-1 font-mono text-xs">{i.diff.slice(0, 60).map((x) => <li key={x} className={x.startsWith("+") ? "text-emerald-700" : "text-rose-700"}>{x}</li>)}</ul></details>}
          <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Extracted courses by semester</summary>
            <div className="mt-2 grid gap-3 md:grid-cols-2">{[...new Set(i.courses.map((c) => c.semester))].map((sem) => (<div key={sem}><div className="font-medium">Semester {sem} · {i.courses.filter((c) => c.semester === sem).reduce((a, c) => a + c.ch, 0)} CH</div><ul className="text-xs text-slate-600">{i.courses.filter((c) => c.semester === sem).map((c, n) => <li key={n}><span className="font-mono">{c.code}</span> {c.title} ({c.ch})</li>)}</ul></div>))}</div></details>
        </Card>
      ))}
      <Card title="Import"><ApplyPosForm draftId={d.id} items={d.items.map((i) => ({ key: i.key, label: `${i.posCode} · ${i.variant.replaceAll("_", " ").toLowerCase()} — ${i.status === "IDENTICAL" ? "already loaded" : i.status.toLowerCase()}${i.problems.length ? " (blocked)" : ""}`, selectable: !i.problems.length && i.status !== "IDENTICAL" }))} /></Card>
    </div>
  );
}
