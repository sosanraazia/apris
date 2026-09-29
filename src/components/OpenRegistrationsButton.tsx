"use client";
import { useActionState } from "react";
import { openRegistrationsAction } from "@/app/admin/actions";
import { btn, Notice } from "./ui";

export function OpenRegistrationsButton({ disabledReason }: { disabledReason?: string }) {
  const [state, action, pending] = useActionState(openRegistrationsAction, undefined);
  return (
    <form action={action} className="space-y-2">
      {state?.error && <Notice tone="red">{state.error}</Notice>}
      {state?.ok && <Notice tone="green">{state.ok}</Notice>}
      <button className={btn} disabled={pending || !!disabledReason} title={disabledReason}>{pending ? "Opening…" : "Open registrations"}</button>
      {disabledReason && <p className="text-xs text-slate-500">{disabledReason}</p>}
    </form>
  );
}
