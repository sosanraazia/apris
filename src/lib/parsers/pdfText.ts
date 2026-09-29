import { readFileSync } from "node:fs";

type Item = { str: string; x: number; y: number; w: number };

export interface PageText {
  /** Full-width lines (good for headers/footers). */
  flat: string[];
  /** Lines with multi-column semester layouts unwrapped column by column. */
  cols: string[];
}

const HEADER = /^(Semester \d+|(Fall|Spring|Summer) Semester)/;

function toLines(items: Item[]): string[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Item[][] = [];
  for (const it of sorted) {
    const row = rows.find((r) => Math.abs(r[0].y - it.y) < 2.5);
    if (row) row.push(it);
    else rows.push([it]);
  }
  return rows
    .sort((a, b) => b[0].y - a[0].y)
    .map((r) => {
      r.sort((a, b) => a.x - b.x);
      let s = "";
      let end = -1e9;
      for (const it of r) {
        if (s && it.x - end > 1) s += " ";
        s += it.str;
        end = it.x + it.w;
      }
      return s.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);
}

export async function pdfPages(input: Buffer | Uint8Array | string): Promise<PageText[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(typeof input === "string" ? readFileSync(input) : input);
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, verbosity: 0, disableFontFace: true }).promise;
  if (doc.numPages > 30) throw new Error("PDF has too many pages");
  const pages: PageText[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const items: Item[] = (tc.items as { str?: string; transform?: number[]; width?: number }[])
      .filter((i) => typeof i.str === "string" && i.str.trim() !== "" && i.transform)
      .map((i) => ({ str: i.str as string, x: i.transform![4], y: i.transform![5], w: i.width ?? 0 }));

    const xs = items.filter((i) => HEADER.test(i.str.trim())).map((i) => i.x).sort((a, b) => a - b);
    const bounds: number[] = [];
    for (const x of xs) if (!bounds.length || x - bounds[bounds.length - 1] > 30) bounds.push(x);

    let cols: string[];
    if (bounds.length < 2) cols = toLines(items);
    else {
      const buckets: Item[][] = bounds.map(() => []);
      for (const it of items) {
        let k = 0;
        for (let b = 0; b < bounds.length; b++) if (it.x >= bounds[b] - 4) k = b;
        buckets[k].push(it);
      }
      cols = buckets.flatMap(toLines);
    }
    pages.push({ flat: toLines(items), cols });
  }
  return pages;
}
