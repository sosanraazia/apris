"use client";
import { useActionState } from "react";
import { uploadDocumentsAction } from "@/app/students/actions";
import { btn, input, label, Notice } from "./ui";

export function UploadForm({ studentId }: { studentId?: number }) {
  const [state, action, pending] = useActionState(uploadDocumentsAction, undefined);
  return (
    <form action={action} className="space-y-4">
      {studentId && <input type="hidden" name="studentId" value={studentId} />}
      <div className="grid gap-4 md:grid-cols-2">
        <div><label className={label} htmlFor="transcript">Interim Transcript (PDF)</label><input id="transcript" name="transcript" type="file" accept="application/pdf" className={input} required /></div>
        <div><label className={label} htmlFor="fulfillment">Plan of Study Fulfillment Report (PDF)</label><input id="fulfillment" name="fulfillment" type="file" accept="application/pdf" className={input} required /></div>
      </div>
      <p className="text-xs text-slate-500">Registration ID, name, program, POS and grades are all read from the documents. The home section can be set afterwards on the student&apos;s profile.</p>
      {state?.error && <Notice tone="red">{state.error}</Notice>}
      <button className={btn} disabled={pending}>{pending ? "Reading documents…" : "Upload & extract"}</button>
    </form>
  );
}
