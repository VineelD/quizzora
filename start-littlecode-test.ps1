function Import-DotEnvFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path $Path)) {
    return
  }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      return
    }

    $separator = $line.IndexOf("=")
    if ($separator -lt 1) {
      return
    }

    $name = $line.Substring(0, $separator).Trim()
    $value = $line.Substring($separator + 1).Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"')) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    Set-Item -Path "Env:$name" -Value $value
  }
}

$ErrorActionPreference = "Stop"

$appPath = "C:\LittleCode-test"
$nodePort = 3001
$logPath = Join-Path $appPath "logs"
New-Item -ItemType Directory -Force -Path $logPath | Out-Null

function Stop-ExistingLittleCodeServer {
  param(
    [int]$Port = 3001,
    [string]$AppRoot = "C:\LittleCode-test"
  )

  $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    $processId = $listener.OwningProcess
    if (-not $processId) {
      continue
    }

    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if (-not $process) {
      continue
    }

    $commandLine = [string]$process.CommandLine
    if ($commandLine -notmatch [regex]::Escape($AppRoot) -or $commandLine -notmatch "next") {
      continue
    }

    Write-Host "Stopping existing LittleCode test server (PID $processId)"
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }

  if ($listeners.Count -gt 0) {
    Start-Sleep -Seconds 2
  }
}

Stop-ExistingLittleCodeServer -Port $nodePort -AppRoot $appPath

function Ensure-OpenAiApiKey {
  if ($env:OPENAI_API_KEY) {
    return
  }

  foreach ($scope in @("Process", "User", "Machine")) {
    $value = [Environment]::GetEnvironmentVariable("OPENAI_API_KEY", $scope)
    if ($value) {
      $env:OPENAI_API_KEY = $value
      Write-Host "Loaded OPENAI_API_KEY from $scope environment."
      return
    }
  }
}

Set-Location $appPath
Import-DotEnvFile -Path (Join-Path $appPath ".env.local")
Ensure-OpenAiApiKey

$env:NODE_ENV = "production"
$env:PORT = "$nodePort"
$env:HOSTNAME = "127.0.0.1"

if (-not $env:AUTH_COOKIE_SECURE) {
  $env:AUTH_COOKIE_SECURE = "false"
}

if ($env:RESEND_API_KEY) {
  Remove-Item Env:SMTP_HOST -ErrorAction SilentlyContinue
  Remove-Item Env:SMTP_PORT -ErrorAction SilentlyContinue
  Remove-Item Env:SMTP_USER -ErrorAction SilentlyContinue
  Remove-Item Env:SMTP_PASS -ErrorAction SilentlyContinue
}

# Node writes ExperimentalWarning to stderr; do not treat that as a fatal PowerShell error.
$ErrorActionPreference = "Continue"
npm run start -- --hostname 127.0.0.1 --port $nodePort *>> (Join-Path $logPath "next.log")
