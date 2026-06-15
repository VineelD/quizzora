# Post-reboot recovery for Quizzora production host.
# Restores Ollama, LittleCode, and background curriculum/question-bank jobs.
#
# Run once after reboot (Administrator recommended for scheduled-task registration):
#   powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\post-reboot-recover.ps1
#
# Or register as startup task (see register-post-reboot-recover.ps1).

param(
  [switch]$SkipQuestionBankEmbed,
  [switch]$SkipCurriculumResume
)

$ErrorActionPreference = "Continue"
$repoRoot = "C:\LittleCode"
$logRoot = Join-Path $repoRoot "scripts"
$generateLog = Join-Path $logRoot "_curriculum-generate.log"
$embedPollLog = Join-Path $logRoot "_curriculum-embed.log"
$snapshotPath = Join-Path $logRoot "_maintenance-state.json"

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host "=== $Title ==="
}

function Test-PortListening {
  param([int]$Port)
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Get-ProcessByCommandPattern {
  param([string]$Pattern)
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { [string]$_.CommandLine -match $Pattern }
}

function Test-NvidiaDriver {
  param([int]$MinMajor = 591)

  try {
    $gpuLines = @(& nvidia-smi -L 2>$null | Where-Object { $_ -match "^GPU" })
    $gpuCount = $gpuLines.Count
    $smi = & nvidia-smi --query-gpu=name,driver_version --format=csv,noheader 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $smi) {
      return @{ ok = $false; gpuCount = 0; message = "nvidia-smi unavailable" }
    }
    if ($gpuCount -gt 1) {
      Write-Host "  GPUs: $($gpuLines -join "; ")"
    }
    $parts = ($smi -split "," | ForEach-Object { $_.Trim().Trim('"') })
    $driver = $parts[1]
    $major = 0
    if ($driver -match "^(\d+)") { $major = [int]$Matches[1] }
    $oem227 = Get-ChildItem "C:\Windows\System32\DriverStore\FileRepository" -Directory -Filter "oem227.inf*" -ErrorAction SilentlyContinue
    return @{
      ok           = ($major -ge $MinMajor)
      gpuCount     = $gpuCount
      gpu          = $parts[0]
      driver       = $driver
      major        = $major
      oem227Staged = [bool]$oem227
      message      = if ($major -ge $MinMajor) { "Driver $driver OK (>= $MinMajor), $gpuCount GPU(s) in nvidia-smi" } else { "Driver $driver is below $MinMajor; reboot may still be required after NVIDIA install ($gpuCount GPU(s) visible)" }
    }
  } catch {
    return @{ ok = $false; gpuCount = 0; message = $_.Exception.Message }
  }
}

function Ensure-Ollama {
  if (Test-PortListening -Port 11434) {
    Write-Host "Ollama already listening on 11434"
    return
  }

  $ollamaExe = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
  if (-not (Test-Path $ollamaExe)) {
    Write-Warning "Ollama not found at $ollamaExe - start from Start menu if installed elsewhere"
    return
  }

  Write-Host "Starting Ollama serve ..."
  Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline) {
    if (Test-PortListening -Port 11434) { break }
    Start-Sleep -Seconds 2
  }

  $check = Join-Path $repoRoot "scripts\check-ollama.ps1"
  if (Test-Path $check) {
    Write-Host "Pre-warming Ollama models ..."
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $check -PreWarm
  }
}

