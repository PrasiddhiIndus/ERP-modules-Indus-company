param(
  [Parameter(Mandatory = $true)][string]$Thumbprint,
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'

$svc = Get-Service -Name 'SCardSvr' -ErrorAction SilentlyContinue
if ($null -ne $svc -and $svc.Status -ne 'Running') {
  try {
    Start-Service -Name 'SCardSvr' -ErrorAction Stop
    Start-Sleep -Seconds 2
    $svc.Refresh()
  } catch {}
  if ($svc.Status -ne 'Running') {
    throw 'Windows Smart Card service is stopped, so the USB DSC private key cannot be opened (the token can be plugged in and this still fails). Open Command Prompt as Administrator and run: sc start SCardSvr   Then set it to start automatically: sc config SCardSvr start= demand   Plug the token in, start Hypersecu, enter the PIN, and download again.'
  }
}

$pin = [string]$env:INDUS_DSC_PIN
$pinFile = Join-Path (Split-Path -Parent $InputPath) 'pin.txt'
if ((-not $pin) -and (Test-Path $pinFile)) {
  $pin = [string](Get-Content -LiteralPath $pinFile -Raw)
}
$csPath = Join-Path $PSScriptRoot 'SignPdfCms.cs'
Add-Type -Path $csPath -ReferencedAssemblies System.Security, System.Core
[IndusDsc.SignPdfCms]::SignDetached($Thumbprint, $InputPath, $OutputPath, $pin)
