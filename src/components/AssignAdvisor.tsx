"use client";
import { useState, useTransition } from "react";
import { assignAdvisorAction } from "@/app/students/[id]/actions";
import { btnGhost, input, Notice } from "./ui";

export function AssignAdvisor({ studentId, current, advisors }: { studentId: number; current: number | null; advisors: { id: number; name: string }[] }) {
  const [v, setV] = useState(current ?? 0);
  const [msg, setMsg] = useState<{ t: "green" | "red"; m: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select className={input} value={v} onChange={(e) => setV(Number(e.target.value))} aria-label="Advisor">
          <option value={0}>Unassigned</option>{advisors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button className={btnGhost} disabled={pending || v === (current ?? 0)} onClick={() => start(async () => { const r = await assignAdvisorAction(studentId, v || null); setMsg(r.error ? { t: "red", m: r.error } : { t: "green", m: r.ok! }); })}>Assign</button>
      </div>
      {msg && <Notice tone={msg.t}>{msg.m}</Notice>}
    </div>
  );
}
