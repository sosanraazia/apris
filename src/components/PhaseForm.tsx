"use client";
import { useActionState } from "react";
import { setPhaseAction } from "@/app/admin/actions";
import { btn, input, label, Notice } from "./ui";

export function PhaseForm({ phase, ends }: { phase: string; ends: string }) {
  const [state, action, pending] = useActionState(setPhaseAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className={label} htmlFor="phase">Phase</label>
          <select id="phase" name="phase" defaultValue={phase} className={input}>
            <option value="SETUP">Setup — offerings being prepared; advisors can preview suggestions only</option>
            <option value="REGISTRATION">Registration — advisors register students</option>
            <option value="ADD_DROP">Add / Drop — changes create a new version with a reason</option>
            <option value="CLOSED">Closed — locked (Admin late changes only)</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="addDropEnds">Add/Drop ends (auto-closes)</label>
          <input id="addDropEnds" name="addDropEnds" type="date" defaultValue={ends} className={input} />
        </div>
      </div>
      {state?.error && <Notice tone="red">{state.error}</Notice>}
      {state?.ok && <Notice tone="green">{state.ok}</Notice>}
      <button className={btn} disabled={pending}>Apply phase</button>
    </form>
  );
}
