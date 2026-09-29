"use client";
import { useActionState } from "react";
import { openSemesterAction } from "@/app/admin/actions";
import { btn, input, label, Notice } from "./ui";

export function OpenSemesterForm({ current }: { current: string | null }) {
  const [state, action, pending] = useActionState(openSemesterAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="max-w-xs"><label className={label} htmlFor="sem-name">New semester</label><input id="sem-name" name="name" className={input} placeholder="Spring 2027" required /></div>
      <p className="text-xs text-slate-500">{current ? <>This closes <b>{current}</b> (its registrations stay on record) and starts the new semester with <b>no offerings</b> — suggestions begin after you upload and apply the course offering workbook.</> : "Starts the first semester."}</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="force" /> Open anyway even if the current semester has unexported registrations</label>
      {state?.error && <Notice tone="red">{state.error}</Notice>}
      {state?.ok && <Notice tone="green">{state.ok}</Notice>}
      <button className={btn} disabled={pending}>Open semester</button>
    </form>
  );
}
