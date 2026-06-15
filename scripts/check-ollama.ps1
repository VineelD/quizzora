# Quick Ollama health check for Study Coach local provider.
# Usage:
#   .\scripts\check-ollama.ps1
#   .\scripts\check-ollama.ps1 -PreWarm
#   .\scripts\check-ollama.ps1 -Restart -PreWarm

param(
  [switch]$PreWarm,
  [switch]$Restart
)

$ErrorActionPreference = "Continue"

function Test-ModelInstalled {
  param(
    [array]$InstalledModels,
    [string]$ModelName
  )

  foreach ($installed in $InstalledModels) {
    $name = [string]$installed.name
    if ($name -eq $ModelName -or $name -eq "${ModelName}:latest" -or $name.StartsWith("${ModelName}:")) {
      return $true
    }
  }
  return $false
}

function Import-DotEnvFile {
  param([string]$Path)

  if (-not (Test-Path $Path)) { return }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $separator = $line.IndexOf("=")
    if ($separator -lt 1) { return }
    $name = $line.Substring(0, $separator).Trim()
    if (Test-Path "Env:$name") { return }
    $value = $line.Substring($separator + 1).Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"')) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    Set-Item -Path "Env:$name" -Value $value
  }
}

function Get-OllamaGpuReport {
  $report = @{
    GpuName = $null
    GpuList = @()
    DriverVersion = $null
    GpuUtil = $null
    VramUsedMiB = $null
    VramTotalMiB = $null
    OllamaLibrary = [Environment]::GetEnvironmentVariable("OLLAMA_LLM_LIBRARY", "User")
    VulkanEnabled = [Environment]::GetEnvironmentVariable("OLLAMA_VULKAN", "User")
    CudaVisibleDevices = [Environment]::GetEnvironmentVariable("CUDA_VISIBLE_DEVICES", "User")
    DriverNeeds570 = $false
    Warnings = @()
  }

  try {
    $report.GpuList = @(& nvidia-smi -L 2>$null | Where-Object { $_ -match "^GPU" })
    $smi = & nvidia-smi --query-gpu=name,driver_version,utilization.gpu,memory.used,memory.total --format=csv,noheader 2>$null
    if ($LASTEXITCODE -eq 0 -and $smi) {
      $parts = ($smi -split "," | ForEach-Object { $_.Trim().Trim('"') })
      if ($parts.Count -ge 5) {
        $report.GpuName = $parts[0]
        $report.DriverVersion = $parts[1]
        $report.GpuUtil = $parts[2]
        $report.VramUsedMiB = $parts[3]
        $report.VramTotalMiB = $parts[4]
        if ($report.DriverVersion -match "^(\d+)") {
          $major = [int]$Matches[1]
          if ($major -lt 570) {
            $report.DriverNeeds570 = $true
            $report.Warnings += "NVIDIA driver $($report.DriverVersion) is below 570; use Vulkan on Pascal (GTX 1050 Ti) or upgrade driver."
          }
        }
      }
    }
  } catch {
    $report.Warnings += "nvidia-smi unavailable; Ollama may run on CPU."
  }

  if (-not $report.OllamaLibrary) {
    $report.OllamaLibrary = [Environment]::GetEnvironmentVariable("OLLAMA_LLM_LIBRARY", "Machine")
  }
  if (-not $report.VulkanEnabled) {
    $report.VulkanEnabled = [Environment]::GetEnvironmentVariable("OLLAMA_VULKAN", "Machine")
  }
  if (-not $report.CudaVisibleDevices) {
    $report.CudaVisibleDevices = [Environment]::GetEnvironmentVariable("CUDA_VISIBLE_DEVICES", "Machine")
  }
  if ($report.DriverNeeds570 -and -not $report.OllamaLibrary -and $report.VulkanEnabled -ne "1") {
    $report.Warnings += "Set User OLLAMA_VULKAN=1 (and optionally OLLAMA_LLM_LIBRARY=vulkan) until driver 570+ is active."
  }

  return $report
}

