#Requires -Version 5.1
<#
.SYNOPSIS
  Apply Windows power settings recommended for Quizzora self-hosting on AC power.

.DESCRIPTION
  Configures the active AC power scheme (timeouts, hibernate, PCI/USB/processor/disk),
  disables network adapter power saving on physical Ethernet adapters, and optionally
  disables the staging Next.js scheduled task when not developing.

.PARAMETER StopTestInstance
  If set, stops and disables scheduled task "LittleCode Test Next.js" (staging on port 3001).
  Does not affect production task "LittleCode Next.js". Re-enable via Task Scheduler when needed.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\optimize-hosting-power.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\optimize-hosting-power.ps1 -StopTestInstance
#>
[CmdletBinding()]
param(
    [switch] $StopTestInstance
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$script:Results = [System.Collections.Generic.List[object]]::new()

function Write-Step {
    param([string] $Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Add-Result {
    param(
        [string] $Step,
        [bool]   $Success,
        [string] $Detail
    )
    $status = if ($Success) { 'OK' } else { 'FAIL' }
    $color = if ($Success) { 'Green' } else { 'Red' }
    Write-Host "    [$status] $Detail" -ForegroundColor $color
    $script:Results.Add([pscustomobject]@{ Step = $Step; Success = $Success; Detail = $Detail })
}

function Test-IsAdministrator {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-ActivePowerSchemeGuid {
    $line = (& powercfg.exe /getactivescheme 2>&1 | Out-String).Trim()
    if ($line -match '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})') {
        return $Matches[1]
    }
    throw "Could not parse active power scheme from: $line"
}

function Invoke-PowerCfg {
    param([string[]] $Arguments)
    $output = & powercfg.exe @Arguments 2>&1 | Out-String
    $ok = $LASTEXITCODE -eq 0
    return @{ Ok = $ok; Output = $output.Trim() }
}

function Set-AcSchemeValue {
    param(
        [string] $SchemeGuid,
        [string] $SubGroup,
        [string] $Setting,
        [int]    $Value,
        [string] $Label
    )
    $r = Invoke-PowerCfg @('/setacvalueindex', $SchemeGuid, $SubGroup, $Setting, "$Value")
    Add-Result -Step $Label -Success $r.Ok -Detail $(if ($r.Ok) { "Set AC $SubGroup\$Setting = $Value" } else { $r.Output })
}

function Set-RegistryAdapterPnPCapabilities {
    param(
        [guid]   $InterfaceGuid,
        [string] $AdapterName
    )
    $netClass = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e972-e325-11ce-bfc1-08002be10318}'
    if (-not (Test-Path $netClass)) {
        Add-Result -Step 'Net PnP registry' -Success $false -Detail "Network class registry path missing for $AdapterName"
        return
    }
    $matched = $false
    foreach ($key in Get-ChildItem -Path $netClass -ErrorAction SilentlyContinue) {
        try {
            $props = Get-ItemProperty -LiteralPath $key.PSPath -ErrorAction Stop
        } catch {
            continue
        }
        if ($props.NetCfgInstanceId -and [guid]$props.NetCfgInstanceId -eq $InterfaceGuid) {
            $matched = $true
            $desired = 24  # disable idle power-down (Allow computer to turn off this device)
            $current = $props.PnPCapabilities
            if ($null -ne $current -and [int]$current -eq $desired) {
                Add-Result -Step 'Net PnP registry' -Success $true -Detail "$AdapterName PnPCapabilities already $desired"
            } else {
                try {
                    Set-ItemProperty -LiteralPath $key.PSPath -Name PnPCapabilities -Value $desired -Type DWord -Force
                    Add-Result -Step 'Net PnP registry' -Success $true -Detail "$AdapterName PnPCapabilities set to $desired (was $current)"
                } catch {
                    Add-Result -Step 'Net PnP registry' -Success $false -Detail "$AdapterName registry update failed: $($_.Exception.Message)"
                }
            }
            break
        }
    }
    if (-not $matched) {
        Add-Result -Step 'Net PnP registry' -Success $false -Detail "No registry key for $AdapterName ($InterfaceGuid)"
    }
}

Write-Host 'Quizzora hosting power optimization' -ForegroundColor Yellow
Write-Host "Script: $PSCommandPath"

if (-not (Test-IsAdministrator)) {
    Write-Host ''
    Write-Host 'ERROR: This script must be run as Administrator.' -ForegroundColor Red
    Write-Host 'Right-click PowerShell -> Run as administrator, then run:' -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -ForegroundColor White
    if ($StopTestInstance) {
        Write-Host '  (add -StopTestInstance if you want to disable the staging scheduled task)' -ForegroundColor DarkGray
    }
    exit 1
}

Add-Result -Step 'Administrator' -Success $true -Detail 'Running with elevated privileges'

# --- Active power scheme ---
Write-Step 'Resolve active AC power scheme'
try {
    $schemeGuid = Get-ActivePowerSchemeGuid
    Add-Result -Step 'Active scheme' -Success $true -Detail "GUID $schemeGuid"
} catch {
    Add-Result -Step 'Active scheme' -Success $false -Detail $_.Exception.Message
    exit 1
}

# --- Simple timeouts (minutes for monitor; 0 = never where supported) ---
Write-Step 'Basic AC timeouts (powercfg /change)'
$basicChanges = @(
    @{ Args = @('/change', 'monitor-timeout-ac', '10'); Label = 'Monitor timeout AC 10 min' },
    @{ Args = @('/change', 'disk-timeout-ac', '0'); Label = 'Disk timeout AC never' },
    @{ Args = @('/change', 'standby-timeout-ac', '0'); Label = 'Standby/sleep timeout AC never' },
    @{ Args = @('/change', 'hibernate-timeout-ac', '0'); Label = 'Hibernate timeout AC never' }
)
foreach ($c in $basicChanges) {
    $r = Invoke-PowerCfg -Arguments $c.Args
    Add-Result -Step $c.Label -Success $r.Ok -Detail $(if ($r.Ok) { 'Applied' } else { $r.Output })
}

Write-Step 'Disable hibernation'
$r = Invoke-PowerCfg -Arguments @('/hibernate', 'off')
Add-Result -Step 'Hibernate off' -Success $r.Ok -Detail $(if ($r.Ok) { 'hiberfil.sys disabled' } else { $r.Output })

# --- Advanced scheme settings (aliases work on Win10/11) ---
Write-Step 'Advanced AC power settings'
Set-AcSchemeValue -SchemeGuid $schemeGuid -SubGroup 'SUB_PCIEXPRESS' -Setting 'ASPM' -Value 0 -Label 'PCI Express ASPM Off'
Set-AcSchemeValue -SchemeGuid $schemeGuid -SubGroup '2a737441-1930-4402-8d77-b2bebba308a3' -Setting '48e6b7a6-50f5-4782-a5d4-53bb8f07e226' -Value 0 -Label 'USB selective suspend Disabled'
Set-AcSchemeValue -SchemeGuid $schemeGuid -SubGroup 'SUB_PROCESSOR' -Setting 'PROCTHROTTLEMIN' -Value 5 -Label 'Minimum processor state AC 5%'
Set-AcSchemeValue -SchemeGuid $schemeGuid -SubGroup 'SUB_PROCESSOR' -Setting 'PROCTHROTTLEMAX' -Value 100 -Label 'Maximum processor state AC 100%'
Set-AcSchemeValue -SchemeGuid $schemeGuid -SubGroup 'SUB_DISK' -Setting 'DISKIDLE' -Value 0 -Label 'Hard disk turn off AC never'
Set-AcSchemeValue -SchemeGuid $schemeGuid -SubGroup 'SUB_VIDEO' -Setting 'VIDEOIDLE' -Value 600 -Label 'Display turn off AC 10 min (600s)'

$r = Invoke-PowerCfg -Arguments @('/setactive', $schemeGuid)
Add-Result -Step 'Activate scheme' -Success $r.Ok -Detail $(if ($r.Ok) { "Re-applied scheme $schemeGuid" } else { $r.Output })

# --- Network adapters ---
Write-Step 'Physical Ethernet adapter power management'
$adapters = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
    -not $_.Virtual -and ($_.MediaType -eq '802.3' -or $_.PhysicalMediaType -match '802.3|Native 802.3')
})
if ($adapters.Count -eq 0) {
    $adapters = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { -not $_.Virtual -and $_.Status -eq 'Up' })
}
if ($adapters.Count -eq 0) {
    Add-Result -Step 'Net adapters' -Success $false -Detail 'No physical Ethernet adapters found'
} else {
    foreach ($adapter in $adapters) {
        $name = $adapter.Name
        if (Get-Command -Name 'Disable-NetAdapterPowerManagement' -ErrorAction SilentlyContinue) {
            try {
                Disable-NetAdapterPowerManagement -Name $name -ErrorAction Stop
                Add-Result -Step 'Disable-NetAdapterPowerManagement' -Success $true -Detail "$name - adapter power management features disabled"
            } catch {
                Add-Result -Step 'Disable-NetAdapterPowerManagement' -Success $false -Detail "$name - $($_.Exception.Message)"
            }
        } else {
            Add-Result -Step 'Disable-NetAdapterPowerManagement' -Success $false -Detail "$name - cmdlet not available on this OS"
        }
        Set-RegistryAdapterPnPCapabilities -InterfaceGuid $adapter.InterfaceGuid -AdapterName $name
    }
}

