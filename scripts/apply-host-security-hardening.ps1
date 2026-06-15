<#
.SYNOPSIS
  Apply host security hardening steps 1-4 from docs/HOST-SECURITY.md (Administrator required).

.DESCRIPTION
  Idempotent: PostgreSQL stop or localhost bind, FTP disable, RDP Public block via
  harden-hosting-firewall.ps1, SMB restricted on Public profile. Logs to logs/.

.EXAMPLE
  .\scripts\apply-host-security-hardening.ps1
  .\scripts\apply-host-security-hardening.ps1 -LogFile C:\LittleCode\logs\host-security-hardening.log
#>
param(
  [string]$AppRoot = "C:\LittleCode",
  [string]$LogFile = ""
)

$ErrorActionPreference = "Continue"

if (-not $LogFile) {
  $LogFile = Join-Path $AppRoot "logs\host-security-hardening-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
}

$logDir = Split-Path $LogFile -Parent
if ($logDir -and -not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}

$results = [System.Collections.Generic.List[object]]::new()

function Write-Log {
  param([string]$Message)
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
  Write-Host $line
}

function Add-Result {
  param(
    [string]$Step,
    [string]$Status,
    [string]$Detail = ""
  )
  $results.Add([pscustomobject]@{ Step = $Step; Status = $Status; Detail = $Detail })
  Write-Log "$Step : $Status $(if ($Detail) { "- $Detail" })"
}

function Assert-Administrator {
  $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script in an elevated PowerShell (Run as Administrator)."
  }
}

function Set-PostgresListenLocalhost {
  param([string]$ConfPath)

  if (-not (Test-Path $ConfPath)) {
    return $false, "postgresql.conf not found at $ConfPath"
  }

  $content = Get-Content $ConfPath -Raw
  $newListen = "listen_addresses = 'localhost'"
  if ($content -match "(?m)^\s*listen_addresses\s*=") {
    $content = $content -replace "(?m)^\s*listen_addresses\s*=.*$", $newListen
  } else {
    $content = $content + "`n$newListen`n"
  }

  $backup = "$ConfPath.bak.quizzora-$(Get-Date -Format 'yyyyMMddHHmmss')"
  Copy-Item -Path $ConfPath -Destination $backup -Force
  Set-Content -Path $ConfPath -Value $content -Encoding UTF8 -NoNewline

  $svc = Get-Service -Name "postgresql-x64-18" -ErrorAction SilentlyContinue
  if ($svc) {
    Restart-Service -Name $svc.Name -Force -ErrorAction Stop
  }
  return $true, "Set listen_addresses=localhost and restarted $($svc.Name); backup $backup"
}

Assert-Administrator
Write-Log "=== apply-host-security-hardening.ps1 started ==="
Write-Log "Log file: $LogFile"

# --- 1. PostgreSQL ---
$pgStep = "1. PostgreSQL"
$pgServices = @(Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue)
if (-not $pgServices.Count) {
  Add-Result -Step $pgStep -Status "skipped" -Detail "No postgresql* service found"
} else {
  foreach ($pgSvc in $pgServices) {
    $localConn = Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
    $extListeners = @(Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $_.LocalAddress -notin @('127.0.0.1', '::1') })
    Write-Log "PostgreSQL service $($pgSvc.Name) status=$($pgSvc.Status); external listeners=$($extListeners.Count)"

    try {
      Stop-Service -Name $pgSvc.Name -Force -ErrorAction Stop
      Start-Sleep -Seconds 2
      $after = Get-Service -Name $pgSvc.Name
      if ($after.Status -eq 'Stopped') {
        Set-Service -Name $pgSvc.Name -StartupType Manual -ErrorAction SilentlyContinue
        Add-Result -Step $pgStep -Status "success" -Detail "Stopped $($pgSvc.Name); startup set to Manual"
      } else {
        throw "Service still $($after.Status) after stop"
      }
    } catch {
      Write-Log "Stop-Service failed: $($_.Exception.Message); attempting localhost bind"
      $confCandidates = @(
        "C:\Program Files\PostgreSQL\18\data\postgresql.conf",
        "C:\Program Files\PostgreSQL\17\data\postgresql.conf",
        "C:\Program Files\PostgreSQL\16\data\postgresql.conf"
      )
      $confPath = $confCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
      if (-not $confPath) {
        $dataDir = (Get-ItemProperty -Path "HKLM:\SOFTWARE\PostgreSQL\Installations\*" -ErrorAction SilentlyContinue |
          Select-Object -ExpandProperty Data Directory -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ($dataDir) { $confPath = Join-Path $dataDir "postgresql.conf" }
      }
      if ($confPath) {
        try {
          $ok, $msg = Set-PostgresListenLocalhost -ConfPath $confPath
          if ($ok) { Add-Result -Step $pgStep -Status "success" -Detail $msg }
          else { Add-Result -Step $pgStep -Status "failed" -Detail $msg }
        } catch {
          Add-Result -Step $pgStep -Status "failed" -Detail "localhost bind failed: $($_.Exception.Message)"
        }
      } else {
        Add-Result -Step $pgStep -Status "failed" -Detail "Could not stop and postgresql.conf not found"
      }
    }
  }
}

# --- 2. FTP ---
$ftpStep = "2. FTP (ftpsvc)"
$ftp = Get-Service -Name "ftpsvc" -ErrorAction SilentlyContinue
if (-not $ftp) {
  Add-Result -Step $ftpStep -Status "skipped" -Detail "ftpsvc not installed"
} elseif ($ftp.Status -eq 'Stopped' -and $ftp.StartType -eq 'Disabled') {
  Add-Result -Step $ftpStep -Status "success" -Detail "Already stopped and disabled"
} else {
  try {
    if ($ftp.Status -ne 'Stopped') { Stop-Service -Name ftpsvc -Force -ErrorAction Stop }
    Set-Service -Name ftpsvc -StartupType Disabled -ErrorAction Stop
    Add-Result -Step $ftpStep -Status "success" -Detail "Stopped and disabled ftpsvc"
  } catch {
    Add-Result -Step $ftpStep -Status "failed" -Detail $_.Exception.Message
  }
}

