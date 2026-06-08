<#
.SYNOPSIS
  Sets missing LittleCode machine environment variables on Windows.

.DESCRIPTION
  Run as Administrator. Never overwrites OPENAI_API_KEY or AUTH_SECRET if they are
  already set, unless you pass -SetOpenAIKey or -SetAuthSecret.

  Other variables are filled only when empty. Use -Force to overwrite non-secret vars.

.EXAMPLE
  Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
  .\scripts\windows\set-littlecode-env.ps1

.EXAMPLE
  .\scripts\windows\set-littlecode-env.ps1 -AppPath "C:\LittleCode" -HttpsCookies
#>
param(
  [string]$AppPath = "C:\LittleCode",
  [string]$OpenAIKey = "",
  [string]$AuthSecret = "",
  [switch]$Force,
  [switch]$SetOpenAIKey,
  [switch]$SetAuthSecret,
  [switch]$HttpsCookies,
  [switch]$DisableImageGeneration
)

$ErrorActionPreference = "Stop"

function New-RandomSecret {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  [Convert]::ToBase64String($bytes)
}

function Get-MachineEnv([string]$Name) {
  [Environment]::GetEnvironmentVariable($Name, "Machine")
}

function Set-MachineEnvIfMissing {
  param(
    [string]$Name,
    [string]$Value,
    [switch]$Overwrite
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return
  }

  $current = Get-MachineEnv $Name
  if ($Overwrite -or [string]::IsNullOrWhiteSpace($current)) {
    [Environment]::SetEnvironmentVariable($Name, $Value, "Machine")
    Write-Host "Set $Name"
    return $true
  }

  Write-Host "Keep $Name (already set)"
  return $false
}

function Prompt-Secret([string]$Message) {
  $secure = Read-Host $Message -AsSecureString
  [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  )
}

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run this script in an elevated PowerShell (Run as Administrator)."
}

$dbPath = Join-Path $AppPath "data\littlecode.sqlite"
$cookieSecure = if ($HttpsCookies) { "true" } else { "false" }

$existingOpenAiKey = Get-MachineEnv "OPENAI_API_KEY"
$existingAuthSecret = Get-MachineEnv "AUTH_SECRET"

if ($SetOpenAIKey) {
  if ($OpenAIKey) {
    $keyToSet = $OpenAIKey
  } else {
    $keyToSet = Prompt-Secret "Enter OPENAI_API_KEY to replace the existing value (input hidden)"
  }
  Set-MachineEnvIfMissing -Name "OPENAI_API_KEY" -Value $keyToSet -Overwrite | Out-Null
} elseif ([string]::IsNullOrWhiteSpace($existingOpenAiKey)) {
  if ($OpenAIKey) {
    $keyToSet = $OpenAIKey
  } else {
    $keyToSet = Prompt-Secret "Enter OPENAI_API_KEY (input hidden)"
  }
  Set-MachineEnvIfMissing -Name "OPENAI_API_KEY" -Value $keyToSet | Out-Null
} else {
  Write-Host "Keep OPENAI_API_KEY (already set; not changed)"
}

if ($SetAuthSecret) {
  if ($AuthSecret) {
    $secretToSet = $AuthSecret
  } else {
    $secretToSet = New-RandomSecret
    Write-Host "Generated new AUTH_SECRET."
  }
  Set-MachineEnvIfMissing -Name "AUTH_SECRET" -Value $secretToSet -Overwrite | Out-Null
} elseif ([string]::IsNullOrWhiteSpace($existingAuthSecret)) {
  if ($AuthSecret) {
    $secretToSet = $AuthSecret
  } else {
    $secretToSet = New-RandomSecret
    Write-Host "Generated new AUTH_SECRET."
  }
  Set-MachineEnvIfMissing -Name "AUTH_SECRET" -Value $secretToSet | Out-Null
} else {
  Write-Host "Keep AUTH_SECRET (already set; not changed)"
}

$defaults = @{
  OPENAI_MODEL                   = "gpt-4.1-mini"
  OPENAI_ENDPOINT                = "https://api.openai.com/v1/responses"
  OPENAI_IMAGE_RESPONSE_MODEL    = "gpt-4.1-mini"
  OPENAI_IMAGE_QUALITY           = "medium"
  OPENAI_IMAGE_SIZE              = "1024x1024"
  OPENAI_IMAGE_ENDPOINT          = "https://api.openai.com/v1/images/generations"
  OPENAI_IMAGE_MODEL             = "dall-e-3"
  OPENAI_IMAGE_USE_RESPONSES_API = "true"
  AUTH_COOKIE_SECURE             = $cookieSecure
  SQLITE_DATABASE_PATH           = $dbPath
  NODE_ENV                       = "production"
}

if ($DisableImageGeneration) {
  Set-MachineEnvIfMissing -Name "OPENAI_IMAGE_GENERATION" -Value "false" -Overwrite:$Force | Out-Null
} else {
  Set-MachineEnvIfMissing -Name "OPENAI_IMAGE_GENERATION" -Value "true" -Overwrite:$Force | Out-Null
}

Write-Host ""
Write-Host "LittleCode environment (Machine scope, AppPath=$AppPath)"
Write-Host ""

foreach ($entry in $defaults.GetEnumerator() | Sort-Object Name) {
  $overwrite = $Force -and $entry.Key -ne "AUTH_COOKIE_SECURE"
  if ($entry.Key -eq "AUTH_COOKIE_SECURE" -and $HttpsCookies) {
    $overwrite = $true
  }
  Set-MachineEnvIfMissing -Name $entry.Key -Value $entry.Value -Overwrite:$overwrite | Out-Null
}

$reportNames = @(
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_ENDPOINT",
  "OPENAI_IMAGE_RESPONSE_MODEL",
  "OPENAI_IMAGE_QUALITY",
  "OPENAI_IMAGE_SIZE",
  "OPENAI_IMAGE_ENDPOINT",
  "OPENAI_IMAGE_MODEL",
  "OPENAI_IMAGE_USE_RESPONSES_API",
  "OPENAI_IMAGE_GENERATION",
  "AUTH_SECRET",
  "AUTH_COOKIE_SECURE",
  "SQLITE_DATABASE_PATH",
  "NODE_ENV"
)

Write-Host ""
Write-Host "Current values:"
foreach ($name in $reportNames) {
  $shown = Get-MachineEnv $name
  if ($name -eq "OPENAI_API_KEY" -and $shown) {
    $shown = $shown.Substring(0, [Math]::Min(8, $shown.Length)) + "..."
  }
  if ($name -eq "AUTH_SECRET" -and $shown) {
    $shown = "(set, hidden)"
  }
  Write-Host ("  {0} = {1}" -f $name, $(if ($shown) { $shown } else { "(not set)" }))
}

Write-Host ""
Write-Host "Restart the Node app so it picks up new variables:"
Write-Host '  Stop-ScheduledTask -TaskName "LittleCode Next.js"'
Write-Host '  Start-ScheduledTask -TaskName "LittleCode Next.js"'
Write-Host ""
Write-Host "Or reboot the server."
