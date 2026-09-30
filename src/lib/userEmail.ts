/**
 * Staff email addresses (advisors, HoD, admins). Must belong to the university domain so replies to student emails
 * can only ever go to a university mailbox. When LDAP / Active Directory sign-in is added, this value is refreshed
 * from the directory's `mail` attribute instead of being typed by an Admin.
 */
export const STAFF_EMAIL_DOMAIN = "dsu.edu.pk";

const SHAPE = /^[a-z0-9._%+-]{1,64}@([a-z0-9-]+\.)+[a-z]{2,}$/;

/** Returns the normalised address, or an error message. */
export function checkStaffEmail(raw: string): { ok: true; email: string } | { ok: false; error: string } {
  const email = raw.trim().toLowerCase();
  if (!email) return { ok: false, error: "Email is required" };
  if (email.length > 120 || !SHAPE.test(email)) return { ok: false, error: "Enter a valid email address" };
  const domain = email.split("@")[1];
  if (domain !== STAFF_EMAIL_DOMAIN && !domain.endsWith(`.${STAFF_EMAIL_DOMAIN}`)) return { ok: false, error: `Email must be a @${STAFF_EMAIL_DOMAIN} address` };
  return { ok: true, email };
}
