# Backups, and getting local data onto the live server

## Why your local data is not on the server after a deploy
A deploy only moves **code** (git → server). Student records, registrations, uploaded PDFs and the audit trail are **data**: they live in `prisma/dev.db` and `storage/` on your machine and are **git-ignored on purpose** (private student records must never sit in git history). So a fresh server starts with the reference data only (plans of study, prerequisites, Fall offerings, elective assignments) and **no students**. To put your local data there you push it separately, as below.

Local data and server data are two separate databases. After you move data to the server, **work only on the server** — the server's copy becomes the real one.

## A. Back up the local (laptop) database
```bash
cd apris
npm run db:backup          # writes backups/apris-YYYY-MM-DD-HHMM.db, checks it, folder is git-ignored
```
That is a consistent copy, safe while the app is running. Keep it private (student records). To restore it: stop `npm run dev`, then copy the file over `prisma/dev.db` and delete `prisma/dev.db-wal` / `-shm` if present.

Uploaded documents are in `storage/` (copy that folder too if you want everything).

## B. Move the local data to the live server (one command)
Prerequisites: the server is installed (`deploy/README.md`), you can `ssh` to it, and your user can `sudo` there.
```bash
cd apris
npm run data:push -- <your-user>@<server-address>
```
It exports your database and documents into one **encrypted** file, copies it to the server, imports it there and deletes the temporary files. You type a passphrase twice (here and on the server) and `REPLACE` to confirm. The server's previous database is backed up first (`/var/lib/apris/backups/before-import-<time>.db`). When it finishes:
1. Sign in on the server and **reset or disable the dev accounts** (`admin`, `hod`, `advisor`) that came with your data, and create the real accounts.
2. From now on enter data on the server only.

### The same thing in steps (if you can't use ssh from your laptop)
```bash
npm run data:export                     # writes ~/apris-data-YYYY-MM-DD.tar.enc (asks for a passphrase)
# copy that file to the server any way you can (scp, SFTP, USB), give IT the passphrase by a DIFFERENT channel, then ON THE SERVER:
sudo bash /opt/apris/current/deploy/data-import.sh /path/to/apris-data-YYYY-MM-DD.tar.enc
```
Delete the file afterwards on both machines. Never commit it or email it.

### Or start clean
For go-live you may prefer **not** to carry test data over: `npx tsx scripts/reset-fresh.ts --yes` on the server clears students and the audit trail (keeps plans, prerequisites, offerings, accounts), and advisors register real students there.

## C. Back up the live server
**Automatic:** every night at about 02:30 the server writes `/var/backups/apris/apris-YYYY-MM-DD.db` (database) and `storage-YYYY-MM-DD.tar.gz` (uploaded documents) and keeps 14 days. Before every deploy it also keeps `/var/lib/apris/backups/pre-<commit>.db` (30 days).

**Take one right now** (on the server):
```bash
sudo systemctl start apris-backup.service
ls -lh /var/backups/apris/
```
**These live on the same server**, so they do not protect against losing the server. Copy them off it regularly (ask IT for an off-server location), for example from your laptop:
```bash
scp <your-user>@<server-address>:/var/backups/apris/apris-2026-10-08.db ~/Backups/
scp <your-user>@<server-address>:/var/backups/apris/storage-2026-10-08.tar.gz ~/Backups/
```
(Your user needs read access to `/var/backups/apris`, which is root-only; either ask IT to sync it off-server as root, or run `sudo cp` into your home first.)

## D. Restore the live server from a backup
```bash
sudo systemctl stop apris
sudo -u apris cp /var/backups/apris/apris-2026-10-08.db /var/lib/apris/apris.db
sudo rm -f /var/lib/apris/apris.db-wal /var/lib/apris/apris.db-shm
# documents, if needed:
sudo tar -xzf /var/backups/apris/storage-2026-10-08.tar.gz -C /var/lib/apris
sudo chown -R apris:apris /var/lib/apris/apris.db /var/lib/apris/storage
sudo systemctl start apris
curl -s http://127.0.0.1:3000/api/health
```
Check that the database is healthy before restoring: `node scripts/db-tool.mjs check <file>` (from a copy of the repository on any machine with Node).

## E. Checklist for go-live
- [ ] Decide: carry local data over (section B) or start clean.
- [ ] Reset/disable the dev accounts, create real Admin/HoD/advisors (with their batches).
- [ ] Run a backup on the server (C) and confirm the file exists.
- [ ] Arrange the off-server copy of `/var/backups/apris`.
- [ ] Practise one restore (D) on a test copy before you need it.
