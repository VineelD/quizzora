# One-time setup for test.quizzora.org staging environment.
# Run as Administrator:
#   powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\setup-test-environment.ps1

$ErrorActionPreference = "Stop"

$prodRoot = "C:\LittleCode"
$testRoot = "C:\LittleCode-test"
$siteName = "LittleCode-Test"
$taskName = "LittleCode Test Next.js"
$hostName = "test.quizzora.org"
$certThumb = "97D42CBAEAFCCA0ED566407BFF4F46B7A1A7582C"

function Test-IsAdmin {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
  Write-Warning "Run this script in an elevated PowerShell (Administrator) for IIS and scheduled task setup."
}

Write-Host "=== 1. Clone / sync from production ==="
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $prodRoot "scripts\sync-test-from-prod.ps1")

Write-Host "`n=== 2. Install dependencies and build test app ==="
Set-Location $testRoot
if (-not (Test-Path "node_modules")) {
  npm install --no-fund --no-audit
}
npm run build

Write-Host "`n=== 3. IIS site ($siteName) ==="
Import-Module WebAdministration -ErrorAction Stop

$site = Get-Website -Name $siteName -ErrorAction SilentlyContinue
if (-not $site) {
  New-Website -Name $siteName -PhysicalPath $testRoot -Port 80 -HostHeader $hostName | Out-Null
  Write-Host "Created IIS site $siteName"
} else {
  Set-ItemProperty "IIS:\Sites\$siteName" -Name physicalPath -Value $testRoot
  Write-Host "IIS site $siteName already exists - updated physical path"
}

$httpBinding = Get-WebBinding -Name $siteName -Protocol "http" -HostHeader $hostName -Port 80 -ErrorAction SilentlyContinue
if (-not $httpBinding) {
  New-WebBinding -Name $siteName -Protocol http -Port 80 -HostHeader $hostName | Out-Null
  Write-Host "Added HTTP binding *:80:$hostName"
}

$httpsBinding = Get-WebBinding -Name $siteName -Protocol "https" -HostHeader $hostName -Port 443 -ErrorAction SilentlyContinue
if (-not $httpsBinding) {
  New-WebBinding -Name $siteName -Protocol https -Port 443 -HostHeader $hostName | Out-Null
  Write-Host "Added HTTPS binding *:443:$hostName"
}

$httpsBinding = Get-WebBinding -Name $siteName -Protocol https -Port 443 -HostHeader $hostName
try {
  $httpsBinding.AddSslCertificate($certThumb, "my")
  Write-Host "Assigned SSL certificate $certThumb"
} catch {
  Write-Warning "Could not assign certificate automatically: $($_.Exception.Message)"
  Write-Warning "Assign a certificate for $hostName in IIS Manager - $siteName - Bindings"
}

Start-Website -Name $siteName

Write-Host "`n=== 4. Scheduled task ($taskName) ==="
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$testRoot\start-littlecode-test.ps1`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  Set-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
  Write-Host "Updated scheduled task $taskName"
} else {
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Quizzora staging (test.quizzora.org) on port 3001" | Out-Null
  Write-Host "Registered scheduled task $taskName"
}

Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 4

Write-Host "`n=== 5. Verify local listener ==="
$listener = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  Write-Host "OK - Node listening on 127.0.0.1:3001"
} else {
  Write-Warning "Port 3001 not listening yet - check $testRoot\logs\next.log"
}

Write-Host "`n=== 6. DNS (manual in Cloudflare) ==="
Write-Host "Add proxied DNS: CNAME test -> quizzora.org (orange cloud)"
Write-Host "Verify: https://test.quizzora.org/api/health"
Write-Host "Stripe: run npm run stripe:sandbox with sk_test_... and APP_BASE_URL=https://test.quizzora.org"
Write-Host 'Then merge .env.stripe-test.local into C:\LittleCode-test\.env.local and rebuild'
Write-Host "Refresh: scripts\sync-test-from-prod.ps1 then build and restart $taskName"
