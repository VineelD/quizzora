# Remove phantom NVIDIA GeForce RTX 5060 Ti PnP device (NOT the GTX 1050 Ti display GPU).
# NOTE: Physical RTX 2060 is DEV_1E89 (SUBSYS_134D10DE). Do NOT remove it.
# Only DEV_2D04 / name ""5060"" is the phantom adapter this script targets.

# Run elevated:
#   powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\remove-phantom-5060.ps1

$ErrorActionPreference = "Stop"

function Test-IsAdmin {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$keepPattern = "DEV_1C82"   # GTX 1050 Ti
$removePattern = "DEV_2D04" # RTX 5060 Ti phantom

$displayDevices = @(Get-PnpDevice -Class Display -ErrorAction SilentlyContinue)
Write-Host "Display adapters before:"
$displayDevices | Format-Table Status, FriendlyName, InstanceId -AutoSize

$phantoms = @($displayDevices | Where-Object {
  $_.InstanceId -match $removePattern -or
  ($_.FriendlyName -match "5060" -and $_.InstanceId -notmatch $keepPattern)
})

if ($phantoms.Count -eq 0) {
  Write-Host "No phantom RTX 5060 Ti device found."
  exit 0
}

foreach ($device in $phantoms) {
  if ($device.InstanceId -match $keepPattern) {
    Write-Warning "Skipping 1050 Ti device: $($device.InstanceId)"
    continue
  }
  Write-Host "Removing phantom device: $($device.FriendlyName) [$($device.InstanceId)]"
  if (-not (Test-IsAdmin)) {
    Write-Warning "Administrator required for pnputil /remove-device. Re-run elevated."
    exit 2
  }
  & pnputil /remove-device $device.InstanceId
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "pnputil exit code $LASTEXITCODE - trying Disable-PnpDevice"
    Disable-PnpDevice -InstanceId $device.InstanceId -Confirm:$false -ErrorAction SilentlyContinue
  }
}

Write-Host "`nDisplay adapters after:"
Get-PnpDevice -Class Display -ErrorAction SilentlyContinue | Format-Table Status, FriendlyName, InstanceId -AutoSize
