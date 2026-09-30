"use client";
import { useActionState } from "react";
import { retryAllAction, sendTestEmailAction } from "@/app/admin/email/actions";
import { btn, btnGhost, input, label, Notice } from "./ui";

export function TestEmailForm() {
  const [st, action, pending] = useActionState(sendTestEmailAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <div className="flex items-end gap-2"><div className="flex-1"><label className={label} htmlFor="to">Send a test email to</label><input id="to" name="to" type="email" className={input} placeholder="you@dsu.edu.pk" required /></div><button className={btn} disabled={pending}>{pending ? "Sending…" : "Send test"}</button></div>
      {st?.error && <Notice tone="red">{st.error}</Notice>}
      {st?.ok && <Notice tone="green">{st.ok}</Notice>}
    </form>
  );
}

export function RetryAllButton({ failed }: { failed: number }) {
  const [st, action, pending] = useActionState(async () => retryAllAction(), undefined);
  return (
    <form action={action} className="flex items-center gap-3">
      <button className={btnGhost} disabled={pending || failed === 0}>Retry all failed ({failed})</button>
      {st?.ok && <span className="text-xs text-emerald-700">{st.ok}</span>}
    </form>
  );
}
