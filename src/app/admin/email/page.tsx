import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { mailConfig } from "@/lib/mail/transport";
import { Badge, Card, Notice, Stat, btnGhost, td, th } from "@/components/ui";
import { RetryAllButton, TestEmailForm } from "@/components/EmailTools";
import { retryOneAction } from "./actions";

const TONE: Record<string, string> = { QUEUED: "amber", SENDING: "blue", RETRYING: "amber", SENT: "green", FAILED: "red" };

export default async function EmailPage({ searchParams }: PageProps<"/admin/email">) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const status = typeof sp.status === "string" && TONE[sp.status] ? sp.status : undefined;
  const cfg = mailConfig();
  const [counts, rows] = await Promise.all([
    db.notification.groupBy({ by: ["status"], _count: { _all: true } }),
    db.notification.findMany({ where: status ? { status } : {}, orderBy: { id: "desc" }, take: 100 }),
  ]);
  const n = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  return (
    <div className="space-y-6">
      <div><Link href="/admin" className="text-sm text-slate-500 hover:underline">← Admin</Link><h1 className="text-xl font-semibold">Student emails</h1><p className="text-sm text-slate-500">Every committed registration change queues an email to <span className="font-mono">&lt;RegistrationID&gt;@dsu.edu.pk</span>. Sending is separate from registering — a mail problem never affects a registration.</p></div>

      <Card title="Delivery" right={<Badge tone={cfg.mode === "smtp" && !cfg.problems.length ? "green" : cfg.mode === "log" ? "blue" : "amber"}>{cfg.mode === "smtp" && !cfg.problems.length ? (cfg.redirectTo ? "sending (redirected to test address)" : "sending") : cfg.mode === "log" ? "log only" : cfg.mode === "off" ? "off — messages held" : "blocked"}</Badge>}>
        <dl className="grid gap-x-8 gap-y-1 text-sm md:grid-cols-2">
          <div className="flex justify-between"><dt className="text-slate-500">Mode</dt><dd className="font-mono">{cfg.mode}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">From</dt><dd>{cfg.from}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">SMTP server</dt><dd className="font-mono">{cfg.smtp ? `${cfg.smtp.host}:${cfg.smtp.port}${cfg.smtp.secure ? " (TLS)" : " (STARTTLS)"}` : "—"}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">SMTP user</dt><dd className="font-mono">{cfg.smtp?.user ?? "—"}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Redirect all mail to</dt><dd>{cfg.redirectTo ?? "— (real recipients)"}</dd></div>
        </dl>
        {cfg.problems.map((p) => <div key={p} className="mt-3"><Notice tone={cfg.mode === "log" ? "blue" : "amber"}>{p}</Notice></div>)}
        {cfg.mode === "log" && <div className="mt-3"><Notice tone="blue"><b>Log-only mode:</b> messages are marked as sent but nothing leaves this machine. Set the SMTP variables on the server (see the Admin runbook) to send for real.</Notice></div>}
        <p className="mt-3 text-xs text-slate-500">These settings live in the server&apos;s environment file, not in the app, so the SMTP password is never stored in the database or shown here.</p>
        <div className="mt-4 max-w-xl"><TestEmailForm /></div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Queued" value={n("QUEUED")} /><Stat label="Retrying" value={n("RETRYING")} tone={n("RETRYING") ? "amber" : undefined} /><Stat label="Sent" value={n("SENT")} /><Stat label="Failed" value={n("FAILED")} tone={n("FAILED") ? "red" : undefined} /><Stat label="Total" value={counts.reduce((a, c) => a + c._count._all, 0)} />
      </div>

      <Card title="Outbox" right={<div className="flex items-center gap-2 text-sm">{["", "QUEUED", "RETRYING", "SENT", "FAILED"].map((s) => <Link key={s} href={s ? `/admin/email?status=${s}` : "/admin/email"} className={`rounded-md px-2 py-1 ${status === (s || undefined) ? "bg-slate-200 font-medium" : "text-slate-600 hover:bg-slate-100"}`}>{s ? s.toLowerCase() : "all"}</Link>)}</div>}>
        <div className="mb-3"><RetryAllButton failed={n("FAILED")} /></div>
        <div className="-mx-5 overflow-x-auto"><table className="w-full"><thead><tr><th className={th}>When</th><th className={th}>Student</th><th className={th}>Event</th><th className={th}>To</th><th className={th}>Status</th><th className={th}>Tries</th><th className={th}></th></tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map((r) => (
            <tr key={r.id}>
              <td className={`${td} whitespace-nowrap`}>{r.createdAt.toLocaleString()}</td>
              <td className={`${td} font-mono`}><Link className="text-brand hover:underline" href={`/students/${r.studentId}?tab=notifications`}>{r.studentRegId}</Link></td>
              <td className={td}>{r.eventType.replace("ENROLLMENT_", "").toLowerCase()}<details className="mt-1 text-xs"><summary className="cursor-pointer text-slate-500">preview</summary><pre className="mt-1 max-w-md whitespace-pre-wrap rounded bg-slate-50 p-2 font-sans text-slate-700">{r.subject}{"\n\n"}{r.textBody}</pre></details></td>
              <td className={td}>{r.toEmail}</td>
              <td className={td}><Badge tone={TONE[r.status]}>{r.status.toLowerCase()}</Badge>{r.lastError && r.status !== "SENT" && <div className="mt-1 max-w-xs break-words text-xs text-rose-700">{r.lastError}</div>}{r.status === "SENT" && <div className="mt-1 text-xs text-slate-500">{r.sentAt?.toLocaleString()} · {r.transport}</div>}{r.status === "RETRYING" && <div className="mt-1 text-xs text-slate-500">next try {r.nextAttemptAt.toLocaleTimeString()}</div>}</td>
              <td className={td}>{r.attempts}</td>
              <td className={td}>{(r.status === "FAILED" || r.status === "RETRYING") && <form action={retryOneAction}><input type="hidden" name="id" value={r.id} /><button className={btnGhost}>Retry now</button></form>}</td>
            </tr>))}
            {!rows.length && <tr><td colSpan={7} className={`${td} py-8 text-center text-slate-500`}>No messages yet — they appear here when a registration is finalized or changed.</td></tr>}</tbody></table></div>
      </Card>
    </div>
  );
}
