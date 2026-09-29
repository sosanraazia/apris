"use client";
import { useActionState } from "react";
import { saveSettingsAction } from "@/app/admin/actions";
import type { Settings } from "@/lib/rules/types";
import { btn, input, label, Notice } from "./ui";

const FIELDS: [keyof Settings, string, string][] = [
  ["fypThresholdCH", "FYP-I minimum completed CH", "FYP-I eligibility depends only on this threshold"],
  ["minLoadCH", "Minimum load (CH)", "Below this an advisor reason is required"],
  ["regularMaxCH", "Regular load ceiling (CH)", "HEC regular load 15–18"],
  ["overloadMaxCH", "Absolute ceiling (CH)", "Overload needs DSU approval reference"],
  ["summerMaxCH", "Summer maximum (CH)", ""],
  ["minPassGradePoint", "Minimum passing grade point", "1.0 = D counts as a pass"],
  ["probationMaxCH", "Probation max CH", "Blank = not configured → no automatic recommendation"],
  ["relegationMaxCH", "Relegation max CH", "Blank = not configured → no automatic recommendation"],
  ["finalSemesterMaxCH", "Final-semester max CH", "Blank = use regular ceiling"],
];

export function SettingsForm({ values }: { values: Settings }) {
  const [state, action, pending] = useActionState(saveSettingsAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {FIELDS.map(([k, l, hint]) => (
          <div key={k}><label className={label} htmlFor={k}>{l}</label><input id={k} name={k} defaultValue={values[k] ?? ""} className={input} inputMode="decimal" /><p className="mt-1 text-xs text-slate-500">{hint}</p></div>
        ))}
      </div>
      {state?.error && <Notice tone="red">{state.error}</Notice>}
      {state?.ok && <Notice tone="green">{state.ok}</Notice>}
      <button className={btn} disabled={pending}>Save settings</button>
    </form>
  );
}
