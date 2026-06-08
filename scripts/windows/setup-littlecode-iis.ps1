param(
  [string]$SourcePath = (Resolve-Path ".").Path,
  [string]$AppPath = "C:\LittleCode",
  [string]$SiteName = "LittleCode",
  [int]$IisPort = 8080,
  [int]$NodePort = 3000,
  [string]$OpenAIKey = "",
  [string]$AuthSecret = "",
  [switch]$SkipIis
)

$ErrorActionPreference = "Stop"

function Assert-Command($Name, $InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name was not found. $InstallHint"
  }
}

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

Assert-Command "node" "Install Node.js LTS from https://nodejs.org/."
Assert-Command "npm" "Install Node.js LTS from https://nodejs.org/."

if (-not $AuthSecret) {
  $AuthSecret = New-RandomSecret
}

Write-Host "Preparing LittleCode in $AppPath"
New-Item -ItemType Directory -Force -Path $AppPath | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $AppPath "data") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $AppPath "logs") | Out-Null

$exclude = @("node_modules", ".next", ".git", "data", "logs")
$items = Get-ChildItem -Force -Path $SourcePath | Where-Object { $exclude -notcontains $_.Name }
foreach ($item in $items) {
  Copy-Item -Path $item.FullName -Destination $AppPath -Recurse -Force
}

Copy-Item -Path (Join-Path $SourcePath "scripts\windows\start-littlecode.ps1") -Destination (Join-Path $AppPath "start-littlecode.ps1") -Force
Copy-Item -Path (Join-Path $SourcePath "scripts\windows\iis-web.config") -Destination (Join-Path $AppPath "web.config") -Force

$setEnvScript = Join-Path $SourcePath "scripts\windows\set-littlecode-env.ps1"
if (Test-Path $setEnvScript) {
  $setEnvArgs = @{ AppPath = $AppPath; AuthSecret = $AuthSecret }
  if ($OpenAIKey) {
    $setEnvArgs.OpenAIKey = $OpenAIKey
    $setEnvArgs.SetOpenAIKey = $true
  }
  if ($AuthSecret) {
    $setEnvArgs.SetAuthSecret = $true
  }
  & $setEnvScript @setEnvArgs
} else {
  [Environment]::SetEnvironmentVariable("OPENAI_API_KEY", $OpenAIKey, "Machine")
  [Environment]::SetEnvironmentVariable("OPENAI_MODEL", "gpt-4.1-mini", "Machine")
  [Environment]::SetEnvironmentVariable("OPENAI_ENDPOINT", "https://api.openai.com/v1/responses", "Machine")
  [Environment]::SetEnvironmentVariable("AUTH_SECRET", $AuthSecret, "Machine")
  [Environment]::SetEnvironmentVariable("AUTH_COOKIE_SECURE", "false", "Machine")
  [Environment]::SetEnvironmentVariable("SQLITE_DATABASE_PATH", (Join-Path $AppPath "data\littlecode.sqlite"), "Machine")
}

$env:OPENAI_API_KEY = $OpenAIKey
$env:OPENAI_MODEL = "gpt-4.1-mini"
$env:OPENAI_ENDPOINT = "https://api.openai.com/v1/responses"
$env:AUTH_SECRET = $AuthSecret
$env:AUTH_COOKIE_SECURE = "false"
$env:SQLITE_DATABASE_PATH = Join-Path $AppPath "data\littlecode.sqlite"

Set-Location $AppPath
npm ci
npm run build

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$AppPath\start-littlecode.ps1`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
Register-ScheduledTask -TaskName "LittleCode Next.js" -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName "LittleCode Next.js"

if (-not $SkipIis) {
  Import-Module WebAdministration

  try {
    Set-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST" -Filter "system.webServer/proxy" -Name "enabled" -Value "True"
    Set-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST" -Filter "system.webServer/proxy" -Name "preserveHostHeader" -Value "True"
  } catch {
    Write-Warning "Could not enable ARR proxy automatically. Install IIS Application Request Routing and enable proxy in IIS Manager."
  }

  if (-not (Test-Path "IIS:\AppPools\$SiteName")) {
    New-WebAppPool -Name $SiteName | Out-Null
  }
  Set-ItemProperty "IIS:\AppPools\$SiteName" -Name managedRuntimeVersion -Value ""

  if (Test-Path "IIS:\Sites\$SiteName") {
    Remove-Website -Name $SiteName
  }
  New-Website -Name $SiteName -Port $IisPort -PhysicalPath $AppPath -ApplicationPool $SiteName | Out-Null

  Write-Host "IIS site '$SiteName' is bound to http://localhost:$IisPort and proxies to Node on http://127.0.0.1:$NodePort."
  Write-Host "Requires IIS URL Rewrite and Application Request Routing with proxy enabled."
}

Write-Host "LittleCode setup complete."
Write-Host "Node app: http://127.0.0.1:$NodePort"
Write-Host "IIS app:  http://localhost:$IisPort"
