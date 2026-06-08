# Reset production SQLite: backup first, wipe tenant data, keep superadmin + support.
# Usage:
#   powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\reset-prod-db-keep-platform.ps1

param(
  [switch]$SkipBackup
)

$ErrorActionPreference = "Stop"

$prodRoot = "C:\LittleCode"
$prodDb = Join-Path $prodRoot "data\littlecode.sqlite"
$taskName = "LittleCode Next.js"
$backupScript = Join-Path $prodRoot "scripts\backup-prod-db.ps1"
$resetScript = Join-Path $prodRoot "scripts\reset-prod-db-keep-platform.mjs"
$healthUrl = "http://127.0.0.1:3000/api/health"

function Write-ResetLog {
  param([string]$Message)
  $logDir = Join-Path $prodRoot "logs"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Add-Content -Path (Join-Path $logDir "reset-prod-db.log") -Value $line
  Write-Host $line
}

if (-not (Test-Path $prodDb)) {
  throw "Production database not found: $prodDb"
}

Write-ResetLog "START reset-prod-db-keep-platform"

$backupInfo = $null
if (-not $SkipBackup) {
  Write-Host "=== 1. Backup production database ==="
  $backupInfo = & $backupScript
  if (-not $backupInfo.BackupPath -or -not (Test-Path $backupInfo.BackupPath)) {
    throw "Backup failed or backup file missing."
  }
  Write-ResetLog "BACKUP $($backupInfo.BackupPath) sizeBytes=$($backupInfo.SizeBytes)"
} else {
  Write-Host "=== 1. Skipping backup (SkipBackup) ==="
}

Write-Host "`n=== 2. Stop $taskName ==="
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

Write-Host "`n=== 3. Reset database (keep superadmin + support) ==="
$env:SQLITE_DATABASE_PATH = $prodDb
Set-Location $prodRoot
$resultJson = node $resetScript
$result = $resultJson | ConvertFrom-Json
if (-not $result.ok) {
  throw "Reset failed: $resultJson"
}

Write-ResetLog "RESET ok platformUsers=$($result.platformUsers.Count)"
Write-Host ($resultJson)

Write-Host "`n=== 4. Restart $taskName ==="
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 8

Write-Host "`n=== 5. Verify health endpoint ==="
Set-Location $prodRoot
$healthJson = node --input-type=module -e @'
const url = "http://127.0.0.1:3000/api/health";
const response = await fetch(url, { redirect: "follow" });
const body = await response.json();
console.log(JSON.stringify({ ok: response.ok && body.status === "ok" && body.database === true, status: response.status, body }));
'@

$health = $healthJson | ConvertFrom-Json
if (-not $health.ok) {
  throw "Health check failed at $healthUrl : $healthJson"
}

Write-Host "Health OK: $healthUrl"

Write-Host "`n=== 6. Verify platform login records ==="
Set-Location $prodRoot
$verifyJson = node --input-type=module -e @'
import { DatabaseSync } from "node:sqlite";
import { findPlatformOperatorMatch } from "./lib/platform-auth.js";

const db = new DatabaseSync("C:/LittleCode/data/littlecode.sqlite", { readOnly: true });
const rows = db.prepare("SELECT id, username, email, role, length(password_hash) AS hash_len FROM users WHERE role IN ('superadmin','support')").all();
db.close();

const superadmin = findPlatformOperatorMatch("superadmin");
const support = findPlatformOperatorMatch("support");

console.log(JSON.stringify({
  ok: Boolean(superadmin && support && superadmin.password_hash && support.password_hash),
  users: rows,
  superadminFound: Boolean(superadmin),
  supportFound: Boolean(support),
}));
'@

$verify = $verifyJson | ConvertFrom-Json
if (-not $verify.ok) {
  throw "Platform user verification failed: $verifyJson"
}

Write-Host "Platform users verified (password hashes intact, lookup works)."

Write-Host "`n=== Production reset complete ==="
if ($backupInfo) {
  Write-Host "Backup: $($backupInfo.BackupPath) ($($backupInfo.SizeMB) MB)"
}
Write-Host "Kept users:"
foreach ($user in $result.platformUsers) {
  Write-Host "  - $($user.role): $($user.username) <$($user.email)>"
}
Write-Host "Counts before -> after:"
Write-Host "  users: $($result.countsBefore.users) -> $($result.countsAfter.users)"
Write-Host "  schools: $($result.countsBefore.schools) -> $($result.countsAfter.schools)"
Write-Host "  families: $($result.countsBefore.families) -> $($result.countsAfter.families)"
Write-Host "  quizzes: $($result.countsBefore.quizzes) -> $($result.countsAfter.quizzes)"
