"use client";
import { useActionState } from "react";
import { addPrerequisiteAction, updatePrerequisiteAction } from "@/app/admin/actions";
import { btn, btnGhost, input, label, Notice } from "./ui";

export function AddPrerequisiteForm() {
  const [st, action, pending] = useActionState(addPrerequisiteAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div><label className={label} htmlFor="pr-course">Course</label><input id="pr-course" name="course" list="pr-titles" className={input} required autoComplete="off" /></div>
        <div><label className={label} htmlFor="pr-pre">Must have passed</label><input id="pr-pre" name="prerequisite" list="pr-titles" className={input} required autoComplete="off" /></div>
      </div>
      {st?.error && <Notice tone="red">{st.error}</Notice>}
      {st?.ok && <Notice tone="green">{st.ok}</Notice>}
      <button className={btn} disabled={pending}>Add rule</button>
    </form>
  );
}

export function EditPrerequisiteForm({ id, prerequisite }: { id: number; prerequisite: string }) {
  const [st, action, pending] = useActionState(updatePrerequisiteAction, undefined);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="prerequisite" list="pr-titles" defaultValue={prerequisite} className={`${input} min-w-64`} aria-label="Prerequisite" autoComplete="off" />
      <button className={btnGhost} disabled={pending}>Save</button>
      {st?.error && <span className="text-xs text-rose-600">{st.error}</span>}
      {st?.ok && <span className="text-xs text-emerald-700">Saved</span>}
    </form>
  );
}
