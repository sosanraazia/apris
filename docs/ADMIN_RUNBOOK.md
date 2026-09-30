# APRIS — Admin Runbook

For the department's APRIS administrators (and the IT person supporting the server). Part A is day-to-day work in the web app; Part B is server operations; Part C is emergencies.

**Golden rules**
1. Keep **at least two Admin accounts** (so a forgotten password is never a crisis).
2. Never send student documents, exports or screenshots with student data by email/chat.
3. Anything that changes registrations, users or settings is in the audit log — assume you are being watched, and so are the advisors.
4. `clean-main` is the live branch: whatever is merged there is deployed to the server automatically.

---

# Part A — Working in the app

## A1. Who can do what

| | Advisor | HoD | Admin |
|---|---|---|---|
| Add students / upload documents | ✅ own students | — | ✅ |
| Register / add-drop | ✅ own students, when phase allows | view only | ✅ (late changes flagged) |
| See all students, exceptions, audit log | — | ✅ | ✅ |
| Users, settings, semesters, offerings, POS | — | — | ✅ |
| Set standing, assign advisor, archive profile | — | — | ✅ |
| Delete a student | **nobody** (archive only) | | |

## A2. Users

**Admin → Manage users**

- **Add a user:** username, full name, role, institutional email (optional), temporary password (12+ characters, not containing the username). The user **must change it at first login**. Give it to them in person or by phone — not with the link in the same message.
- **Change a role:** the *Set* button next to their role. Takes effect on their next click. You can't change your own role, and one active Admin must always remain. Changing an advisor to another role does **not** reassign their students — reassign first.
- **Reset a password:** enter a new temporary password → *Reset*. The user is signed out everywhere and must change it.
- **Disable / enable:** disabled users are locked out immediately. Do this the same day someone leaves.
- **Assign advisors:** open the student → Overview → **Advisor** card → *Assign*. Students created by an Admin have no advisor until you assign one.

## A3. Academic rule settings

**Admin → Academic rule settings** (every change is audited with before/after):

| Setting | Current policy |
|---|---|
| FYP-I minimum completed CH | 90 (FYP-I depends **only** on this; FYP-II also needs FYP-I passed) |
| Minimum load | 12 CH — below it advisors must give a reason |
| Regular load ceiling | 18 CH (HEC 15–18) |
| Absolute ceiling | 21 CH — cannot be exceeded by anyone; overload above 18 needs an approval reference |
| Summer maximum | 8 CH (reserved for a later phase) |
| Minimum passing grade point | 1.0 → **D counts as a pass**; F, W, I do not |
| Probation / relegation max CH | **blank** → these students are registered **manually** (see A9). Filling a number switches on automatic recommendations for them. |
| Final-semester max CH | blank = regular ceiling applies |

Changing the passing grade point or FYP threshold changes recommendations for *everyone* at once — do it only between registration periods.

**Prerequisites** are rules such as "Data Structures requires Programming Fundamentals". They are matched by course **name** across Plan-of-Study versions (aliases handle small naming differences). To change them: edit `data/PreReqRules.xlsx` in the repository (pull request → `clean-main`), then on the server run `npm run prereq:reload` (Part B). It replaces only the rules; no student data is touched. Multiple prerequisites for one course all apply; labs inherit their theory course's rules.

## A4. Plans of Study (POS)

**Admin → Plans of Study**

To add a new POS (or a new version/variant):
1. **Upload** the PDF (one plan per page, e.g. `BS-SE-2026`, plus Minorities / PreMed variants).
2. **Review** the extraction. For each plan you see course counts, credit hours checked against the document's stated total, **each semester checked against its printed total**, and — if it already exists — a diff against the stored version.
3. A plan with a red *blocked* note can't be imported (totals don't add up, in use by students, etc.). Resolve the cause; don't try to force it.
4. **Import selected.** Plans import **unpublished** unless you tick *Publish immediately*.
5. Open the plan (**Plans of Study → the POS**) and check every semester against the PDF, then **Publish**. Only published plans can be assigned to students.

