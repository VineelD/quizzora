<#
.SYNOPSIS
  Read-only security audit for the Quizzora Windows hosting server.

.DESCRIPTION
  Reports listening ports, bind addresses, Windows Firewall posture, IIS/Node
  configuration hints, and high-risk services. Does not change system state.

.EXAMPLE
  .\scripts\audit-host-security.ps1
  .\scripts\audit-host-security.ps1 -OutputFile C:\LittleCode\logs\host-security-audit.txt
#>
param(
  [string]$AppRoot = "C:\LittleCode",
  [string]$TestAppRoot = "C:\LittleCode-test",
  [string]$OutputFile = ""
)

$ErrorActionPreference = "Continue"
$report = [System.Collections.Generic.List[string]]::new()

function Write-ReportLine {
  param([string]$Line = "")
  $report.Add($Line)
  Write-Host $Line
}

function Get-ProcessNameForPid {
  param([int]$ProcessId)
  try {
    return (Get-Process -Id $ProcessId -ErrorAction Stop).ProcessName
  } catch {
    return "unknown"
  }
}

function Get-BindRisk {
  param([string]$LocalAddress, [int]$Port)

  if ($LocalAddress -eq "127.0.0.1" -or $LocalAddress -eq "::1") {
    return "Low (loopback only)"
  }

  if ($Port -in 3000, 3001) {
    return "HIGH  - Node must bind loopback only"
  }

  if ($Port -eq 3389) {
    return "HIGH  - RDP exposed on all interfaces"
  }

  if ($Port -in 21, 22, 23, 445, 5432) {
    return "HIGH  - unnecessary remote service"
  }

  if ($Port -in 80, 443) {
    return "Expected (web)  - restrict to Cloudflare at firewall"
  }

  if ($Port -in 8080, 8081, 8082, 5000, 5001) {
    return "Medium  - IIS/extra site; confirm firewall"
  }

  if ($LocalAddress -eq "0.0.0.0" -or $LocalAddress -eq "::") {
    return "Medium  - all interfaces"
  }

  return "Review"
}

Write-ReportLine "=== Quizzora host security audit ==="
Write-ReportLine "Timestamp (UTC): $([DateTime]::UtcNow.ToString('o'))"
Write-ReportLine "Computer: $env:COMPUTERNAME"
Write-ReportLine ""
Write-ReportLine "DISCLAIMER: No system is 100% secure against external attack."
Write-ReportLine "This report is a point-in-time snapshot. Re-run after changes."
Write-ReportLine ""

# --- Firewall profiles ---
Write-ReportLine "--- Windows Firewall profiles ---"
Get-NetFirewallProfile | ForEach-Object {
  Write-ReportLine ("  {0,-8} Enabled={1} DefaultInbound={2}" -f $_.Name, $_.Enabled, $_.DefaultInboundAction)
}
Write-ReportLine ""

# --- LittleCode origin rules ---
Write-ReportLine "--- LittleCode / Cloudflare origin rules ---"
$loopbackRule = Get-NetFirewallRule -DisplayName "LittleCode - Loopback 3000,3001,8080" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $loopbackRule) {
  $loopbackRule = Get-NetFirewallRule -DisplayName "LittleCode - Loopback 3000,8080" -ErrorAction SilentlyContinue | Select-Object -First 1
}
if ($loopbackRule) {
  Write-ReportLine "  [OK] $($loopbackRule.DisplayName) (Enabled=$($loopbackRule.Enabled), Action=$($loopbackRule.Action))"
} else {
  Write-ReportLine "  [MISSING] LittleCode loopback rule - run scripts\harden-hosting-firewall.ps1"
}

foreach ($name in @("LittleCode - Cloudflare IPv4 80,443", "LittleCode - Cloudflare IPv6 80,443")) {
  $rule = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($rule) {
    Write-ReportLine "  [OK] $name (Enabled=$($rule.Enabled), Action=$($rule.Action))"
  } else {
    Write-ReportLine "  [MISSING] $name - run scripts\windows\lockdown-origin-cloudflare.ps1"
  }
}
Write-ReportLine ""

# --- Listening TCP ports ---
Write-ReportLine "--- Listening TCP ports (notable) ---"
Write-ReportLine ("{0,-22} {1,-8} {2,-10} {3}" -f "LocalAddress", "Port", "PID", "Risk")
$connections = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Sort-Object LocalPort, LocalAddress

$notablePorts = 21, 22, 23, 25, 80, 85, 135, 443, 445, 3000, 3001, 3389, 5000, 5001, 5050, 5432, 7680, 8080, 8081, 8082
foreach ($conn in $connections) {
  if ($conn.LocalPort -notin $notablePorts -and $conn.LocalAddress -notin @("0.0.0.0", "::")) {
    continue
  }
  $risk = Get-BindRisk -LocalAddress $conn.LocalAddress -Port $conn.LocalPort
  $proc = Get-ProcessNameForPid -ProcessId $conn.OwningProcess
  Write-ReportLine ("{0,-22} {1,-8} {2,-10} {3} ({4})" -f $conn.LocalAddress, $conn.LocalPort, $conn.OwningProcess, $risk, $proc)
}
Write-ReportLine ""

# --- Node bind check ---
Write-ReportLine "--- Node.js bind addresses ---"
foreach ($port in 3000, 3001) {
  $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  if (-not $listeners.Count) {
    Write-ReportLine "  Port ${port}: not listening"
    continue
  }
  foreach ($l in $listeners) {
    $ok = $l.LocalAddress -eq "127.0.0.1"
    $tag = if ($ok) { "[OK]" } else { "[WARN]" }
    Write-ReportLine "  $tag Port $port on $($l.LocalAddress)"
  }
}
Write-ReportLine ""

