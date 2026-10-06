"use client";
import { useState, useTransition } from "react";
import { setHomeSectionAction } from "@/app/students/[id]/actions";
import { btnGhost, input, Notice } from "./ui";

export function SetHomeSection({ studentId, current, suggested }: { studentId: number; current: string | null; suggested?: { section: string; note: string } | null }) {
  const [v, setV] = useState(current ?? suggested?.section ?? "");
  const [msg, setMsg] = useState<{ t: "green" | "red"; m: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className={input} value={v} onChange={(e) => setV(e.target.value)} placeholder="e.g. SE-3A" aria-label="Home section" />
        <button className={btnGhost} disabled={pending || !v.trim() || v.trim().toUpperCase() === current} onClick={() => start(async () => { const r = await setHomeSectionAction(studentId, v); setMsg(r.error ? { t: "red", m: r.error } : { t: "green", m: r.ok! }); })}>Save</button>
      </div>
      <p className="text-xs text-slate-500">{current ? "Confirm or change for the new semester." : "Not set — recommendations won't suggest sections until you set it."}</p>
      {suggested && suggested.section !== current && <p className="text-xs text-emerald-700">{current ? "" : "✓ Pre-filled — press Save to apply. "}{suggested.note}</p>}
      {msg && <Notice tone={msg.t}>{msg.m}</Notice>}
    </div>
  );
}