Rules: a POS in use by students **can't be overwritten or unpublished** — issue the change as a new POS code/version. Programs other than SE and CYS need development work.

## A5. Running a semester (the main workflow)

Phases: **Setup → Registration → Add/Drop → Closed.**

### Start of semester
1. **Admin → Semesters → Open a new semester** (`Spring 2027`). The previous semester closes and its registrations stay on record. If the old one has finalized registrations that were never exported, APRIS refuses — export first, or tick *Open anyway* (recorded in the audit log).
2. The new semester is in **Setup**: advisors can preview suggestions but **cannot register**.
3. **Upload course offerings** (A6). Suggestions go live for advisors as soon as you apply them.
4. Ask advisors to **refresh each student's documents** (the readiness card on the Admin page shows "x of y students").
5. Check the **readiness** card on the Admin page, then press **Open registrations** (Admin page or Semesters page). It needs offerings; it warns if rows still lack a CBA code or section.

### During registration
- Watch the **dashboard** (registered / draft / finalized) and **Exceptions**.
- Export in batches: dashboard → **Download registration CSV** (A8).

### Add / Drop
- **Admin → Registration phase**: choose *Add / Drop* and set the **end date** — it closes itself after that date.
- Advisors can now change finalized registrations, each change creating a new version with a reason.

### Close
1. Set the phase to **Closed** (or let the add/drop end date pass).
2. **Export the final CSV** and check the count against the registrar.
3. Only then open the next semester.

A late change after closing is possible only by an Admin, needs a reason, and is flagged in the version history and the audit log.

## A6. Course offerings

**Admin → Upload course offerings** (or the Semesters page).

1. Upload the `.xlsx` workbook — one sheet per class (`SE-3`, `CYS-5`…) with *CBA Code, Course Code, Class & Section, Course Name*.
2. **Review before anything changes.** APRIS shows new rows, changed rows (e.g. "CBA 12345 → 17351"), unchanged rows, and rows in the system but missing from the file. It also reports automatically fixed rows (swapped section/code columns), duplicate CBA codes and rows with no CBA or section.
3. **Apply.** Rules that protect you:
   - A **blank cell never erases** a CBA code you typed in by hand.
   - Rows the file no longer contains are **switched off, not deleted,** if any registration uses them.
   - If a change affects a course students are already registered in, the review page says so. Finalized registrations keep the CBA/section they were exported with; correct them through Add/Drop.
4. **Fix incomplete rows** under **Offering rows needing attention**: enter the section and CBA code from the source system and press *Save*. Duplicates are re-checked after every save. **A course whose offering lacks a CBA code or section cannot be finalized or exported** — this list should be empty before registrations open.

## A7. Students (Admin actions)

Open a student, **Overview**:
- **Academic standing** (Normal, Probation, Relegation, Frozen, Inactive, Withdrawn, Graduated) — a reason/source is required. Standing drives the rules; probation/relegation switch the student to manual registration; Frozen/Inactive/Withdrawn/Graduated block recommendations.
- **Advisor** — assign or change.
- **Profile record → Archive** — for a profile created by mistake (e.g. duplicate). Needs a reason, hides the profile from lists and advisors, and is reversible (**Students → Show archived → Restore**). Profiles with **finalized registrations can't be archived** — set their standing to Withdrawn/Inactive instead. Nothing is ever deleted.

## A8. Exports

Dashboard → **Download registration CSV** (also available to HoD). One row per student-course:

`Student Registration ID, CBA Code, Course Code, Class & Section, Course Name`

A student in six courses appears in six rows. Downloading marks those registrations **Exported** and is audited. Later changes make a new version — export again to get the current state. Open the CSV in a spreadsheet only to read it; never paste it into shared chats.

## A9. Probation and relegation (manual, for now)