# --- Optional staging task ---
Write-Step 'Quizzora scheduled tasks (optional)'
$prodTask = 'LittleCode Next.js'
$testTask = 'LittleCode Test Next.js'
$backupTask = 'LittleCode Prod DB Backup'
Write-Host "    Production (unchanged): $prodTask - quizzora.org :3000" -ForegroundColor DarkGray
Write-Host "    Staging (optional -StopTestInstance): $testTask - test.quizzora.org :3001" -ForegroundColor DarkGray
Write-Host "    Backup (unchanged): $backupTask" -ForegroundColor DarkGray

if ($StopTestInstance) {
    $taskPath = "\$testTask"
    & schtasks.exe /End /TN $taskPath 2>&1 | Out-Null
    $endNote = if ($LASTEXITCODE -eq 0) { 'End requested' } else { 'End skipped (may not be running)' }
    & schtasks.exe /Change /TN $taskPath /DISABLE 2>&1 | Out-String | Out-Null
    $disOk = $LASTEXITCODE -eq 0
    Add-Result -Step 'StopTestInstance' -Success $disOk -Detail $(if ($disOk) { "$endNote; disabled $testTask" } else { "Failed to disable $testTask" })
    Write-Host '    Re-enable staging: schtasks /Change /TN "\LittleCode Test Next.js" /ENABLE' -ForegroundColor Yellow
} else {
    Add-Result -Step 'StopTestInstance' -Success $true -Detail 'Skipped (pass -StopTestInstance to disable staging task when not developing)'
}

# --- Summary ---
Write-Step 'Summary'
$okCount = @($script:Results | Where-Object Success).Count
$failCount = @($script:Results | Where-Object { -not $_.Success }).Count
Write-Host "Completed: $okCount succeeded, $failCount failed (of $($script:Results.Count) steps)." -ForegroundColor $(if ($failCount -eq 0) { 'Green' } else { 'Yellow' })
if ($failCount -gt 0) {
    $script:Results | Where-Object { -not $_.Success } | ForEach-Object {
        Write-Host "  - $($_.Step): $($_.Detail)" -ForegroundColor Red
    }
}

exit $(if ($failCount -gt 0) { 2 } else { 0 })
