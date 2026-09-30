// Dev check for the e-mail queue with fake transports. Run on a COPY of the DB after scripts/flow-check.ts (with EMAIL_MODE=off).
import { PrismaClient } from "@prisma/client";
import { enqueueEnrollmentEmail, processDue, retryAllFailed, retryNotification, backoffMs, MAX_ATTEMPTS } from "../src/lib/mail/queue";
import type { MailConfig, MailMessage, MailTransport } from "../src/lib/mail/transport";

const db = new PrismaClient();
const ok = (c: boolean, m: string) => console.log(c ? "✔" : "✖", m);
const cfg = (mode: MailConfig["mode"]): MailConfig => ({ mode, from: "x@dsu.edu.pk", redirectTo: null, defaultReplyTo: null, smtp: null, problems: [] });
const sent: MailMessage[] = [];
const good: MailTransport = { name: "fake-ok", async send(m) { sent.push(m); } };
const bad: MailTransport = { name: "fake-down", async send() { throw new Error("connect ECONNREFUSED smtp.dsu.edu.pk:587 password=hunter2"); } };

(async () => {
  const rows = await db.notification.findMany({ orderBy: { id: "asc" } });
  ok(rows.length === 2 && rows.every((n) => n.status === "QUEUED"), `finalizing v1 and v2 queued ${rows.length} notifications (nothing sent yet)`);
  ok(rows[0].eventType === "ENROLLMENT_FINALIZED" && rows[1].eventType === "ENROLLMENT_CHANGED", "v1 = ENROLLMENT_FINALIZED, v2 = ENROLLMENT_CHANGED");
  ok(rows.every((n) => n.toEmail === "se251093@dsu.edu.pk"), "addressed to <RegistrationID>@dsu.edu.pk");
  ok(rows[0].idempotencyKey.endsWith(":1:ENROLLMENT_FINALIZED"), `idempotency key ${rows[0].idempotencyKey}`);

  const adv = await db.user.findFirstOrThrow({ where: { role: "ADVISOR" } });
  ok(rows.every((n) => n.replyTo === adv.email), `Reply-To captured from the advisor who committed the registration (${rows[0].replyTo})`);
  ok(rows[0].textBody.includes(adv.name) && rows[0].textBody.includes("just reply to this email"), "the email names the advisor and invites a reply");

  // idempotency: enqueueing the same version again does nothing
  const reg =await db.registration.findFirstOrThrow({ include: { versions: { orderBy: { version: "asc" } }, student: true, semester: true } });
  const v1 = reg.versions[0];
  await db.$transaction((tx) => enqueueEnrollmentEmail(tx, { student: reg.student, semester: reg.semester, versionId: v1.id, version: 1, prevItems: [], items: JSON.parse(v1.items), at: new Date() }));
  ok((await db.notification.count()) === 2, "re-enqueueing the same version created no duplicate");

  // mode off: nothing is attempted
  const off = await processDue({ transport: good, cfg: cfg("off") });
  ok(off.sent === 0 && off.held === 2 && sent.length === 0, "mode OFF holds both messages in the queue");

  // SMTP down: retry with backoff
  const t0 = new Date("2026-10-01T09:00:00Z");
  let st = await processDue({ transport: bad, cfg: cfg("smtp"), now: t0 });
  let n1 = await db.notification.findFirstOrThrow({ orderBy: { id: "asc" } });
  ok(st.retrying === 2 && n1.status === "RETRYING" && n1.attempts === 1, "SMTP down → RETRYING, attempt 1");
  ok(!/hunter2/.test(n1.lastError ?? "") && /ECONNREFUSED/.test(n1.lastError ?? ""), `error recorded without the password: "${n1.lastError}"`);
  ok(n1.nextAttemptAt.getTime() === t0.getTime() + backoffMs(1), "next attempt scheduled +1 minute");
  st = await processDue({ transport: good, cfg: cfg("smtp"), now: new Date(t0.getTime() + 30_000) });
  ok(st.sent === 0 && sent.length === 0, "not retried before its time");

  // keep failing until it gives up
  let now = t0;
  for (let a = 2; a <= MAX_ATTEMPTS; a++) { now = new Date(now.getTime() + backoffMs(a - 1) + 1000); await processDue({ transport: bad, cfg: cfg("smtp"), now }); }
  n1 = await db.notification.findFirstOrThrow({ orderBy: { id: "asc" } });
  ok(n1.status === "FAILED" && n1.attempts === MAX_ATTEMPTS, `after ${MAX_ATTEMPTS} attempts → FAILED`);
  ok((await db.auditLog.count({ where: { action: "NOTIFICATION_FAILED" } })) === 2, "each permanent failure is audit-logged");
  const reg2 = await db.registration.findFirstOrThrow();
  ok(reg2.status === "FINALIZED" && reg2.version === 2, "the registration itself is untouched by mail failures");

  // admin retry → delivered
  const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  ok(await retryNotification(admin.id, n1.id), "Admin retry re-queues a failed message");
  st = await processDue({ transport: good, cfg: cfg("smtp"), now: new Date(now.getTime() + 5000) });
  n1 = await db.notification.findFirstOrThrow({ orderBy: { id: "asc" } });
  ok(st.sent === 1 && n1.status === "SENT" && n1.transport === "fake-ok" && !!n1.sentAt, "retry succeeds → SENT (transport + time recorded)");
  ok(sent.length === 1 && sent[0].to === "se251093@dsu.edu.pk" && sent[0].replyTo === adv.email && /confirmed/.test(sent[0].subject), `delivered: "${sent[0].subject}"`);
  ok((await retryAllFailed(admin.id)) === 1, "retry-all picks up the other failed message");
  st = await processDue({ transport: good, cfg: cfg("smtp"), now: new Date(now.getTime() + 10_000) });
  ok(st.sent === 1 && (await db.notification.count({ where: { status: "SENT" } })) === 2, "both messages are now SENT");

  // two workers at once: only one runs
  await db.notification.updateMany({ data: { status: "QUEUED", nextAttemptAt: new Date(0) } });
  const slow: MailTransport = { name: "slow", async send(m) { await new Promise((r) => setTimeout(r, 200)); sent.push(m); } };
  const before = sent.length;
  const [a, b] = await Promise.all([processDue({ transport: slow, cfg: cfg("smtp") }), processDue({ transport: slow, cfg: cfg("smtp") })]);
  ok(sent.length - before === 2 && a.sent + b.sent === 2, "two simultaneous workers still send each message exactly once");

  // crash recovery: a row stuck in SENDING is picked up again
  const stuck = await db.notification.findFirstOrThrow();
  await db.notification.update({ where: { id: stuck.id }, data: { status: "SENDING", nextAttemptAt: new Date(Date.now() - 10 * 60_000) } });
  st = await processDue({ transport: good, cfg: cfg("smtp") });
  ok(st.sent === 1, "a message stuck in SENDING (server crashed) is recovered and sent");
  await db.$disconnect();
})();
