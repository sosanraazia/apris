# Security notes

## Secrets and credentials
- **No password, key or secret is stored in the repository.** `.env`, `.dev-credentials.txt`, `storage/`, `data/sample/` and the database files are git-ignored.
- Production secrets live only in `/etc/apris/apris.env` (root:apris, mode 640): `SESSION_SECRET`, `DATABASE_URL`, `STORAGE_DIR`. The app refuses to start with a missing, short or placeholder `SESSION_SECRET`.
- The first admin password is supplied to the installer once, removed from disk after the first deploy, and must be changed at first login. Every account created or reset by an Admin has a temporary password that must be changed at first login.
- GitHub access from the VM is a **read-only deploy key**; the deploy service account has no shell and can only restart the app service with root.

## Authentication and sessions
- bcrypt (cost 12); passwords need 6+ characters and nothing else (department decision); sign-in lockout and throttling apply.
- Login is timing-safe against username guessing; failed attempts lock the IP+username for 10 minutes (5 tries) and an IP for 10 minutes (25 tries); nginx additionally rate-limits `/login`.
- Signed 8-hour cookie: `HttpOnly`, `SameSite=Lax`, `Secure` in production. The user is re-checked in the database on **every request**, so disabling an account or changing a role applies immediately, and changing/resetting a password signs that user out everywhere.
- Roles (Admin / HoD / Advisor) are enforced on the server in every page, route and server action; advisors only ever reach their own students (list, profile, documents, uploads, registration, export).

## Data protection
- Student documents are stored under `/var/lib/apris/storage`, served only through an authenticated, per-student-authorised route (`Cache-Control: no-store`), never from a public directory.
- Unconfirmed uploads are deleted after 24 hours. Uploads must be real PDFs (magic-number check), ≤10 MB, ≤30 pages.
- CSV export is POST-only with an origin check, and neutralises spreadsheet formula injection.
- Every state change is written to the audit log (who, what, which student, before/after, reason). Failed logins are logged without ever recording what was typed for unknown usernames.
- Backups (`/var/backups/apris`) are mode 700 and hold personal data — copy them to approved storage only. Ask IT for **disk encryption** on the VM.

## Section lists
- Award Lists are read in memory; only **Registration ID, section, term and course code** are stored (no names, no grades) and the PDFs are not kept. Review drafts that hold IDs are deleted after 24 hours or when saved.
- Uploading and checking lists is Admin-only and audited (`ROSTER_UPLOADED`, `ROSTER_APPLIED`). Suggestions are only suggestions: the advisor must confirm the value when creating the profile.

## Email
- SMTP credentials live only in `/etc/apris/apris.env`; they are never stored in the database, shown in the app, written to logs, or included in error messages.
- Student mail always goes to the institutional address `<RegistrationID>@dsu.edu.pk`; recipients are never taken from user input.
- **Reply-To** is always a stored staff address (validated as `@dsu.edu.pk`, one address, no line breaks) belonging to the advisor who committed the registration — never text typed into a form at send time. In redirect/test mode no Reply-To is set. Only an Admin can set or change staff email addresses, and each change is audited.
- Names from uploaded PDFs are HTML-escaped and stripped of line breaks (no HTML or header injection).
- **A development machine cannot email real students:** outside production, real SMTP is refused unless every message is redirected to `EMAIL_REDIRECT_TO`. `EMAIL_REDIRECT_TO` also lets the pilot run against the real system without notifying students.
- Mail is queued in the same database transaction as the registration version and sent afterwards; a mail failure never changes a registration. Duplicates are prevented by a unique key (student + semester + version + event).
- The mail contains course, section and credit-hour details — treat it as personal data; use TLS to the mail server (STARTTLS/TLS 1.2+ is required by the app).

## Web hardening
`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS, and a CSP restricting framing / forms / base URI / plugins; `X-Powered-By` removed; nginx `server_tokens off`; the app listens on `127.0.0.1` only; UFW allows only SSH/80/443; fail2ban and unattended security updates enabled.

## Known limits (be aware)
- The CSP does not restrict scripts (a script-nonce policy needs extra work). React escapes all output and the code has no `dangerouslySetInnerHTML`/`eval`.
- Login throttling is in memory (single process; resets on restart). Fine for one VM.
- `npm audit` reports a `deepmerge-ts` issue inside the Prisma CLI (build-time tooling, no user input reaches it).
- The deploy scripts have not yet been run on a real Ubuntu VM.
- Someone with sudo/root on the VM can read the data. Restrict who has it.
