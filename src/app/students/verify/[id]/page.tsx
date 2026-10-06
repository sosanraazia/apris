import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadDraft } from "@/lib/services/ingest";
import { suggestFor } from "@/lib/services/roster";
import { Badge, Card, Notice, td, th } from "@/components/ui";
import { ConfirmProfileForm } from "@/components/ConfirmProfileForm";

export default async function Verify({ params }: PageProps<"/students/verify/[id]">) {
  const sess = await requireRole("ADVISOR", "ADMIN");
  const draft = await loadDraft((await params).id);
  if (!draft || (draft.createdBy !== sess.userId && sess.role !== "ADMIN")) return <Notice tone="red">This upload was not found or has expired. <Link className="underline" href="/students/new">Start again</Link>.</Notice>;
  const { transcript: t, fulfillment: f } = draft;
  const blocked = draft.conflicts.length > 0;
  // Home section: pre-filled from the uploaded section lists (Award Lists); the advisor confirms or changes it.
  const suggestion = await suggestFor(t.registrationId, t.program, t.admission);
  const existing = draft.existingStudentId ? await db.student.findUnique({ where: { id: draft.existingStudentId }, select: { homeSection: true } }) : null;
  const prefill = draft.homeSection ?? suggestion.section ?? existing?.homeSection ?? "";
  const sectionHint = suggestion.section ? suggestion.note : existing?.homeSection ? `Current section: ${existing.homeSection}. ${suggestion.note}` : suggestion.note;
  const rows: [string, string][] = [
    ["Registration ID", t.registrationId],
    ["Institutional email", `${t.registrationId.toLowerCase()}@dsu.edu.pk`],
    ["Program", t.program === "SE" ? "BS Software Engineering" : "BS Cyber Security"],
    ["Admission", t.admission ?? "—"],
    ["POS", `${f.pos.posCode} · ${f.pos.variant.replaceAll("_", " ").toLowerCase()}`],
    ["CGPA", t.cgpa?.toFixed(2) ?? "—"],
    ["Completed CH", `${t.completedCH ?? "—"} of ${t.requiredCH ?? f.requiredCH ?? "—"}`],
    ["Program status", t.programStatus ?? "—"],
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Verify extracted data</h1>
      {blocked && (
        <Notice tone="red">
          <p className="font-semibold">Document conflict — advisor review required</p>
          <ul className="mt-1 list-disc pl-5">{draft.conflicts.map((c) => <li key={c}>{c}</li>)}</ul>
          <p className="mt-2">Upload the correct documents to continue. <Link className="underline" href="/students/new">Start again</Link></p>
        </Notice>
      )}
      {draft.readingIssues?.length > 0 && (
        <Notice tone="red">
          <p className="font-semibold">Check the extraction before confirming</p>
          <p className="mt-1">APRIS may not have read these documents perfectly. Compare the course table below with the PDF — especially lab courses, grades and credit hours — before you continue.</p>
          <ul className="mt-2 list-disc pl-5">{draft.readingIssues.map((w) => <li key={w}>{w}</li>)}</ul>
        </Notice>
      )}
      {draft.warnings.length > 0 && <Notice tone="amber"><ul className="list-disc pl-5">{draft.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Notice>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Student" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">{rows.map(([k, v]) => (<div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>))}</dl>
        </Card>
        <Card title={`Transcript courses (${t.courses.length})`} className="lg:col-span-2">
          <div className="-m-5 max-h-96 overflow-auto">
            <table className="w-full"><thead className="sticky top-0 bg-white"><tr><th className={th}>Term</th><th className={th}>Code</th><th className={th}>Title</th><th className={th}>Grade</th><th className={th}>CH</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{t.courses.map((c, i) => (<tr key={i}><td className={td}>{c.term}</td><td className={`${td} font-mono`}>{c.code}</td><td className={td}>{c.title}</td><td className={td}><Badge tone={c.gradePoint >= 1 ? "green" : "red"}>{c.grade}</Badge></td><td className={td}>{c.ch}</td></tr>))}</tbody>
            </table>
          </div>
        </Card>
      </div>
      <Card title={draft.existingStudentId ? "Confirm — update existing profile" : "Confirm"}>
        <ConfirmProfileForm draftId={draft.id} name={t.name} fatherName={t.fatherName} homeSection={prefill} hint={sectionHint} suggested={!!suggestion.section} needsAck={(draft.readingIssues?.length ?? 0) > 0} blocked={blocked} isUpdate={!!draft.existingStudentId} />
      </Card>
    </div>
  );
}
