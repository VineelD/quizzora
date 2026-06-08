# Refresh C:\LittleCode-test from production (code + database).
# Preserves staging-only files: web.config (port 3001), .env.local, SQLite via online backup.
# Usage: powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\sync-test-from-prod.ps1

$ErrorActionPreference = "Stop"

$prodRoot = "C:\LittleCode"
$testRoot = "C:\LittleCode-test"
$testTaskName = "LittleCode Test Next.js"
$stagingHost = "test.quizzora.org"
$stagingPort = 3001

if (-not (Test-Path $prodRoot)) {
  throw "Production path not found: $prodRoot"
}

New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $testRoot "data") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $testRoot "logs") | Out-Null

Write-Host "Syncing application files (excluding node_modules, .next, logs, data, staging-only config)..."
$robocopyArgs = @(
  $prodRoot,
  $testRoot,
  "/MIR",
  "/XD", "node_modules", ".next", "logs", "data", ".git",
  "/XF", ".env.local", ".env.stripe-test.local", "web.config",
  "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np"
)
& robocopy @robocopyArgs | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "robocopy failed with exit code $LASTEXITCODE"
}

Write-Host "Restoring staging web.config (127.0.0.1:$stagingPort)..."
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $prodRoot "scripts\restore-test-webconfig.ps1") -TestRoot $testRoot -ProdRoot $prodRoot

$prodDb = Join-Path $prodRoot "data\littlecode.sqlite"
$testDb = Join-Path $testRoot "data\littlecode.sqlite"
$backupScript = Join-Path $prodRoot "scripts\backup-prod-db.mjs"
$testStoppedForDb = $false

if (Test-Path $prodDb) {
  Write-Host "Online backup of production database (safe with WAL + live app)..."
  Stop-ScheduledTask -TaskName $testTaskName -ErrorAction SilentlyContinue
  $testStoppedForDb = $true
  Start-Sleep -Seconds 2
  foreach ($suffix in @("", "-wal", "-shm")) {
    $sidecar = if ($suffix) { "$testDb$suffix" } else { $testDb }
    if (Test-Path $sidecar) {
      Remove-Item $sidecar -Force
    }
  }
  $env:SQLITE_DATABASE_PATH = $prodDb
  Set-Location $prodRoot
  $resultJson = node $backupScript --output $testDb
  $result = $resultJson | ConvertFrom-Json
  if (-not $result.ok) {
    throw "Database backup failed: $resultJson"
  }
  $integrityJson = node -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.argv[1], { readOnly: true }); const r = db.prepare('PRAGMA integrity_check').all(); db.close(); console.log(JSON.stringify(r));" $testDb
  $integrity = $integrityJson | ConvertFrom-Json
  if ($integrity[0].integrity_check -ne "ok") {
    throw "Staging database failed integrity check after backup: $integrityJson"
  }
  Write-Host "Staging database copied via online backup; integrity ok."
} else {
  Write-Warning "Production database not found at $prodDb"
}

# Re-apply web.config after DB step so a mid-script failure never leaves prod proxy in place.
Write-Host "Re-verifying staging web.config..."
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $prodRoot "scripts\restore-test-webconfig.ps1") -TestRoot $testRoot -ProdRoot $prodRoot

$testEnvPath = Join-Path $testRoot ".env.local"
if (-not (Test-Path $testEnvPath)) {
  Write-Host "Creating .env.local for test from production template..."
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $prodRoot "scripts\write-test-env.ps1")
} else {
  Write-Host "Preserved existing staging .env.local (not copied from production)."
  $envContent = Get-Content $testEnvPath -Raw
  if ($envContent -match '(?m)^SQLITE_DATABASE_PATH=(.+)$') {
    $dbPath = $Matches[1].Trim()
    Write-Host "Preserved SQLITE_DATABASE_PATH=$dbPath"
  }
}

Write-Host "Post-sync verification..."
$testWebConfig = Join-Path $testRoot "web.config"
$configContent = Get-Content -Path $testWebConfig -Raw
if ($configContent -match ":3000/") {
  throw "Post-sync check failed: $testWebConfig still proxies to port 3000. Staging would hit production Node and cause redirect loops."
}

$listener = Get-NetTCPConnection -LocalPort $stagingPort -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  $healthUrl = "http://127.0.0.1:$stagingPort/api/health"
  try {
    $health = curl.exe -s -S -H "Host: $stagingHost" $healthUrl
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Health check request failed (curl exit $LASTEXITCODE). web.config is correct; restart '$testTaskName' after build if needed."
    } elseif ($health -match "test\.quizzora\.org") {
      Write-Host "OK - staging health via 127.0.0.1:$stagingPort (Host: $stagingHost)"
    } else {
      Write-Warning "Health responded but may not be staging app: $health"
    }
  } catch {
    Write-Warning "Health check failed: $($_.Exception.Message). web.config is correct; restart '$testTaskName' after build if needed."
  }
} else {
  Write-Warning "Port $stagingPort not listening - web.config verified. Run build and restart '$testTaskName' when ready."
}

if ($testStoppedForDb) {
  Write-Host "Note: '$testTaskName' was stopped for database backup; restart after npm run build."
}

Write-Host "Test sync complete: $testRoot"
Write-Host "Next: cd $testRoot; npm install; npm run build; restart '$testTaskName' task"
