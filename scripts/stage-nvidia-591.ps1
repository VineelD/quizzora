# Stage NVIDIA 591.86 driver install from local cache (passive, no reboot).
# Does NOT stop LittleCode/Ollama unless the installer requires it.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\stage-nvidia-591.ps1
#   powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\stage-nvidia-591.ps1 -SetupPath "D:\path\to\591.86-desktop-win10-win11-64bit-international-dch-whql.exe"

param(
  [string]$SetupPath = ""
)

$ErrorActionPreference = "Continue"
$targetVersion = "591.86"
$logPath = Join-Path $PSScriptRoot "_nvidia-stage.log"

function Write-Log {
  param([string]$Message)
  $line = "[$(Get-Date -Format o)] $Message"
  Add-Content -Path $logPath -Value $line -Encoding UTF8
  Write-Host $line
}

function Find-NvidiaSetup {
  param([string]$ExplicitPath)

  if ($ExplicitPath -and (Test-Path $ExplicitPath)) {
    return (Resolve-Path $ExplicitPath).Path
  }

  $searchRoots = @(
    "$env:USERPROFILE\Downloads",
    "C:\NVIDIA",
    "C:\Temp",
    "C:\Program Files\NVIDIA Corporation\Installer2"
  )

  foreach ($root in $searchRoots) {
    if (-not (Test-Path $root)) { continue }
    $hits = Get-ChildItem -Path $root -Recurse -Filter "*.exe" -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match "591\.86|591_86" -or $_.FullName -match "591\.86|591_86" } |
      Select-Object -First 1
    if ($hits) { return $hits.FullName }
  }

  # GeForce / Package Cache naming
  $cache = Get-ChildItem "C:\ProgramData\NVIDIA Corporation\NVIDIA GeForce Experience" -Recurse -Filter "*.exe" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "591" } | Select-Object -First 1
  if ($cache) { return $cache.FullName }

  return $null
}

Write-Log "Searching for NVIDIA $targetVersion installer ..."

$setup = Find-NvidiaSetup -ExplicitPath $SetupPath
if (-not $setup) {
  Write-Log "NOT FOUND: NVIDIA $targetVersion setup.exe"
  Write-Log "Download WHQL 591.86 from https://www.nvidia.com/Download/index.aspx (GTX 1050 Ti / Win11 64-bit DCH)"
  Write-Log "Then re-run: stage-nvidia-591.ps1 -SetupPath `"C:\path\to\591.86-....exe`""
  exit 1
}

Write-Log "Found installer: $setup"

# Passive + noreboot stages files; kernel driver swap still needs reboot to activate.
$args = @(
  "-passive",
  "-noreboot",
  "-clean",
  "-install",
  "-noeula"
)

Write-Log "Launching: `"$setup`" $($args -join ' ')"
Write-Log "NOTE: Installer may prompt or take several minutes. Production services should remain up unless installer stops them."

$proc = Start-Process -FilePath $setup -ArgumentList $args -PassThru -Wait
Write-Log "Installer exit code: $($proc.ExitCode)"

$oem227 = Get-ChildItem "C:\Windows\System32\DriverStore\FileRepository" -Directory -Filter "oem227.inf*" -ErrorAction SilentlyContinue
$nvlddmkm = Get-ChildItem "C:\Windows\System32\DriverStore\FileRepository" -Recurse -Filter "nvlddmkm.sys" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1

Write-Log "oem227.inf staged: $([bool]$oem227)"
if ($nvlddmkm) {
  Write-Log "Latest nvlddmkm.sys: $($nvlddmkm.FullName) ($($nvlddmkm.LastWriteTime))"
}

try {
  $smi = & nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>$null
  Write-Log "Active driver (pre-reboot): $smi"
} catch {
  Write-Log "nvidia-smi: unavailable"
}

if ($proc.ExitCode -eq 0 -or $proc.ExitCode -eq 3010) {
  Write-Log "Staging complete. Reboot when ready, then run post-reboot-recover.ps1"
  exit 0
}

Write-Log "Installer may have failed or requires reboot (exit $($proc.ExitCode)). Check NVIDIA installer log in C:\Program Files\NVIDIA Corporation\Installer2\"
exit $proc.ExitCode
