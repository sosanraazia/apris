<#
First-time install on Windows Server 2019/2022. Run ONCE from an elevated PowerShell (Run as Administrator):

  powershell -ExecutionPolicy Bypass -File .\install.ps1 -Domain apris.se.dsu.edu.pk -Repo git@github.com:sosanraazia/apris.git

Use Windows PowerShell 5.1 (the default on Windows Server). Prerequisites (see deploy\windows\README.md): Node.js 22+, Git for Windows, NSSM. Re-running is safe: the env file, keys and database are kept.
#>
param(
  [string]$Domain = "apris.se.dsu.edu.pk",
  [string]$Repo = "git@github.com:sosanraazia/apris.git",
  [string]$Branch = "clean-main"
)
$ErrorActionPreference = "Stop"
$Base = "C:\apris"; $Data = "$Base\data"; $Cfg = "$Base\config"; $Ssh = "$Base\.ssh"; $Repository = "$Base\repo.git"

function Need([string]$what, [bool]$ok, [string]$hint) { if (-not $ok) { throw "Missing: $what. $hint" } }
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Need "administrator rights" $isAdmin "Open PowerShell with 'Run as administrator'."
Need "Node.js 22 or newer" ((Get-Command node -ErrorAction SilentlyContinue) -and ([int](& node -v).TrimStart('v').Split('.')[0] -ge 22)) "Install Node.js LTS (nodejs.org, or: winget install OpenJS.NodeJS.LTS) and reopen PowerShell."
Need "Git for Windows" ($null -ne (Get-Command git -ErrorAction SilentlyContinue)) "Install it (git-scm.com, or: winget install Git.Git) and reopen PowerShell."
Need "NSSM (service wrapper)" ($null -ne (Get-Command nssm -ErrorAction SilentlyContinue)) "Install it (nssm.cc, or: winget install NSSM.NSSM) and reopen PowerShell."
$GitRoot = Split-Path -Parent (Split-Path -Parent (Get-Command git).Source)
$SshKeygen = @("$GitRoot\usr\bin\ssh-keygen.exe", "$GitRoot\..\usr\bin\ssh-keygen.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $SshKeygen) { $SshKeygen = (Get-Command ssh-keygen -ErrorAction SilentlyContinue).Source }
Need "ssh-keygen" ($null -ne $SshKeygen) "It ships with Git for Windows; reinstall Git with the default options."

Write-Host "==> Folders and service account"
New-Item -ItemType Directory -Force "$Base\releases", "$Data\storage", "$Data\logs", "$Data\backups", "$Base\backups", $Cfg, $Ssh | Out-Null
$svcUser = "apris"
if (-not (Get-LocalUser -Name $svcUser -ErrorAction SilentlyContinue)) {
  $bytes = New-Object byte[] 24; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $svcPassword = "Aa1!" + [Convert]::ToBase64String($bytes)   # long random, never shown or stored except inside the service definition
  New-LocalUser -Name $svcUser -Password (ConvertTo-SecureString $svcPassword -AsPlainText -Force) -PasswordNeverExpires -UserMayNotChangePassword -Description "APRIS service account" | Out-Null
  Add-LocalGroupMember -Group "Users" -Member $svcUser
  $newUser = $true
} else { $newUser = $false }
# the service account may run the app and write its data, nothing else
& icacls $Base /inheritance:r /grant "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" | Out-Null
& icacls "$Base\releases" /grant "${svcUser}:(OI)(CI)M" | Out-Null
& icacls $Data /grant "${svcUser}:(OI)(CI)M" | Out-Null
& icacls $Cfg /grant "${svcUser}:(OI)(CI)R" | Out-Null
& icacls $Base /grant "${svcUser}:(RX)" | Out-Null

Write-Host "==> Environment file"
$EnvFile = "$Cfg\apris.env"
if (-not (Test-Path $EnvFile)) {
  $pw = Read-Host -AsSecureString "Choose the initial admin password (6+ characters)"
  $adminPw = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw))
  if ($adminPw.Length -lt 6) { throw "Password too short (6+ characters)." }
  $sb = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($sb)
  @"
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
APP_DOMAIN=$Domain
APRIS_BRANCH=$Branch
SESSION_SECRET=$([Convert]::ToBase64String($sb))
DATABASE_URL=file:C:/apris/data/apris.db
STORAGE_DIR=$Data\storage
INITIAL_ADMIN_PASSWORD=$adminPw
"@ | Set-Content -Path $EnvFile -Encoding ascii
  & icacls $EnvFile /inheritance:r /grant "SYSTEM:F" "Administrators:F" "${svcUser}:R" | Out-Null
}

