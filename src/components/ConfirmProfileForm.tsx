"use client";
import { useActionState } from "react";
import { confirmProfileAction } from "@/app/students/actions";
import { btn, input, label, Notice } from "./ui";

export function ConfirmProfileForm(p: { draftId: string; name: string; fatherName: string | null; homeSection: string; hint?: string; suggested?: boolean; needsAck?: boolean; blocked: boolean; isUpdate: boolean }) {
  const [state, action, pending] = useActionState(confirmProfileAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="draftId" value={p.draftId} />
      <div className="grid gap-4 md:grid-cols-3">
        <div><label className={label} htmlFor="name">Student name</label><input id="name" name="name" defaultValue={p.name} className={input} required /></div>
        <div><label className={label} htmlFor="fatherName">Father&apos;s name</label><input id="fatherName" name="fatherName" defaultValue={p.fatherName ?? ""} className={input} /></div>
        <div><label className={label} htmlFor="homeSection">Home section (optional)</label><input id="homeSection" name="homeSection" defaultValue={p.homeSection} className={`${input} ${p.suggested ? "border-emerald-400 bg-emerald-50/40" : ""}`} placeholder="Set later" />{p.hint && <p className={`mt-1 text-xs ${p.suggested ? "text-emerald-700" : "text-slate-500"}`}>{p.suggested ? "✓ Pre-filled. " : ""}{p.hint}</p>}</div>
      </div>
      <p className="text-xs text-slate-500">Identity details can be corrected if extraction misread them. Grades and credit hours come from the documents and can&apos;t be edited.</p>
      {p.needsAck && (
        <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <input type="checkbox" name="ack" required className="mt-1" />
          <span><b>I have compared the extracted course table with the PDF</b> (grades, lab courses and credit hours) and it is correct — or I will upload fresh documents.</span>
        </label>
      )}
      {state?.error && <Notice tone="red">{state.error}</Notice>}
      <button className={btn} disabled={pending || p.blocked}>{pending ? "Saving…" : p.isUpdate ? "Confirm & update profile" : "Confirm & create profile"}</button>
    </form>
  );
}
