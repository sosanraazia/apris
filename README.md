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

`npm run seed` creates the dev accounts `admin`, `hod` and `advisor` with **random passwords written to `.dev-credentials.txt`** (git-ignored, mode 600); `npm run dev:credentials` issues new ones. No passwords are stored in the source. Set a real `SESSION_SECRET` in `.env` (32+ chars). See [SECURITY.md](SECURITY.md) before deploying.

Fixed inputs live in `data/`: POS PDFs, `Fall2026CourseOffering.xlsx`, `PreReqRules.xlsx`, `AcademicStatusRules.xlsx`. Re-run `npm run seed` after changing them. `data/sample/` (real student PDFs) and `storage/` (uploads) are git-ignored — treat them as personal data.

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
| CSV export (`Student Registration ID, CBA Code, Course Code, Class & Section, Course Name`, one row per enrollment) | ✅ |
| Admin: settings, fix offering rows (CBA/section), standing per student, audit view | ✅ |
| Dashboards (basic counters), exception list | ✅ basic |

## Deliberately deferred (per the one-week scope)

Student e-mail sending (the version records `email: deferred`), probation/relegation CSV upload (standing is set by Admin per student), timetable/seat capacity, LDAP/SSO (auth is provider-shaped: `User.authProvider`), ERP enrolment, HoD bulk approval, POS upload UI (POS are seeded).

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
