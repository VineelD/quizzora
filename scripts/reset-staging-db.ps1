# Reset test.quizzora.org SQLite: backup, wipe, seed super admin, restart Node task.
# Usage: powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\reset-staging-db.ps1

$ErrorActionPreference = "Stop"

$prodRoot = "C:\LittleCode"
$testRoot = "C:\LittleCode-test"
$taskName = "LittleCode Test Next.js"
$testDb = Join-Path $testRoot "data\littlecode.sqlite"
$prodDb = Join-Path $prodRoot "data\littlecode.sqlite"
$backupDir = Join-Path $testRoot "data\backups"
$testEnv = Join-Path $testRoot ".env.local"

if (-not (Test-Path $testRoot)) {
  throw "Staging path not found: $testRoot"
}

$testDbResolved = Resolve-Path $testDb -ErrorAction SilentlyContinue
$prodDbResolved = Resolve-Path $prodDb -ErrorAction SilentlyContinue
if ($testDbResolved -and $prodDbResolved -and ($testDbResolved.Path -eq $prodDbResolved.Path)) {
  throw "Staging and production database paths must differ."
}

function Import-DotEnvFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return @{} }
  $vars = @{}
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $sep = $line.IndexOf("=")
    if ($sep -lt 1) { return }
    $key = $line.Substring(0, $sep).Trim()
    $value = $line.Substring($sep + 1).Trim()
    $vars[$key] = $value
    Set-Item -Path "Env:$key" -Value $value
  }
  return $vars
}

function New-RandomPassword {
  param([int]$Length = 20)
  $bytes = New-Object byte[] $Length
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', 'x').Replace('/', 'y').Substring(0, $Length)
}

Write-Host "=== 1. Stop $taskName ==="
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "`n=== 2. Backup current staging database ==="
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if (Test-Path $testDb) {
  $backupPath = Join-Path $backupDir "littlecode-$stamp.sqlite"
  Copy-Item $testDb $backupPath -Force
  foreach ($suffix in @("-wal", "-shm")) {
    $sidecar = "$testDb$suffix"
    if (Test-Path $sidecar) {
      Copy-Item $sidecar "$backupPath$suffix" -Force
    }
  }
  Write-Host "Backed up to $backupPath"
} else {
  Write-Host "No existing database to backup."
}

Write-Host "`n=== 3. Reset database and seed super admin ==="
$envVars = Import-DotEnvFile -Path $testEnv
$env:SQLITE_DATABASE_PATH = $testDb
$env:SUPERADMIN_USERNAME = "superadmin"
$env:SUPERADMIN_EMAIL = "superadmin@staging.quizzora.org"
$env:SUPERADMIN_NAME = "Platform Super Admin"
$env:SUPERADMIN_PASSWORD = New-RandomPassword -Length 20

Set-Location $prodRoot
$resultJson = node (Join-Path $prodRoot "scripts\reset-staging-db.mjs")
$result = $resultJson | ConvertFrom-Json
if (-not $result.ok) {
  throw "Reset failed: $resultJson"
}

$username = $result.superadmin.username
$email = $result.superadmin.email
$password = $result.superadmin.password
Write-Host "Super admin created: $username / $email"

Write-Host "`n=== 4. Update staging .env.local seed credentials ==="
$lines = if (Test-Path $testEnv) { Get-Content $testEnv } else { @() }
$out = New-Object System.Collections.Generic.List[string]
$skipUntilBlank = $false
$seedKeys = @{
  "SUPERADMIN_EMAIL" = $email
  "SUPERADMIN_USERNAME" = $username
  "SUPERADMIN_PASSWORD" = $password
  "SQLITE_DATABASE_PATH" = $result.database
}

foreach ($line in $lines) {
  $trimmed = $line.Trim()
  if ($trimmed -eq "# STAGING_SEED_CREDENTIALS") {
    $skipUntilBlank = $true
    continue
  }
  if ($skipUntilBlank) {
    if (-not $trimmed) {
      $skipUntilBlank = $false
    }
    continue
  }
  $sep = $trimmed.IndexOf("=")
  if ($sep -gt 0) {
    $key = $trimmed.Substring(0, $sep).Trim()
    if ($seedKeys.ContainsKey($key)) {
      continue
    }
  }
  $out.Add($line)
}

$out.Add("")
$out.Add("# STAGING_SEED_CREDENTIALS")
$out.Add("# Generated $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') by scripts/reset-staging-db.ps1")
$out.Add("# Layer B app login (super admin) - separate from STAGING_GATE_* (Layer A)")
$out.Add("# SUPERADMIN_USERNAME=$username")
$out.Add("# SUPERADMIN_PASSWORD=$password")
$out.Add("SUPERADMIN_EMAIL=$email")
$out.Add("SUPERADMIN_USERNAME=$username")
$out.Add("SUPERADMIN_PASSWORD=$password")
$out.Add("SQLITE_DATABASE_PATH=$($result.database)")

Set-Content -Path $testEnv -Value ($out -join "`r`n") -Encoding UTF8
Write-Host "Updated $testEnv"

Write-Host "`n=== 5. Restart $taskName ==="
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 5

$listener = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  Write-Host "OK - Node listening on 127.0.0.1:3001"
} else {
  Write-Warning "Port 3001 not listening yet - check $testRoot\logs\next.log"
}

Write-Host "`n=== Staging super admin (save securely) ==="
Write-Host "Username: $username"
Write-Host "Email:    $email"
Write-Host "Password: $password"
Write-Host "Gate:     tester / (see STAGING_GATE_PASSWORD in .env.local)"