There is no automatic recommendation. The advisor picks the courses and records one **approval reference**; it is stored against every course, written to the audit log, and appears under **Exceptions → Manual registration to review** for the HoD. Your job: make sure the HoD reviews that list each week. When the department is ready to automate, set the probation/relegation CH limit in Settings.

## A10. Audit log and monitoring

**Audit** (Admin and HoD). Everything is recorded: logins and failures, viewing a student or a document, uploads, edits, registration saves and finalizations (with the actual courses, sections and CBA codes before and after), exports, user/role/standing changes, settings, semesters, offerings and POS.

- **Advisor activity** table: last login, students added, documents uploaded, drafts saved, registrations committed, students/documents viewed, failed logins.
- **Filters** by user, student ID, type and date; **Export CSV** (the export itself is logged).
- **Integrity check** at the top: green = every entry is chained and unmodified. **Red = the log was altered or entries were removed — stop and follow C4.**

### Routine
| When | Check |
|---|---|
| Daily during registration | Integrity banner green; Exceptions cleared; failed-login spikes; unexpected late-night activity |
| Weekly | Advisor activity looks proportionate; HoD reviewed manual registrations; backups copied off the VM |
| Each semester start | Disable accounts of people who left; review who has Admin |


## A11. Student emails

Every time a registration is **finalized** or **changed** (add/drop), APRIS emails the student at `<RegistrationID>@dsu.edu.pk`: their name and ID, semester, date and time, what was added / removed / moved, their current courses with sections and CBA codes, total credit hours and status. Advisors send nothing by hand.

**How it works.** The email is saved in the queue in the same step that saves the registration version; a background worker then sends it (usually within seconds). Because they are separate, **a mail problem can never undo or block a registration**, and a repeated action can't send duplicates. Failed sends are retried automatically (after 1 min, 5 min, 15 min, 1 h, 6 h); after 5 attempts a message is marked **failed** and waits for you.

**Admin → Emails** shows the delivery settings, counters (queued / retrying / sent / failed), the outbox with a preview of each message, **Retry now** / **Retry all failed**, and a **Send test email** box.

**Configuration** lives on the server in `/etc/apris/apris.env` (never in the app or database): `EMAIL_MODE`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` (see `deploy/apris.env.example`). After editing: `sudo systemctl restart apris`, then use **Send test email**.

| Mode | Behaviour |
|---|---|
| `smtp` | Sends for real. Default in production when `SMTP_HOST` is set. |
| `log` | Pretends: messages are marked sent, nothing leaves the machine. Default on development machines. |
| `off` | Messages wait in the queue (default in production until SMTP is configured). |

**Pilot / testing safely.** Set `EMAIL_REDIRECT_TO=you@dsu.edu.pk`: every message goes to that address instead of the student, marked `[TEST → original address]`. Run the whole parallel-run pilot this way, then **remove the line and restart at go-live**. As an extra guard, a non-production machine refuses real SMTP unless this is set.

**Statuses:** *queued* (waiting), *retrying* (failed once or more, will try again — the error is shown), *sent* (accepted by the mail server — APRIS does not track bounces or whether the student read it), *failed* (gave up — fix the cause, then **Retry**).

**Common causes of failures:** wrong SMTP host/port/credentials, the VM blocked from the mail server (firewall), the sender address not allowed by the relay, TLS problems (the app requires TLS 1.2+; port 587 uses STARTTLS, 465 implicit TLS with `SMTP_SECURE=true`). The error text on the outbox row says which.

**Daily during registration:** open *Admin → Emails* and confirm *failed* is 0. **Weekly:** check *retrying* isn't growing.

---

# Part B — Server operations (IT / sysadmin)

The app runs on the university Ubuntu VM at `https://apris.se.dsu.edu.pk`. Setup is in `deploy/README.md`; this is the day-to-day.

