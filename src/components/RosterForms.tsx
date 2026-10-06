"use client";
import { useActionState } from "react";
import { applyRosterAction, uploadRosterAction } from "@/app/admin/actions";
import { btn, input, label, Notice } from "./ui";

export function RosterUploadForm() {
  const [st, action, pending] = useActionState(uploadRosterAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <div><label className={label} htmlFor="pdfs">Award List PDFs (select several at once)</label><input id="pdfs" name="pdfs" type="file" accept="application/pdf" multiple className={input} required /></div>
      <p className="text-xs text-slate-500">The per-section gradebooks (“Award List … Class and Section: BS-SE-2A”). Only each student&apos;s Registration ID, section and term are kept — names and grades are discarded. You&apos;ll review the result before anything is saved.</p>
      {st?.error && <Notice tone="red">{st.error}</Notice>}
      <button className={btn} disabled={pending}>{pending ? "Reading files…" : "Upload & review"}</button>
    </form>
  );
}

export function ApplyRosterForm({ draftId, disabled }: { draftId: string; disabled: boolean }) {
  const [st, action, pending] = useActionState(applyRosterAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="draftId" value={draftId} />
      {st?.error && <Notice tone="red">{st.error}</Notice>}
      <button className={btn} disabled={pending || disabled}>{pending ? "Saving…" : "Save these section lists"}</button>
    </form>
  );
}
