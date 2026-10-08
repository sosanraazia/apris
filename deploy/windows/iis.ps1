<#
Publishes APRIS through IIS with HTTPS (reverse proxy to 127.0.0.1:3000). Run elevated, after install.ps1:

  powershell -ExecutionPolicy Bypass -File C:\apris\bootstrap\deploy\windows\iis.ps1 -Domain apris.se.dsu.edu.pk -CertThumbprint <thumbprint>

Before running: install the Microsoft IIS modules "URL Rewrite" and "Application Request Routing" (ask IT), and import the university-issued
certificate (.pfx) into the machine's Personal store (certlm.msc). The thumbprint is on the certificate's Details tab.
#>
param(
  [Parameter(Mandatory = $true)][string]$Domain,
  [Parameter(Mandatory = $true)][string]$CertThumbprint,
  [string]$SiteRoot = "C:\inetpub\apris"
)
$ErrorActionPreference = "Stop"
Import-Module WebAdministration -ErrorAction SilentlyContinue
if (-not (Get-Command Install-WindowsFeature -ErrorAction SilentlyContinue)) { throw "This must run on Windows Server." }

Write-Host "==> IIS role"
Install-WindowsFeature Web-Server, Web-Filtering, Web-Http-Logging, Web-Mgmt-Console | Out-Null
Import-Module WebAdministration

if (-not (Test-Path "$env:windir\System32\inetsrv\rewrite.dll")) { throw "IIS URL Rewrite module is not installed." }
if (-not (Test-Path "$env:windir\System32\inetsrv\requestRouter.dll")) { throw "IIS Application Request Routing (ARR) module is not installed." }
$cert = Get-ChildItem "Cert:\LocalMachine\My" | Where-Object { $_.Thumbprint -eq ($CertThumbprint -replace '\s', '').ToUpper() }
if (-not $cert) { throw "Certificate $CertThumbprint not found in LocalMachine\My." }

Write-Host "==> Proxy settings"
Set-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST" -Filter "system.webServer/proxy" -Name "enabled" -Value "True"
Set-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST" -Filter "system.webServer/proxy" -Name "preserveHostHeader" -Value "True"
Set-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST" -Filter "system.webServer/proxy" -Name "reverseRewriteHostInResponseHeaders" -Value "False"
foreach ($v in "HTTP_X_FORWARDED_HOST", "HTTP_X_FORWARDED_PROTO", "HTTP_X_REAL_IP", "HTTP_X_FORWARDED_FOR") {
  if (-not (Get-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST" -Filter "system.webServer/rewrite/allowedServerVariables/add[@name='$v']" -Name "name" -ErrorAction SilentlyContinue)) {
    Add-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST" -Filter "system.webServer/rewrite/allowedServerVariables" -Name "." -Value @{ name = $v }
  }
}

Write-Host "==> Site"
New-Item -ItemType Directory -Force $SiteRoot | Out-Null
$cfg = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "web.config"
Copy-Item $cfg "$SiteRoot\web.config" -Force
if (Get-Website -Name "APRIS" -ErrorAction SilentlyContinue) { Remove-Website -Name "APRIS" }
New-Website -Name "APRIS" -PhysicalPath $SiteRoot -HostHeader $Domain -Port 80 -Force | Out-Null
New-WebBinding -Name "APRIS" -Protocol https -Port 443 -HostHeader $Domain -SslFlags 1   # SNI
(Get-WebBinding -Name "APRIS" -Protocol https).AddSslCertificate($cert.Thumbprint, "My")
Start-Website -Name "APRIS"

Write-Host ""
Write-Host "Done. Open https://$Domain . Check: Invoke-WebRequest https://$Domain/api/health"
