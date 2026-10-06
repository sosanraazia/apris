# APRIS — Project Backlog

Last updated: 2026-09-29 · Live branch: `clean-main` · Source of scope: [PRD](PRD.md)

**Priority:** P0 = blocks go-live · P1 = next release (first semester in use) · P2 = valuable, schedule it · P3 = later / nice to have
**Size:** S ≈ ½ day · M ≈ 1–3 days · L ≈ 1 week+ · **Owner:** Dev (developer), Admin, HoD, IT (university IT), Reg (registrar)

---

## 1. Status at a glance

| Area | State |
|---|---|
| Student profiles from Interim Transcript + POS Fulfillment Report (read by code, no AI) | ✅ Done |
| 17 Plans of Study (SE, CYS × 2020/2024 × variants), upload / review / publish | ✅ Done |
| Rules: prerequisites, FYP-I ≥ 90 CH, FYP-II needs FYP-I, load 12–18 (max 21), D = pass, lab = theory section | ✅ Done |
| Recommendations with reasons, sections, backlog, electives | ✅ Done |
| Advisor review, mandatory reasons, drafts, finalize, versions | ✅ Done |
| Add/Drop, phases (Setup → Registration → Add/Drop → Closed), open semester, open registrations | ✅ Done |
| Offering upload with review-before-apply | ✅ Done |
| Probation / relegation — manual with approval reference | ✅ Done (automation later) |
| Audit log (chained, filterable, per-advisor activity), archive-not-delete | ✅ Done |
| Users / roles / password change, login throttling, security headers | ✅ Done |
| Row-per-course CSV export | ✅ Done |
| Deploy from GitHub with rollback, backups, docs, advisor guide, admin runbook | ✅ Written — **never run on a real VM** |
| Real-student pilot | ⬜ Not started |
| Student emails (queue, retry, outbox, redirect for pilot) | ✅ Done — needs SMTP details from IT (G-14) |
| Timetable, ERP, LDAP, bulk enrolment | ⬜ Later phases |

---

## 2. P0 — Go-live blockers

| ID | Item | Owner | Size | Done when |
|---|---|---|---|---|
| G-01 | Confirm the target semester and deadline (Fall 2026 window vs Spring 2027) | HoD | S | Written date agreed |
| G-02 | Request VM, DNS `apris.se.dsu.edu.pk`, ports 80/443, outbound access (GitHub, npm, Prisma), TLS certificate | Dev → IT | S | IT ticket accepted with dates |
| G-03 | Written IT/compliance approval to store student data on the VM; disk encryption; off-VM backup location | HoD + IT | M | Approval on file |
| G-04 | **First install on the VM** with IT; fix whatever differs from `deploy/README.md` | Dev + IT | M | https works; auto-deploy from `clean-main` proven; rollback tried once |
| G-05 | Branch protection on `clean-main` (pull request + CI required) | Dev | S | Setting enabled |
| G-06 | Restore drill: back up, restore into a scratch folder, record the time | IT | S | Restore documented as working |
| G-07 | Fill missing CBA codes / sections in the Fall 2026 workbook (35 rows without CBA, some without section) and fix duplicate CBAs `17349`, `17373` | Admin + Reg | M | "Offering rows needing attention" = 0 |
| G-08 | Confirm the export CSV layout is accepted by the registrar / ERP (columns, encoding, CBA format) | Reg | S | Sample file accepted |
| G-09 | **Parallel-run pilot**: 10–15 real students (normal, backlog, PreMed, CYS, near-90 CH, 1–2 probation); compare APRIS vs manual result course-by-course | Advisors + Dev | M | Every difference explained; wrong recommendations fixed |
| G-10 | Create real accounts (Admin ×2, HoD, advisors); every user changes their password | Admin | S | All accounts active, no default/temp passwords left |
| G-11 | Advisor training (30 min) using the guide; agree the manual fallback and escalation contact | HoD | S | All advisors registered one practice student |
| G-12 | Review the advisor guide and admin runbook against the live screens; correct any drift | Dev | S | Docs match production |
| G-14 | **SMTP details from IT** (host, port, account allowed to send as no-reply@dsu.edu.pk); set in `/etc/apris/apris.env`; **Admin → Emails → Send test** works; pilot runs with `EMAIL_REDIRECT_TO` set | IT + Dev | S | Test email arrives; redirect removed at go-live |
| G-15 | **Every advisor has a real, monitored `@dsu.edu.pk` email in Manage users** (student replies are delivered there); advisors know they own the replies; sender address agreed with IT | Admin + IT | S | Every advisor row shows a correct email; a test registration's reply reaches the right advisor |
| G-17 | **Load the updated Fall 2026 offering workbook** (all CBA codes and sections present, placeholder course codes replaced) through Admin → Upload course offerings; CYS-6A is batch 23 (they were in CYS-5A in Spring 2026), as the section lists show; re-check duplicate CBAs 17349 and 17373 | Admin + Reg | S | Offering rows needing attention = 0 apart from deliberate exceptions |
| G-16 | **Upload the Award Lists for every section (SE and CYS) for the latest term** and check coverage (Admin → Section lists → Check a student); decide how PreMed / minority / new students get their section | Admin | S | Most pilot students show a suggested section; the rest are known exceptions |
| G-13 | Clear pilot data before real use (`reset-fresh`, or archive pilot students) | Dev | S | Live system holds real data only |

