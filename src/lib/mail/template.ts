export interface MailCourse {
  courseCode: string;
  courseName: string;
  section: string;
  cbaCode: string;
  ch: number;
}

export interface EnrollmentEmailInput {
  studentName: string;
  registrationId: string;
  semesterName: string;
  version: number;
  at: Date;
  prevItems: MailCourse[]; // empty for the first version
  items: MailCourse[]; // the registration as it now stands
  /** The advisor responsible for this registration — replies reach them. */
  advisor?: { name: string; email: string } | null;
}

export type EnrollmentEvent = "ENROLLMENT_FINALIZED" | "ENROLLMENT_CHANGED";

export interface BuiltEmail {
  event: EnrollmentEvent;
  subject: string;
  text: string;
  html: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/** Names come from uploaded PDFs: keep them single-line and free of control characters (also protects the subject header). */
const clean = (s: string) => s.replace(/[\r\n\u0000-\u001f]+/g, " ").trim();
const when = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(d) + " (Pakistan time)";
const key = (c: MailCourse) => c.courseName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + (/L$/.test(c.courseCode) ? "#lab" : "");

export function diffCourses(prev: MailCourse[], items: MailCourse[]) {
  const pm = new Map(prev.map((c) => [key(c), c]));
  const im = new Map(items.map((c) => [key(c), c]));
  return {
    added: items.filter((c) => !pm.has(key(c))),
    removed: prev.filter((c) => !im.has(key(c))),
    sectionChanged: items.flatMap((c) => { const p = pm.get(key(c)); return p && p.section !== c.section ? [{ course: c, from: p.section }] : []; }),
  };
}

const line = (c: MailCourse) => `${c.courseCode}  ${c.courseName}  —  section ${c.section}, CBA ${c.cbaCode}, ${c.ch} CH`;

export function buildEnrollmentEmail(input: EnrollmentEmailInput): BuiltEmail {
  const name = clean(input.studentName), sem = clean(input.semesterName), reg = clean(input.registrationId);
  const first = input.prevItems.length === 0;
  const event: EnrollmentEvent = first ? "ENROLLMENT_FINALIZED" : "ENROLLMENT_CHANGED";
  const d = diffCourses(input.prevItems, input.items);
  const total = input.items.reduce((a, c) => a + c.ch, 0);
  const prevTotal = input.prevItems.reduce((a, c) => a + c.ch, 0);
  const subject = first ? `Course registration confirmed — ${sem} (${reg})` : `Course registration updated — ${sem}, version ${input.version} (${reg})`;

  const T: string[] = [`Dear ${name},`, "", first ? `Your course registration for ${sem} has been confirmed.` : `Your course registration for ${sem} has been updated.`, "",
    `Registration ID:  ${reg}`, `Semester:         ${sem}`, `Date and time:    ${when(input.at)}`, `Version:          ${input.version}`, `Status:           Finalized`, ""];
  if (!first) {
    T.push("WHAT CHANGED");
    if (d.added.length) T.push("Added:", ...d.added.map((c) => `  + ${line(c)}`));
    if (d.removed.length) T.push("Removed:", ...d.removed.map((c) => `  - ${line(c)}`));
    if (d.sectionChanged.length) T.push("Section changes:", ...d.sectionChanged.map((x) => `  ~ ${x.course.courseName}: ${x.from} → ${x.course.section}`));
    if (total !== prevTotal) T.push(`Credit hours: ${prevTotal} → ${total}`);
    if (!d.added.length && !d.removed.length && !d.sectionChanged.length) T.push("  (no course changes)");
    T.push("");
  }
  T.push("YOUR CURRENT COURSES", ...input.items.map((c) => `  ${line(c)}`), "", `Total registered credit hours: ${total}`, "",
    ...(input.advisor
      ? [`If anything here looks wrong, or you have a question, just reply to this email — it goes to your academic advisor, ${clean(input.advisor.name)} (${clean(input.advisor.email)}).`]
      : ["If anything here looks wrong, please contact your academic advisor.", "This is an automated message — please do not reply."]),
    "", "DHA Suffa University");

  const li = (c: MailCourse) => `<li><b>${esc(c.courseCode)}</b> ${esc(c.courseName)} — section ${esc(c.section)}, CBA ${esc(c.cbaCode)}, ${c.ch} CH</li>`;
  const changed = first ? "" : `<h3 style="margin:18px 0 6px;font-size:15px">What changed</h3>${d.added.length ? `<p style="margin:4px 0"><b>Added</b></p><ul>${d.added.map(li).join("")}</ul>` : ""}${d.removed.length ? `<p style="margin:4px 0"><b>Removed</b></p><ul>${d.removed.map(li).join("")}</ul>` : ""}${d.sectionChanged.length ? `<p style="margin:4px 0"><b>Section changes</b></p><ul>${d.sectionChanged.map((x) => `<li>${esc(x.course.courseName)}: ${esc(x.from)} → <b>${esc(x.course.section)}</b></li>`).join("")}</ul>` : ""}${total !== prevTotal ? `<p style="margin:4px 0">Credit hours: ${prevTotal} → <b>${total}</b></p>` : ""}${!d.added.length && !d.removed.length && !d.sectionChanged.length ? "<p>No course changes.</p>" : ""}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#16202a;max-width:640px"><p>Dear ${esc(name)},</p><p>Your course registration for <b>${esc(sem)}</b> has been ${first ? "confirmed" : "updated"}.</p>
<table style="border-collapse:collapse;font-size:14px"><tr><td style="padding:2px 14px 2px 0;color:#5b6770">Registration ID</td><td>${esc(reg)}</td></tr><tr><td style="padding:2px 14px 2px 0;color:#5b6770">Semester</td><td>${esc(sem)}</td></tr><tr><td style="padding:2px 14px 2px 0;color:#5b6770">Date and time</td><td>${esc(when(input.at))}</td></tr><tr><td style="padding:2px 14px 2px 0;color:#5b6770">Version</td><td>${input.version}</td></tr><tr><td style="padding:2px 14px 2px 0;color:#5b6770">Status</td><td>Finalized</td></tr></table>
${changed}<h3 style="margin:18px 0 6px;font-size:15px">Your current courses</h3><ul>${input.items.map(li).join("")}</ul><p><b>Total registered credit hours: ${total}</b></p>
<p style="color:#5b6770">${input.advisor ? `If anything here looks wrong, or you have a question, just reply to this email — it goes to your academic advisor, <b>${esc(clean(input.advisor.name))}</b> (${esc(clean(input.advisor.email))}).` : "If anything here looks wrong, please contact your academic advisor. This is an automated message — please do not reply."}</p><p>DHA Suffa University</p></div>`;
  return { event, subject, text: T.join("\n"), html };
}
