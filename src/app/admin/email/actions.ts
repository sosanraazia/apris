"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { retryAllFailed, retryNotification, sendTestEmail } from "@/lib/mail/queue";
import { kickMailWorker } from "@/lib/mail/worker";

type R = { ok?: string; error?: string } | undefined;

export async function sendTestEmailAction(_: R, form: FormData): Promise<R> {
  const s = await requireRole("ADMIN");
  const r = await sendTestEmail(s.userId, String(form.get("to") ?? "").trim());
  return r.ok ? { ok: r.transport === "log" ? "Logged only — email mode is 'log', so nothing was actually sent." : `Test email sent via ${r.transport}. Check the inbox.` } : { error: r.error };
}

export async function retryOneAction(form: FormData) {
  const s = await requireRole("ADMIN");
  if (await retryNotification(s.userId, Number(form.get("id")))) kickMailWorker();
  revalidatePath("/admin/email");
}

export async function retryAllAction(): Promise<R> {
  const s = await requireRole("ADMIN");
  const n = await retryAllFailed(s.userId);
  if (n) kickMailWorker();
  revalidatePath("/admin/email");
  return { ok: n ? `${n} failed message(s) re-queued.` : "No failed messages." };
}
