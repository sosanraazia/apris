import type { Prisma } from "@prisma/client";

export const ACTION_GROUPS: Record<string, { label: string; match: (a: string) => boolean }> = {
  enrollment: { label: "Enrollment (registrations, exports)", match: (a) => a.startsWith("REGISTRATION_") || a === "CSV_EXPORT" },
  records: { label: "Student records", match: (a) => /^(STUDENT_(CREATED|ARCHIVED|RESTORED|DETAILS_EDITED)|SNAPSHOT_CREATED|DOCUMENTS_UPLOADED|HOME_SECTION_SET|ADVISOR_ASSIGNED|STANDING_CHANGED)$/.test(a) },
  access: { label: "Access (logins, views)", match: (a) => /^(LOGIN|LOGIN_FAILED|LOGOUT|DOCUMENT_VIEWED|STUDENT_VIEWED)$/.test(a) },
  admin: { label: "Administration", match: (a) => /^(SETTINGS_CHANGED|USER_|PASSWORD_|SEMESTER_|OFFERING|AUDIT_)/.test(a) },
};

export interface AuditFilter {
  user?: number;
  student?: string;
  group?: string;
  from?: Date;
  to?: Date;
}

export function parseFilter(sp: Record<string, string | string[] | undefined>): AuditFilter {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined;
  const date = (v?: string, end = false) => {
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
    const d = new Date(v + (end ? "T23:59:59.999" : "T00:00:00"));
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  return {
    user: one("user") && /^\d+$/.test(one("user")!) ? Number(one("user")) : undefined,
    student: one("student")?.trim().toUpperCase().slice(0, 20) || undefined,
    group: one("group") && ACTION_GROUPS[one("group")!] ? one("group") : undefined,
    from: date(one("from")),
    to: date(one("to"), true),
  };
}

/** Group filters are applied in the query via an IN list of known action names. */
export const KNOWN_ACTIONS = [
  "REGISTRATION_DRAFT_SAVED", "REGISTRATION_FINALIZED", "REGISTRATION_ADD_DROP", "REGISTRATION_LATE_CHANGE", "CSV_EXPORT",
  "STUDENT_CREATED", "STUDENT_ARCHIVED", "STUDENT_RESTORED", "STUDENT_DETAILS_EDITED", "SNAPSHOT_CREATED", "DOCUMENTS_UPLOADED", "HOME_SECTION_SET", "ADVISOR_ASSIGNED", "STANDING_CHANGED",
  "LOGIN", "LOGIN_FAILED", "LOGOUT", "DOCUMENT_VIEWED", "STUDENT_VIEWED",
  "SETTINGS_CHANGED", "USER_CREATED", "USER_ROLE_CHANGED", "USER_DEACTIVATED", "USER_ACTIVATED", "PASSWORD_RESET", "PASSWORD_CHANGED",
  "SEMESTER_OPENED", "SEMESTER_PHASE_CHANGED", "OFFERINGS_UPLOADED", "OFFERINGS_APPLIED", "OFFERING_EDITED", "AUDIT_EXPORTED",
];

export function toWhere(f: AuditFilter): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (f.user) where.userId = f.user;
  if (f.student) where.studentRegId = f.student;
  if (f.group) where.action = { in: KNOWN_ACTIONS.filter(ACTION_GROUPS[f.group].match) };
  if (f.from || f.to) where.at = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) };
  return where;
}

export const defaultSince = (days = 30) => new Date(Date.now() - days * 86400000);