function Ensure-LittleCodeTask {
  $taskName = "LittleCode Next.js"
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if (-not $task) {
    Write-Warning "Scheduled task '$taskName' not found - run ensure-windows-services.ps1"
    if (-not (Test-PortListening -Port 3000)) {
      $startScript = Join-Path $repoRoot "start-littlecode.ps1"
      if (Test-Path $startScript) {
        Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`"" -WindowStyle Hidden
      }
    }
    return
  }

  if ($task.State -ne "Running" -and -not (Test-PortListening -Port 3000)) {
    Write-Host "Starting scheduled task: $taskName"
    Start-ScheduledTask -TaskName $taskName
  } else {
    Write-Host "LittleCode already running (task state: $($task.State), port 3000 listening: $(Test-PortListening -Port 3000))"
  }
}

function Start-BackgroundNodeScript {
  param(
    [string]$ScriptRelativePath,
    [string]$Arguments = "",
    [string]$MatchPattern
  )

  if ($MatchPattern) {
    $existing = Get-ProcessByCommandPattern -Pattern $MatchPattern
    if ($existing) {
      Write-Host "Already running: $ScriptRelativePath (PID $($existing[0].ProcessId))"
      return $existing[0].ProcessId
    }
  }

  $scriptPath = Join-Path $repoRoot $ScriptRelativePath
  if (-not (Test-Path $scriptPath)) {
    Write-Warning "Script not found: $scriptPath"
    return $null
  }

  $nodeArgs = "`"$scriptPath`" $Arguments".Trim()
  Write-Host "Starting background: node $nodeArgs"
  $proc = Start-Process -FilePath "node" -ArgumentList $nodeArgs -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru
  return $proc.Id
}

function Get-CurriculumPendingCount {
  if (Test-Path $snapshotPath) {
    try {
      $data = Get-Content $snapshotPath -Raw | ConvertFrom-Json
      if ($data.curriculum.pendingOrFailedJobs -ne $null) {
        return [int]$data.curriculum.pendingOrFailedJobs
      }
    } catch {}
  }
  $capture = Join-Path $logRoot "_capture-maintenance-state.mjs"
  if (-not (Test-Path $capture)) { return $null }
  try {
    Push-Location $repoRoot
    $jsonLine = (& node $capture 2>$null | Where-Object { $_ -match '^\{' } | Select-Object -Last 1)
    Pop-Location
    if ($jsonLine) {
      $data = $jsonLine | ConvertFrom-Json
      return [int]$data.curriculum.pendingOrFailedJobs
    }
  } catch {}
  return $null
}

function Resume-CurriculumJobs {
  $pending = Get-CurriculumPendingCount
  if ($null -ne $pending -and $pending -eq 0) {
    Write-Host "Curriculum generation complete (0 pending/failed jobs)"
    return
  }

  Write-Host "Resuming curriculum doc generation (pending/failed: $pending) ..."
  $genArgs = "--rate-ms 2000"
  Start-BackgroundNodeScript -ScriptRelativePath "scripts\generate-curriculum-docs.mjs" `
    -Arguments $genArgs `
    -MatchPattern "generate-curriculum-docs\.mjs"

  Start-BackgroundNodeScript -ScriptRelativePath "scripts\embed-curriculum-docs-poll.mjs" `
    -Arguments "" `
    -MatchPattern "embed-curriculum-docs-poll\.mjs"
}

function Run-QuestionBankEmbed {
  if ($SkipQuestionBankEmbed) { return }
  $script = Join-Path $repoRoot "scripts\embed-question-bank.mjs"
  if (-not (Test-Path $script)) { return }
  Write-Host "Embedding pending question-bank items (foreground batch) ..."
  Push-Location $repoRoot
  & node $script 2>&1
  Pop-Location
}

function Show-Summary {
  Write-Section "Recovery summary"
  $nv = Test-NvidiaDriver
  Write-Host "NVIDIA: $($nv.message)"
  if ($nv.oem227Staged) { Write-Host "  oem227.inf present in DriverStore" }
  Write-Host "Port 3000 (LittleCode): $(Test-PortListening -Port 3000)"
  Write-Host "Port 11434 (Ollama): $(Test-PortListening -Port 11434)"
  try {
    if (Test-PortListening -Port 3000) {
      $health = Invoke-WebRequest "http://127.0.0.1:3000/api/health" -UseBasicParsing -TimeoutSec 15
      Write-Host "Health: HTTP $($health.StatusCode)"
    }
  } catch {
    Write-Host "Health check: $($_.Exception.Message)"
  }
  if (Test-Path $snapshotPath) {
    Write-Host "Pre-reboot snapshot: $snapshotPath"
  }
}

Write-Section "Post-reboot recover - $(Get-Date -Format o)"

Write-Section "NVIDIA driver"
$nvidia = Test-NvidiaDriver
Write-Host $nvidia.message
if (-not $nvidia.ok) {
  Write-Warning "Expected driver 591.86+ with oem227.inf after clean install. If still on 560.x, re-run the NVIDIA installer with -clean and reboot."
}
$configDualGpu = Join-Path $repoRoot "scripts\configure-dual-gpu-ollama.ps1"
if ((Test-Path $configDualGpu) -and $nvidia.gpuCount -ge 2) {
  Write-Host "Configuring Ollama for RTX 2060 compute GPU ..."
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $configDualGpu
}

Write-Section "Ollama"
Ensure-Ollama

Write-Section "LittleCode Next.js"
Ensure-LittleCodeTask

if (-not $SkipCurriculumResume) {
  Write-Section "Curriculum docs"
  Resume-CurriculumJobs
}

Write-Section "Question bank embeddings"
Run-QuestionBankEmbed

Show-Summary
Write-Host ""
Write-Host "Done. Logs: $generateLog, $embedPollLog"
