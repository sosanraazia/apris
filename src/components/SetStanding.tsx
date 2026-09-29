"use client";
import { useState, useTransition } from "react";
import { setStandingAction } from "@/app/students/[id]/actions";
import { btnGhost, input, Notice } from "./ui";

export function SetStanding({ studentId, current }: { studentId: number; current: string }) {
  const [v, setV] = useState(current);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ t: "green" | "red"; m: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select className={`${input} max-w-44`} value={v} onChange={(e) => setV(e.target.value)} aria-label="Academic standing">
          {["NORMAL", "PROBATION", "RELEGATION", "FROZEN", "INACTIVE", "WITHDRAWN", "GRADUATED"].map((x) => <option key={x}>{x}</option>)}
        </select>
        <input className={input} placeholder="Source / reason (e.g. Probation list Fall 2026)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className={btnGhost} disabled={pending || v === current} onClick={() => start(async () => { const r = await setStandingAction(studentId, v, reason); setMsg(r.error ? { t: "red", m: r.error } : { t: "green", m: r.ok! }); })}>Set</button>
      </div>
      {msg && <Notice tone={msg.t}>{msg.m}</Notice>}
    </div>
  );
}