| Task | Command |
|---|---|
| Is it healthy? | `curl -s http://127.0.0.1:3000/api/health` → `{"ok":true}` |
| App logs | `journalctl -u apris -f` |
| Deploy log | `tail -f /var/lib/apris/deploy.log` |
| Which version is live | `basename $(readlink -f /opt/apris/current)` (git commit) |
| Deploy now | `sudo -u apris /opt/apris/deploy.sh` |
| Restart | `sudo systemctl restart apris` |
| Timers | `systemctl list-timers 'apris-*'` |

## B1. Releasing changes
1. Change code on a branch, open a pull request into `clean-main`; CI must pass.
2. Merge. Within ~2 minutes the VM fetches, builds in a new folder, runs tests, backs up the database, applies migrations, switches over and checks `/api/health`.
3. If any step fails, **the old version keeps running** and the bad commit is not retried (`/var/lib/apris/failed-sha`). Read `deploy.log`, fix, push again.

## B2. Manual rollback
```bash
ls /opt/apris/releases                        # newest first: ls -1t
sudo ln -sfn /opt/apris/releases/<older-sha> /opt/apris/current
sudo systemctl restart apris
```
Database changes are additive; if a bad migration must be undone restore the pre-deploy backup (B4).

## B3. Reference-data commands (run on the server, from the live release)
```bash
sudo -u apris bash -c 'cd /opt/apris/current && set -a && . /etc/apris/apris.env && set +a && npm run prereq:reload'
```
- `npm run prereq:reload` — replace prerequisite rules from `data/PreReqRules.xlsx`.
- **Never run `npm run seed` in production** — it is the *development* reset and overwrites Admin's data. Production only ever uses the automatic first-install `seed:init`.

## B4. Backups and restore
- Nightly at 02:30: database + uploaded documents → `/var/backups/apris` (14 days, mode 700). A database copy is also taken before every deploy: `/var/lib/apris/backups/pre-<sha>.db`.
- **Copy `/var/backups/apris` off the VM every week** to storage approved for student data. A backup that lives only on the same disk is not a backup.
- **Restore:**
  ```bash
  sudo systemctl stop apris
  sudo cp /var/backups/apris/apris-<date>.db /var/lib/apris/apris.db
  sudo tar -xzf /var/backups/apris/storage-<date>.tar.gz -C /var/lib/apris
  sudo chown -R apris:apris /var/lib/apris
  sudo systemctl start apris
  ```
- **Test a restore once before go-live** (into a scratch folder) and record how long it took.

## B5. Secrets and certificates
- `/etc/apris/apris.env` (root:apris, 640) holds `SESSION_SECRET`, `DATABASE_URL`, `STORAGE_DIR`, `APRIS_BRANCH` and the email settings including `SMTP_PASS`. Never copy it into a ticket or chat.
- Rotating `SESSION_SECRET` (`openssl rand -base64 48`, then `sudo systemctl restart apris`) signs **everyone** out — do this after any suspected compromise.
- Certificates: Let's Encrypt renews itself (`systemctl list-timers | grep certbot`); a university-issued certificate must be renewed by IT before it expires.
- The GitHub deploy key is **read-only**; if the VM is ever compromised, delete it in GitHub → Settings → Deploy keys.

## B6. What lives where
| | Location |
|---|---|
| Live code | `/opt/apris/current` → `/opt/apris/releases/<sha>` |
| Database | `/var/lib/apris/apris.db` |
| Uploaded PDFs | `/var/lib/apris/storage` (mode-restricted; never web-accessible) |
| Config / secrets | `/etc/apris/apris.env` |
| Reverse proxy | `/etc/nginx/sites-available/apris` |

---

# Part C — Emergencies

## C1. An Admin forgot their password
Use another Admin: **Manage users → Reset**. If **no** Admin can log in, on the server:
```bash
read -rs -p "Temporary password (12+ chars): " PW; echo
sudo -u apris bash -c "cd /opt/apris/current && set -a && . /etc/apris/apris.env && set +a && ADMIN_NEW_PASSWORD='$PW' npm run admin:reset -- admin"
unset PW
```
The account must change the password at next login; it is audit-logged.