**Go-live gate:** G-01…G-16 complete, or each remaining item consciously accepted by the HoD.

---

## 3. P1 — First release after go-live (semester 1 in use)

### Efficiency (the volume problem: ~700 students)
| ID | Story | Owner | Size |
|---|---|---|---|
| E-01 | **Bulk student upload**: drop many transcript + fulfillment PDFs at once; match pairs by Registration ID; show one verification table; confirm all | Dev | L |
| E-02 | Bulk "approve all recommended" for students with no exceptions (advisor selects a list, reviews summary) | Dev | M |
| E-03 | Advisor worklist: filter students by status (needs documents / needs review / ready / finalized) and by exceptions | Dev | M |
| E-04 | Dashboard metrics from PRD §48: backlog students, failed courses, FYP eligible/not eligible, profiles updated, advisor turnaround | Dev | M |

### Notifications (PRD Phase 5 — locked requirement, deferred for the first release)
| ID | Story | Owner | Size |
|---|---|---|---|
| N-01 | ✅ SMTP / DSU mail configuration; send from a no-reply address (config via environment; needs IT details — G-14) | IT + Dev | M |
| N-02 | ✅ Email `<RegID>@dsu.edu.pk` on every committed enrollment change (initial, add, drop, section change, cancelled); content per PRD §36 | Dev | M |
| N-03 | ✅ Async queue with states Queued / Sent / Failed / Retrying, retry from Admin, idempotency key (student + semester + version + event); failure never rolls back a registration | Dev | L |
| N-04 | ✅ Notification history on the student page (Emails tab) and Admin outbox | Dev | S |

### Policy / rules that need decisions
| ID | Item | Owner | Size |
|---|---|---|---|
| R-01 | **Probation / relegation automation**: HoD supplies credit-hour limits and restrictions → set in Settings → recommendations switch on; add Admin upload of standing (CSV/Excel per PRD §50) | HoD + Dev | M |
| R-02 | HoD sign-off workflow for manual (probation/relegation) registrations and overloads (today: listed under Exceptions, no approve/reject step) | Dev | M |
| R-03 | Backlog from semesters with no offering sheet (workbook has SE-3/5/7 and CYS-3/5/7 only): decide where semester 1/2/4/6/8 offerings come from | Reg + Dev | M |
| R-04 | Repeat / grade-improvement policy (what happens to a repeated course and CGPA, when a passed course may be retaken) | HoD | M |
| R-05 | **Section promotion rule**: home sections are now pre-filled from the Award Lists assuming "next semester, same letter" (SE-2A → SE-3A). HoD to confirm or give the real rule (e.g. regrouping by CGPA, PreMed tracks) | HoD | S |
| R-06 | Final-semester and summer credit limits (summer max 8 CH exists in settings but is not applied) | HoD + Dev | M |
| R-07 | Should overrides of prerequisite / FYP rules by an advisor be allowed at all, or require HoD approval? (today: allowed with a reason, audited) | HoD | S |

### Admin self-service (today these need a developer or a file change)
| ID | Story | Size |
|---|---|---|
| A-01 | Prerequisite management screen (add/edit/remove rules, alias names) instead of spreadsheet + `npm run prereq:reload` | M |
| A-02 | Past-semester screens: browse old registrations and re-export a closed semester | M |
| A-03 | Course catalogue (PRD §8): course type, theory/lab, active flag, equivalent-course mapping | L |
| A-04 | Student transfer between advisors in bulk; advisor workload view | S |