# --- 3. RDP Public block ---
$rdpStep = "3. RDP firewall (Public block)"
$hardenScript = Join-Path $AppRoot "scripts\harden-hosting-firewall.ps1"
if (-not (Test-Path $hardenScript)) {
  Add-Result -Step $rdpStep -Status "failed" -Detail "Missing $hardenScript"
} else {
  Write-Host ""
  Write-Host "WARNING: Blocking inbound RDP on Public profile. You may lose RDP on Public Wi-Fi or from the internet on Public networks."
  Write-Host ""
  try {
    & $hardenScript -BlockRdpFromPublic -SkipCloudflareReminder 2>&1 | ForEach-Object { Write-Log $_ }
    $blockRule = Get-NetFirewallRule -DisplayName "Quizzora - Block RDP on Public profile" -ErrorAction SilentlyContinue
    if ($blockRule -and $blockRule.Enabled -eq 'True') {
      Add-Result -Step $rdpStep -Status "success" -Detail "Ran harden-hosting-firewall.ps1 -BlockRdpFromPublic"
    } else {
      Add-Result -Step $rdpStep -Status "failed" -Detail "Block rule not found or not enabled after script"
    }
  } catch {
    Add-Result -Step $rdpStep -Status "failed" -Detail $_.Exception.Message
  }
}

# --- 4. SMB on Public ---
$smbStep = "4. SMB (445) Public profile"
$blockSmbRuleName = "Quizzora - Block SMB on Public profile"
try {
  $publicOnlyDisabled = 0
  $smbRules = Get-NetFirewallRule -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Enabled -eq 'True' -and
      $_.Direction -eq 'Inbound' -and
      $_.DisplayName -match 'SMB-In' -and
      $_.Profile -eq 'Public'
    }
  foreach ($rule in $smbRules) {
    Disable-NetFirewallRule -Name $rule.Name -ErrorAction Stop
    $publicOnlyDisabled++
    Write-Log "Disabled Public-only rule: $($rule.DisplayName)"
  }

  netsh advfirewall firewall delete rule name="$blockSmbRuleName" 2>$null | Out-Null
  $netshOut = netsh advfirewall firewall add rule `
    name="$blockSmbRuleName" `
    dir=in action=block protocol=TCP localport=445 remoteip=any profile=public enable=yes 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "netsh SMB block failed: $netshOut"
  }

  $sharedPublic = Get-NetFirewallRule -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Enabled -eq 'True' -and
      $_.Direction -eq 'Inbound' -and
      $_.DisplayGroup -eq 'File and Printer Sharing' -and
      $_.DisplayName -match 'SMB-In' -and
      ($_.Profile -band [Microsoft.PowerShell.Cmdletization.GeneratedTypes.NetSecurity.Profile]::Public) -and
      ($_.Profile -band [Microsoft.PowerShell.Cmdletization.GeneratedTypes.NetSecurity.Profile]::Private)
    }
  if ($sharedPublic) {
    Write-Log "SMB-In rules still enabled on Private+Public; Public inbound 445 blocked by $blockSmbRuleName"
  }

  Add-Result -Step $smbStep -Status "success" -Detail "Disabled $publicOnlyDisabled Public-only SMB-In rule(s); added block rule for TCP 445 on Public"
} catch {
  try {
    $smbInPublicBoth = Get-NetFirewallRule -DisplayName "File and Printer Sharing (SMB-In)" -ErrorAction SilentlyContinue |
      Where-Object { $_.Enabled -eq 'True' -and $_.Profile -match 'Public' }
    foreach ($r in $smbInPublicBoth) {
      if ($r.Profile -eq 'Private' -or $r.Profile -eq 'Domain') { continue }
      if ($r.Profile.ToString() -match 'Public' -and $r.Profile.ToString() -match 'Private') {
        Write-Log "Keeping Private+Public SMB-In allow; relying on block rule"
        continue
      }
      Disable-NetFirewallRule -Name $r.Name -ErrorAction SilentlyContinue
    }
    netsh advfirewall firewall delete rule name="$blockSmbRuleName" 2>$null | Out-Null
    netsh advfirewall firewall add rule name="$blockSmbRuleName" dir=in action=block protocol=TCP localport=445 profile=public enable=yes | Out-Null
    Add-Result -Step $smbStep -Status "success" -Detail "Block rule for SMB on Public (fallback path)"
  } catch {
    Add-Result -Step $smbStep -Status "failed" -Detail $_.Exception.Message
  }
}

# --- 5. Router (manual) ---
Add-Result -Step "5. Router port forwards" -Status "manual-only" -Detail "Configure on router admin; see docs/HOST-SECURITY.md Router checklist"

# --- Health checks ---
Write-Log "--- Health checks (Quizzora) ---"
foreach ($port in 3000, 3001) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
    Add-Result -Step "Health :$port" -Status "success" -Detail "HTTP $($r.StatusCode)"
  } catch {
    Add-Result -Step "Health :$port" -Status "failed" -Detail $_.Exception.Message
  }
}

Write-Log "=== Summary ==="
$results | Format-Table -AutoSize | Out-String | ForEach-Object { Write-Log $_.Trim() }
Write-Log "=== apply-host-security-hardening.ps1 finished ==="
Write-Host ""
Write-Host "Log saved to: $LogFile"
