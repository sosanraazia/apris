import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { audit } from "../services/audit";
import { studentEmail } from "../studentEmail";
import { buildEnrollmentEmail, type MailCourse } from "./template";
import { createTransport, mailConfig, type MailConfig, type MailTransport } from "./transport";

export const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
/** Delay before the next try after `attemptsMade` failed attempts: 1 min, 5 min, 15 min, 1 h, 6 h. */
export const backoffMs = (attemptsMade: number) => BACKOFF_MS[Math.min(Math.max(attemptsMade, 1), BACKOFF_MS.length) - 1];

const STUCK_MS = 5 * 60_000;
const safeError = (e: unknown) => String((e as Error)?.message ?? e).replace(/(pass(word)?|auth|token)[=:]\s*\S+/gi, "$1=…").slice(0, 300);

interface EnqueueArgs {
  /** The recipient is always derived from registrationId (<RegistrationID>@dsu.edu.pk); any stored address is ignored. */
  student: { id: number; registrationId: string; name: string; email?: string };
  semester: { id: number; name: string };
  versionId: number;
  version: number;
  prevItems: MailCourse[];
  items: MailCourse[];
  at: Date;
  /** Advisor responsible for replies (committed the registration, else the student's assigned advisor). */
  advisor?: { name: string; email: string } | null;
  /** Fallback Reply-To when there is no advisor (EMAIL_DEFAULT_REPLY_TO). */
  defaultReplyTo?: string | null;
}

/**
 * Called inside the same transaction that commits a registration version, so a committed change always has its
 * notification — and a later mail failure can never undo the registration. Idempotent per student+semester+version+event.
 */
export async function enqueueEnrollmentEmail(tx: Prisma.TransactionClient, a: EnqueueArgs) {
  const built = buildEnrollmentEmail({ studentName: a.student.name, registrationId: a.student.registrationId, semesterName: a.semester.name, version: a.version, at: a.at, prevItems: a.prevItems, items: a.items, advisor: a.advisor });
  const idempotencyKey = `${a.student.id}:${a.semester.id}:${a.version}:${built.event}`;
  const existing = await tx.notification.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;
  return tx.notification.create({
    data: { idempotencyKey, studentId: a.student.id, studentRegId: a.student.registrationId, semesterId: a.semester.id, versionId: a.versionId, eventType: built.event, toEmail: studentEmail(a.student.registrationId), replyTo: a.advisor?.email ?? a.defaultReplyTo ?? null, subject: built.subject, textBody: built.text, htmlBody: built.html },
  });
}

export interface ProcessStats { sent: number; retrying: number; failed: number; held: number }
let running = false;

/** Sends everything that is due. Safe to call from several places: overlapping runs are skipped, rows are claimed atomically. */
export async function processDue(opts: { transport?: MailTransport; cfg?: MailConfig; now?: Date; limit?: number } = {}): Promise<ProcessStats> {
  const stats: ProcessStats = { sent: 0, retrying: 0, failed: 0, held: 0 };
  if (running) return stats;
  running = true;
  try {
    const cfg = opts.cfg ?? mailConfig();
    const now = opts.now ?? new Date();
    // rows left "SENDING" by a crashed process go back into the queue
    await db.notification.updateMany({ where: { status: "SENDING", nextAttemptAt: { lt: new Date(now.getTime() - STUCK_MS) } }, data: { status: "RETRYING" } });
    if (cfg.mode === "off") { stats.held = await db.notification.count({ where: { status: { in: ["QUEUED", "RETRYING"] } } }); return stats; }

    const transport = opts.transport ?? createTransport(cfg);
    const due = await db.notification.findMany({ where: { status: { in: ["QUEUED", "RETRYING"] }, nextAttemptAt: { lte: now } }, orderBy: { id: "asc" }, take: opts.limit ?? 25 });
    for (const n of due) {
      const claimed = await db.notification.updateMany({ where: { id: n.id, status: { in: ["QUEUED", "RETRYING"] } }, data: { status: "SENDING", nextAttemptAt: now } });
      if (claimed.count !== 1) continue; // another worker got it
      const attempts = n.attempts + 1;
      try {
        if (cfg.problems.length && cfg.mode === "smtp") throw new Error(cfg.problems[0]);
        await transport.send({ to: n.toEmail, replyTo: n.replyTo ?? undefined, subject: n.subject, text: n.textBody, html: n.htmlBody });
        await db.notification.update({ where: { id: n.id }, data: { status: "SENT", attempts, sentAt: new Date(), transport: transport.name, lastError: null } });
        await audit({ action: "NOTIFICATION_SENT", studentRegId: n.studentRegId, reason: `${n.eventType} → ${n.toEmail} via ${transport.name}` });
        stats.sent++;
      } catch (e) {
        const lastError = safeError(e);
        if (attempts >= MAX_ATTEMPTS) {
          await db.notification.update({ where: { id: n.id }, data: { status: "FAILED", attempts, lastError } });
          await audit({ action: "NOTIFICATION_FAILED", studentRegId: n.studentRegId, reason: `${n.eventType} → ${n.toEmail}: ${lastError}` });
          stats.failed++;
        } else {
          await db.notification.update({ where: { id: n.id }, data: { status: "RETRYING", attempts, lastError, nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)) } });
          stats.retrying++;
        }
      }
    }
    return stats;
  } finally {
    running = false;
  }
}

export async function retryNotification(userId: number, id: number) {
  const n = await db.notification.findUnique({ where: { id } });
  if (!n || !["FAILED", "RETRYING"].includes(n.status)) return false;
  await db.notification.update({ where: { id }, data: { status: "QUEUED", attempts: 0, nextAttemptAt: new Date() } });
  await audit({ userId, action: "NOTIFICATION_RETRY", studentRegId: n.studentRegId, reason: `${n.eventType} → ${n.toEmail}` });
  return true;
}

export async function retryAllFailed(userId: number) {
  const failed = await db.notification.findMany({ where: { status: "FAILED" }, select: { id: true } });
  for (const f of failed) await retryNotification(userId, f.id);
  return failed.length;
}

/** Sends one message straight through the configured transport (not queued) so an Admin can verify the SMTP settings. */
export async function sendTestEmail(userId: number, to: string) {
  if (!/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(to) || to.length > 120) return { ok: false as const, error: "Enter a valid email address." };
  const cfg = mailConfig();
  if (cfg.mode === "off") return { ok: false as const, error: cfg.problems[0] };
  if (cfg.mode === "smtp" && cfg.problems.length) return { ok: false as const, error: cfg.problems[0] };
  const transport = createTransport(cfg);
  try {
    await transport.send({ to, subject: "APRIS test email", text: "This is a test message from APRIS. If you can read it, outgoing email works.", html: "<p>This is a test message from <b>APRIS</b>. If you can read it, outgoing email works.</p>" });
    await audit({ userId, action: "EMAIL_TEST_SENT", reason: `${to} via ${transport.name}` });
    return { ok: true as const, transport: transport.name };
  } catch (e) {
    return { ok: false as const, error: safeError(e) };
  }
}
