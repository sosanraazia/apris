import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { verifyAuditChain } from "@/lib/services/audit";
import { ACTION_GROUPS, defaultSince, parseFilter, toWhere } from "@/lib/services/auditQuery";
import { Badge, Card, Notice, btn, btnGhost, input, td, th } from "@/components/ui";

const PAGE = 50;
const pretty = (v: string | null) => {
  if (!v) return "";
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p.join("; ") : typeof p === "object" && p ? Object.entries(p).map(([k, x]) => `${k}: ${typeof x === "object" ? JSON.stringify(x) : x}`).join(", ") : String(p);
  } catch { return v; }
};

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  await requireRole("ADMIN", "HOD");
  const sp = await searchParams;
  const f = parseFilter(sp);
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1);
  const where = toWhere(f);
  const [users, total, rows, chain] = await Promise.all([
    db.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { id: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    verifyAuditChain(),
  ]);
  const uname = new Map(users.map((u) => [u.id, u]));

  // per-advisor activity for the selected period (default: last 30 days)
  const since = f.from ?? defaultSince();
  const groups = await db.auditLog.groupBy({ by: ["userId", "action"], where: { at: { gte: since, ...(f.to ? { lte: f.to } : {}) }, userId: { not: null } }, _count: { _all: true }, _max: { at: true } });
  const c = (uid: number, ...actions: string[]) => groups.filter((g) => g.userId === uid && actions.includes(g.action)).reduce((a, g) => a + g._count._all, 0);
  const last = (uid: number) => groups.filter((g) => g.userId === uid && g.action === "LOGIN").map((g) => g._max.at!).sort((a, b) => +b - +a)[0];
  const failed = await db.auditLog.findMany({ where: { action: "LOGIN_FAILED", at: { gte: since } }, select: { reason: true } });
  const failedFor = (username: string) => failed.filter((x) => x.reason?.startsWith(username + " ")).length;

  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (v && k !== "page" ? [[k, Array.isArray(v) ? v[0] : v]] : [])) as [string, string][]);
  const link = (p: number) => `/audit?${new URLSearchParams({ ...Object.fromEntries(qs), page: String(p) })}`;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between"><div><h1 className="text-xl font-semibold">Audit log</h1><p className="text-sm text-slate-500">Every login, view, change and export — who, what, which student, before/after, why.</p></div>
        <form method="post" action={`/audit/export?${qs}`}><button className={btnGhost}>Export CSV</button></form></div>

      {chain.ok
        ? <Notice tone="green"><b>Log integrity verified.</b> {chain.checked.toLocaleString()} entries are chained and unmodified{chain.legacyUnprotected ? ` (${chain.legacyUnprotected} older entries pre-date tamper protection)` : ""}.</Notice>
        : <Notice tone="red"><b>Log integrity check FAILED at entry #{chain.brokenAtId}</b> — {chain.reason}. Treat the log as possibly tampered with and investigate.</Notice>}

      <Card title={`Advisor activity — since ${since.toLocaleDateString()}`}>
        <div className="-m-5 overflow-x-auto"><table className="w-full"><thead><tr><th className={th}>User</th><th className={th}>Last login</th><th className={th}>Students added</th><th className={th}>Documents uploaded</th><th className={th}>Drafts saved</th><th className={th}>Registrations committed</th><th className={th}>Students viewed</th><th className={th}>Documents viewed</th><th className={th}>Failed logins</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{users.filter((u) => u.role !== "HOD" || c(u.id, "LOGIN")).map((u) => (
            <tr key={u.id}><td className={td}><Link className="text-brand hover:underline" href={`/audit?user=${u.id}`}>{u.name}</Link> <Badge tone={u.role === "ADMIN" ? "violet" : u.role === "HOD" ? "blue" : "slate"}>{u.role.toLowerCase()}</Badge></td>
              <td className={td}>{last(u.id)?.toLocaleString() ?? "—"}</td><td className={td}>{c(u.id, "STUDENT_CREATED")}</td><td className={td}>{c(u.id, "DOCUMENTS_UPLOADED")}</td><td className={td}>{c(u.id, "REGISTRATION_DRAFT_SAVED")}</td>
              <td className={td}>{c(u.id, "REGISTRATION_FINALIZED", "REGISTRATION_ADD_DROP", "REGISTRATION_LATE_CHANGE")}</td><td className={td}>{c(u.id, "STUDENT_VIEWED")}</td><td className={td}>{c(u.id, "DOCUMENT_VIEWED")}</td><td className={td}>{failedFor(u.username) || "—"}</td></tr>))}</tbody></table></div>
      </Card>

      <Card title="Filter">
        <form className="grid gap-3 md:grid-cols-6" method="get">
          <select name="user" defaultValue={f.user ?? ""} className={input} aria-label="User"><option value="">Everyone</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role.toLowerCase()})</option>)}</select>
          <input name="student" defaultValue={f.student ?? ""} placeholder="Student ID" className={`${input} font-mono`} />
          <select name="group" defaultValue={f.group ?? ""} className={input} aria-label="Type"><option value="">All activity</option>{Object.entries(ACTION_GROUPS).map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}</select>
          <input name="from" type="date" defaultValue={typeof sp.from === "string" ? sp.from : ""} className={input} aria-label="From" />
          <input name="to" type="date" defaultValue={typeof sp.to === "string" ? sp.to : ""} className={input} aria-label="To" />
          <button className={btn}>Apply</button>
        </form>
      </Card>

      <Card title={`Entries (${total.toLocaleString()})`}>
        <div className="-m-5 overflow-x-auto"><table className="w-full"><thead><tr><th className={th}>#</th><th className={th}>When</th><th className={th}>Who</th><th className={th}>Action</th><th className={th}>Student</th><th className={th}>Before → after</th><th className={th}>Reason</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map((r) => (
            <tr key={r.id}><td className={`${td} text-slate-400`}>{r.id}</td><td className={`${td} whitespace-nowrap`}>{r.at.toLocaleString()}</td><td className={td}>{uname.get(r.userId ?? -1)?.name ?? "—"}</td><td className={td}><Badge tone={r.action.includes("FAILED") ? "red" : r.action.startsWith("REGISTRATION") || r.action === "CSV_EXPORT" ? "green" : "slate"}>{r.action.toLowerCase().replaceAll("_", " ")}</Badge></td>
              <td className={`${td} font-mono`}>{r.studentRegId ?? ""}</td><td className={`${td} max-w-md break-words text-xs text-slate-600`}>{pretty(r.before)}{r.before && r.after ? " → " : ""}{pretty(r.after)}</td><td className={`${td} max-w-xs break-words`}>{r.reason}</td></tr>))}
            {!rows.length && <tr><td colSpan={7} className={`${td} py-8 text-center text-slate-500`}>No entries match.</td></tr>}</tbody></table></div>
        <div className="mt-5 flex items-center justify-between text-sm text-slate-600"><span>Page {page} of {Math.max(1, Math.ceil(total / PAGE))}</span><span className="flex gap-2">{page > 1 && <Link className={btnGhost} href={link(page - 1)}>← Newer</Link>}{page * PAGE < total && <Link className={btnGhost} href={link(page + 1)}>Older →</Link>}</span></div>
      </Card>
    </div>
  );
}
