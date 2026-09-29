"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { saveSetting } from "@/lib/settings";
import { audit } from "@/lib/services/audit";
import type { Settings } from "@/lib/rules/types";

const NUMERIC: (keyof Settings)[] = ["fypThresholdCH", "minLoadCH", "regularMaxCH", "overloadMaxCH", "summerMaxCH", "minPassGradePoint"];
const NULLABLE: (keyof Settings)[] = ["probationMaxCH", "relegationMaxCH", "finalSemesterMaxCH"];

export async function saveSettingsAction(_: { ok?: string; error?: string } | undefined, form: FormData) {
  const s = await requireRole("ADMIN");
  const out: Partial<Record<keyof Settings, number | null>> = {};
  for (const k of NUMERIC) {
    const v = Number(form.get(k));
    if (!Number.isFinite(v) || v < 0 || v > 200) return { error: `${k}: enter a valid number` };
    out[k] = v;
  }
  for (const k of NULLABLE) {
    const raw = String(form.get(k) ?? "").trim();
    if (raw === "") out[k] = null;
    else {
      const v = Number(raw);
      if (!Number.isFinite(v) || v < 0 || v > 30) return { error: `${k}: enter a number or leave blank (not configured)` };
      out[k] = v;
    }
  }
  if ((out.minLoadCH as number) > (out.regularMaxCH as number) || (out.regularMaxCH as number) > (out.overloadMaxCH as number)) return { error: "Limits must satisfy minimum ≤ regular max ≤ overload max" };
  const before = Object.fromEntries((await db.setting.findMany()).map((r) => [r.key, JSON.parse(r.value)]));
  for (const [k, v] of Object.entries(out)) await saveSetting(k as keyof Settings, v as number | null);
  await audit({ userId: s.userId, action: "SETTINGS_CHANGED", before, after: out });
  revalidatePath("/admin");
  return { ok: "Settings saved." };
}

/** Recompute duplicate-CBA flags after an edit; keeps other (import-time) notes. */
async function refreshIssues(semesterId: number) {
  const rows = await db.offering.findMany({ where: { semesterId } });
  const byCba = new Map<string, typeof rows>();
  for (const r of rows) if (r.cbaCode) byCba.set(r.cbaCode, [...(byCba.get(r.cbaCode) ?? []), r]);
  for (const r of rows) {
    const keep = (JSON.parse(r.issues) as string[]).filter((i) => !i.startsWith("Duplicate CBA"));
    const group = r.cbaCode ? byCba.get(r.cbaCode)! : [];
    if (new Set(group.map((x) => x.courseCode + "|" + x.section)).size > 1) keep.push(`Duplicate CBA ${r.cbaCode} shared by ${group.map((x) => `${x.courseCode}/${x.section}`).join(", ")}`);
    if (JSON.stringify(keep) !== r.issues) await db.offering.update({ where: { id: r.id }, data: { issues: JSON.stringify(keep) } });
  }
}

export async function fixOfferingAction(form: FormData) {
  const s = await requireRole("ADMIN");
  const id = Number(form.get("id"));
  const cba = String(form.get("cbaCode") ?? "").trim();
  const section = String(form.get("section") ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (cba && !/^\d{4,8}$/.test(cba)) return;
  if (section && !/^[A-Z]{2,4}-\d[A-Z]$/.test(section)) return;
  const o = await db.offering.findUnique({ where: { id } });
  if (!o) return;
  await db.offering.update({ where: { id }, data: { cbaCode: cba || null, section: section || null } });
  await refreshIssues(o.semesterId);
  await audit({ userId: s.userId, action: "OFFERING_EDITED", before: { cba: o.cbaCode, section: o.section }, after: { cba: cba || null, section: section || null }, reason: `${o.courseCode} ${o.courseName}` });
  revalidatePath("/admin");
}

export async function setPhaseAction(_: { ok?: string; error?: string } | undefined, form: FormData) {
  const s = await requireRole("ADMIN");
  const phase = String(form.get("phase"));
  if (!["REGISTRATION", "ADD_DROP", "CLOSED"].includes(phase)) return { error: "Unknown phase" };
  const endsRaw = String(form.get("addDropEnds") ?? "");
  const ends = phase === "ADD_DROP" && endsRaw ? new Date(endsRaw + "T23:59:59") : null;
  if (ends && Number.isNaN(ends.getTime())) return { error: "Invalid end date" };
  const sem = await db.semester.findFirst({ where: { active: true } });
  if (!sem) return { error: "No active semester" };
  await db.semester.update({ where: { id: sem.id }, data: { phase, addDropEnds: ends } });
  await audit({ userId: s.userId, action: "SEMESTER_PHASE_CHANGED", before: { phase: sem.phase, ends: sem.addDropEnds }, after: { phase, ends }, reason: sem.name });
  revalidatePath("/", "layout");
  return { ok: `${sem.name} is now in the ${phase.replace("_", " / ").toLowerCase()} phase.` };
}
