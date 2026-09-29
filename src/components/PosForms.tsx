"use client";
import { useActionState, useState, useTransition } from "react";
import { applyPosAction, setPosPublishedAction, uploadPosAction } from "@/app/admin/actions";
import { btn, btnGhost, input, label, Notice } from "./ui";

export function PosUploadForm() {
  const [state, action, pending] = useActionState(uploadPosAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <div><label className={label} htmlFor="pos-pdf">Plan of Study (PDF)</label><input id="pos-pdf" name="pdf" type="file" accept="application/pdf" className={input} required /></div>
      <p className="text-xs text-slate-500">A PDF with one Plan of Study per page (e.g. BS-SE-2026, plus Minorities / PreMed variants). Nothing is saved until you review the extraction.</p>
      {state?.error && <Notice tone="red">{state.error}</Notice>}
      <button className={btn} disabled={pending}>{pending ? "Reading PDF…" : "Upload & review"}</button>
    </form>
  );
}

export function ApplyPosForm({ draftId, items }: { draftId: string; items: { key: string; label: string; selectable: boolean }[] }) {
  const [state, action, pending] = useActionState(applyPosAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="draftId" value={draftId} />
      <div className="space-y-1.5">
        {items.map((i) => (<label key={i.key} className={`flex items-center gap-2 text-sm ${i.selectable ? "" : "text-slate-400"}`}><input type="checkbox" name="key" value={i.key} defaultChecked={i.selectable} disabled={!i.selectable} />{i.label}</label>))}
      </div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="publish" className="mt-1" /><span>Publish immediately (make assignable to students). Leave unticked to review the imported plan first and publish it later.</span></label>
      {state?.error && <Notice tone="red">{state.error}</Notice>}
      <button className={btn} disabled={pending}>{pending ? "Importing…" : "Import selected"}</button>
    </form>
  );
}

export function PublishToggle({ posId, published, locked }: { posId: number; published: boolean; locked: boolean }) {
  const [msg, setMsg] = useState<{ t: "green" | "red"; m: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <button className={published ? btnGhost : btn} disabled={pending || (published && locked)} onClick={() => start(async () => { const r = await setPosPublishedAction(posId, !published); setMsg(r.error ? { t: "red", m: r.error } : { t: "green", m: r.ok! }); })}>{published ? "Unpublish" : "Publish"}</button>
      {published && locked && <p className="text-xs text-slate-500">In use by students — can&apos;t be unpublished.</p>}
      {msg && <Notice tone={msg.t}>{msg.m}</Notice>}
    </div>
  );
}
