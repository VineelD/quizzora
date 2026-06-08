# Copy canonical staging IIS reverse-proxy config to C:\LittleCode-test\web.config.
# Usage: powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\restore-test-webconfig.ps1

param(
  [string]$TestRoot = "C:\LittleCode-test",
  [string]$ProdRoot = "C:\LittleCode",
  [switch]$VerifyOnly
)

$ErrorActionPreference = "Stop"

$templatePath = Join-Path $ProdRoot "scripts\web.config.test.xml"
$testWebConfig = Join-Path $TestRoot "web.config"
$expectedPort = "3001"
$wrongPort = "3000"

function Test-StagingWebConfigContent {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return @{
      Ok = $false
      Message = "Missing staging web.config at $Path"
    }
  }

  $content = Get-Content -Path $Path -Raw
  if ($content -match ":$wrongPort/") {
    return @{
      Ok = $false
      Message = "Staging web.config proxies to port $wrongPort (production). Expected $expectedPort. Run scripts\restore-test-webconfig.ps1 or sync-test-from-prod.ps1."
    }
  }
  if ($content -notmatch ":$expectedPort/") {
    return @{
      Ok = $false
      Message = "Staging web.config does not proxy to 127.0.0.1:$expectedPort. Check $Path"
    }
  }
  if ($content -notmatch '<proxy[^>]*timeout=') {
    return @{
      Ok = $false
      Message = "Staging web.config is missing ARR proxy timeout (AI quiz generation needs >= 6 minutes). Run scripts\restore-test-webconfig.ps1."
    }
  }

  return @{
    Ok = $true
    Message = "Staging web.config proxies to 127.0.0.1:$expectedPort with ARR proxy timeout"
  }
}

if (-not $VerifyOnly) {
  if (-not (Test-Path $templatePath)) {
    throw "Missing canonical template: $templatePath"
  }

  New-Item -ItemType Directory -Force -Path $TestRoot | Out-Null
  Copy-Item -Path $templatePath -Destination $testWebConfig -Force
  Write-Host "Restored staging web.config from $templatePath"
}

$result = Test-StagingWebConfigContent -Path $testWebConfig
if (-not $result.Ok) {
  throw $result.Message
}

Write-Host $result.Message
