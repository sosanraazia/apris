import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Slip } from "./slips";

/** Standard PDF fonts only cover Latin-1: replace anything else so a stray character can never break the whole file. */
export function pdfSafe(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/→/g, "->")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

const W = 595.28, H = 841.89, M = 48;
const INK = rgb(0.09, 0.13, 0.16), MUTED = rgb(0.36, 0.42, 0.44), TEAL = rgb(0.06, 0.3, 0.36), LINE = rgb(0.8, 0.84, 0.86), BAND = rgb(0.94, 0.96, 0.97);
const PROGRAM: Record<string, string> = { SE: "BS Software Engineering", CYS: "BS Cyber Security" };

function fit(font: PDFFont, text: string, size: number, maxWidth: number): string {
  let t = pdfSafe(text);
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + "...", size) > maxWidth) t = t.slice(0, -1);
  return t + "...";
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of pdfSafe(text).split(" ")) {
    const next = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && cur) { lines.push(cur); cur = word; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** One page per student (more only if a registration is unusually long), all in a single PDF. */
export async function buildSlipsPdf(slips: Slip[], meta: { semester: string; generatedAt: Date }): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Course registration slips - ${meta.semester}`);
  pdf.setProducer("APRIS");
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const stamp = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(meta.generatedAt);
  const cols = [{ x: M, w: 70, h: "Course code" }, { x: M + 70, w: 268, h: "Course" }, { x: M + 338, w: 62, h: "Section" }, { x: M + 400, w: 56, h: "CBA" }, { x: M + 456, w: 43, h: "CH" }];

  const header = (page: PDFPage, s: Slip, continued: boolean): number => {
    page.drawText("DHA SUFFA UNIVERSITY", { x: M, y: H - 52, size: 11, font: bold, color: TEAL });
    page.drawText(pdfSafe(`Course registration slip - ${meta.semester}`), { x: M, y: H - 70, size: 15, font: bold, color: INK });
    page.drawLine({ start: { x: M, y: H - 80 }, end: { x: W - M, y: H - 80 }, thickness: 1.2, color: TEAL });
    const suffix = continued ? " (continued)" : ""; // shorten only the name, so the "continued" marker is never cut off
    page.drawText(fit(bold, s.name, 17, W - 2 * M - bold.widthOfTextAtSize(suffix, 17)) + suffix, { x: M, y: H - 108, size: 17, font: bold, color: INK });
    const facts: [string, string][] = [
      ["Registration ID", s.registrationId], ["Program", PROGRAM[s.program] ?? s.program], ["Home section", s.homeSection ?? "not set"],
      ["Advisor", s.advisor ?? "not assigned"], ["Registration version", `${s.version}  (${s.status.toLowerCase()})`],
    ];
    facts.forEach(([k, v], i) => {
      const y = H - 132 - i * 16;
      page.drawText(k, { x: M, y, size: 9.5, font: reg, color: MUTED });
      page.drawText(fit(bold, v, 10.5, 330), { x: M + 120, y, size: 10.5, font: bold, color: INK });
    });
    return H - 132 - facts.length * 16 - 14;
  };
  const tableHead = (page: PDFPage, y: number) => {
    page.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: 20, color: TEAL });
    for (const c of cols) page.drawText(c.h, { x: c.x + 6, y: y + 1, size: 9.5, font: bold, color: rgb(1, 1, 1) });
    return y - 22;
  };

  for (const s of slips) {
    let page = pdf.addPage([W, H]);
    let y = tableHead(page, header(page, s, false));
    s.items.forEach((i, n) => {
      // a long course name wraps onto further lines instead of being cut off
      const nameLines = wrap(reg, i.courseName, 10, cols[1].w - 12);
      const rowH = Math.max(1, nameLines.length) * 12 + 6;
      if (y - rowH < 110) { page = pdf.addPage([W, H]); y = tableHead(page, header(page, s, true)); }
      if (n % 2 === 0) page.drawRectangle({ x: M, y: y - rowH + 13, width: W - 2 * M, height: rowH, color: BAND });
      page.drawText(fit(reg, i.courseCode, 10, cols[0].w - 8), { x: cols[0].x + 6, y, size: 10, font: reg, color: INK });
      nameLines.forEach((ln, k) => page.drawText(ln, { x: cols[1].x + 6, y: y - k * 12, size: 10, font: reg, color: INK }));
      page.drawText(fit(bold, i.section, 10, cols[2].w - 8), { x: cols[2].x + 6, y, size: 10, font: bold, color: INK });
      page.drawText(fit(reg, i.cbaCode, 10, cols[3].w - 8), { x: cols[3].x + 6, y, size: 10, font: reg, color: INK });
      page.drawText(String(i.ch), { x: cols[4].x + 6, y, size: 10, font: reg, color: INK });
      y -= rowH;
    });
    page.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.8, color: LINE });
    page.drawText(`${s.items.length} courses`, { x: M + 6, y: y - 8, size: 10, font: reg, color: MUTED });
    page.drawText(`Total credit hours: ${s.totalCH}`, { x: M + 338, y: y - 8, size: 10.5, font: bold, color: INK });
    wrap(reg, "This slip lists the courses and class sections recorded in APRIS for the registration version above. Please report any difference to your academic advisor.", 8.5, W - 2 * M).forEach((ln, k) => page.drawText(ln, { x: M, y: 80 - k * 11, size: 8.5, font: reg, color: MUTED }));
  }
  if (!slips.length) { const p = pdf.addPage([W, H]); p.drawText("No registrations.", { x: M, y: H - 100, size: 12, font: reg }); }

  const pages = pdf.getPages();
  pages.forEach((p, i) => p.drawText(pdfSafe(`APRIS  |  generated ${stamp}  |  page ${i + 1} of ${pages.length}`), { x: M, y: 40, size: 8, font: reg, color: MUTED }));
  return Buffer.from(await pdf.save());
}
