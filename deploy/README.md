# Deploying APRIS on the university VM (Ubuntu)

Target address: **https://apris.se.dsu.edu.pk** (change `DOMAIN` if IT picks another name).

## How updates work

```
you push to GitHub `clean-main`
        │            (private repo; the VM only *pulls*, no inbound access needed)
        ▼
apris-deploy.timer  → every 2 min → /opt/apris/deploy.sh
   fetch → build in a new release dir → tests → back up DB → migrate → switch → health check
        │
        ├─ healthy  → new version live, old releases pruned (last 3 kept)
        └─ unhealthy / any step fails → previous version keeps running (auto-rollback), the bad commit is not retried
```

Data never lives in the git checkout: database `/var/lib/apris/apris.db`, uploaded PDFs `/var/lib/apris/storage`, secrets `/etc/apris/apris.env`.

## Ask university IT for (one-time)

1. A VM: Ubuntu 22.04/24.04, 2 vCPU, 4 GB RAM, 20 GB disk, and `sudo` for you.
2. DNS record `apris.se.dsu.edu.pk` → the VM's IP.
3. Firewall: inbound **80** and **443**. Outbound **443** to `github.com` **and SSH (22) to `github.com`** (or use `ssh.github.com:443`), plus `registry.npmjs.org`, `binaries.prisma.sh`, `deb.nodesource.com` and Ubuntu apt mirrors. (Without outbound access to these the VM can't build.)
4. Confirmation that storing student names / grades / transcripts on this VM is approved, and how the VM disk is backed up off-machine.
6. Either permission for a Let's Encrypt certificate, or a university-issued TLS certificate.

## First install

The repository is **private**, so the VM cannot clone it over plain HTTPS. The VM authenticates with a **read-only deploy key** (an SSH key that exists only on the VM and can only read this one repo).

1. From your laptop, copy the deploy folder to the VM (the VM needs no GitHub access for this step):
   ```bash
   scp -r deploy <your-user>@<vm-address>:/tmp/apris-deploy
   ```
2. On the VM, run the installer:
   ```bash
   cd /tmp/apris-deploy
   sudo DOMAIN=apris.se.dsu.edu.pk REPO=git@github.com:sosanraazia/apris.git CERT_EMAIL=you@dsu.edu.pk bash install.sh
   ```
3. When it prints `Add this public key as a READ-ONLY deploy key…` and shows a line starting with `ssh-ed25519`, **copy that whole line** and add it in GitHub (you need to be an admin of the repo):
   *GitHub → `sosanraazia/apris` → Settings → Deploy keys → Add deploy key* → title `apris-vm`, paste the key, **leave "Allow write access" unticked**, Add key. Then go back to the VM terminal and press Enter. The script checks the key works before it continues.
4. If you ever need to see the key again: `sudo cat /var/lib/apris/.ssh/id_ed25519.pub` (the private half, `id_ed25519`, never leaves the VM and must never be copied or committed).

**Rotating or revoking the key:** delete it under Settings → Deploy keys (the VM stops being able to pull immediately), then on the VM run `sudo -u apris rm /var/lib/apris/.ssh/id_ed25519*` and re-run `install.sh` to generate and register a new one. Do this if the VM is rebuilt, replaced or suspected of compromise. One deploy key can only be attached to one repository, which is what we want here.

Network: the VM needs outbound SSH (22) to `github.com`, or port 443 via `ssh.github.com` (ask IT; see the firewall list above).

The script asks for an initial admin password, generates a session secret and a **read-only deploy key**, prints the key and waits while you add it at *GitHub → repo → Settings → Deploy keys* (leave "Allow write access" off). It then builds and starts the app, sets up nginx + HTTPS, and enables the deploy and backup timers.

Afterwards:
0. Put the SMTP details in `/etc/apris/apris.env` (see `apris.env.example`), `sudo systemctl restart apris`, then **Admin → Emails → Send test**. Use `EMAIL_REDIRECT_TO` during the pilot.
1. Open https://apris.se.dsu.edu.pk, log in as `admin`.
2. You will be asked to change the initial password immediately (the installer has already removed it from `/etc/apris/apris.env`).
3. **Admin → Manage users**: create the advisors and the HoD. Each gets a temporary password and must change it at first login.
4. **Admin → offering rows needing attention**: enter the missing CBA codes / sections.

## Day to day

| Task | How |
|---|---|
| Release a change | Merge/push to `clean-main` (the deploy branch; set by `APRIS_BRANCH` in `/etc/apris/apris.env`). CI (GitHub Actions) checks it; the VM deploys it within ~2 minutes. |
| See what happened | `tail -f /var/lib/apris/deploy.log`, `journalctl -u apris -f` |
| Deploy now | `sudo -u apris /opt/apris/deploy.sh` |
| Which version is live | `basename $(readlink -f /opt/apris/current)` (the git commit) |
| A deploy failed | The old version is still running. Fix, push again. (`/var/lib/apris/failed-sha` remembers the bad commit.) |
| Roll back by hand | `ln -sfn /opt/apris/releases/<older-sha> /opt/apris/current && sudo systemctl restart apris` |
| Reload the offering workbook (new semester) | Replace `data/Fall2026CourseOffering.xlsx` in git for now and ask a developer to run `npm run seed` in a **staging** copy — it *overwrites* Admin's CBA fixes. Don't run it on production without a backup. |
| Backups | Nightly 02:30 to `/var/backups/apris` (14 days). **Copy these off the VM.** A DB backup is also taken before every deploy in `/var/lib/apris/backups`. |
| Restore | `systemctl stop apris; cp /var/backups/apris/apris-<date>.db /var/lib/apris/apris.db; tar -xzf …storage-<date>.tar.gz -C /var/lib/apris; chown -R apris:apris /var/lib/apris; systemctl start apris` |

## Protect the deploy branch

In GitHub → Settings → Branches, require a pull request and the CI check on `clean-main`. Whatever lands on it goes live on the VM automatically, so `clean-main` should only receive reviewed, green changes.

## Security notes

- The deploy key is read-only and belongs to a service account with no shell (`apris`); it can restart the app service and nothing else with root.
- `/etc/apris/apris.env` is readable only by root and `apris`.
- Sessions are 8-hour signed cookies, `Secure` in production; login locks a username for 10 minutes after 5 failures.
- Real student PDFs are never committed (`data/sample/`, `storage/` are git-ignored). Keep it that way.
- The install script downloads Node from NodeSource and pipes it to bash; if IT prefers, install Node 22 by their own method first — the script skips it when Node ≥ 22 is present.
- **Not tested on a real VM yet.** The scripts pass a syntax check but have never run on Ubuntu; do the first install with IT's help and expect to adjust.
