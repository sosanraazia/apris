import { courseKey, isLabCode, placeholderMatches, theoryKeyOf } from "./keys";
import type {
  AttemptRow,
  OfferingChoice,
  OfferingRow,
  PosCourseRow,
  PrereqRow,
  RecItem,
  Recommendation,
  Settings,
  StudentInput,
} from "./types";

export const isPass = (a: AttemptRow, s: Settings) => a.gradePoint >= s.minPassGradePoint && !/^(F|W|I)/i.test(a.grade);

export function targetSemesterOf(homeSection: string | null, attempts: AttemptRow[]): number | null {
  const m = homeSection?.match(/-(\d+)[A-Z]?$/i);
  if (m) return Number(m[1]);
  const terms = new Set(attempts.map((a) => a.term));
  return terms.size ? terms.size + 1 : null;
}

interface Slot extends PosCourseRow {
  key: string;
  idx: number;
  isLab: boolean;
  passed: boolean;
  failed: boolean;
  filledBy?: AttemptRow; // for placeholder slots
}

export interface PosProgressItem extends PosCourseRow {
  key: string;
  state: "COMPLETED" | "FAILED" | "PENDING" | "FUTURE";
  grade?: string;
}

/** Map transcript attempts onto POS rows. Codes are POS-version specific, titles are the cross-version fallback. */
function buildSlots(student: StudentInput, s: Settings) {
  const attempts = student.attempts;
  const used = new Set<AttemptRow>();
  const slots: Slot[] = student.pos.map((c, idx) => ({ ...c, idx, key: `${c.code}|${c.semester}|${idx}`, isLab: isLabCode(c.code), passed: false, failed: false }));

  for (const slot of slots.filter((x) => !x.isPlaceholder)) {
    const k = courseKey(slot.code, slot.title);
    const mine = attempts.filter((a) => a.code === slot.code || courseKey(a.code, a.title) === k);
    mine.forEach((a) => used.add(a));
    const passedAttempt = mine.find((a) => isPass(a, s));
    slot.passed = !!passedAttempt;
    slot.failed = !slot.passed && mine.length > 0;
    slot.filledBy = passedAttempt;
  }
  // leftover passed attempts fill elective placeholder slots by code pattern (each attempt only once)
  const leftovers = attempts.filter((a) => !used.has(a) && isPass(a, s)).sort((a, b) => a.termOrder - b.termOrder);
  for (const slot of slots.filter((x) => x.isPlaceholder)) {
    const a = leftovers.find((l) => !used.has(l) && isLabCode(l.code) === slot.isLab && placeholderMatches(slot.code, l.code));
    if (a) {
      used.add(a);
      slot.passed = true;
      slot.filledBy = a;
    }
  }
  return slots;
}

export function completedCHOf(attempts: AttemptRow[], s: Settings): number {
  const seen = new Map<string, number>();
  for (const a of attempts) if (isPass(a, s)) seen.set(courseKey(a.code, a.title) + "|" + a.code, a.ch);
  let total = 0;
  seen.forEach((ch) => (total += ch));
  return total;
}

export function posProgress(student: StudentInput, s: Settings): PosProgressItem[] {
  const target = targetSemesterOf(student.homeSection, student.attempts);
  return buildSlots(student, s).map((sl) => ({
    semester: sl.semester,
    code: sl.code,
    title: sl.title,
    ch: sl.ch,
    isPlaceholder: sl.isPlaceholder,
    key: sl.key,
    grade: sl.filledBy?.grade,
    state: sl.passed ? "COMPLETED" : sl.failed ? "FAILED" : target != null && sl.semester <= target ? "PENDING" : "FUTURE",
  }));
}

function prereqIndex(rows: PrereqRow[]) {
  const map = new Map<string, string[]>(); // course key → prerequisite keys
  for (const r of rows) {
    const c = courseKey("X-0000", r.course);
    const p = courseKey("X-0000", r.prerequisite);
    map.set(c, [...(map.get(c) ?? []), p]);
  }
  return map;
}

function toChoice(o: OfferingRow, student: StudentInput): OfferingChoice {
  const issues = [...o.issues];
  if (!o.cbaCode) issues.push("Missing CBA code");
  if (!o.section) issues.push("Missing section");
  return {
    offeringId: o.id,
    courseCode: o.courseCode,
    courseName: o.courseName,
    section: o.section,
    cbaCode: o.cbaCode,
    crossProgram: o.program !== student.program,
    exportable: !!o.cbaCode && !!o.section && !o.issues.some((i) => i.startsWith("Duplicate CBA")),
    issues,
  };
}

