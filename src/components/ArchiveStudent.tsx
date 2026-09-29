"use client";
import { useState, useTransition } from "react";
import { archiveStudentAction, restoreStudentAction } from "@/app/students/[id]/actions";
import { btnGhost, input, Notice } from "./ui";

export function ArchiveStudent({ studentId, archived }: { studentId: number; archived: boolean }) {
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ t: "green" | "red"; m: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      {archived ? (
        <button className={btnGhost} disabled={pending} onClick={() => start(async () => { const r = await restoreStudentAction(studentId); setMsg(r.error ? { t: "red", m: r.error } : { t: "green", m: r.ok! }); })}>Restore profile</button>
      ) : (
        <>
          <input className={input} placeholder="Reason (e.g. duplicate profile created by mistake)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className={btnGhost} disabled={pending || !reason.trim()} onClick={() => start(async () => { const r = await archiveStudentAction(studentId, reason); setMsg(r.error ? { t: "red", m: r.error } : { t: "green", m: r.ok! }); })}>Archive profile</button>
        </>
      )}
      <p className="text-xs text-slate-500">Advisors cannot delete or archive profiles. Archiving is Admin-only, reversible and audited; profiles with finalized registrations can&apos;t be archived.</p>
      {msg && <Notice tone={msg.t}>{msg.m}</Notice>}
    </div>
  );
}
