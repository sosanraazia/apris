"use client";
import { useActionState } from "react";
import { applyOfferingsAction, uploadOfferingsAction } from "@/app/admin/actions";
import { btn, input, label, Notice } from "./ui";

export function OfferingUploadForm() {
  const [state, action, pending] = useActionState(uploadOfferingsAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <div><label className={label} htmlFor="workbook">Course offering workbook (.xlsx)</label><input id="workbook" name="workbook" type="file" accept=".xlsx" className={input} required /></div>
      <p className="text-xs text-slate-500">One sheet per class (SE-3, CYS-5, …) with CBA Code, Course Code, Class &amp; Section, Course Name. You&apos;ll see exactly what changes before anything is applied.</p>
      {state?.error && <Notice tone="red">{state.error}</Notice>}
      <button className={btn} disabled={pending}>{pending ? "Reading workbook…" : "Upload & review changes"}</button>
    </form>
  );
}

export function ApplyOfferingsForm({ draftId, hasMissing }: { draftId: string; hasMissing: boolean }) {
  const [state, action, pending] = useActionState(applyOfferingsAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="draftId" value={draftId} />
      {hasMissing && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="removeMissing" defaultChecked className="mt-1" />
          <span>Remove offerings that are not in this file. (Any used by an existing registration are kept but switched off, so registrations are never broken.)</span>
        </label>
      )}
      {state?.error && <Notice tone="red">{state.error}</Notice>}
      <button className={btn} disabled={pending}>{pending ? "Applying…" : "Apply these changes"}</button>
    </form>
  );
}