export function recommend(student: StudentInput, prereqRows: PrereqRow[], offerings: OfferingRow[], s: Settings): Recommendation {
  const warnings: string[] = [];
  const target = targetSemesterOf(student.homeSection, student.attempts);
  const slots = buildSlots(student, s);
  const completedCH = completedCHOf(student.attempts, s);
  const prereqs = prereqIndex(prereqRows);
  const passedKeys = new Set(slots.filter((x) => x.passed && !x.isPlaceholder).map((x) => courseKey(x.code, x.title)));
  student.attempts.filter((a) => isPass(a, s)).forEach((a) => passedKeys.add(courseKey(a.code, a.title)));
  const posKeys = new Set(slots.filter((x) => !x.isPlaceholder).map((x) => courseKey(x.code, x.title)));
  const unmetKeys = new Set(slots.filter((x) => !x.passed && !x.isPlaceholder).map((x) => courseKey(x.code, x.title)));

  const preMedStudent = /PREMED/.test(student.posVariant);
  const usable = offerings.filter((o) => !o.preMedOnly || preMedStudent);
  const fypThreshold = s.fypThresholdCH;
  const fypOk = completedCH >= fypThreshold;
  if (target == null) warnings.push("Home section missing or unreadable — target semester unknown");

  // standing → applicable ceiling
  let max: number | null = s.regularMaxCH;
  let blockAll: string | null = null;
  if (student.standing === "PROBATION") {
    max = s.probationMaxCH;
    if (max == null) warnings.push("Probation CH limit is not configured (Admin → Settings). Advisor must select courses manually.");
  } else if (student.standing === "RELEGATION") {
    max = s.relegationMaxCH;
    if (max == null) warnings.push("Relegation CH limit is not configured (Admin → Settings). Advisor must select courses manually.");
  } else if (student.standing !== "NORMAL") {
    blockAll = `Student standing is ${student.standing}`;
    max = null;
  } else if (target != null && target >= 8 && s.finalSemesterMaxCH != null) max = s.finalSemesterMaxCH;

  const items: RecItem[] = [];

  const due = slots.filter((x) => !x.passed && target != null && x.semester <= target);
  const ahead = slots.filter((x) => !x.passed && target != null && x.semester > target && !x.isPlaceholder);

  const evaluate = (sl: Slot, opts: { ahead?: boolean } = {}): RecItem => {
    const key = courseKey(sl.code, sl.title);
    const base: RecItem = {
      key: sl.key, semester: sl.semester, code: sl.code, title: sl.title, ch: sl.ch,
      status: "RECOMMENDED", priority: null, isBacklog: target != null && sl.semester < target, isLab: sl.isLab,
      reason: "", choices: [], suggested: null, sectionNote: null,
    };
    if (blockAll) return { ...base, status: "NOT_ELIGIBLE", reason: blockAll };

    // eligibility (labs inherit their theory course's rules)
    const tKey = theoryKeyOf(key);
    if (!sl.isPlaceholder) {
      if (tKey === "final year project i" && !fypOk)
        return { ...base, status: "NOT_ELIGIBLE", reason: `FYP-I not eligible — ${completedCH} of ${fypThreshold} required credit hours completed.` };
      const missing = (prereqs.get(tKey) ?? []).filter((p) => posKeys.has(p) && !passedKeys.has(p));
      if (missing.length) {
        const names = missing.map((m) => slots.find((x) => courseKey(x.code, x.title) === m)?.title ?? m);
        return { ...base, status: "BLOCKED", reason: `Blocked — prerequisite incomplete: ${names.join(", ")}.` };
      }
    }

    // offerings
    // "ahead" courses only count if offered on the student's own semester sheet (e.g. SE-3), not another cohort's
    const pool0 = opts.ahead ? usable.filter((o) => Number(o.sheet.match(/-(\d+)$/)?.[1]) === target) : usable;
    const matches = pool0.filter((o) =>
      sl.isPlaceholder
        ? isLabCode(o.courseCode) === sl.isLab && placeholderMatches(sl.code, o.courseCode) && !posKeys.has(courseKey(o.courseCode, o.courseName))
        : courseKey(o.courseCode, o.courseName) === key,
    );
    const own = matches.filter((o) => o.program === student.program);
    const pool = own.length ? own : matches;
    const home = student.homeSection?.toUpperCase();
    const choices = pool
      .map((o) => toChoice(o, student))
      .sort((a, b) => Number(b.section === home) - Number(a.section === home) || (a.section ?? "~").localeCompare(b.section ?? "~"));
    base.choices = choices;

    if (!choices.length) return { ...base, status: "NOT_OFFERED", reason: `${sl.title} — academically due (semester ${sl.semester}) but not offered this semester.` };

    if (sl.isPlaceholder) {
      return { ...base, status: "ELECTIVE_CHOICE", priority: 4, reason: `${sl.title} — elective slot; choose one of ${new Set(choices.map((c) => c.courseName)).size} offered elective(s).` };
    }
    if (opts.ahead) return { ...base, status: "OPTIONAL", priority: 5, reason: `Offered this semester ahead of POS semester ${sl.semester}; optional.` };

    const failed = sl.failed;
    const backlog = base.isBacklog;
    const crossOnly = own.length === 0;
    if (!backlog && !failed) {
      const homeMatch = choices.find((c) => c.section === home);
      if (homeMatch) return { ...base, suggested: homeMatch, priority: 3, reason: `POS semester ${sl.semester} requirement — home section ${home}.` };
      return { ...base, priority: 3, sectionNote: home ? `Home section ${home} does not offer this course — advisor must choose a section.` : "Home section not set yet — advisor must choose a section.", reason: `POS semester ${sl.semester} requirement.` };
    }
    return {
      ...base,
      priority: 1,
      reason: failed ? `Failed earlier — retake required.` : `Backlog from POS semester ${sl.semester}.`,
      sectionNote: crossOnly
        ? `Not offered for ${student.program}; offered only in: ${[...new Set(choices.map((c) => c.section))].join(", ")} — advisor must choose.`
        : `Backlog — advisor chooses among offered sections.`,
    };
  };

  const evaluated = new Map<string, RecItem>();
  for (const sl of due) evaluated.set(sl.key, evaluate(sl));
  for (const sl of ahead) {
    const r = evaluate(sl, { ahead: true });
    if (r.status === "OPTIONAL") evaluated.set(sl.key, r);
  }

  // priority 2: regular courses that unlock unmet prerequisite chains
  for (const sl of due) {
    const r = evaluated.get(sl.key)!;
    if (r.priority === 3 && [...prereqs.entries()].some(([c, ps]) => unmetKeys.has(c) && ps.includes(theoryKeyOf(courseKey(sl.code, sl.title))) && c !== theoryKeyOf(courseKey(sl.code, sl.title)))) {
      r.priority = 2;
      r.reason += " Unlocks later prerequisite chains.";
    }
  }

  // bundle theory + lab (identical base key + code base) so both fit or neither does
  const bundleKey = (sl: Slot) => (sl.isLab ? `${theoryKeyOf(courseKey(sl.code, sl.title))}` : courseKey(sl.code, sl.title));
  const groups = new Map<string, Slot[]>();
  for (const sl of due) groups.set(bundleKey(sl) + (sl.isPlaceholder ? "|ph" + sl.key : ""), [...(groups.get(bundleKey(sl) + (sl.isPlaceholder ? "|ph" + sl.key : "")) ?? []), sl]);
  const ordered = [...groups.values()].sort((a, b) => {
    const pa = Math.min(...a.map((x) => evaluated.get(x.key)!.priority ?? 9));
    const pb = Math.min(...b.map((x) => evaluated.get(x.key)!.priority ?? 9));
    return pa - pb || a[0].semester - b[0].semester || a[0].idx - b[0].idx;
  });

  let load = 0;
  for (const g of ordered) {
    const rs = g.map((x) => evaluated.get(x.key)!);
    const live = rs.filter((r) => r.status === "RECOMMENDED" || r.status === "ELECTIVE_CHOICE");
    const ch = live.reduce((a, r) => a + r.ch, 0);
    if (!live.length) continue;
    if (max == null) {
      live.forEach((r) => { r.status = "OPTIONAL"; r.reason += " (Load limit for this standing is not configured — advisor decides.)"; });
    } else if (load + ch > max) {
      live.forEach((r) => { r.status = "DEFERRED_BY_LOAD"; r.reason += ` Deferred: adding ${ch} CH would exceed the ${max} CH limit.`; });
    } else load += ch;
  }
  for (const sl of due) items.push(evaluated.get(sl.key)!);
  for (const sl of ahead) if (evaluated.has(sl.key)) items.push(evaluated.get(sl.key)!);

  if (max != null && load < s.minLoadCH && target != null)
    warnings.push(`Recommended load ${load} CH is below the ${s.minLoadCH} CH minimum — advisor override with reason needed.`);
  const anyBlocked = items.some((i) => (i.status === "RECOMMENDED" || i.status === "ELECTIVE_CHOICE") && i.choices.length && !i.choices.some((c) => c.exportable));
  if (anyBlocked) warnings.push("Some recommended courses only have incomplete offering rows (missing CBA code or section) and can't be exported until an Admin fixes them.");

  return {
    registrationId: student.registrationId,
    targetSemester: target,
    completedCH,
    fypEligible: fypOk,
    items,
    recommendedCH: load,
    load: { min: s.minLoadCH, regularMax: s.regularMaxCH, overloadMax: s.overloadMaxCH, applicableMax: max },
    warnings,
  };
}
