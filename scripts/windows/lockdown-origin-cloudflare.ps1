<#
.SYNOPSIS
  Restrict origin web ports so only Cloudflare (and local tunnel) can reach the app.

.DESCRIPTION
  For quizzora.org behind Cloudflare:
  - Ports 80 and 443: inbound TCP allow only from Cloudflare published IP ranges.
  - Ports 8080 (IIS) and 3000 (Node): inbound TCP allow only from loopback.
  - Disables overly broad legacy allow rules.

  Windows Firewall gives Block rules precedence over Allow, so this script uses
  explicit Allow rules only; other sources are denied by default inbound policy.

  Run as Administrator. Re-run periodically (Cloudflare IP lists are fetched live).

.EXAMPLE
  Set-ExecutionPolicy -Scope Process Bypass
  .\scripts\windows\lockdown-origin-cloudflare.ps1
#>
param(
  [switch]$WhatIf,
  [switch]$SkipDisableLegacy,
  [switch]$SkipDefaultInboundBlock
)

$ErrorActionPreference = "Stop"

$RuleGroup = "LittleCode Origin Lockdown"
$CfV4Url = "https://www.cloudflare.com/ips-v4"
$CfV6Url = "https://www.cloudflare.com/ips-v6"

function Assert-Administrator {
  $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script in an elevated PowerShell (Run as Administrator)."
  }
}

function Get-CloudflareCidrs {
  param([string]$Url)

  $text = (Invoke-WebRequest -Uri $Url -UseBasicParsing).Content
  return @(
    $text -split "`r?`n" |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_ -and $_ -notmatch "^\s*#" }
  )
}

function Remove-LittleCodeOriginRules {
  $names = @(
    "LittleCode - Loopback 3000,8080",
    "LittleCode - Loopback 3000,3001,8080",
    "LittleCode - Cloudflare IPv4 80,443",
    "LittleCode - Cloudflare IPv6 80,443",
    "LittleCode - Allow loopback 3000,8080",
    "LittleCode - Allow Cloudflare IPv4 on 80,443",
    "LittleCode - Allow Cloudflare IPv6 on 80,443",
    "LittleCode - Block non-Cloudflare 80,443",
    "LittleCode - Block remote 8080,3000"
  )

  foreach ($name in $names) {
    if ($WhatIf) {
      Write-Host "[WhatIf] Delete rule if present: $name"
      continue
    }
    netsh advfirewall firewall delete rule name="$name" 2>$null | Out-Null
  }
}

function Add-AllowRuleNetsh {
  param(
    [string]$Name,
    [string]$RemoteIpList,
    [string]$LocalPorts
  )

  if ($WhatIf) {
    Write-Host "[WhatIf] netsh allow TCP $LocalPorts remoteip=$RemoteIpList - $Name"
    return
  }

  $output = netsh advfirewall firewall add rule `
    name="$Name" `
    dir=in `
    action=allow `
    protocol=TCP `
    localport=$LocalPorts `
    remoteip=$RemoteIpList `
    profile=any `
    enable=yes 2>&1

  if ($LASTEXITCODE -ne 0) {
    throw "netsh failed for '$Name': $output"
  }

  Write-Host "Added allow rule: $Name"
}

function Disable-LegacyRule {
  param([string]$DisplayName)

  $rules = @(Get-NetFirewallRule -DisplayName $DisplayName -ErrorAction SilentlyContinue)
  foreach ($rule in $rules) {
    if ($WhatIf) {
      Write-Host "[WhatIf] Disable legacy rule: $DisplayName"
      continue
    }
    Disable-NetFirewallRule -Name $rule.Name
    Write-Host "Disabled legacy rule: $DisplayName"
  }
}

function Assert-RuleIsAllow {
  param([string]$Name)

  $show = (netsh advfirewall firewall show rule name="$Name" 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) {
    throw "Firewall rule '$Name' was not found after creation."
  }
  if ($show -notmatch "Action:\s+Allow") {
    throw "Firewall rule '$Name' was not created as Allow."
  }
}

Assert-Administrator

Write-Host "Fetching Cloudflare IP ranges..."
$cfV4 = Get-CloudflareCidrs -Url $CfV4Url
$cfV6 = Get-CloudflareCidrs -Url $CfV6Url

if (-not $cfV4.Count -or -not $cfV6.Count) {
  throw "Could not load Cloudflare IP lists."
}

Write-Host "Cloudflare IPv4 ranges: $($cfV4.Count)"
Write-Host "Cloudflare IPv6 ranges: $($cfV6.Count)"

Write-Host ""
Write-Host "Replacing LittleCode origin rules..."
Remove-LittleCodeOriginRules

# Internal proxy chain: cloudflared -> IIS:8080 -> Node:3000
Add-AllowRuleNetsh -Name "LittleCode - Loopback 3000,3001,8080" `
  -RemoteIpList "127.0.0.1" `
  -LocalPorts "3000,3001,8080"

# Public HTTP(S) only from Cloudflare (no catch-all Block rule; Block wins over Allow on Windows)
Add-AllowRuleNetsh -Name "LittleCode - Cloudflare IPv4 80,443" `
  -RemoteIpList ($cfV4 -join ",") `
  -LocalPorts "80,443"

Add-AllowRuleNetsh -Name "LittleCode - Cloudflare IPv6 80,443" `
  -RemoteIpList ($cfV6 -join ",") `
  -LocalPorts "80,443"

if (-not $WhatIf) {
  Assert-RuleIsAllow -Name "LittleCode - Loopback 3000,3001,8080"
  Assert-RuleIsAllow -Name "LittleCode - Cloudflare IPv4 80,443"
  Assert-RuleIsAllow -Name "LittleCode - Cloudflare IPv6 80,443"
}

if (-not $SkipDefaultInboundBlock) {
  if ($WhatIf) {
    Write-Host "[WhatIf] Set Public profile default inbound action to Block"
  } else {
    Set-NetFirewallProfile -Profile Public -DefaultInboundAction Block
    Write-Host "Set Public profile default inbound action: Block"
  }
}

if (-not $SkipDisableLegacy) {
  Write-Host ""
  Write-Host "Disabling broad legacy allow rules (if present)..."
  Disable-LegacyRule -DisplayName "Allow TCP 8080-8090,9000-9010"
  Disable-LegacyRule -DisplayName "App3000 Inbound"
  Disable-LegacyRule -DisplayName "cloudflared"
}

Write-Host ""
Write-Host "Origin lockdown applied."
Write-Host "  80/443    - allow Cloudflare IPs only (+ default deny)"
Write-Host "  8080/3000/3001 - allow localhost only"
Write-Host ""
Write-Host "Re-run this script when Cloudflare updates IP ranges."
Write-Host "Docs: docs/DNS-QUIZZORA.md"