function Write-OllamaGpuReport {
  param($Report)

  Write-Host "`nGPU / accelerator:"
  if ($Report.GpuList -and $Report.GpuList.Count -gt 1) {
    foreach ($g in $Report.GpuList) { Write-Host "  $g" }
  }
  if ($Report.GpuName) {
    Write-Host "  Primary: $($Report.GpuName) (driver $($Report.DriverVersion), util $($Report.GpuUtil), VRAM $($Report.VramUsedMiB)/$($Report.VramTotalMiB) MiB)"
  } else {
    Write-Host "  GPU: (none detected via nvidia-smi)"
  }
  Write-Host "  CUDA_VISIBLE_DEVICES: $(if ($Report.CudaVisibleDevices) { $Report.CudaVisibleDevices } else { '(all)' })"
  Write-Host "  OLLAMA_LLM_LIBRARY: $(if ($Report.OllamaLibrary) { $Report.OllamaLibrary } else { '(auto)' })"
  Write-Host "  OLLAMA_VULKAN: $(if ($Report.VulkanEnabled) { $Report.VulkanEnabled } else { '(default)' })"
  foreach ($warning in $Report.Warnings) { Write-Host "  WARN: $warning" }
}

function Write-OllamaProcessorReport {
  param([string]$BaseUrl)

  try {
    $ps = Invoke-RestMethod -Uri "$BaseUrl/api/ps" -Method Get -TimeoutSec 5
    if (-not $ps.models) {
      Write-Host "  (no models loaded)"
      return
    }
    foreach ($loaded in $ps.models) {
      $processor = & ollama ps 2>$null | Select-String $loaded.name
      $line = if ($processor) { $processor.Line.Trim() } else { $loaded.name }
      Write-Host "  - $line"
    }
  } catch {
    Write-Host "  could not query processor state: $_"
  }
}

function Test-OllamaCloudAuth {
  param(
    [string]$CloudBaseUrl,
    [string]$ApiKey,
    [string]$CloudModel
  )

  Write-Host "`nChecking Ollama Cloud at $CloudBaseUrl ..."
  $headers = @{ Authorization = "Bearer $ApiKey" }

  try {
    $tags = Invoke-RestMethod -Uri "$CloudBaseUrl/api/tags" -Method Get -Headers $headers -TimeoutSec 20
    $count = if ($tags.models) { $tags.models.Count } else { 0 }
    Write-Host "Cloud auth OK ($count models available)."
  } catch {
    Write-Host "Cloud auth failed: $_"
    return $false
  }

  Write-Host "Cloud chat smoke test ($CloudModel) ..."
  $chatBody = @{
    model = $CloudModel
    messages = @(@{ role = "user"; content = "Reply with one word: ready." })
    stream = $false
  } | ConvertTo-Json -Depth 4 -Compress
  try {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $chat = Invoke-RestMethod -Uri "$CloudBaseUrl/api/chat" -Method Post -Headers ($headers + @{ "Content-Type" = "application/json" }) -Body $chatBody -TimeoutSec 120
    $sw.Stop()
    $reply = [string]$chat.message.content
    if (-not $reply.Trim()) { $reply = "(empty content)" }
    Write-Host "  cloud chat OK ($([math]::Round($sw.Elapsed.TotalSeconds, 1))s) reply: $($reply.Trim())"
    return $true
  } catch {
    Write-Host "  cloud chat failed: $_"
    return $false
  }
}

function Invoke-OllamaPreWarm {
  param(
    [string]$BaseUrl,
    [string]$EmbedBaseUrl,
    [string]$ChatModel,
    [string]$EmbedModel
  )

  Write-Host "`nPre-warming embed model '$EmbedModel' on $EmbedBaseUrl ..."
  $embedBody = @{ model = $EmbedModel; prompt = "warmup"; keep_alive = "30m" } | ConvertTo-Json -Compress
  try {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    Invoke-RestMethod -Uri "$EmbedBaseUrl/api/embeddings" -Method Post -Body $embedBody -ContentType "application/json" -TimeoutSec 120 | Out-Null
    $sw.Stop()
    Write-Host "  embed OK ($([math]::Round($sw.Elapsed.TotalSeconds, 1))s)"
  } catch {
    Write-Host "  embed failed: $_"
    return $false
  }

  Write-Host "Pre-warming chat model '$ChatModel' ..."
  $chatBody = @{
    model = $ChatModel
    messages = @(@{ role = "user"; content = "Reply with one word: ready." })
    stream = $false
    keep_alive = "30m"
  } | ConvertTo-Json -Depth 4 -Compress
  try {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $chat = Invoke-RestMethod -Uri "$BaseUrl/api/chat" -Method Post -Body $chatBody -ContentType "application/json" -TimeoutSec 180
    $sw.Stop()
    Write-Host "  chat OK ($([math]::Round($sw.Elapsed.TotalSeconds, 1))s) reply: $($chat.message.content)"
  } catch {
    Write-Host "  chat failed: $_"
    return $false
  }

  Write-Host "`nLoaded models (processor):"
  Write-OllamaProcessorReport -BaseUrl $BaseUrl

  try {
    $cliPs = ollama ps 2>&1 | Out-String
    if ($cliPs -match "100% CPU") {
      Write-Host "`nWARNING: Ollama is running on CPU only."
    } elseif ($cliPs -match "100% GPU") {
      Write-Host "`nGPU acceleration: active (ollama ps shows 100% GPU)."
    }
  } catch {}

  if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    $gpuUse = nvidia-smi --query-gpu=memory.used,utilization.gpu --format=csv,noheader 2>$null | Select-Object -First 1
    if ($gpuUse) { Write-Host "GPU snapshot: $gpuUse" }
  }

  return $true
}

