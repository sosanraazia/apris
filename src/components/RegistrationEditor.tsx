"use client";
import { useMemo, useState, useTransition } from "react";
import { saveDraftAction, finalizeAction } from "@/app/students/[id]/actions";
import type { RecItem } from "@/lib/rules/types";
import { Badge, Notice, btn, btnGhost, input, td, th } from "./ui";

export interface OfferingLite { id: number; courseCode: string; courseName: string; section: string | null; cbaCode: string | null; ch: number }
interface Props {
  studentId: number;
  readOnly: boolean;
  items: RecItem[];
  offerings: OfferingLite[];
  saved: { offeringId: number; overrideReason: string | null }[];
  savedRemovals: { code: string; reason: string }[];
  status: string;
  version: number;
  limits: { min: number; regularMax: number; overloadMax: number; applicableMax: number | null };
  warnings: string[];
  phase: string;
  phaseLabel: string;
  lateAdmin: boolean;
  /** Probation / relegation: registered manually against one approval reference. */
  manual: boolean;
  standing: string;
  savedApproval: string;
  homeSection: string | null;
}
interface Row { include: boolean; offeringId: string; reason: string }

const STATUS_TONE: Record<string, string> = { RECOMMENDED: "green", ELECTIVE_CHOICE: "violet", OPTIONAL: "blue", DEFERRED_BY_LOAD: "amber", BLOCKED: "red", NOT_ELIGIBLE: "red", NOT_OFFERED: "slate" };
const isStandard = (i: RecItem, offeringId: string) => (i.status === "RECOMMENDED" || i.status === "ELECTIVE_CHOICE") && (!i.suggested || i.suggested.offeringId === offeringId);

