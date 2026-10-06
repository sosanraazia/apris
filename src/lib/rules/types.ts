import type { PosVariant, ProgramCode } from "../parsers/common";

export interface Settings {
  fypThresholdCH: number; // FYP-I eligibility: completed CH >= this
  minLoadCH: number; // below this needs advisor override
  regularMaxCH: number; // HEC regular load ceiling
  overloadMaxCH: number; // absolute ceiling, needs approval
  summerMaxCH: number;
  minPassGradePoint: number; // grade point at/above which a course counts as passed
  probationMaxCH: number | null; // null = not configured → advisor review
  relegationMaxCH: number | null;
  finalSemesterMaxCH: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  fypThresholdCH: 90,
  minLoadCH: 12,
  regularMaxCH: 18,
  overloadMaxCH: 21,
  summerMaxCH: 8,
  minPassGradePoint: 1.0,
  probationMaxCH: null,
  relegationMaxCH: null,
  finalSemesterMaxCH: null,
};

export type Standing = "NORMAL" | "PROBATION" | "RELEGATION" | "FROZEN" | "INACTIVE" | "WITHDRAWN" | "GRADUATED";

export type ElectiveCategory = "UNIVERSITY" | "DOMAIN";

/** One elective slot of a POS and the course assigned to it (titleKey null = not announced yet). */
export interface ElectiveMapRow {
  category: ElectiveCategory;
  slot: number;
  semester: number | null;
  courseTitle: string | null;
  titleKey: string | null;
}

export interface PosCourseRow {
  semester: number;
  code: string;
  title: string;
  ch: number;
  isPlaceholder: boolean;
  alsoAccepts?: string; // title of a course the POS originally printed in this slot; a pass in it also fills the slot
}

export interface AttemptRow {
  term: string;
  termOrder: number;
  code: string;
  title: string;
  grade: string;
  gradePoint: number;
  ch: number;
}

export interface PrereqRow {
  course: string; // title
  prerequisite: string; // title
  rule: string; // "Must Pass"
}

export interface OfferingRow {
  id: string;
  sheet: string; // "SE-3"
  program: ProgramCode | null;
  courseCode: string;
  courseName: string;
  section: string | null;
  cbaCode: string | null;
  preMedOnly: boolean;
  issues: string[];
}

export interface StudentInput {
  registrationId: string;
  program: ProgramCode;
  posVariant: PosVariant;
  homeSection: string | null;
  standing: Standing;
  pos: PosCourseRow[];
  electives?: ElectiveMapRow[]; // assignments for this student's POS
  attempts: AttemptRow[];
}

export type ItemStatus =
  | "RECOMMENDED"
  | "ELECTIVE_CHOICE"
  | "BLOCKED"
  | "NOT_ELIGIBLE"
  | "NOT_OFFERED"
  | "OPTIONAL"
  | "DEFERRED_BY_LOAD"
  | "COMPLETED"
  | "FUTURE";

export interface OfferingChoice {
  offeringId: string;
  courseCode: string;
  courseName: string;
  section: string | null;
  cbaCode: string | null;
  crossProgram: boolean;
  exportable: boolean;
  issues: string[];
}

export interface RecItem {
  key: string; // stable id for the POS course / slot
  semester: number;
  code: string;
  title: string;
  ch: number;
  status: ItemStatus;
  priority: 1 | 2 | 3 | 4 | 5 | null;
  isBacklog: boolean;
  isLab: boolean;
  reason: string;
  choices: OfferingChoice[];
  suggested: OfferingChoice | null;
  sectionNote: string | null;
}

export interface Recommendation {
  registrationId: string;
  targetSemester: number | null;
  completedCH: number;
  fypEligible: boolean;
  items: RecItem[];
  recommendedCH: number;
  load: { min: number; regularMax: number; overloadMax: number; applicableMax: number | null };
  warnings: string[];
}
