# Deploying APRIS on Windows Server

For Windows Server 2019 / 2022. This is the same design as the Ubuntu kit in `deploy/` (pull-based deploys from the private GitHub repo, health-checked, automatic rollback, nightly backups, data outside the code), using Windows tools.

> **Only needed if the university ends up providing Windows Server. The plan is an Ubuntu VM (`deploy/README.md`), which is the better-tested route.**
>
> **Status: written but not yet run on a real Windows Server.** The application itself is platform independent and the shared helper (`scripts/db-tool.mjs`) is tested, but these PowerShell scripts have only been reviewed, not executed. Do the first install on a **staging** server or VM and read `C:\apris\data\deploy.log` if anything stops. If IT can give you a Linux VM instead, the Ubuntu kit is the better-tested route.

## What runs where

| Piece | Windows implementation |
|---|---|
| App | Node.js 22+ running `next start` on `127.0.0.1:3000` (never exposed directly) |
| Service | **NSSM** service `apris`, runs as the low-privilege local account `apris`, restarts on failure, logs to `C:\apris\data\logs\apris.log` |
| HTTPS + web server | **IIS** reverse proxy (URL Rewrite + Application Request Routing) with the university certificate |
| Deploys | Scheduled task **APRIS deploy** (every 2 min, as SYSTEM) runs `C:\apris\deploy.ps1` |
| Backups | Scheduled task **APRIS backup** (02:30 daily) runs `backup.ps1`; keeps 14 days in `C:\apris\backups` |
| Code access | read-only **deploy key** (SSH) for the private repo, stored in `C:\apris\.ssh` (SYSTEM + Administrators only) |

