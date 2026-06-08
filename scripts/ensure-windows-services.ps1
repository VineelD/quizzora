# Idempotent registration of Windows Task Scheduler jobs for Quizzora production,
# staging (test.quizzora.org), and production DB backups.
#
# Run elevated (Administrator):
#   powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\ensure-windows-services.ps1
#
# Scheduled tasks (Task Scheduler):
# | Task name                  | Trigger              | Action script                          | Port / notes        |
# |----------------------------|----------------------|----------------------------------------|---------------------|
# | LittleCode Next.js         | At system startup    | C:\LittleCode\start-littlecode.ps1     | 127.0.0.1:3000 prod |
# | LittleCode Test Next.js    | At system startup    | C:\LittleCode-test\start-littlecode-test.ps1 | 127.0.0.1:3001 staging |
# | LittleCode Prod DB Backup  | Daily 2:00 AM local  | C:\LittleCode\scripts\backup-prod-db.ps1 | prod SQLite only  |
#
# Test DB backups are not scheduled (staging DB is disposable; see docs/TEST-ENVIRONMENT.md).

param(
  [switch]$SkipIis,
  [switch]$StartTasksNow
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
$testRoot = "C:\LittleCode-test"

function New-NodeAppTaskSettings {
  return New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Hours 72) `
    -MultipleInstances IgnoreNew
}

function Register-QuizzoraNodeTask {
  param(
    [string]$TaskName,
    [string]$ScriptPath,
    [string]$Description
  )

  if (-not (Test-Path $ScriptPath)) {
    throw "Start script not found: $ScriptPath"
  }

  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $settings = New-NodeAppTaskSettings
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description $Description -Force | Out-Null
  Write-Host "Registered/updated task: $TaskName (At startup, SYSTEM, restart on failure x3)"
}

function Register-ProdBackupTask {
  $scriptPath = Join-Path $prodRoot "scripts\backup-prod-db.ps1"
  if (-not (Test-Path $scriptPath)) {
    throw "Backup script not found: $scriptPath"
  }

  $taskName = "LittleCode Prod DB Backup"
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
  $trigger = New-ScheduledTaskTrigger -Daily -At "2:00AM"
  $settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -MultipleInstances IgnoreNew
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Daily production SQLite backup (see docs/BACKUP.md)" -Force | Out-Null
  Write-Host "Registered/updated task: $taskName (Daily 2:00 AM, SYSTEM)"
}

function Ensure-IisAutoStart {
  $w3svc = Get-Service W3SVC -ErrorAction SilentlyContinue
  if ($w3svc -and $w3svc.StartType -ne "Automatic") {
    Set-Service W3SVC -StartupType Automatic
    Write-Host "Set W3SVC (World Wide Web Publishing) startup type to Automatic"
  }

  Import-Module WebAdministration -ErrorAction Stop

  foreach ($siteName in @("LittleCode", "LittleCode-Test")) {
    $site = Get-Website -Name $siteName -ErrorAction SilentlyContinue
    if (-not $site) {
      Write-Warning "IIS site not found: $siteName"
      continue
    }

    $poolName = $site.applicationPool
    if ($poolName -and (Test-Path "IIS:\AppPools\$poolName")) {
      $pool = Get-ItemProperty "IIS:\AppPools\$poolName"
      if ($pool.startMode -ne "AlwaysRunning") {
        Set-ItemProperty "IIS:\AppPools\$poolName" -Name startMode -Value "AlwaysRunning"
        Write-Host "Set app pool '$poolName' startMode=AlwaysRunning (site $siteName)"
      }
    }

    if ($site.State -ne "Started") {
      Start-Website -Name $siteName
      Write-Host "Started IIS site: $siteName"
    }
  }
}

Write-Host "=== Quizzora Windows scheduled tasks ==="

Register-QuizzoraNodeTask -TaskName "LittleCode Next.js" `
  -ScriptPath (Join-Path $prodRoot "start-littlecode.ps1") `
  -Description "Quizzora production (quizzora.org) on port 3000"

Register-QuizzoraNodeTask -TaskName "LittleCode Test Next.js" `
  -ScriptPath (Join-Path $testRoot "start-littlecode-test.ps1") `
  -Description "Quizzora staging (test.quizzora.org) on port 3001"

Register-ProdBackupTask

if (-not $SkipIis) {
  Write-Host "`n=== IIS (reverse proxy) ==="
  Ensure-IisAutoStart
}

if ($StartTasksNow) {
  Write-Host "`n=== Starting Node tasks (simulate post-reboot) ==="
  foreach ($taskName in @("LittleCode Next.js", "LittleCode Test Next.js")) {
    $state = (Get-ScheduledTask -TaskName $taskName).State
    if ($state -eq "Running") {
      Write-Host "Task already running: $taskName"
      continue
    }
    Start-ScheduledTask -TaskName $taskName
    Write-Host "Started: $taskName"
  }
}

Write-Host "`nDone. Verify: schtasks /Query /TN `"LittleCode Next.js`" /V /FO LIST"
Write-Host "Health: curl http://127.0.0.1:3000/api/health and :3001/api/health"

