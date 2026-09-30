import { describe, it, expect } from "vitest";
import { buildEnrollmentEmail, diffCourses, type MailCourse } from "../src/lib/mail/template";
import { applyRedirect, mailConfig } from "../src/lib/mail/transport";
import { backoffMs, MAX_ATTEMPTS } from "../src/lib/mail/queue";

const c = (code: string, name: string, section: string, cba: string, ch: number): MailCourse => ({ courseCode: code, courseName: name, section, cbaCode: cba, ch });
const dsa = c("CS-2007", "Data Structures & Algorithms", "SE-3A", "17343", 3);
const dsaLab = c("CS-2007L", "Data Structures & Algorithms Lab", "SE-3A", "17347", 1);
const net = c("CS-2201", "Computer Networks", "SE-3A", "17350", 3);
const at = new Date("2026-09-30T12:59:00Z");

describe("enrollment e-mail content", () => {
  it("first version: confirmation with every registered course, section, CBA and the total", () => {
    const m = buildEnrollmentEmail({ studentName: "Kanchan Damicha", registrationId: "SE251093", semesterName: "Fall 2026", version: 1, at, prevItems: [], items: [dsa, dsaLab, net] });
    expect(m.event).toBe("ENROLLMENT_FINALIZED");
    expect(m.subject).toBe("Course registration confirmed — Fall 2026 (SE251093)");
    for (const s of ["Dear Kanchan Damicha", "SE251093", "Fall 2026", "Pakistan time", "CS-2007  Data Structures & Algorithms  —  section SE-3A, CBA 17343, 3 CH", "Total registered credit hours: 7", "Version:          1"]) expect(m.text).toContain(s);
    expect(m.text).not.toContain("WHAT CHANGED");
  });
  it("later versions: added / removed / section changes and the credit-hour change", () => {
    const m = buildEnrollmentEmail({ studentName: "K", registrationId: "SE251093", semesterName: "Fall 2026", version: 2, at, prevItems: [dsa, dsaLab, net], items: [{ ...dsa, section: "SE-3B", cbaCode: "17344" }, { ...dsaLab, section: "SE-3B", cbaCode: "17348" }, c("CS-2801", "Software Engineering", "SE-3A", "17358", 3)] });
    expect(m.event).toBe("ENROLLMENT_CHANGED");
    expect(m.subject).toContain("updated — Fall 2026, version 2");
    expect(m.text).toContain("Added:");
    expect(m.text).toContain("+ CS-2801  Software Engineering");
    expect(m.text).toContain("Removed:");
    expect(m.text).toContain("- CS-2201  Computer Networks");
    expect(m.text).toContain("Data Structures & Algorithms: SE-3A → SE-3B");
    expect(m.text).not.toContain("Credit hours:"); // 7 CH before and after → no credit-hour line
    const more = buildEnrollmentEmail({ studentName: "K", registrationId: "SE251093", semesterName: "Fall 2026", version: 3, at, prevItems: [dsa, dsaLab], items: [dsa, dsaLab, net] });
    expect(more.text).toContain("Credit hours: 4 → 7");
  });
  it("diffCourses matches courses by name (a re-coded course is a change of section, not a drop + add)", () => {
    const d = diffCourses([dsa], [{ ...dsa, courseCode: "SE-2001", section: "SE-3C" }]);
    expect(d.added).toHaveLength(0);
    expect(d.removed).toHaveLength(0);
    expect(d.sectionChanged).toHaveLength(1);
  });
  it("escapes HTML and keeps header injection out of the subject (names come from uploaded PDFs)", () => {
    const m = buildEnrollmentEmail({ studentName: 'Eve <script>alert(1)</script>\r\nBcc: attacker@evil.example', registrationId: "SE251093", semesterName: "Fall 2026", version: 1, at, prevItems: [], items: [dsa] });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.text.split("\n")[0]).not.toContain("\r");
  });
});

describe("delivery safety", () => {
  it("development never sends real mail by default", () => {
    expect(mailConfig({ NODE_ENV: "development" }).mode).toBe("log");
    expect(mailConfig({ NODE_ENV: "development", EMAIL_MODE: "smtp", SMTP_HOST: "smtp.dsu.edu.pk" }).problems.join(" ")).toMatch(/blocked outside production/);
  });
  it("…unless everything is redirected to a test address", () => {
    const cfg = mailConfig({ NODE_ENV: "development", EMAIL_MODE: "smtp", SMTP_HOST: "smtp.dsu.edu.pk", EMAIL_REDIRECT_TO: "me@dsu.edu.pk" });
    expect(cfg.problems).toEqual([]);
    const out = applyRedirect({ to: "se251093@dsu.edu.pk", subject: "Course registration confirmed", text: "body", html: "<p>body</p>" }, cfg.redirectTo);
    expect(out.to).toBe("me@dsu.edu.pk");
    expect(out.subject).toContain("[TEST → se251093@dsu.edu.pk]");
    expect(out.text).toContain("originally for se251093@dsu.edu.pk");
  });
  it("production: smtp when a host is configured, otherwise held (off) — never silently 'log'", () => {
    expect(mailConfig({ NODE_ENV: "production", SMTP_HOST: "smtp.dsu.edu.pk" }).mode).toBe("smtp");
    expect(mailConfig({ NODE_ENV: "production" }).mode).toBe("off");
    expect(mailConfig({ NODE_ENV: "production", EMAIL_MODE: "smtp" }).problems.join(" ")).toMatch(/SMTP_HOST is not set/);
  });
  it("the config object never carries the SMTP password", () => {
    const cfg = mailConfig({ NODE_ENV: "production", SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "hunter2-secret" });
    expect(JSON.stringify(cfg)).not.toContain("hunter2-secret");
  });
});

describe("retry schedule", () => {
  it("backs off 1 min, 5 min, 15 min, 1 h, 6 h and gives up after 5 attempts", () => {
    expect([1, 2, 3, 4, 5].map(backoffMs)).toEqual([60_000, 300_000, 900_000, 3_600_000, 21_600_000]);
    expect(backoffMs(99)).toBe(21_600_000);
    expect(MAX_ATTEMPTS).toBe(5);
  });
});
