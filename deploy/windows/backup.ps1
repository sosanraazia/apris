# Nightly backup of the database and uploaded documents (scheduled task "APRIS backup", as SYSTEM). Keeps 14 days.
$ErrorActionPreference = "Stop"
$Base = "C:\apris"; $Dest = "C:\apris\backups"; $Stamp = Get-Date -Format "yyyy-MM-dd"
New-Item -ItemType Directory -Force $Dest | Out-Null
Get-Content "$Base\config\apris.env" | ForEach-Object { if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$' -and $_ -notmatch '^\s*#') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim('"', "'"), "Process") } }
$Db = $env:DATABASE_URL -replace '^file:', ''
& node "$Base\current\scripts\db-tool.mjs" backup $Db "$Dest\apris-$Stamp.db"
if ($LASTEXITCODE -ne 0) { throw "database backup failed" }
if (Get-ChildItem $env:STORAGE_DIR -Force -ErrorAction SilentlyContinue) { Compress-Archive -Path "$env:STORAGE_DIR\*" -DestinationPath "$Dest\storage-$Stamp.zip" -Force }
Get-ChildItem $Dest -File | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } | Remove-Item -Force
