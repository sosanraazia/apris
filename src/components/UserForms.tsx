"use client";
import { useActionState } from "react";
import { createUserAction, resetPasswordAction, updateBatchesAction, updateUserEmailAction } from "@/app/admin/users/actions";
import { btn, btnGhost, input, label, Notice } from "./ui";

export function CreateUserForm() {
  const [st, action, pending] = useActionState(createUserAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div><label className={label} htmlFor="u-username">Username</label><input id="u-username" name="username" className={input} required autoComplete="off" /></div>
        <div><label className={label} htmlFor="u-name">Full name</label><input id="u-name" name="name" className={input} required /></div>
        <div><label className={label} htmlFor="u-role">Role</label><select id="u-role" name="role" className={input} defaultValue="ADVISOR"><option value="ADVISOR">Academic Advisor</option><option value="HOD">Head of Department</option><option value="ADMIN">Admin</option></select></div>
        <div><label className={label} htmlFor="u-email">University email (required for advisors — student replies go here)</label><input id="u-email" name="email" type="email" className={input} placeholder="firstname.lastname@dsu.edu.pk" autoComplete="off" /></div>
        <div><label className={label} htmlFor="u-dept">Department</label><input id="u-dept" name="department" className={input} defaultValue="Software Engineering" /></div>
        <div><label className={label} htmlFor="u-batches">Batches advised (advisors only — e.g. CYS23, CYS24, SE24)</label><input id="u-batches" name="batches" className={input} placeholder="CYS23, CYS24" autoComplete="off" /></div>
        <div><label className={label} htmlFor="u-pass">Temporary password (6+ chars — user must change it at first login)</label><input id="u-pass" name="password" type="password" className={input} required autoComplete="new-password" /></div>
      </div>
      {st?.error && <Notice tone="red">{st.error}</Notice>}
      {st?.ok && <Notice tone="green">{st.ok}</Notice>}
      <button className={btn} disabled={pending}>Create user</button>
    </form>
  );
}

export function ResetPasswordForm({ id }: { id: number }) {
  const [st, action, pending] = useActionState(resetPasswordAction, undefined);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="password" type="password" placeholder="New password (6+)" className={`${input} w-44`} autoComplete="new-password" aria-label="New password" />
      <button className={btnGhost} disabled={pending}>Reset</button>
      {st?.error && <span className="text-xs text-rose-600">{st.error}</span>}
      {st?.ok && <span className="text-xs text-emerald-700">Done</span>}
    </form>
  );
}

export function EmailForm({ id, email, required }: { id: number; email: string; required: boolean }) {
  const [st, action, pending] = useActionState(updateUserEmailAction, undefined);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="email" type="email" defaultValue={email} className={`${input} w-56`} aria-label={required ? "Advisor email" : "Email"} />
      <button className={btnGhost} disabled={pending}>Save</button>
      {st?.error && <span className="text-xs text-rose-600">{st.error}</span>}
      {st?.ok && <span className="text-xs text-emerald-700">Saved</span>}
    </form>
  );
}

export function BatchesForm({ id, batches }: { id: number; batches: string }) {
  const [st, action, pending] = useActionState(updateBatchesAction, undefined);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="batches" defaultValue={batches.split(",").filter(Boolean).join(", ")} placeholder="CYS23, CYS24" className={`${input} w-40`} aria-label="Batches advised" autoComplete="off" />
      <button className={btnGhost} disabled={pending}>Save</button>
      {st?.error && <span className="text-xs text-rose-600">{st.error}</span>}
      {st?.ok && <span className="text-xs text-emerald-700">{st.ok}</span>}
    </form>
  );
}