Write-Host "==> GitHub deploy key (read-only)"
$Key = "$Ssh\id_ed25519"
if (-not (Test-Path $Key)) { & cmd.exe /c "`"$SshKeygen`" -q -t ed25519 -N `"`" -C apris-deploy@$Domain -f `"$Key`""; if ($LASTEXITCODE -ne 0) { throw "ssh-keygen failed" } }
& icacls $Ssh /inheritance:r /grant "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" | Out-Null   # OpenSSH refuses a key other accounts can read
$env:GIT_SSH_COMMAND = "ssh -i C:/apris/.ssh/id_ed25519 -o UserKnownHostsFile=C:/apris/.ssh/known_hosts -o StrictHostKeyChecking=yes -o BatchMode=yes -o IdentitiesOnly=yes"
$Keyscan = "$(Split-Path $SshKeygen)\ssh-keyscan.exe"
if (-not (Test-Path "$Ssh\known_hosts")) { (& cmd.exe /c "`"$Keyscan`" -t ed25519 github.com 2>nul") | Set-Content -Path "$Ssh\known_hosts" -Encoding ascii }
$GitSsh = "$(Split-Path $SshKeygen)\ssh.exe"
$probe = (& cmd.exe /c "`"$GitSsh`" -i `"$Key`" -o UserKnownHostsFile=`"$Ssh\known_hosts`" -o StrictHostKeyChecking=yes -o BatchMode=yes -o IdentitiesOnly=yes -T git@github.com 2>&1") | Out-String
if ($probe -notmatch "successfully authenticated") {
  Write-Host ""
  Write-Host "Add this public key as a READ-ONLY deploy key to the repository"
  Write-Host "(GitHub -> repo -> Settings -> Deploy keys -> Add deploy key; leave 'Allow write access' OFF):"
  Write-Host ""; Get-Content "$Key.pub"; Write-Host ""
  Read-Host "Press Enter once the key is added"
}

Write-Host "==> Clone"
if (-not (Test-Path $Repository)) { & git clone --bare --quiet $Repo $Repository; if ($LASTEXITCODE -ne 0) { throw "git clone failed - is the deploy key added and outbound SSH to github.com allowed?" } }
& git --git-dir=$Repository fetch --quiet origin "+refs/heads/${Branch}:refs/heads/${Branch}"
$tmp = "$Base\bootstrap.zip"
& git --git-dir=$Repository archive --format=zip -o $tmp $Branch deploy/windows
Expand-Archive -Path $tmp -DestinationPath "$Base\bootstrap" -Force; Remove-Item $tmp
foreach ($f in "deploy.ps1", "run.ps1", "backup.ps1") { Copy-Item "$Base\bootstrap\deploy\windows\$f" "$Base\$f" -Force }
& icacls "$Base\run.ps1" /grant "${svcUser}:R" | Out-Null

Write-Host "==> Windows service (NSSM)"
if (-not (Get-Service apris -ErrorAction SilentlyContinue)) {
  $ps = (Get-Command powershell.exe).Source
  & nssm install apris $ps "-NoProfile -ExecutionPolicy Bypass -File $Base\run.ps1" | Out-Null
  & nssm set apris AppDirectory $Base | Out-Null
  & nssm set apris DisplayName "APRIS" | Out-Null
  & nssm set apris Description "Academic Progression and Registration Intelligence System" | Out-Null
  & nssm set apris Start SERVICE_AUTO_START | Out-Null
  & nssm set apris AppExit Default Restart | Out-Null
  & nssm set apris AppRestartDelay 3000 | Out-Null
  & nssm set apris AppStdout "$Data\logs\apris.log" | Out-Null
  & nssm set apris AppStderr "$Data\logs\apris.log" | Out-Null
  & nssm set apris AppRotateFiles 1 | Out-Null
  & nssm set apris AppRotateBytes 10485760 | Out-Null
  if ($newUser) { & nssm set apris ObjectName ".\$svcUser" $svcPassword | Out-Null }
  else { Write-Host "!! The 'apris' account already existed: set the service to run as it with: nssm set apris ObjectName .\apris <password>" }
}

Write-Host "==> First build and start (takes a few minutes)"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$Base\deploy.ps1"
if ($LASTEXITCODE -ne 0) { throw "First deploy failed - read $Data\deploy.log" }
# the initial admin password has done its job - don't leave it on disk (the admin must change it at first login)
(Get-Content $EnvFile) | Where-Object { $_ -notmatch '^INITIAL_ADMIN_PASSWORD=' } | Set-Content -Path $EnvFile -Encoding ascii

Write-Host "==> Scheduled tasks (deploy every 2 minutes, backup nightly)"
$ps = (Get-Command powershell.exe).Source
$run = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$deployTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 2) -RepetitionDuration (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName "APRIS deploy" -Force -Principal $run -Trigger $deployTrigger -Settings (New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)) `
  -Action (New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -File $Base\deploy.ps1") | Out-Null
Register-ScheduledTask -TaskName "APRIS backup" -Force -Principal $run -Trigger (New-ScheduledTaskTrigger -Daily -At 2:30am) `
  -Action (New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -File $Base\backup.ps1") | Out-Null

Write-Host "==> Firewall: only web ports inbound (the app itself listens on 127.0.0.1 only)"
foreach ($port in 80, 443) { if (-not (Get-NetFirewallRule -DisplayName "APRIS HTTP $port" -ErrorAction SilentlyContinue)) { New-NetFirewallRule -DisplayName "APRIS HTTP $port" -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow | Out-Null } }

Write-Host ""
Write-Host "Done. The app answers on http://127.0.0.1:3000 (check: Invoke-WebRequest http://127.0.0.1:3000/api/health)."
Write-Host "Next: publish it with HTTPS through IIS -> run  .\iis.ps1 -Domain $Domain -CertThumbprint <thumbprint>   (see deploy\windows\README.md)."
