import { db } from "../db";
import { DEFAULT_ELECTIVES, applySlotOverrides, classifyElectiveSlot, isElectiveSlotRow, keyOfTitle } from "../rules/electives";
import type { ElectiveCategory, ElectiveMapRow } from "../rules/types";

export async function loadElectiveMap(posCode: string): Promise<ElectiveMapRow[]> {
  const rows = await db.electiveMapping.findMany({ where: { posCode }, orderBy: [{ category: "asc" }, { slot: "asc" }] });
  return rows.map((r) => ({ category: r.category as ElectiveCategory, slot: r.slot, semester: r.semester, courseTitle: r.courseTitle, titleKey: r.titleKey }));
}

/** Fill in the department-announced assignments that are missing; never overwrites what an Admin has set. */
export async function seedDefaultElectives(client: Pick<typeof db, "electiveMapping"> = db): Promise<number> {
  let added = 0;
  for (const [posCode, rows] of Object.entries(DEFAULT_ELECTIVES))
    for (const r of rows) {
      const where = { posCode_category_slot: { posCode, category: r.category, slot: r.slot } };
      if (await client.electiveMapping.findUnique({ where })) continue;
      await client.electiveMapping.create({ data: { posCode, category: r.category, slot: r.slot, semester: r.semester, courseTitle: r.title, titleKey: r.title ? keyOfTitle(r.title) : null } });
      added++;
    }
  return added;
}

export async function setElectiveCourse(posCode: string, category: ElectiveCategory, slot: number, title: string | null) {
  const clean = title?.trim() || null;
  const data = { courseTitle: clean, titleKey: clean ? keyOfTitle(clean) : null };
  await db.electiveMapping.upsert({ where: { posCode_category_slot: { posCode, category, slot } }, create: { posCode, category, slot, ...data }, update: data });
}

export interface SlotView {
  posCode: string;
  category: ElectiveCategory;
  slot: number;
  semester: number | null;
  posRow: string | null; // the POS placeholder row this slot corresponds to, e.g. "SE Elective I (SE-XXXX)"
  courseTitle: string | null;
  offeredAs: string[]; // Fall offerings that match the assigned course
}

/** Every mapping row beside the POS placeholder it resolves to (or null when the stored POS has no such slot). */
export async function slotViews(offeredTitleKeys?: Map<string, string[]>): Promise<SlotView[]> {
  const [maps, posList] = await Promise.all([db.electiveMapping.findMany({ orderBy: [{ posCode: "asc" }, { category: "desc" }, { slot: "asc" }] }), db.pos.findMany({ where: { variant: "REGULAR" }, include: { courses: true } })]);
  return maps.map((m) => {
    const pos = posList.find((p) => p.posCode === m.posCode);
    const row = pos && applySlotOverrides(pos.posCode, pos.courses.map((c) => ({ semester: c.semester, code: c.code, title: c.title, ch: c.ch, isPlaceholder: c.isPlaceholder }))).filter((c) => isElectiveSlotRow(c.title, c.isPlaceholder) && !/ lab$/i.test(c.title)).find((c) => {
      const id = classifyElectiveSlot(c.title);
      return id && id.category === m.category && id.slot === m.slot;
    });
    return { posCode: m.posCode, category: m.category as ElectiveCategory, slot: m.slot, semester: row?.semester ?? m.semester, posRow: row ? `${row.title.replace(/\s+\d+$/, "")} (${row.code})` : null, courseTitle: m.courseTitle, offeredAs: m.titleKey ? (offeredTitleKeys?.get(m.titleKey) ?? []) : [] };
  });
}
