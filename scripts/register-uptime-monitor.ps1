# Register a Windows scheduled task that polls /api/health and emails on failure.
#
# Run elevated (Administrator):
#   powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\register-uptime-monitor.ps1
#
# Task name: Quizzora Uptime Monitor (every 5 minutes)

param(
  [int]$IntervalMinutes = 5
)

$ErrorActionPreference = "Stop"

function Test-IsAdmin {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
  throw "Run this script in an elevated PowerShell (Administrator)."
}

$prodRoot = "C:\LittleCode"
$wrapperScript = Join-Path $prodRoot "scripts\run-uptime-check.ps1"

if (-not (Test-Path $wrapperScript)) {
  throw "Uptime wrapper not found: $wrapperScript"
}

$taskName = "Quizzora Uptime Monitor"
$taskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$wrapperScript`""

$schtasksArgs = @(
  "/Create",
  "/TN", $taskName,
  "/TR", $taskCommand,
  "/SC", "MINUTE",
  "/MO", "$IntervalMinutes",
  "/RU", "SYSTEM",
  "/RL", "HIGHEST",
  "/F"
)

& schtasks.exe @schtasksArgs | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "schtasks failed with exit code $LASTEXITCODE"
}

Write-Host "Registered/updated task: $taskName (every $IntervalMinutes minutes, SYSTEM)"
Write-Host ""
Write-Host "Before alerts work, set in C:\LittleCode\.env.local:"
Write-Host "  UPTIME_ALERT_EMAIL=your-operator@example.com"
Write-Host "  RESEND_API_KEY=...  (or SMTP_* vars)"
Write-Host ""
Write-Host "Optional:"
Write-Host "  UPTIME_CHECK_URL=http://127.0.0.1:3000/api/health"
Write-Host "  UPTIME_CHECK_URLS=http://127.0.0.1:3000/api/health,https://quizzora.org/api/health"
Write-Host "  UPTIME_ALERT_COOLDOWN_MINUTES=60"
Write-Host ""
Write-Host "Test manually:"
Write-Host "  node C:\LittleCode\scripts\uptime-check.mjs"
Write-Host ""
Write-Host "Verify task:"
Write-Host "  schtasks /Query /TN `"$taskName`" /V /FO LIST"