# --- IIS web.config ---
Write-ReportLine "--- IIS reverse proxy (web.config) ---"
$webConfig = Join-Path $AppRoot "web.config"
if (Test-Path $webConfig) {
  $xml = Get-Content $webConfig -Raw
  if ($xml -match "127\.0\.0\.1:3000") {
    Write-ReportLine "  [OK] $webConfig proxies to 127.0.0.1:3000"
  } else {
    Write-ReportLine "  [WARN] $webConfig does not reference 127.0.0.1:3000"
  }
} else {
  Write-ReportLine "  [MISSING] $webConfig"
}

$testWebConfig = Join-Path $TestAppRoot "web.config"
if (Test-Path $testWebConfig) {
  $testXml = Get-Content $testWebConfig -Raw
  if ($testXml -match "127\.0\.0\.1:3001") {
    Write-ReportLine "  [OK] $testWebConfig proxies to 127.0.0.1:3001"
  } else {
    Write-ReportLine "  [WARN] $testWebConfig should proxy to 127.0.0.1:3001"
  }
}
Write-ReportLine ""

# --- Risky services ---
Write-ReportLine "--- Services (selected) ---"
$serviceNames = @("TermService", "ftpsvc", "postgresql-x64-18", "sshd", "W3SVC", "cloudflared")
foreach ($name in $serviceNames) {
  $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
  if ($svc) {
    $note = switch ($name) {
      "TermService" { "RDP  - disable Public firewall access if not needed remotely" }
      "ftpsvc" { "FTP  - stop/disable if unused" }
      "postgresql-x64-18" { "PostgreSQL  - Quizzora uses SQLite; bind to localhost or stop" }
      "sshd" { "OpenSSH server" }
      "cloudflared" { "Cloudflare Tunnel (alternative to A-record proxy)" }
      default { "" }
    }
    Write-ReportLine ("  {0,-22} {1,-10} {2}" -f $name, $svc.Status, $note)
  }
}
Write-ReportLine ""

# --- RDP firewall ---
Write-ReportLine "--- Remote Desktop firewall ---"
$rdpRules = Get-NetFirewallRule -DisplayName "Remote Desktop - User Mode (TCP-In)" -ErrorAction SilentlyContinue
foreach ($rule in $rdpRules) {
  Write-ReportLine "  $($rule.DisplayName) Enabled=$($rule.Enabled) Profile=$($rule.Profile) Action=$($rule.Action)"
}
Write-ReportLine "  If RDP is not required from the internet, use harden script -BlockRdpFromPublic (may lock you out on Public Wi-Fi)."
Write-ReportLine ""

# --- Secrets / git ---
Write-ReportLine "--- Secrets hygiene ---"
$gitignore = Join-Path $AppRoot ".gitignore"
if (Test-Path $gitignore) {
  $gi = Get-Content $gitignore -Raw
  if ($gi -match "\.env\*\.local") {
    Write-ReportLine "  [OK] .env*.local ignored by git"
  } else {
    Write-ReportLine "  [WARN] Verify .env.local is gitignored"
  }
}
Write-ReportLine ""

# --- App security (file checks) ---
Write-ReportLine "--- Application security (code hints) ---"
$middleware = Join-Path $AppRoot "middleware.js"
if (Test-Path $middleware) {
  $mw = Get-Content $middleware -Raw
  $checks = @(
    @{ Name = "CSP (report-only)"; Pattern = "Content-Security-Policy-Report-Only" },
    @{ Name = "HSTS (production)"; Pattern = "Strict-Transport-Security" },
    @{ Name = "X-Frame-Options"; Pattern = "X-Frame-Options" }
  )
  foreach ($c in $checks) {
    if ($mw -match [regex]::Escape($c.Pattern)) {
      Write-ReportLine "  [OK] middleware.js sets $($c.Name)"
    } else {
      Write-ReportLine "  [MISSING] middleware.js $($c.Name)"
    }
  }
}

$sessionCookie = Join-Path $AppRoot "lib\session-cookie.js"
if (Test-Path $sessionCookie) {
  $sc = Get-Content $sessionCookie -Raw
  if ($sc -match "httpOnly:\s*true") {
    Write-ReportLine "  [OK] session cookies httpOnly"
  }
  if ($sc -match "secure:") {
    Write-ReportLine "  [OK] session cookies secure when HTTPS detected"
  }
}
Write-ReportLine ""

# --- Recommendations ---
Write-ReportLine "--- Recommendations ---"
Write-ReportLine "  1. Keep Node on 127.0.0.1; public entry via IIS + Cloudflare only."
Write-ReportLine "  2. Run scripts\windows\lockdown-origin-cloudflare.ps1 after Cloudflare IP updates."
Write-ReportLine "  3. Run scripts\harden-hosting-firewall.ps1 for defense-in-depth on Node ports."
Write-ReportLine "  4. Stop/disable FTP (ftpsvc) and PostgreSQL if not required."
Write-ReportLine "  5. Restrict or disable RDP from Public networks."
Write-ReportLine "  6. Windows Update, strong passwords, 2FA on Stripe/GitHub/Cloudflare."
Write-ReportLine "  7. See docs\HOST-SECURITY.md and docs\PCI-COMPLIANCE.md"
Write-ReportLine ""
Write-ReportLine "=== End audit ==="

if ($OutputFile) {
  $dir = Split-Path $OutputFile -Parent
  if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  $report -join [Environment]::NewLine | Set-Content -Path $OutputFile -Encoding UTF8
  Write-Host ""
  Write-Host "Report saved to $OutputFile"
}