## C2. A user's account may be compromised (or a laptop was lost)
1. **Disable the user** (Manage users → Disable) — effective immediately.
2. If an Admin is involved or unsure how far it goes: rotate `SESSION_SECRET` (B5).
3. Review that user's activity in the audit log; list the students they viewed or changed.
4. Reset their password before re-enabling them.
5. Tell the HoD and follow the university's data-incident procedure.

## C3. A bad deploy / the site is down
1. `curl -s http://127.0.0.1:3000/api/health`, then `journalctl -u apris -n 100`.
2. Check `/var/lib/apris/deploy.log` for the failing step.
3. If it isn't recovering: manual rollback (B2). Advisors fall back to the manual process meanwhile.

## C4. The audit log's integrity check is red
1. **Do not "fix" the data.** Note the entry number shown.
2. Preserve evidence: copy `/var/lib/apris/apris.db` and `/var/log` to secure storage.
3. Compare against the last known-good backup (B4): the entries in the backup should match the live log.
4. Inform the HoD and the university's IT security contact. Rotate `SESSION_SECRET` and review who has server access.

## C5. The VM is lost or corrupted
Rebuild a VM, run the installer (`deploy/README.md`), then restore the latest backup (B4). Expect a few hours; advisors use the manual process until it's back. This is why off-VM backups matter.

## C6. A wrong registration was exported
Do not edit the database. Have the advisor correct it in **Add/Drop** (or an Admin makes a flagged late change), re-export, and give the registrar the new CSV. The version history and audit log keep the full story.

---

# Troubleshooting

| Symptom | Likely cause → fix |
|---|---|
| Advisor: "semester isn't open for registration" | No offerings applied → upload (A6). |
| Advisor can see suggestions but can't save | Semester in **Setup** → *Open registrations*; or phase is Closed. |
| "Can't finalize — offering data is incomplete" | A chosen course has no CBA code / section → fix under *Offering rows needing attention*. |
| Upload says "Unknown POS" | The student's POS isn't loaded/published → A4. |
| Upload says "assigned to another advisor" | Reassign the student (A2) or let the right advisor upload. |
| POS import "blocked: semester X adds up to …" | The PDF layout wasn't read correctly or the document is inconsistent — send me the PDF; do not force. |
| A student has no suggestions | Standing is Probation/Relegation (manual), or Frozen/Withdrawn/etc. |
| A course is "Blocked" unexpectedly | Prerequisite rule not met — check the rule file and the student's grade (D passes; F/W/I don't). |
| Everyone logged out suddenly | `SESSION_SECRET` changed or the service restarted with a different env file. |
| Emails stuck as "retrying" / "failed" | Read the error on *Admin → Emails*: credentials, firewall to the mail server, sender not allowed, or TLS. Fix, restart if you changed the env file, then **Retry all failed**. Registrations are unaffected. |
| Emails say "log" and nothing arrives | Mail mode is `log` (no SMTP configured) — set the SMTP variables (A11). |
| Login page says "Too many failed attempts" | Locked 10 minutes per IP+username; wait, or restart the service to clear. |

---

# Checklists

**Before the pilot:** SMTP details from IT set in the env file → *Send test email* arrives → `EMAIL_REDIRECT_TO` set so pilot mail goes to a test address. **At go-live:** remove `EMAIL_REDIRECT_TO`, restart, send a test, watch the first real messages in *Admin → Emails*.

**Before opening a semester:** previous semester exported and checked → new semester opened → offerings uploaded and reviewed → offering rows needing fixes = 0 → POS published → students' documents refreshed → readiness card green → Open registrations → announce.

**Before Add/Drop:** phase set to Add/Drop with an end date → advisors told.

**End of semester:** phase Closed → final export reconciled with the registrar → backups copied off the VM → disabled leavers → review Admin list.

**Every month:** apply Ubuntu security updates (`unattended-upgrades` does most), check disk space (`df -h /var/lib/apris`), test that a backup file opens.