### Data quality / parsing
| ID | Story | Size |
|---|---|---|
| D-01 | Handle elective + lab pairs for CYS electives (`CYS-3XXX` with `CYS-3XXXL`) as one choice | M |
| D-02 | Course equivalency and POS migration (student moves from POS 2020 → 2024) | L |
| D-03 | Transfer credits and exemptions in the profile (PRD §52) | L |
| D-04 | Support other layouts: scanned PDFs (OCR fallback), reissued/legacy transcript formats; clear "unreadable" reporting | L |
| D-05 | Tighten unknown-course handling: transcript courses that match no POS row (show them, don't ignore them) | M |

---

## 4. P2 — Quality, operations, security

| ID | Item | Size |
|---|---|---|
| T-01 | **Synthetic test PDFs** (fake student, same layout) so real end-to-end tests run in CI without personal data | M |
| T-02 | Move the dev check scripts (`flow-check`, `manual-check`, `semester-check`, `offering-check`, `pos-check`, `audit-check`) into the automated CI test suite | M |
| T-03 | Browser end-to-end tests (Playwright) for login, add student, register, add/drop, export | L |
| T-04 | Monitoring: uptime check on `/api/health`, alert on failed deploy, disk-space and backup-age alerts; error tracking (e.g. Sentry) | M |
| T-05 | Log rotation for `deploy.log`; retention policy for audit log archives | S |
| T-06 | Persisted login throttling (survives restart) and per-IP limits at the proxy | S |
| T-07 | Script-nonce Content-Security-Policy (today CSP covers framing/forms/base only) | M |
| T-08 | Encrypt stored student PDFs at rest (if IT does not provide full-disk encryption) | M |
| T-09 | Upgrade path: Prisma 7, `deepmerge-ts` advisory, keep Next.js/dependencies patched monthly | M |
| T-10 | SQLite → PostgreSQL if concurrent use grows or IT requires managed DB | L |
| T-11 | Accessibility review (keyboard, contrast, screen reader) and mobile layout pass | M |
| T-12 | Print / PDF of a student's registration slip | S |
| T-13 | Advisor-facing "what changed since last version" view and version compare | S |

---

## 5. P3 — Future phases (from the PRD roadmap)

| Phase | Item | Size |
|---|---|---|
| 7 | Section capacity, timetable data (days, times, rooms, faculty), clash-free section allocation, seat availability | L |
| 8 | **LDAP / Active Directory sign-in — confirmed for a later version** (auth is already provider-shaped: `authProvider`, `externalId`). See the readiness notes below the table. | L |
| 9 | One-click ERP enrolment (Registration ID + CBA code) with per-course result handling | L |
| 10 | HoD bulk auto-enrolment with exception-only review; partial-failure retry (`Retry Failed Enrollments`) | L |
| — | Additional programs beyond SE and CYS (program table, sheet-prefix mapping, POS code patterns) | L |
| — | Student portal view (read-only) of their own registration | L |
| — | Self-service password reset by email (email now exists) | S |
| — | Email delivery/bounce tracking, cancellation notice, Urdu/English templates | M |

**LDAP readiness notes (decided: LDAP comes in a later version — nothing below is built yet)**
- **Where it plugs in:** one branch in `authenticate()` (`src/lib/auth.ts`) that checks the credentials against the directory and then resolves the *same* `User` row (`authProvider` = `LDAP`/`ACTIVE_DIRECTORY`, `externalId` = directory identifier). Everything after sign-in (sessions, roles, audit, advisor scoping) is unchanged. Business logic does not need rewriting.
- **Email:** advisors' email (used as Reply-To on student emails) is entered by an Admin today. With LDAP it should be **synced from the directory's `mail` attribute at each sign-in** and become read-only in *Manage users*. Keep the `@dsu.edu.pk` check (`src/lib/userEmail.ts`).
- **Roles:** map directory groups to Admin / HoD / Advisor (e.g. `apris-admins`, `apris-hod`, `apris-advisors`) so access is removed centrally when someone leaves; decide whether an Admin can still override a role locally.
- **Passwords:** LDAP users have no local password (`passwordHash` stays empty; the change-password page and "reset password" don't apply to them). Keep **one or two local break-glass Admin accounts** (`authProvider = LOCAL`) in case the directory is unreachable, with the throttle and audit unchanged.
- **Account matching:** match on the directory's stable id (`externalId`), not on the username, so renames don't create duplicates or hand over an account.
- **Provisioning:** first LDAP sign-in creates the `User` row only if the person is in an allowed group; students never get accounts.
- **Needs from IT (ask early):** directory type and server, TLS/LDAPS certificate, a read-only service account, search base, attribute names (`uid`/`sAMAccountName`, `mail`, `displayName`), group names, and network access from the VM.
- **Tests to add then:** a fake-directory adapter, group→role mapping, disabled-in-directory user is refused, break-glass account still works.

---

## 6. Known issues / limitations (today)

1. Deploy scripts are syntax-checked only — never executed on Ubuntu. (**G-04**)
2. Advisors can't be assigned in bulk; students uploaded by an Admin have no advisor until assigned.
3. Home section is confirmed by hand each semester; target semester falls back to "completed terms + 1" if unset.
4. Prerequisite rules are matched by course **name** with an alias table; a renamed course in a new POS may silently stop matching → check *Plans of Study → detail → "covered by prerequisite rules"* after importing a new POS.
5. One "Fall 2026" workbook contains mixed POS-version codes (e.g. `CS-2201` means Networks in POS 2024 but Professional Practices in POS 2020); matching is by title, so course codes in the export come from the workbook.
6. Login throttle is in memory (resets on restart).
7. The audit chain detects tampering; it cannot stop someone with root access on the VM from rebuilding it — restrict server access and keep off-VM backups.
8. Timetable, ERP and SSO are not built. Email: no bounce/delivery tracking (only "accepted by the mail server"), English only, no "registration cancelled" message yet (there is no cancel feature).

---

## 7. Decisions already made (do not re-open without a reason)

| Decision | Date | Note |
|---|---|---|
| Registration ID is the permanent student identity | PRD | |
| Extraction is deterministic code, no AI service | 2026-09 | PDFs have a text layer; no student data leaves the machine |
| D counts as a pass | 2026-09 | grade point ≥ 1.0 |
| Labs must be in the same section as their theory course | 2026-09 | hard rule |
| FYP-I: completed CH ≥ 90 (admin-editable); FYP-II needs FYP-I | 2026-09 | |
| Load: min 12, regular ≤ 18, absolute 21 | 2026-09 | |
| Probation / relegation registered manually for now | 2026-09 | automate later (R-01) |
| Advisors never delete students; Admin archives only | 2026-09 | |
| Deploy from `clean-main`, pull-based, on the university VM (not Vercel) | 2026-09 | |
| Student emails built after the first release plan (queue + retry + redirect for pilot) | 2026-09 | N-01…N-04 done; delivery tracking (bounces) is a later item |
| A student's email address is always `<RegistrationID>@dsu.edu.pk` (lowercase, never typed) | 2026-09 | one shared rule, used at creation and by the mail queue |
| Home section is pre-filled from the departments' Award Lists (regular members only; backlog attendees excluded), moved up one semester with the same letter; the advisor confirms | 2026-10 | stores only Registration ID, section, term; promotion rule is an assumption (R-05); coverage depends on which courses' lists are uploaded |
| Replies to student emails go to the **advisor who committed the registration**, who is responsible for answering | 2026-09 | Reply-To = that advisor's stored university email; sender is a shared system address (needs IT); advisor email is required when an Admin creates an advisor |
| **LDAP / Active Directory sign-in will be added in a later version** | 2026-09 | design notes under Phase 8; advisor email will then sync from the directory |

---

## 8. Suggested sequence

1. **Sprint A (go-live):** G-01 → G-13. Nothing else starts until G-04 (VM) and G-07 (CBA data) are moving.
2. **Sprint B (efficiency):** E-01, E-03, E-04 — bulk upload is the biggest time saver for ~700 students.
3. **Sprint C (communication):** N-01 → N-04, R-02.
4. **Sprint D (rules):** R-01 (probation/relegation), R-03, R-04, R-05, A-01.
5. **Sprint E (hardening):** T-01 → T-04, T-06, T-07.
6. Then PRD phases 7–10 as the department is ready.

## 9. Definition of Done (for every item)
Code reviewed and merged via pull request → CI green (types, lint, tests, build) → rules covered by tests → audit entries written for any state change → docs updated (advisor guide / admin runbook if behaviour changed) → checked on the live screens → no personal data or secrets in the repository.
