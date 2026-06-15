# Pin Ollama LLM workloads to the RTX 2060 when a GTX 1050 Ti is also present.
# Requires both GPUs visible in nvidia-smi after a unified NVIDIA 591+ driver + reboot.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\configure-dual-gpu-ollama.ps1
#   powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\configure-dual-gpu-ollama.ps1 -ApplyModelfile

param(
  [switch]$ApplyModelfile,
  [int]$LlmNumCtx = 8192
)

$ErrorActionPreference = "Stop"

function Get-NvidiaGpuList {
  $lines = & nvidia-smi -L 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $lines) {
    return @()
  }
  $gpus = @()
  $index = 0
  foreach ($line in $lines) {
    if ($line -match "^GPU\s+(\d+):\s+(.+?)\s+\(UUID") {
      $gpus += [PSCustomObject]@{
        Index = [int]$Matches[1]
        Name  = $Matches[2].Trim()
      }
    } else {
      $gpus += [PSCustomObject]@{ Index = $index; Name = $line.Trim() }
      $index++
    }
  }
  return $gpus
}

function Set-UserEnv {
  param([string]$Name, [string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    [Environment]::SetEnvironmentVariable($Name, $null, "User")
    Write-Host "  Cleared User env $Name (use Ollama default)"
  } else {
    [Environment]::SetEnvironmentVariable($Name, $Value, "User")
    Write-Host "  Set User env $Name=$Value"
  }
}

Write-Host "NVIDIA GPUs (nvidia-smi -L):"
$gpus = Get-NvidiaGpuList
if ($gpus.Count -eq 0) {
  Write-Warning "No GPUs from nvidia-smi. Complete NVIDIA 591.86 install and reboot, then re-run."
  exit 1
}
$gpus | ForEach-Object { Write-Host "  GPU $($_.Index): $($_.Name)" }

$llmGpu = $gpus | Where-Object { $_.Name -match "2060" } | Select-Object -First 1
if (-not $llmGpu) {
  Write-Warning "RTX 2060 not listed in nvidia-smi. Check Device Manager (Problem code 31/10 = driver mismatch; reboot after 591 install)."
  exit 2
}

$driver = (& nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>$null | Select-Object -First 1).Trim().Trim('"')
Write-Host "Active driver (first GPU row): $driver"

# Route Ollama CUDA to the 2060 only (1050 Ti can stay on display / idle).
Set-UserEnv -Name "CUDA_VISIBLE_DEVICES" -Value ([string]$llmGpu.Index)

# Turing 2060: use CUDA once driver >= 570; drop Pascal Vulkan workaround.
if ($driver -match "^(\d+)") {
  $major = [int]$Matches[1]
  if ($major -ge 570) {
    Set-UserEnv -Name "OLLAMA_LLM_LIBRARY" -Value $null
    Set-UserEnv -Name "OLLAMA_VULKAN" -Value $null
  } else {
    Write-Warning "Driver $driver is below 570; keeping Vulkan env for 1050 Ti fallback until you upgrade + reboot."
  }
}

if (-not [Environment]::GetEnvironmentVariable("OLLAMA_KEEP_ALIVE", "User")) {
  Set-UserEnv -Name "OLLAMA_KEEP_ALIVE" -Value "30m"
}

Write-Host "`nOllama should use GPU $($llmGpu.Index) ($($llmGpu.Name)) after tray restart."
Write-Host "Verify: .\scripts\check-ollama.ps1 -Restart -PreWarm"

if ($ApplyModelfile) {
  $modelName = "llama3.2:3b-gpu-6g"
  $modelfile = Join-Path $env:TEMP "Modelfile.llama3.2-3b-gpu-6g"
  @(
    "FROM llama3.2:3b",
    "PARAMETER num_ctx $LlmNumCtx"
  ) | Set-Content -Path $modelfile -Encoding UTF8
  Write-Host "`nCreating Ollama model $modelName (num_ctx $LlmNumCtx) ..."
  & ollama create $modelName -f $modelfile
  Write-Host "Set STUDY_COACH_OLLAMA_MODEL=$modelName and STUDY_COACH_OLLAMA_NUM_CTX=$LlmNumCtx in .env.local"
}
