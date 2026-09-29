import { db } from "./db";
import { DEFAULT_SETTINGS, type Settings } from "./rules/types";

export async function getSettings(): Promise<Settings> {
  const rows = await db.setting.findMany();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = JSON.parse(r.value);
  return out as unknown as Settings;
}

export async function saveSetting(key: keyof Settings, value: number | null) {
  await db.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
}
