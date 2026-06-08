# Direct PC-to-printer Ethernet (no router)
# PC: 192.168.0.100  |  Printer: 192.168.0.173  |  Subnet: 255.255.255.0

$ErrorActionPreference = "Stop"
$adapterName = "Ethernet"
$pcIp = "192.168.0.100"
$printerIp = "192.168.0.173"
$printerName = "Brother HL-L2375DW (Ethernet)"
$portName = "IP_$printerIp"

$adapter = Get-NetAdapter -Name $adapterName -ErrorAction Stop
if ($adapter.Status -ne "Up") {
  Write-Host "Ethernet is not connected. Plug the cable into the PC's Ethernet port and the printer's LAN port, then run this script again."
  exit 1
}

Get-NetIPAddress -InterfaceAlias $adapterName -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Remove-NetIPAddress -Confirm:$false -ErrorAction SilentlyContinue
New-NetIPAddress -InterfaceAlias $adapterName -IPAddress $pcIp -PrefixLength 24 | Out-Null

Get-NetRoute -DestinationPrefix "$printerIp/32" -ErrorAction SilentlyContinue |
  Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue
New-NetRoute -DestinationPrefix "$printerIp/32" -InterfaceIndex $adapter.ifIndex -NextHop "0.0.0.0" -RouteMetric 1 -PolicyStore PersistentStore | Out-Null

if (-not (Get-PrinterPort -Name $portName -ErrorAction SilentlyContinue)) {
  Add-PrinterPort -Name $portName -PrinterHostAddress $printerIp -PortNumber 9100
}
if (-not (Get-Printer -Name $printerName -ErrorAction SilentlyContinue)) {
  Add-Printer -DriverName "Brother HL-L2375DW series" -Name $printerName -PortName $portName
}

if (-not (Test-Connection -ComputerName $printerIp -Count 1 -Quiet)) {
  Write-Host "Cannot reach $printerIp. On the printer, set a static IP: $printerIp, subnet 255.255.255.0, no gateway."
  exit 1
}

$printer = Get-CimInstance Win32_Printer -Filter "Name='$printerName'"
Invoke-CimMethod -InputObject $printer -MethodName PrintTestPage | Out-Null
Write-Host "Test page sent to $printerName at $printerIp."