Folders: `C:\apris\releases\<commit>` (3 newest kept), `C:\apris\current` (junction to the live release), `C:\apris\repo.git` (mirror), `C:\apris\config\apris.env` (secrets, server only), `C:\apris\data` (database `apris.db`, `storage\` uploads, `deploy.log`, `logs\`, pre-deploy backups). Deploys never touch `data` or `config`.

> **Host name and certificate:** the university certificate is a wildcard (`*.dsu.edu.pk`), which covers **one** name level only. `apris.dsu.edu.pk` is covered; `apris.se.dsu.edu.pk` is **not**. Use a single-level name, or get a certificate for the exact name.

## What to ask IT for
1. A Windows Server with **Windows PowerShell 5.1**, Administrator access, and 2 vCPU / 4 GB RAM / 40 GB disk (BitLocker on the data disk).
2. DNS name (e.g. `apris.dsu.edu.pk`) and a **TLS certificate (.pfx)** for it.
3. Inbound **80 and 443**. Outbound: **SSH (22) to `github.com`** (or `ssh.github.com:443`), HTTPS to `registry.npmjs.org`, `binaries.prisma.sh`, `github.com`, and SMTP (host/port/account allowed to send as `no-reply@dsu.edu.pk`).
4. Permission to install: **Node.js 22 LTS**, **Git for Windows**, **NSSM**, and the IIS modules **URL Rewrite** and **Application Request Routing**.
5. Off-server backup of `C:\apris\backups` (the server's own copy is not enough) and data-storage approval for student records.

## Install (once)
On the server, in an **elevated Windows PowerShell**:

1. Install the prerequisites (reopen PowerShell afterwards so they are on the PATH):
   ```powershell
   winget install OpenJS.NodeJS.LTS
   winget install Git.Git
   winget install NSSM.NSSM
   ```
   (or install them from their websites if `winget` is not available). Install the two IIS modules from Microsoft's downloads.
2. Copy the `deploy\windows` folder to the server (RDP file transfer, a share, or USB). The repository is private, so it cannot be cloned until the deploy key exists.
3. Run the installer:
   ```powershell
   cd <folder you copied>
   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Domain apris.dsu.edu.pk -Repo git@github.com:sosanraazia/apris.git
   ```
   It asks for the initial admin password (6+ characters), creates the `apris` account, folders and permissions, generates a session secret and the **read-only deploy key**, then **prints the key and waits**.
4. **Add the key on GitHub** (repo owner/admin): `sosanraazia/apris` → Settings → Deploy keys → Add deploy key → title `apris-windows`, paste the whole `ssh-ed25519 …` line, leave **Allow write access unticked**. Back in PowerShell press Enter. The installer clones the repo, builds and starts the first release (a few minutes), removes the initial password from the env file, registers the two scheduled tasks and opens ports 80/443.
5. Check it: `Invoke-WebRequest http://127.0.0.1:3000/api/health` should say `{"ok":true}`.
6. Import the certificate into the machine store (`certlm.msc` → Personal → Certificates → import the `.pfx`), note its **thumbprint** (certificate → Details), then publish through IIS:
   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\apris\bootstrap\deploy\windows\iis.ps1 -Domain apris.dsu.edu.pk -CertThumbprint <thumbprint>
   ```
   Open `https://apris.dsu.edu.pk` and sign in as `admin`; you must change the password at first login.
7. Fill in the email settings (`SMTP_*`, `EMAIL_FROM`; use `EMAIL_REDIRECT_TO` during the pilot) in `C:\apris\config\apris.env` (template: `apris.env.example`), then `Restart-Service apris` and use Admin → Emails → Send test.

## Everyday operations
| Task | Command (elevated PowerShell) |
|---|---|
| Which version is live | `Split-Path -Leaf (Get-Item C:\apris\current).Target` (the git commit) |
| Status / restart / stop | `Get-Service apris` · `Restart-Service apris` · `Stop-Service apris` |
| App log | `Get-Content C:\apris\data\logs\apris.log -Tail 100` |
| Deploy log | `Get-Content C:\apris\data\deploy.log -Tail 100` |
| Deploy now (instead of waiting 2 min) | `Start-ScheduledTask "APRIS deploy"` |
| Backup now | `Start-ScheduledTask "APRIS backup"` |
| Change a setting / secret | edit `C:\apris\config\apris.env`, then `Restart-Service apris` |
| Reset a user's password | Admin → Manage users → Reset (or `npm run admin:reset` in `C:\apris\current`, with the env loaded) |

**Deploys:** push to `clean-main` on GitHub; within about two minutes the server builds it in a new release folder, runs the tests, backs up the database, applies new migrations, switches over and checks `/api/health`. If anything fails the old version keeps running (the log says why), and a commit that failed is not retried until a newer commit arrives.

**Rollback by hand:** `Stop-Service apris; cmd /c rmdir C:\apris\current; New-Item -ItemType Junction C:\apris\current -Target C:\apris\releases\<older commit>; Start-Service apris`. The database is only ever migrated forwards; restore a pre-deploy backup from `C:\apris\data\backups\pre-<commit>.db` if a migration must be undone.

**Restore a backup:** `Stop-Service apris`, copy `C:\apris\backups\apris-<date>.db` over `C:\apris\data\apris.db` (delete any `apris.db-wal` / `-shm` next to it), `Start-Service apris`.

## Moving existing registrations onto the server (not through git)
1. On your Mac/Linux development machine: `bash deploy/data-export.sh` (asks for a passphrase) → `~/apris-data-YYYY-MM-DD.tar.enc`.
2. Copy that file to the server (RDP file transfer / share / USB; `scp` only if IT enabled OpenSSH Server) and give the passphrase to IT by a **different channel**.
3. On the server: `powershell -ExecutionPolicy Bypass -File C:\apris\bootstrap\deploy\windows\data-import.ps1 -File <path to the .tar.enc>`. Type `REPLACE`, enter the passphrase. It checks the file, backs up the current database, replaces the data, applies pending migrations and restarts the app.
4. Delete the file on both machines, and reset or disable the dev accounts (`admin`, `hod`, `advisor`) that came with the data.

For go-live prefer clearing test data and registering for real on the server (see `deploy/README.md`).

## Security notes
- The app listens only on `127.0.0.1`; IIS is the only thing reachable. The firewall rules open 80 and 443 only.
- Service account `apris` is a plain local user: it can read the release, write `data\` and read `config\`. It cannot read the deploy key or the backups.
- `apris.env` holds the session secret and SMTP password: SYSTEM/Administrators full, `apris` read only. Never commit it.
- IIS has no equivalent of the nginx login-rate-limit in the Linux kit. The app still locks accounts after repeated failures; add the IIS *Dynamic IP Restrictions* module if you want per-address throttling too.
- Keep Windows Update on, and keep Node.js and Git current.

## Known limits
- Untested on a real Windows Server (see the note at the top).
- The Linux `data-push.sh` one-command push assumes an SSH server on the target; on Windows use the copy + `data-import.ps1` steps above.
- `npm start` in `package.json` uses shell syntax that `cmd.exe` does not understand; the Windows service avoids it by running Node directly (`run.ps1`).
