# Register "LittleCode Post-Reboot Recover" scheduled task (runs at startup, once per boot).
# Run elevated:
#   powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\register-post-reboot-recover.ps1

$ErrorActionPreference = "Stop"

function Test-IsAdmin {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
  throw "Run this script in an elevated PowerShell (Administrator)."
}

$repoRoot = "C:\LittleCode"
$scriptPath = Join-Path $repoRoot "scripts\post-reboot-recover.ps1"
if (-not (Test-Path $scriptPath)) {
  throw "Recovery script not found: $scriptPath"
}

$taskName = "LittleCode Post-Reboot Recover"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description "After reboot: verify NVIDIA driver, start Ollama, LittleCode, curriculum embed/generate, question-bank embed" -Force | Out-Null

Write-Host "Registered/updated task: $taskName (At startup, SYSTEM)"
Write-Host "Manual run: powershell -ExecutionPolicy Bypass -File `"$scriptPath`""