export function RegistrationEditor(p: Props) {
  const includable = p.items.filter((i) => i.choices.length > 0 && i.status !== "NOT_OFFERED");
  const info = p.items.filter((i) => !includable.includes(i));

  const initial = useMemo(() => {
    const rows: Record<string, Row> = {};
    const adhoc: { offeringId: string; reason: string }[] = [];
    const savedIds = new Map(p.saved.map((s) => [String(s.offeringId), s.overrideReason ?? ""]));
    const claimed = new Set<string>();
    for (const i of includable) {
      const savedChoice = i.choices.find((c) => savedIds.has(c.offeringId));
      const preset = i.suggested?.offeringId ?? (i.choices.length === 1 ? i.choices[0].offeringId : "");
      if (savedChoice) { claimed.add(savedChoice.offeringId); rows[i.key] = { include: true, offeringId: savedChoice.offeringId, reason: savedIds.get(savedChoice.offeringId) ?? "" }; }
      else rows[i.key] = { include: p.saved.length === 0 && i.status === "RECOMMENDED" && !!i.suggested?.exportable, offeringId: preset, reason: p.savedRemovals.find((r) => r.code === i.code)?.reason ?? "" };
    }
    for (const [id, reason] of savedIds) if (!claimed.has(id)) adhoc.push({ offeringId: id, reason });
    return { rows, adhoc };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [rows, setRows] = useState(initial.rows);
  const [adhoc, setAdhoc] = useState(initial.adhoc);
  const [loadReason, setLoadReason] = useState("");
  const [approval, setApproval] = useState(p.savedApproval);
  const [changeReason, setChangeReason] = useState("");
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [dirty, setDirty] = useState(p.saved.length === 0);
  const [pending, start] = useTransition();
  const offById = new Map(p.offerings.map((o) => [String(o.id), o]));

  // A lab always sits in the same section as its theory course, so the pair is edited together.
  const partnerOf = (i: RecItem) => includable.find((o) => o.key !== i.key && (i.isLab ? o.code === i.code.replace(/L$/, "") : o.code === i.code + "L"));
  const set = (key: string, patch: Partial<Row>) => {
    setRows((r) => {
      const next = { ...r, [key]: { ...r[key], ...patch } };
      const item = includable.find((x) => x.key === key);
      const partner = item && partnerOf(item);
      if (item && partner) {
        if (patch.include !== undefined && next[partner.key].offeringId) next[partner.key] = { ...next[partner.key], include: patch.include };
        if (patch.offeringId) {
          const section = item.choices.find((c) => c.offeringId === patch.offeringId)?.section;
          const match = partner.choices.find((c) => c.section === section);
          if (match) next[partner.key] = { ...next[partner.key], offeringId: match.offeringId };
        }
      }
      return next;
    });
    setDirty(true);
  };
  const chosen = includable.filter((i) => rows[i.key]?.include && rows[i.key].offeringId);
  const chAdhoc = adhoc.reduce((a, x) => a + (offById.get(x.offeringId)?.ch ?? 3), 0);
  const total = chosen.reduce((a, i) => a + i.ch, 0) + chAdhoc;
  const max = p.limits.applicableMax ?? p.limits.regularMax;
  const overload = total > max, low = total < p.limits.min && total > 0;

  const payload = () => ({
    items: [
      ...chosen.map((i) => ({ offeringId: Number(rows[i.key].offeringId), overrideReason: rows[i.key].reason })),
      ...adhoc.map((a) => ({ offeringId: Number(a.offeringId), overrideReason: a.reason })),
    ],
    removals: includable.filter((i) => i.status === "RECOMMENDED" && !rows[i.key]?.include).map((i) => ({ code: i.code, reason: rows[i.key]?.reason ?? "" })),
    loadReason,
    manualApproval: approval,
  });
  const save = () => start(async () => {
    const r = await saveDraftAction(p.studentId, payload());
    if (r.error) setMsg({ tone: "red", text: r.error }); else { setMsg({ tone: "green", text: r.ok! }); setDirty(false); }
  });
  const fin = () => start(async () => {
    const r = await finalizeAction(p.studentId, changeReason);
    setMsg(r.error ? { tone: "red", text: r.error } : { tone: "green", text: r.ok! });
  });
  const approveAll = () => {
    const targets = includable.filter((i) => i.status === "RECOMMENDED" && i.suggested);
    if (!targets.length) {
      setMsg({ tone: "red", text: p.homeSection ? "There is nothing to approve automatically — choose a section for each course (or use “Set section for all courses”)." : "Nothing can be approved automatically because this student has no home section. Set the home section (Overview tab), or use “Set section for all courses” below." });
      return;
    }
    setRows((r) => { const n = { ...r }; for (const i of targets) n[i.key] = { ...n[i.key], include: true, offeringId: i.suggested!.offeringId }; return n; });
    setMsg(null);
    setDirty(true);
  };

  // One section for every course (labs stay with their theory course because they share a section).
  const allSections = [...new Set(includable.flatMap((i) => i.choices.filter((c) => !c.crossProgram && c.section).map((c) => c.section as string)))].sort();
  const applySectionToAll = (section: string) => {
    if (!section) return;
    let applied = 0, skipped = 0;
    setRows((r) => {
      const n = { ...r };
      for (const i of includable) {
        const match = i.choices.find((c) => c.section === section && !c.crossProgram);
        if (!match) { if (i.status === "RECOMMENDED") skipped++; continue; }
        n[i.key] = { ...n[i.key], offeringId: match.offeringId, include: i.status === "RECOMMENDED" ? true : n[i.key].include };
        if (i.status === "RECOMMENDED") applied++;
      }
      return n;
    });
    setMsg({ tone: applied ? "green" : "red", text: applied ? `Section ${section} applied to ${applied} course(s)${skipped ? `; ${skipped} recommended course(s) aren't offered in ${section} — choose those by hand` : ""}. Review, then save the draft.` : `No recommended course is offered in ${section}.` });
    setDirty(true);
  };
  const addable = p.offerings.filter((o) => !adhoc.some((a) => a.offeringId === String(o.id)));

  return (
    <div className="space-y-4">
      {!p.homeSection && !p.manual && p.phase !== "SETUP" && <Notice tone="amber"><b>This student has no home section yet</b>, so no section is pre-selected and “Approve all recommended” has nothing to apply. Either set it under <a className="underline" href="?tab=overview">Overview → Home section</a>, or pick one section for all courses with the “Set section for all courses” menu below.</Notice>}
      {p.manual && <Notice tone="amber"><b>Manual registration — {p.standing.toLowerCase()} student.</b> There is no automatic recommendation for this standing yet. Choose the courses below (or add others from the offerings) and enter the approval reference. The whole registration is recorded against it and listed for HoD review.</Notice>}
      {p.phase === "SETUP" && <Notice tone="blue"><b>Registrations aren&apos;t open yet.</b> You can review the suggestions below; saving and finalizing become available when an Admin opens registrations.</Notice>}
      {p.phase === "ADD_DROP" && <Notice tone="blue"><b>Add / Drop phase.</b> Tick a course to <b>add</b> it, untick to <b>drop</b> it, or change its section. Save the draft, then finalize with a reason — this creates a new registration version.</Notice>}
      {p.phase === "CLOSED" && <Notice tone="red"><b>Registration is closed.</b> {p.lateAdmin ? "As Admin you can still make a late change; it is flagged and needs a reason." : "Ask an Admin to reopen the add/drop window."}</Notice>}
      {p.warnings.filter((w) => !(p.manual && /registered manually/.test(w))).map((w) => <Notice key={w} tone="amber">{w}</Notice>)}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge tone={p.status === "FINALIZED" || p.status === "EXPORTED" ? "green" : "amber"}>{p.status.toLowerCase()}{p.version ? ` · v${p.version}` : ""}</Badge>
        <span className={`rounded-md px-2.5 py-1 font-medium tabular-nums ${overload ? "bg-rose-50 text-rose-700" : low ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{total} CH selected</span>
        <span className="text-slate-500">limit {max} CH · minimum {p.limits.min} CH · absolute max {p.limits.overloadMax} CH</span>
        {!p.readOnly && !p.manual && allSections.length > 0 && (
          <select className={`${input} ml-auto w-56`} value="" onChange={(e) => applySectionToAll(e.target.value)} aria-label="Set section for all courses">
            <option value="">Set section for all courses…</option>
            {allSections.map((sec) => <option key={sec} value={sec}>{sec}</option>)}
          </select>
        )}
        {!p.readOnly && !p.manual && <button type="button" onClick={approveAll} className={btnGhost}>Approve all recommended</button>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-slate-100 bg-slate-50"><tr><th className={th}></th><th className={th}>Course</th><th className={th}>CH</th><th className={th}>Status / reason</th><th className={th}>Section · CBA</th><th className={th}>Advisor reason</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {includable.map((i) => {
              const r = rows[i.key];
              const choice = i.choices.find((c) => c.offeringId === r.offeringId);
              const needsReason = !p.manual && (r.include ? !isStandard(i, r.offeringId) : i.status === "RECOMMENDED");
              return (
                <tr key={i.key} className={r.include ? "bg-emerald-50/30" : ""}>
                  <td className={td}><input type="checkbox" aria-label={`Include ${i.title}`} disabled={p.readOnly || !r.offeringId} title={!r.offeringId ? "Choose a section first" : undefined} checked={r.include} onChange={(e) => set(i.key, { include: e.target.checked })} /></td>
                  <td className={td}>{(() => { const names = [...new Set(i.choices.map((c) => c.courseName))]; const slot = i.status === "ELECTIVE_CHOICE"; const shown = slot ? (choice?.courseName ?? (names.length === 1 ? names[0] : null)) : null; return shown ? (<><div className="font-medium">{shown}</div><div className="text-xs text-slate-500">{i.title} · <span className="font-mono">{choice?.courseCode ?? i.choices[0]?.courseCode}</span> · sem {i.semester}{i.isBacklog && " · backlog"}</div></>) : (<><div className="font-medium">{i.title}</div><div className="font-mono text-xs text-slate-500">{i.code} · sem {i.semester}{i.isBacklog && " · backlog"}</div></>); })()}</td>
                  <td className={`${td} tabular-nums`}>{i.ch}</td>
                  <td className={td}><Badge tone={STATUS_TONE[i.status]}>{i.status.replaceAll("_", " ").toLowerCase()}</Badge><div className="mt-1 max-w-sm text-xs text-slate-600">{i.reason}</div>{i.sectionNote && <div className="mt-1 max-w-sm text-xs text-amber-700">{i.sectionNote}</div>}</td>
                  <td className={td}>
                    <select className={`${input} min-w-44`} disabled={p.readOnly} value={r.offeringId} onChange={(e) => set(i.key, { offeringId: e.target.value })} aria-label={`Section for ${i.title}`}>
                      {!r.offeringId && <option value="">Choose section…</option>}
                      {i.choices.map((c) => (<option key={c.offeringId} value={c.offeringId}>{c.section ?? "no section"} · {i.status === "ELECTIVE_CHOICE" ? `${c.courseName} · ` : ""}{c.courseCode} · {c.cbaCode ?? "no CBA"}{c.crossProgram ? " (other program)" : ""}</option>))}
                    </select>
                    {choice && (() => { const pr = partnerOf(i); const pc = pr && rows[pr.key]?.include && r.include ? pr.choices.find((c) => c.offeringId === rows[pr.key].offeringId) : null; return pc && pc.section !== choice.section ? <div className="mt-1 text-xs text-rose-600">Lab and theory must be in the same section ({pc.section ?? "none"} vs {choice.section ?? "none"}).</div> : null; })()}
                    {choice && !choice.exportable && <div className="mt-1 text-xs text-rose-600">{choice.issues.join("; ")} — can&apos;t be finalized until an Admin fixes it</div>}
                  </td>
                  <td className={td}>
                    {!p.manual && (needsReason || r.reason) && <input className={`${input} min-w-52 ${needsReason && !r.reason.trim() ? "border-amber-400" : ""}`} disabled={p.readOnly} placeholder={r.include ? "Reason for deviation (required)" : "Why not registered? (required)"} value={r.reason} onChange={(e) => set(i.key, { reason: e.target.value })} />}
                  </td>
                </tr>
              );
            })}
            {adhoc.map((a, idx) => {
              const o = offById.get(a.offeringId);
              return (
                <tr key={a.offeringId} className="bg-sky-50/40">
                  <td className={td}><button type="button" disabled={p.readOnly} className="text-rose-600" aria-label="Remove added course" onClick={() => { setAdhoc(adhoc.filter((_, j) => j !== idx)); setDirty(true); }}>✕</button></td>
                  <td className={td}><div className="font-medium">{o?.courseName}</div><div className="font-mono text-xs text-slate-500">{o?.courseCode}</div></td>
                  <td className={td}>—</td>
                  <td className={td}><Badge tone="blue">added by advisor</Badge></td>
                  <td className={td}>{o?.section ?? "no section"} · {o?.cbaCode ?? "no CBA"}</td>
                  <td className={td}>{p.manual ? <span className="text-xs text-slate-500">covered by approval</span> : <input className={`${input} min-w-52`} placeholder="Reason (required)" value={a.reason} disabled={p.readOnly} onChange={(e) => { setAdhoc(adhoc.map((x, j) => (j === idx ? { ...x, reason: e.target.value } : x))); setDirty(true); }} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!p.readOnly && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select className={`${input} max-w-md`} value="" onChange={(e) => { if (e.target.value) { setAdhoc([...adhoc, { offeringId: e.target.value, reason: "" }]); setDirty(true); } }} aria-label="Add a course">
            <option value="">+ Add another course from this semester&apos;s offerings…</option>
            {addable.map((o) => (<option key={o.id} value={o.id}>{o.courseCode} · {o.courseName} · {o.section ?? "no section"}</option>))}
          </select>
        </div>
      )}

      {info.length > 0 && (
        <details className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-medium text-slate-700">Not registrable now ({info.length})</summary>
          <ul className="mt-3 space-y-2">{info.map((i) => (<li key={i.key} className="flex gap-3"><Badge tone={STATUS_TONE[i.status]}>{i.status.replaceAll("_", " ").toLowerCase()}</Badge><span><span className="font-medium">{i.title}</span> <span className="font-mono text-xs text-slate-500">{i.code}</span> — {i.reason}</span></li>))}</ul>
        </details>
      )}

      {!p.readOnly && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          {p.manual && <div><label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="approval">Approval reference (required)</label><input id="approval" className={input} placeholder="e.g. HoD decision 12 Oct 2026 / probation committee ref." value={approval} onChange={(e) => { setApproval(e.target.value); setDirty(true); }} /></div>}
          {(overload || low) && !(p.manual && low) && <div><input className={input} placeholder={overload ? `Total is above ${max} CH — enter the overload approval reference (required)` : `Total is below ${p.limits.min} CH — reason (required)`} value={loadReason} onChange={(e) => { setLoadReason(e.target.value); setDirty(true); }} /></div>}
          {(p.version > 0 || p.lateAdmin) && <input className={input} placeholder={p.phase === "ADD_DROP" ? "Reason for this add / drop (required)" : "Reason for changing a finalized registration (required to create a new version)"} value={changeReason} onChange={(e) => setChangeReason(e.target.value)} />}
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <div className="flex gap-2">
            <button className={btnGhost} type="button" disabled={pending} onClick={save}>Save draft</button>
            <button className={btn} type="button" disabled={pending || dirty || !p.saved.length && dirty} onClick={fin} title={dirty ? "Save the draft first" : ""}>{p.version > 0 ? (p.phase === "ADD_DROP" ? "Commit add / drop" : "Commit change") : "Approve & finalize registration"}</button>
            {dirty && <span className="self-center text-xs text-slate-500">Save the draft first, then approve.</span>}
          </div>
          <p className="text-xs text-slate-500">Finalizing creates a committed registration version and feeds the export CSV. Emails to students are queued for a later phase.</p>
        </div>
      )}
    </div>
  );
}
