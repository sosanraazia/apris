import type { Session } from "../auth";

export type Phase = "SETUP" | "REGISTRATION" | "ADD_DROP" | "CLOSED";

/** ADD_DROP auto-closes once its end date has passed. */
export function effectivePhase(sem: { phase: string; addDropEnds: Date | null }): Phase {
  if (sem.phase === "ADD_DROP" && sem.addDropEnds && sem.addDropEnds.getTime() < Date.now()) return "CLOSED";
  return (["SETUP", "REGISTRATION", "ADD_DROP", "CLOSED"].includes(sem.phase) ? sem.phase : "CLOSED") as Phase;
}

/** Who may change registrations in which phase. Admin can still make a (flagged) late change once closed. */
export function canEdit(role: Session["role"], phase: Phase): { allowed: boolean; late: boolean } {
  if (role === "HOD") return { allowed: false, late: false };
  if (phase === "SETUP") return { allowed: false, late: false }; // suggestions can be previewed, but nobody registers until an Admin opens registrations
  if (phase === "CLOSED") return { allowed: role === "ADMIN", late: true };
  return { allowed: true, late: false };
}

export const PHASE_LABEL: Record<Phase, string> = { SETUP: "Setup (not open yet)", REGISTRATION: "Registration", ADD_DROP: "Add / Drop", CLOSED: "Closed" };
