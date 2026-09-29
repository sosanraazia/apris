"use client";
import { useState, useTransition } from "react";
import { updateStudentDetailsAction } from "@/app/students/[id]/actions";
import { btnGhost, input, label, Notice } from "./ui";

export function EditDetails({ studentId, name, fatherName }: { studentId: number; name: string; fatherName: string | null }) {
  const [n, setN] = useState(name);
  const [f, setF] = useState(fatherName ?? "");
  const [msg, setMsg] = useState<{ t: "green" | "red"; m: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div><label className={label} htmlFor="sname">Name</label><input id="sname" className={input} value={n} onChange={(e) => setN(e.target.value)} /></div>
      <div><label className={label} htmlFor="sfather">Father&apos;s name</label><input id="sfather" className={input} value={f} onChange={(e) => setF(e.target.value)} /></div>
      <button className={btnGhost} disabled={pending || (n === name && f === (fatherName ?? ""))} onClick={() => start(async () => { const r = await updateStudentDetailsAction(studentId, n, f); setMsg(r.error ? { t: "red", m: r.error } : { t: "green", m: r.ok! }); })}>Save details</button>
      {msg && <Notice tone={msg.t}>{msg.m}</Notice>}
    </div>
  );
}
