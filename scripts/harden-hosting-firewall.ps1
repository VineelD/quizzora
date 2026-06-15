<#
.SYNOPSIS
  Harden Windows Firewall for Quizzora home hosting (Administrator required).

.DESCRIPTION
  - Ensures Windows Firewall is enabled on Domain, Private, and Public profiles.
  - Sets Public profile default inbound action to Block (if not already).
  - Refreshes loopback-only allow rules for Node ports 3000/3001 and IIS 8080.
  - Updates LittleCode loopback allow rule to include port 3001 (staging).
  - Optionally blocks RDP (3389) on the Public profile only (-BlockRdpFromPublic).

  Does NOT replace scripts\windows\lockdown-origin-cloudflare.ps1 for 80/443
  Cloudflare IP allowlisting. Run both for full origin hardening.

.PARAMETER BlockRdpFromPublic
  Adds a Block rule for inbound TCP 3389 on the Public profile.
  WARNING: You may lose RDP when connected via Public networks (e.g. coffee-shop Wi-Fi).
  Does not affect Private/Home network RDP if Private allow rules remain.

.PARAMETER WhatIf
  Preview changes without applying them.

.EXAMPLE
  .\scripts\harden-hosting-firewall.ps1 -WhatIf
  .\scripts\harden-hosting-firewall.ps1
  .\scripts\harden-hosting-firewall.ps1 -BlockRdpFromPublic
#>
param(
  [switch]$WhatIf,
  [switch]$BlockRdpFromPublic,
  [switch]$SkipCloudflareReminder
)

$ErrorActionPreference = "Stop"

$RuleGroup = "Quizzora Host Hardening"
$LoopbackRuleName = "LittleCode - Loopback 3000,3001,8080"
$LegacyLoopbackRuleName = "LittleCode - Loopback 3000,8080"
$BlockRdpPublicRuleName = "Quizzora - Block RDP on Public profile"

function Assert-Administrator {
  $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script in an elevated PowerShell (Run as Administrator)."
  }
}

function Invoke-HardenStep {
  param(
    [string]$Description,
    [scriptblock]$Action
  )

  if ($WhatIf) {
    Write-Host "[WhatIf] $Description"
    return
  }

  & $Action
  Write-Host "Done: $Description"
}

Assert-Administrator

Write-Host "=== Quizzora host firewall hardening ==="
if ($WhatIf) {
  Write-Host "(WhatIf mode  - no changes will be applied)"
}
Write-Host ""

if ($BlockRdpFromPublic) {
  Write-Host "WARNING: -BlockRdpFromPublic will block inbound RDP on Public networks."
  Write-Host "         You may be locked out of RDP over the internet or Public Wi-Fi."
  Write-Host ""
}

# 1. Enable firewall on all profiles
Invoke-HardenStep "Enable Windows Firewall on all profiles" {
  Set-NetFirewallProfile -Profile Domain, Private, Public -Enabled True
}

# 2. Public default inbound Block
Invoke-HardenStep "Set Public profile default inbound action to Block" {
  Set-NetFirewallProfile -Profile Public -DefaultInboundAction Block
}

# 3. Replace legacy loopback rule with 3001 included
Invoke-HardenStep "Refresh LittleCode loopback allow rule (3000,3001,8080)" {
  netsh advfirewall firewall delete rule name="$LegacyLoopbackRuleName" 2>$null | Out-Null
  netsh advfirewall firewall delete rule name="$LoopbackRuleName" 2>$null | Out-Null

  $output = netsh advfirewall firewall add rule `
    name="$LoopbackRuleName" `
    dir=in `
    action=allow `
    protocol=TCP `
    localport=3000,3001,8080 `
    remoteip=127.0.0.1 `
    profile=any `
    enable=yes 2>&1

  if ($LASTEXITCODE -ne 0) {
    throw "Failed to add loopback rule: $output"
  }
}

# 4. Remove obsolete broad Node allow rules if present
Invoke-HardenStep "Disable legacy broad Node allow rules" {
  $legacyNames = @("App3000 Inbound", "Node.js JavaScript Runtime")
  foreach ($name in $legacyNames) {
    $rules = @(Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue)
    foreach ($rule in $rules) {
      Disable-NetFirewallRule -Name $rule.Name
      Write-Host "  Disabled: $name"
    }
  }
}

# Note: Do not add Block+Allow pairs on the same Node ports  - Windows Block wins over Allow
# and would break IIS -> 127.0.0.1:3000. Rely on loopback Allow + Public default deny,
# and ensure Node binds 127.0.0.1 only (start-littlecode.ps1).

# 5. Optional RDP block on Public only
if ($BlockRdpFromPublic) {
  Invoke-HardenStep "Block RDP (3389) on Public profile" {
    netsh advfirewall firewall delete rule name="$BlockRdpPublicRuleName" 2>$null | Out-Null

    $output = netsh advfirewall firewall add rule `
      name="$BlockRdpPublicRuleName" `
      dir=in `
      action=block `
      protocol=TCP `
      localport=3389 `
      remoteip=any `
      profile=public `
      enable=yes 2>&1

    if ($LASTEXITCODE -ne 0) {
      throw "Failed to add RDP block rule: $output"
    }
  }
} else {
  Write-Host "Skipped: RDP Public block (pass -BlockRdpFromPublic to enable)."
  Write-Host "         RDP is still allowed by default rules on Private/Public  - review manually."
}

Write-Host ""
if (-not $SkipCloudflareReminder) {
  Write-Host "Reminder: For 80/443 Cloudflare-only access, also run:"
  Write-Host "  .\scripts\windows\lockdown-origin-cloudflare.ps1"
  Write-Host ""
}

Write-Host "Hardening complete. Re-run scripts\audit-host-security.ps1 to verify."
Write-Host "Docs: docs\HOST-SECURITY.md"
