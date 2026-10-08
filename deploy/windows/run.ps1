# Started by the Windows service (NSSM). Loads C:\apris\config\apris.env into the environment, then runs the app from the current release.
$ErrorActionPreference = "Stop"
$Base = "C:\apris"
Get-Content "$Base\config\apris.env" | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$' -and $_ -notmatch '^\s*#') {
    $v = $Matches[2]
    if ($v.Length -ge 2 -and (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'")))) { $v = $v.Substring(1, $v.Length - 2) }
    [Environment]::SetEnvironmentVariable($Matches[1], $v, "Process")
  }
}
if (-not $env:PORT) { $env:PORT = "3000" }
if (-not $env:HOST) { $env:HOST = "127.0.0.1" }
Set-Location "$Base\current"
& node "node_modules\next\dist\bin\next" start -p $env:PORT -H $env:HOST
exit $LASTEXITCODE
