import nodemailer from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}
export interface MailTransport {
  name: string;
  send(m: MailMessage): Promise<void>;
}

export type MailMode = "off" | "log" | "smtp";

export interface MailConfig {
  mode: MailMode;
  from: string;
  redirectTo: string | null;
  smtp: { host: string; port: number; secure: boolean; user: string | null } | null; // never contains the password
  /** Reasons the configured mode cannot send right now. */
  problems: string[];
}

type Env = Record<string, string | undefined>;

/**
 * EMAIL_MODE: "smtp" sends for real, "log" pretends (nothing leaves the machine), "off" holds everything in the queue.
 * Defaults: production → smtp when SMTP_HOST is set, otherwise off; anywhere else → log.
 * Safety: outside production, real SMTP is refused unless every message is redirected to EMAIL_REDIRECT_TO
 * (or EMAIL_ALLOW_REAL_RECIPIENTS=true) — a development machine must never email real students by accident.
 */
export function mailConfig(env: Env = process.env): MailConfig {
  const prod = env.NODE_ENV === "production";
  const asked = (env.EMAIL_MODE ?? "").toLowerCase();
  const mode: MailMode = asked === "smtp" || asked === "log" || asked === "off" ? asked : prod ? (env.SMTP_HOST ? "smtp" : "off") : "log";
  const problems: string[] = [];
  const redirectTo = env.EMAIL_REDIRECT_TO?.trim() || null;
  const from = env.EMAIL_FROM?.trim() || "DSU Registration <no-reply@dsu.edu.pk>";
  let smtp: MailConfig["smtp"] = null;

  if (mode === "smtp") {
    if (!env.SMTP_HOST) problems.push("SMTP_HOST is not set.");
    else {
      const port = Number(env.SMTP_PORT ?? 587);
      smtp = { host: env.SMTP_HOST, port: Number.isFinite(port) ? port : 587, secure: env.SMTP_SECURE === "true" || port === 465, user: env.SMTP_USER?.trim() || null };
    }
    if (!prod && !redirectTo && env.EMAIL_ALLOW_REAL_RECIPIENTS !== "true")
      problems.push("Real SMTP is blocked outside production unless EMAIL_REDIRECT_TO is set (protects real students from test mail).");
  }
  if (mode === "off") problems.push("Email is switched off (EMAIL_MODE=off or SMTP not configured): messages stay queued.");
  return { mode, from, redirectTo, smtp, problems };
}

/** Applies EMAIL_REDIRECT_TO: everything goes to the test address, clearly marked with the original recipient. */
export function applyRedirect(m: MailMessage, redirectTo: string | null): MailMessage {
  if (!redirectTo) return m;
  const note = `[Redirected test copy — originally for ${m.to}]`;
  return { to: redirectTo, subject: `[TEST → ${m.to}] ${m.subject}`, text: `${note}\n\n${m.text}`, html: `<p style="color:#b45309"><b>${note.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</b></p>${m.html}` };
}

export function createTransport(cfg: MailConfig, env: Env = process.env): MailTransport {
  if (cfg.mode === "smtp" && cfg.smtp && !cfg.problems.length) {
    const t = nodemailer.createTransport({
      host: cfg.smtp.host,
      port: cfg.smtp.port,
      secure: cfg.smtp.secure,
      requireTLS: !cfg.smtp.secure,
      auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: env.SMTP_PASS ?? "" } : undefined,
      tls: { minVersion: "TLSv1.2" },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    return {
      name: cfg.redirectTo ? "redirect-smtp" : "smtp",
      async send(m) {
        const out = applyRedirect(m, cfg.redirectTo);
        await t.sendMail({ from: cfg.from, to: out.to, subject: out.subject, text: out.text, html: out.html, headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" } });
      },
    };
  }
  // "log": nothing leaves the machine
  return { name: "log", async send() {} };
}