function Restart-OllamaWithGpuEnv {
  param([string]$BaseUrl)

  Write-Host "`nRestarting Ollama to apply GPU user env ..."

  $userLibrary = [Environment]::GetEnvironmentVariable("OLLAMA_LLM_LIBRARY", "User")
  $userVulkan = [Environment]::GetEnvironmentVariable("OLLAMA_VULKAN", "User")
  $userKeepAlive = [Environment]::GetEnvironmentVariable("OLLAMA_KEEP_ALIVE", "User")
  $cudaDevices = [Environment]::GetEnvironmentVariable("CUDA_VISIBLE_DEVICES", "User")

  $driverMajor = 0
  try {
    $dv = (& nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>$null | Select-Object -First 1).Trim().Trim('"')
    if ($dv -match "^(\d+)") { $driverMajor = [int]$Matches[1] }
  } catch {}

  if ($driverMajor -ge 570) {
    Write-Host "  Driver >= 570: CUDA path (OLLAMA_LLM_LIBRARY=$(if ($userLibrary) { $userLibrary } else { 'auto' }))"
  } else {
    if (-not $userLibrary) {
      [Environment]::SetEnvironmentVariable("OLLAMA_LLM_LIBRARY", "vulkan", "User")
      $userLibrary = "vulkan"
      Write-Host "  Set User OLLAMA_LLM_LIBRARY=vulkan"
    }
    if ($userVulkan -ne "1") {
      [Environment]::SetEnvironmentVariable("OLLAMA_VULKAN", "1", "User")
      $userVulkan = "1"
      Write-Host "  Set User OLLAMA_VULKAN=1"
    }
  }

  if (-not $userKeepAlive) {
    [Environment]::SetEnvironmentVariable("OLLAMA_KEEP_ALIVE", "30m", "User")
    $userKeepAlive = "30m"
    Write-Host "  Set User OLLAMA_KEEP_ALIVE=30m"
  }

  if ($userLibrary) { $env:OLLAMA_LLM_LIBRARY = $userLibrary } else { Remove-Item Env:OLLAMA_LLM_LIBRARY -ErrorAction SilentlyContinue }
  if ($userVulkan) { $env:OLLAMA_VULKAN = $userVulkan } else { Remove-Item Env:OLLAMA_VULKAN -ErrorAction SilentlyContinue }
  if ($userKeepAlive) { $env:OLLAMA_KEEP_ALIVE = $userKeepAlive }
  if ($cudaDevices) { $env:CUDA_VISIBLE_DEVICES = $cudaDevices }

  Get-Process -Name "ollama","ollama app" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  Stopping $($_.ProcessName) (PID $($_.Id))"
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 3

  $ollamaExe = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
  $ollamaApp = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama app.exe"
  if (Test-Path $ollamaExe) {
    Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
    Write-Host "  Started ollama serve"
  } elseif (Test-Path $ollamaApp) {
    Start-Process -FilePath $ollamaApp -ArgumentList "--hide","--fast-startup" -WindowStyle Hidden
    Write-Host "  Started ollama app"
  } else {
    Write-Host "  WARN: Ollama executable not found"
    return $false
  }

  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    try {
      Invoke-RestMethod -Uri "$BaseUrl/api/tags" -Method Get -TimeoutSec 3 | Out-Null
      Write-Host "  Ollama is back online."
      return $true
    } catch { Start-Sleep -Seconds 2 }
  }

  Write-Host "  WARN: Ollama did not respond within 45s after restart."
  return $false
}

