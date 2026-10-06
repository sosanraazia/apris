# APRIS — Academic Progression & Registration Intelligence System

Week-one build of the DSU registration system (see `../APRIS_Final_Phase_Wise_PRD.md`).
Official documents in → student profile → rules → recommendation → advisor approval → row-per-course CSV.

> **AI extracts, rules decide.** Currently extraction is *pure code* (the university PDFs have a real text layer), so no AI service and no student data leaves the machine.

## Run it

```bash
npm install
npx prisma migrate deploy      # create the SQLite DB
npm run seed                   # DEV ONLY: resets reference data (17 POS variants, prerequisites, Fall 2026 offerings), creates dev users
npm run dev                    # http://localhost:3000
npm test                       # parser + rules-engine tests
```

## Resume on a new machine (or for a teammate)

```bash
git clone git@github.com:sosanraazia/apris.git && cd apris && git checkout clean-main
cp .env.example .env            # first! then set SESSION_SECRET to 32+ random characters
npm ci                          # (generates the database client, which must find .env; if you ran npm ci first, run `npx prisma generate`)
npx prisma migrate deploy       # creates the empty database from the migrations
npm run seed                    # POS variants, prerequisites, Fall 2026 offerings, elective assignments, dev accounts (DEV ONLY; production uses seed:init)
cat .dev-credentials.txt        # random dev passwords (git-ignored); `npm run dev:credentials` issues new ones
npm run dev                     # http://localhost:3000
```

(`npm run db:reset` wipes and rebuilds an existing development database; never run it on real data.)

Read `docs/SESSION_HANDOFF.md` first: what is built, decisions made, what is open. **Student data is never in git** (`prisma/dev.db`, `storage/`, `data/sample/`): on a new machine you start with an empty student list and add students by uploading their PDFs; the Award Lists (Admin → Section lists) are uploaded again from the departments' files.

`npm run seed` creates the dev accounts `admin`, `hod` and `advisor` with **random passwords written to `.dev-credentials.txt`** (git-ignored, mode 600); `npm run dev:credentials` issues new ones. No passwords are stored in the source. Set a real `SESSION_SECRET` in `.env` (32+ chars). See [SECURITY.md](SECURITY.md) before deploying.

Fixed inputs live in `data/`: POS PDFs, `Fall2026CourseOffering.xlsx`, `PreReqRules.xlsx`, `AcademicStatusRules.xlsx`. Re-run `npm run seed` after changing them. `data/sample/` (real student PDFs) and `storage/` (uploads) are git-ignored — treat them as personal data.

## Documentation

| For | Document |
|---|---|
| Advisors | [docs/ADVISOR_GUIDE.md](docs/ADVISOR_GUIDE.md) |
| Admins / IT (app + server + emergencies) | [docs/ADMIN_RUNBOOK.md](docs/ADMIN_RUNBOOK.md) |
| Installing on the university VM | [deploy/README.md](deploy/README.md) |
| Security model | [SECURITY.md](SECURITY.md) |
| Product requirements | [docs/PRD.md](docs/PRD.md) |
| Project backlog (go-live blockers, next releases, future phases) | [docs/BACKLOG.md](docs/BACKLOG.md) |

Server-side commands (run on the VM, never through the web app): `npm run admin:reset -- <username>` (emergency password reset), `npm run prereq:reload` (reload prerequisite rules from `data/PreReqRules.xlsx`).

## What works

| Area | Status |
|---|---|
| Login, 3 roles (Admin / HoD / Advisor), advisors see only their advisees | ✅ |
| POS: all 17 variants parsed from the PDFs, credit hours verified against each POS total | ✅ |
| Student creation from Interim Transcript + Fulfillment Report; cross-document validation (Reg ID, program, CH); verification screen | ✅ |
| Existing student update → new academic snapshot (previous kept) | ✅ |
| Offering workbook import with automatic column-swap normalisation, CBA duplicate/missing detection | ✅ |
| Rules engine: prerequisites (AND, name-based across POS versions), FYP-I ≥ 90 CH (admin-editable), FYP-II needs FYP-I, load limits, standing, backlog vs regular, home-section preference | ✅ |
| Explainable recommendations, elective slots, labs bundled with theory | ✅ |
| Advisor review: section change, add/remove course, **mandatory reasons**, overload/low-load reasons, draft → finalize | ✅ |
| Registration versioning + change diff; audit log | ✅ |
| Student email on every committed registration change (queue with retry, Admin outbox, per-student history; SMTP configured through the environment; safe redirect for the pilot) | ✅ |
| CSV export (`Student Registration ID, CBA Code, Course Code, Class & Section, Course Name`, one row per enrollment) | ✅ |
| Admin: settings, fix offering rows (CBA/section), standing per student, audit view | ✅ |
| Dashboards (basic counters), exception list | ✅ basic |

## Not built yet

probation/relegation CSV upload (standing is set by Admin per student), bulk student upload, email bounce/delivery tracking, timetable/seat capacity, LDAP/SSO (auth is provider-shaped: `User.authProvider`), ERP enrolment, HoD bulk approval. See [docs/BACKLOG.md](docs/BACKLOG.md).

## Decisions confirmed by the department

1. **A grade of D counts as a pass** (grade point ≥ 1.0; `minPassGradePoint`, admin-editable). W / I / F do not.
2. **A lab must sit in the same section as its theory course.** This is enforced when saving a registration (not just a warning); the review screen moves the lab automatically when the theory section changes.
3. **Probation and relegation students are registered manually for now.** No automatic recommendation; the advisor chooses the courses and enters one **approval reference** that is stored against every course, written to the audit log, and listed for HoD review under *Exceptions*. The 21 CH ceiling still applies; per-course reasons and the 12 CH minimum are not required. Automatic, rule-based handling will start once a probation / relegation CH limit is set in Admin → Settings.

## Other assumptions

1. Multiple prerequisites for one course are all required (AND). Labs inherit their theory course's prerequisites.
2. `Cyber Security` (BS-CYS-2024) is treated as `Introduction to Cyber Security` for the CYS prerequisite chain.
3. Target semester = the number in the home section (`SE-3A` → 3), or the number of completed terms + 1 if no section is set.
4. Final-semester CH limit is not configured (the regular ceiling applies).
5. Zero-credit courses don't count toward load.

## Known data problems in the Fall 2026 workbook (surfaced in the app, not hidden)

- Every CYS row and several SE rows have **no CBA code**; `BS-1302` (pre-med) and other rows have **no section** → can be recommended but **can't be exported** until an Admin fills them in (Admin page).
- CBA `17349` is used for both `CS-2007` and `CS-2007L` (SE-3C); `17373` for both `SE-3802` and `SE-3802L` (SE-5B).
- There is no semester-1/2 sheet, so backlog from those semesters shows "not offered".
- `Discrete Structure` (typo) is aliased to `Discrete Structures`.

## Layout

```
src/lib/parsers     PDF → structured data (transcript, fulfillment, POS)
src/lib/rules       pure, framework-free rules engine (tested)
src/lib/services    ingest, recommendation, registration (validation lives here, not in the UI)
src/app             pages + server actions (every action re-checks the role)
prisma/             schema + seed
test/               vitest
scripts/            dev helpers (flow-check.ts runs the whole pipeline against the sample student)
```
