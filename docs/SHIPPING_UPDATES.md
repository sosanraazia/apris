# Shipping updates to the live server without touching the data

## Two kinds of change
| Kind | Examples | How | Data touched? |
|---|---|---|---|
| **Settings and rules stored in the app** | prerequisites, elective assignments, offerings, CH limits, users, batches, section lists | Do it in the live app (Admin screens). No deploy. | Only that table, audited |
| **Code** | a bug fix, a new screen, a new check | Change in the repo, push to `clean-main`; the server deploys itself | No: data lives outside the code |

### Prerequisites (Admin → Prerequisites)
Change a rule right on the live app: edit the "must have passed" course on a row and Save, add a rule, or remove one. The page only accepts real courses from the Plans of Study (pick from the list), refuses a course as its own prerequisite and refuses loops. Recommendations use the new rule immediately; finalized registrations are not changed. Each change is in the audit log.

The rules file `data/PreReqRules.xlsx` only matters for a **fresh install**. After changing rules in the app you may refresh it from the database: `npx tsx scripts/export-prereq-seed.ts`, then commit.

## How a code update reaches the server
1. Change the code on your machine, check it: `npx tsc --noEmit && npx eslint && npx vitest run`.
2. Commit and `git push origin clean-main`. CI runs the same checks plus the secret scan.
3. The server notices within about two minutes, builds the new version in its own folder, runs the tests, **backs up the database**, applies new migrations, switches over and checks `/api/health`. If anything fails, the old version keeps running and the log says why (`C:\apris\data\deploy.log` on Windows, `/var/lib/apris/deploy.log` on Linux).
4. Confirm: the live version is the git commit (`Split-Path -Leaf (Get-Item C:\apris\current).Target` on Windows, `basename $(readlink -f /opt/apris/current)` on Linux).

## Rules that keep the data safe
- **Never run `npm run seed` or `db:reset` on the server.** They rebuild the reference tables and erase data. The server only ever runs `seed:init` (once) and `prisma migrate deploy` (additive).
- Database changes go in as **migrations** (`prisma migrate dev`), and should only *add* columns/tables. A migration that drops or rewrites a column needs a backup and a plan first.
- Reference data in `data/` (offerings workbook, rules workbook, POS PDFs) is read **only on first install**. To change it on a running server use the Admin screens, not the files.
- Before anything risky take a backup (`docs/BACKUP_AND_DATA_TRANSFER.md`, section C).
- Keep local and server data separate: do not push your laptop database over the server's once real registrations are happening there.
