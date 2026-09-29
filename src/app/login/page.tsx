"use client";
import { useActionState } from "react";
import { loginAction } from "./actions";
import { btn, input, label } from "@/components/ui";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <div className="mx-auto mt-24 max-w-sm">
      <div className="mb-6 text-center">
        <div className="text-3xl font-bold tracking-tight text-brand">APRIS</div>
        <p className="mt-1 text-sm text-slate-500">Academic Progression &amp; Registration Intelligence System</p>
      </div>
      <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div><label className={label} htmlFor="username">Username</label><input id="username" name="username" className={input} autoComplete="username" autoFocus required /></div>
        <div><label className={label} htmlFor="password">Password</label><input id="password" name="password" type="password" className={input} autoComplete="current-password" required /></div>
        {state?.error && <p className="text-sm text-rose-600" role="alert">{state.error}</p>}
        <button className={`${btn} w-full`} disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