$repoRoot = Split-Path $PSScriptRoot -Parent
Import-DotEnvFile -Path (Join-Path $repoRoot ".env.local")

$cloudEnabled = ($env:STUDY_COACH_USE_OLLAMA_CLOUD -eq "true" -or $env:OLLAMA_CLOUD_ENABLED -eq "true") -and $env:OLLAMA_API_KEY
$cloudBaseUrl = if ($env:OLLAMA_CLOUD_BASE_URL) { $env:OLLAMA_CLOUD_BASE_URL.TrimEnd("/") } else { "https://ollama.com" }
$cloudChatModel = if ($env:STUDY_COACH_OLLAMA_CLOUD_MODEL) { $env:STUDY_COACH_OLLAMA_CLOUD_MODEL } elseif ($env:OLLAMA_CLOUD_MODEL) { $env:OLLAMA_CLOUD_MODEL } else { "qwen3-next:80b" }

$localBaseUrl = if ($env:STUDY_COACH_OLLAMA_ENDPOINT) {
  ($env:STUDY_COACH_OLLAMA_ENDPOINT -replace "/v1/chat/completions$", "")
} else { "http://127.0.0.1:11434" }

$embedBaseUrl = if ($env:OLLAMA_EMBED_BASE_URL) { $env:OLLAMA_EMBED_BASE_URL.TrimEnd("/") } else { $localBaseUrl }
$baseUrl = $localBaseUrl

$chatModel = if ($env:STUDY_COACH_OLLAMA_MODEL) { $env:STUDY_COACH_OLLAMA_MODEL } else { "llama3.2:3b" }
$embedModel = if ($env:OLLAMA_EMBED_MODEL) { $env:OLLAMA_EMBED_MODEL } else { "nomic-embed-text" }
$keepAlive = [Environment]::GetEnvironmentVariable("OLLAMA_KEEP_ALIVE", "User")
if (-not $keepAlive) { $keepAlive = [Environment]::GetEnvironmentVariable("OLLAMA_KEEP_ALIVE", "Machine") }
if (-not $keepAlive) { $keepAlive = "5m (Ollama default)" }

Write-Host "Checking local Ollama at $baseUrl (embed base: $embedBaseUrl) ..."
Write-Host "OLLAMA_KEEP_ALIVE (User/Machine): $keepAlive"
Write-OllamaGpuReport -Report (Get-OllamaGpuReport)

try {
  $tags = Invoke-RestMethod -Uri "$baseUrl/api/tags" -Method Get -TimeoutSec 5
  Write-Host "Ollama is running."
  if ($tags.models) {
    Write-Host "Installed models:"
    foreach ($model in $tags.models) { Write-Host "  - $($model.name)" }
  }
} catch {
  Write-Host "Ollama is not reachable at $baseUrl"
  exit 1
}

if (-not (Test-ModelInstalled -InstalledModels $tags.models -ModelName $chatModel)) {
  Write-Host "Preferred chat model '$chatModel' not found. Pull with: ollama pull $chatModel"
}
if (-not (Test-ModelInstalled -InstalledModels $tags.models -ModelName $embedModel)) {
  Write-Host "Preferred embed model '$embedModel' not found. Pull with: ollama pull $embedModel"
}

if ($Restart) { $null = Restart-OllamaWithGpuEnv -BaseUrl $baseUrl }
if ($PreWarm) { $null = Invoke-OllamaPreWarm -BaseUrl $baseUrl -EmbedBaseUrl $embedBaseUrl -ChatModel $chatModel -EmbedModel $embedModel }

if ($cloudEnabled) {
  Write-Host "`nSTUDY_COACH_USE_OLLAMA_CLOUD is enabled (chat tries cloud first, local fallback)."
  $null = Test-OllamaCloudAuth -CloudBaseUrl $cloudBaseUrl -ApiKey $env:OLLAMA_API_KEY -CloudModel $cloudChatModel
} else {
  Write-Host "`nOllama Cloud: not configured."
}

exit 0
