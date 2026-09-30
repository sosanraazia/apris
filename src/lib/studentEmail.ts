/** The one rule for student email addresses: `<RegistrationID>@dsu.edu.pk`, lowercase. Nothing else is ever used. */
export const STUDENT_EMAIL_DOMAIN = "dsu.edu.pk";

/** Registration IDs look like SE251093 / CYS241007: 2–4 letters followed by 5–8 digits. */
const REG_ID = /^[A-Z]{2,4}\d{5,8}$/i;

export function isValidRegistrationId(regId: string): boolean {
  return REG_ID.test(regId.trim());
}

export function studentEmail(regId: string): string {
  const id = regId.trim();
  if (!REG_ID.test(id)) throw new Error(`Not a valid Registration ID: "${id.slice(0, 20)}"`);
  return `${id.toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`;
}
