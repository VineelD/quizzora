# Nightly SQLite backup for LittleCode
# Schedule in Task Scheduler: daily, run whether user is logged on or not

$ErrorActionPreference = "Stop"

$appPath = "C:\LittleCode"
$source = if ($env:SQLITE_DATABASE_PATH) { $env:SQLITE_DATABASE_PATH } else { Join-Path $appPath "data\littlecode.sqlite" }
$backupRoot = Join-Path $appPath "backups"
$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$destDir = Join-Path $backupRoot $stamp

if (-not (Test-Path $source)) {
  Write-Error "Database not found: $source"
}

New-Item -ItemType Directory -Force -Path $destDir | Out-Null
Copy-Item -Path $source -Destination (Join-Path $destDir "littlecode.sqlite") -Force

# Keep last 14 daily folders
Get-ChildItem $backupRoot -Directory | Sort-Object Name -Descending | Select-Object -Skip 14 | ForEach-Object {
  Remove-Item $_.FullName -Recurse -Force
}

Write-Host "Backup saved to $destDir"
