# Pull-based deploy for Windows. Run by the "APRIS deploy" scheduled task every 2 minutes (as SYSTEM), or by hand from an elevated PowerShell.
# Builds the new commit in its own release folder and only switches over if it built, passed tests and answers /api/health.
# On any failure the previous release keeps running.
$ErrorActionPreference = "Stop"
$Base = "C:\apris"; $Data = "$Base\data"; $Repo = "$Base\repo.git"; $Log = "$Data\deploy.log"
$Health = "http://127.0.0.1:3000/api/health"
New-Item -ItemType Directory -Force "$Base\releases", "$Data\backups", "$Data\logs" | Out-Null

function Log([string]$m) { $line = "$(Get-Date -Format s) $m"; Write-Host $line; Add-Content -Path $Log -Value $line }

# one deploy at a time
try { $lock = [System.IO.File]::Open("$Data\deploy.lock", "OpenOrCreate", "ReadWrite", "None") } catch { Write-Host "deploy already running"; exit 0 }

# environment (may define APRIS_BRANCH; the build also needs DATABASE_URL and SESSION_SECRET)
Get-Content "$Base\config\apris.env" | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$' -and $_ -notmatch '^\s*#') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim('"', "'"), "Process") }
}
$Branch = if ($env:APRIS_BRANCH) { $env:APRIS_BRANCH } else { "clean-main" }
$env:GIT_SSH_COMMAND = "ssh -i C:/apris/.ssh/id_ed25519 -o UserKnownHostsFile=C:/apris/.ssh/known_hosts -o StrictHostKeyChecking=yes -o BatchMode=yes -o IdentitiesOnly=yes"

& git --git-dir=$Repo fetch --quiet origin "+refs/heads/${Branch}:refs/heads/${Branch}"
if ($LASTEXITCODE -ne 0) { Log "git fetch failed (network or deploy key?)"; exit 1 }
$New = (& git --git-dir=$Repo rev-parse $Branch).Trim()
$Cur = ""
if (Test-Path "$Base\current") { $Cur = Split-Path -Leaf ((Get-Item "$Base\current").Target | Select-Object -First 1) }
if ($New -eq $Cur) { exit 0 }
if ((Test-Path "$Data\failed-sha") -and ((Get-Content "$Data\failed-sha" -Raw).Trim() -eq $New)) { exit 0 }   # don't retry a known-bad commit every 2 minutes

$Rel = "$Base\releases\$New"
Log "deploying $New (current: $(if ($Cur) { $Cur } else { 'none' }))"
function Fail([string]$step) {
  Log "DEPLOY FAILED at step: $step - keeping $Cur"
  Set-Content -Path "$Data\failed-sha" -Value $New
  if (Test-Path $Rel) { Remove-Item -Recurse -Force $Rel -ErrorAction SilentlyContinue }
  $lock.Close(); exit 1
}
# native commands run through cmd so their stderr (npm warnings) is just logged, not treated as a PowerShell error
function Step([string]$name, [string]$cmdline) { & cmd.exe /c "$cmdline >> `"$Log`" 2>&1"; if ($LASTEXITCODE -ne 0) { Fail $name } }

if (Test-Path $Rel) { Remove-Item -Recurse -Force $Rel }
New-Item -ItemType Directory -Force $Rel | Out-Null
$zip = "$Base\release-$New.zip"
& git --git-dir=$Repo archive --format=zip -o $zip $New
if ($LASTEXITCODE -ne 0) { Fail "git archive" }
Expand-Archive -Path $zip -DestinationPath $Rel -Force
Remove-Item $zip -Force
Set-Location $Rel

Step "npm ci"          "npm ci --include=dev --no-audit --no-fund"
Step "prisma generate" "npx prisma generate"
Step "tests"           "npm test"
Step "build"           "npm run build"

# back up the database, then apply only new migrations (never resets data)
$Db = "$Data\apris.db"
if (Test-Path $Db) { Step "pre-deploy backup" "node scripts\db-tool.mjs backup `"$Db`" `"$Data\backups\pre-$New.db`"" }
Step "migrate" "npx prisma migrate deploy"
if (-not (Test-Path "$Data\.seeded")) { Step "seed:init" "npm run seed:init"; New-Item -ItemType File "$Data\.seeded" | Out-Null }

# switch and restart (a junction is the Windows equivalent of the "current" symlink)
$Prev = ""
if (Test-Path "$Base\current") { $Prev = ((Get-Item "$Base\current").Target | Select-Object -First 1); & cmd.exe /c "rmdir `"$Base\current`"" }
New-Item -ItemType Junction -Path "$Base\current" -Target $Rel | Out-Null
Restart-Service apris

for ($i = 0; $i -lt 30; $i++) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 $Health
    if ($r.StatusCode -eq 200) {
      Remove-Item "$Data\failed-sha" -Force -ErrorAction SilentlyContinue
      Log "deployed $New OK"
      foreach ($f in "deploy.ps1", "run.ps1", "backup.ps1") { Copy-Item "$Rel\deploy\windows\$f" "$Base\$f.new" -Force; Move-Item "$Base\$f.new" "$Base\$f" -Force }   # the tasks run these stable copies
      Get-ChildItem "$Base\releases" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -Skip 3 | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue   # keep the 3 newest
      Get-ChildItem "$Data\backups" -Filter "pre-*.db" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force
      $lock.Close(); exit 0
    }
  } catch { }
  Start-Sleep -Seconds 2
}

Log "health check FAILED - rolling back"
if ($Prev -and (Test-Path $Prev)) {
  & cmd.exe /c "rmdir `"$Base\current`""
  New-Item -ItemType Junction -Path "$Base\current" -Target $Prev | Out-Null
  Restart-Service apris
}
Set-Content -Path "$Data\failed-sha" -Value $New
Log "rolled back to $(if ($Prev) { $Prev } else { 'none' }). Database backup taken before this deploy: $Data\backups\pre-$New.db"
$lock.Close(); exit 1
