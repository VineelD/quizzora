# Wrapper for Task Scheduler (SYSTEM). Resolves a stable Node path and runs uptime-check.mjs.
$ErrorActionPreference = "Stop"

$appPath = "C:\LittleCode"
Set-Location $appPath

$nodeExe = $null
foreach ($candidate in @(
  "C:\Program Files\nodejs\node.exe",
  "C:\Program Files (x86)\nodejs\node.exe"
)) {
  if (Test-Path $candidate) {
    $nodeExe = $candidate
    break
  }
}

if (-not $nodeExe) {
  $nodeExe = (Get-Command node -ErrorAction Stop).Source
}

& $nodeExe (Join-Path $appPath "scripts\uptime-check.mjs")
