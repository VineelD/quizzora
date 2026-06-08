# Production SQLite backup: online copy via node:sqlite, compressed zip, optional retention.
# Usage:
#   powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\backup-prod-db.ps1
#
# Retention: backups older than 30 days are deleted (see $RetentionDays below).

param(
  [string]$BackupRoot = "",
  [int]$RetentionDays = 30,
  [switch]$SkipTaskControl
)

$ErrorActionPreference = "Stop"

$prodRoot = "C:\LittleCode"
$prodDb = Join-Path $prodRoot "data\littlecode.sqlite"
$taskName = "LittleCode Next.js"
$scriptDir = Join-Path $prodRoot "scripts"
$logDir = Join-Path $prodRoot "logs"
$nodeScript = Join-Path $scriptDir "backup-prod-db.mjs"

function Get-BestBackupRoot {
  param([string]$Override)

  if ($Override) {
    return $Override
  }

  $best = Get-PSDrive -PSProvider FileSystem |
    Where-Object { $_.Name -match '^[A-Z]$' -and (Test-Path "$($_.Name):\") } |
    Sort-Object Free -Descending |
    Select-Object -First 1

  if (-not $best) {
    throw "No suitable backup drive found."
  }

  return Join-Path "$($best.Name):\" "QuizzoraBackups\production"
}

function Write-BackupLog {
  param([string]$Message)
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Add-Content -Path (Join-Path $logDir "backup-prod-db.log") -Value $line
  Write-Host $line
}

function Invoke-ProdDbBackup {
  param(
    [string]$Root,
    [int]$KeepDays
  )

  if (-not (Test-Path $prodDb)) {
    throw "Production database not found: $prodDb"
  }

  New-Item -ItemType Directory -Force -Path $Root | Out-Null

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $tempSqlite = Join-Path $Root "littlecode-$stamp.sqlite"
  $zipPath = "$tempSqlite.zip"

  $env:SQLITE_DATABASE_PATH = $prodDb
  Set-Location $prodRoot

  $resultJson = node $nodeScript --output $tempSqlite
  $result = $resultJson | ConvertFrom-Json
  if (-not $result.ok) {
    throw "Backup failed: $resultJson"
  }

  if (-not (Test-Path $tempSqlite)) {
    throw "Backup file missing after node script: $tempSqlite"
  }

  if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
  }
  Compress-Archive -Path $tempSqlite -DestinationPath $zipPath -CompressionLevel Optimal
  Remove-Item $tempSqlite -Force

  $sizeBytes = (Get-Item $zipPath).Length
  Write-BackupLog "SUCCESS backup=$zipPath sizeBytes=$sizeBytes"

  if ($KeepDays -gt 0) {
    $cutoff = (Get-Date).AddDays(-$KeepDays)
    Get-ChildItem $Root -Filter "littlecode-*.sqlite.zip" -File |
      Where-Object { $_.LastWriteTime -lt $cutoff } |
      ForEach-Object {
        Remove-Item $_.FullName -Force
        Write-BackupLog "RETENTION deleted=$($_.FullName)"
      }
  }

  return [PSCustomObject]@{
    BackupPath = $zipPath
    SizeBytes  = $sizeBytes
    SizeMB     = [math]::Round($sizeBytes / 1MB, 2)
  }
}

$backupRoot = Get-BestBackupRoot -Override $BackupRoot
Write-BackupLog "START backupRoot=$backupRoot"

$stoppedTask = $false
if (-not $SkipTaskControl) {
  try {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
    if ($task.State -eq "Running") {
      Write-BackupLog "INFO stopping task $taskName for safer backup"
      Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop
      $stoppedTask = $true
      Start-Sleep -Seconds 3
    }
  } catch {
    Write-BackupLog "WARN task control skipped: $($_.Exception.Message)"
  }
}

try {
  $backup = Invoke-ProdDbBackup -Root $backupRoot -KeepDays $RetentionDays
  Write-Host "Backup saved to $($backup.BackupPath) ($($backup.SizeMB) MB)"
  return $backup
} catch {
  Write-BackupLog "FAIL $($_.Exception.Message)"
  throw
} finally {
  if ($stoppedTask) {
    Start-ScheduledTask -TaskName $taskName
    Write-BackupLog "INFO restarted task $taskName"
  }
}
