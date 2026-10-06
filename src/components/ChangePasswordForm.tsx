"use client";
import { useActionState } from "react";
import { changePasswordAction } from "@/app/account/actions";
import { btn, input, label, Notice } from "./ui";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <div className="mx-auto mt-10 max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Change password</h1>
      <p className="text-sm text-slate-600">Use at least 6 characters. If an Admin gave you a temporary password you must change it before continuing.</p>
      <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div><label className={label} htmlFor="current">Current password</label><input id="current" name="current" type="password" className={input} autoComplete="current-password" required /></div>
        <div><label className={label} htmlFor="next">New password</label><input id="next" name="next" type="password" className={input} autoComplete="new-password" required /></div>
        <div><label className={label} htmlFor="confirm">Repeat new password</label><input id="confirm" name="confirm" type="password" className={input} autoComplete="new-password" required /></div>
        {state?.error && <Notice tone="red">{state.error}</Notice>}
        <button className={btn} disabled={pending}>{pending ? "Saving…" : "Change password"}</button>
      </form>
    </div>
  );
}
