<#
Run ON THE SERVER, elevated. Replaces the production database and uploaded documents with the contents of a file made by
deploy/data-export.sh on the developer machine (see deploy\windows\README.md).

  powershell -ExecutionPolicy Bypass -File C:\apris\bootstrap\deploy\windows\data-import.ps1 -File C:\temp\apris-data-2026-10-08.tar.enc

Needs Git for Windows (its OpenSSL decrypts the file) and the built-in tar.exe. The current database is backed up first.
#>
param([Parameter(Mandatory = $true)][string]$File)
$ErrorActionPreference = "Stop"
$Base = "C:\apris"; $Data = "$Base\data"; $Stamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
if (-not (Test-Path $File)) { throw "No such file: $File" }
$GitRoot = Split-Path -Parent (Split-Path -Parent (Get-Command git).Source)
$OpenSsl = @("$GitRoot\usr\bin\openssl.exe", "$GitRoot\..\usr\bin\openssl.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $OpenSsl) { throw "OpenSSL not found (it ships with Git for Windows)." }

Write-Host "This REPLACES the database and uploaded documents in $Data with the contents of $File."
if ((Read-Host "Type REPLACE to continue") -ne "REPLACE") { Write-Host "Cancelled."; exit 1 }
$sec = Read-Host -AsSecureString "Passphrase"
$env:APRIS_DATA_PASSPHRASE = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))

$tmp = Join-Path $env:TEMP "apris-import-$Stamp"
New-Item -ItemType Directory -Force $tmp | Out-Null
try {
  & cmd.exe /c "`"$OpenSsl`" enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:APRIS_DATA_PASSPHRASE -in `"$File`" -out `"$tmp\bundle.tar`" 2>nul"
  if ($LASTEXITCODE -ne 0) { throw "Could not decrypt the file (wrong passphrase?). Nothing was changed." }
  & tar -xf "$tmp\bundle.tar" -C $tmp
  if ($LASTEXITCODE -ne 0) { throw "The file is not a valid APRIS data bundle. Nothing was changed." }
  $check = (& node "$Base\current\scripts\db-tool.mjs" check "$tmp\apris.db") | Select-Object -Last 1
  if ($check -ne "ok") { throw "The database in the file is damaged ($check). Nothing was changed." }

  Stop-Service apris
  if (Test-Path "$Data\apris.db") { & node "$Base\current\scripts\db-tool.mjs" backup "$Data\apris.db" "$Data\backups\before-import-$Stamp.db" }
  Remove-Item "$Data\apris.db-wal", "$Data\apris.db-shm" -Force -ErrorAction SilentlyContinue
  Copy-Item "$tmp\apris.db" "$Data\apris.db" -Force
  New-Item -ItemType Directory -Force "$Data\storage" | Out-Null
  Copy-Item "$tmp\storage\*" "$Data\storage" -Recurse -Force -ErrorAction SilentlyContinue

  # bring an older database up to the deployed schema
  Get-Content "$Base\config\apris.env" | ForEach-Object { if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$' -and $_ -notmatch '^\s*#') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim('"', "'"), "Process") } }
  Push-Location "$Base\current"
  & cmd.exe /c "npx prisma migrate deploy"
  Pop-Location
  if ($LASTEXITCODE -ne 0) { throw "Migration failed; the previous database is at $Data\backups\before-import-$Stamp.db" }
  New-Item -ItemType File "$Data\.seeded" -Force | Out-Null   # the data already has its reference tables
  Start-Service apris
  Write-Host "Imported."
  if (Test-Path "$Data\backups\before-import-$Stamp.db") { Write-Host "Previous database kept at $Data\backups\before-import-$Stamp.db" }
  Write-Host "NEXT: sign in, then reset the password of every account you do not recognise or disable it (the dev accounts admin / hod / advisor came with the data)."
}
finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  Remove-Item Env:\APRIS_DATA_PASSPHRASE -ErrorAction SilentlyContinue
  if ((Get-Service apris -ErrorAction SilentlyContinue).Status -eq "Stopped") { Start-Service apris -ErrorAction SilentlyContinue }
}
