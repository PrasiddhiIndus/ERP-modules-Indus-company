param(
  [string]$Pin = ''
)

$ErrorActionPreference = 'SilentlyContinue'
if (-not $Pin) { $Pin = [string]$env:INDUS_DSC_PIN }

function Get-CommonName([string]$dn) {
  if ([string]::IsNullOrWhiteSpace($dn)) { return '' }
  if ($dn -match 'CN\s*=\s*([^,]+)') { return $Matches[1].Trim() }
  return $dn.Trim()
}

function ConvertTo-JsonForceArray($arr) {
  $list = @($arr)
  if ($list.Count -eq 0) { return '[]' }
  $json = ConvertTo-Json -InputObject $list -Compress -Depth 8
  $trim = $json.Trim()
  if ($trim.StartsWith('[')) { return $trim }
  return ('[' + $trim + ']')
}

$items = New-Object System.Collections.Generic.List[object]
$readers = New-Object System.Collections.Generic.List[object]
$usbIssues = New-Object System.Collections.Generic.List[object]
$seen = @{}
$pcscStatus = ''

try {
  $scard = Get-Service -Name 'SCardSvr' -ErrorAction SilentlyContinue
  if ($null -ne $scard -and $scard.Status -ne 'Running') {
    try { Start-Service -Name 'SCardSvr' -ErrorAction Stop } catch {}
    Start-Sleep -Milliseconds 400
    $scard.Refresh()
    if ($scard.Status -ne 'Running') {
      [void]$usbIssues.Add([pscustomobject]@{
        name = 'Windows Smart Card service'
        status = 'Stopped'
        instanceId = 'SCardSvr'
        hint = 'The USB token cannot be used until Windows Smart Card is running. Open Command Prompt as Administrator and run: sc start SCardSvr'
      })
    }
  }
} catch {}

# Live USB / reader problems (not stale disconnected devices).
try {
  Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | ForEach-Object {
    $name = [string]$_.FriendlyName
    $status = [string]$_.Status
    $id = [string]$_.InstanceId
    if ($status -eq 'Error' -and ($_.Class -eq 'USB' -or $name -match 'USB Device|USB TOKEN|descriptor')) {
      $hint = 'Windows could not start the USB token. Unplug it, wait a few seconds, plug into a USB 2.0 port on the PC (not a hub), then Refresh.'
      if ($name -match 'Descriptor Request Failed') {
        $hint = 'The USB DSC is plugged in but Windows cannot read it (device descriptor failed). Unplug, try another port, install the token manufacturer software, then Refresh.'
      }
      [void]$usbIssues.Add([pscustomobject]@{
        name = $name
        status = $status
        instanceId = $id
        hint = $hint
      })
    }
  }
} catch {}

# Only currently present smart-card readers (ignore leftover/disconnected entries).
try {
  Get-PnpDevice -PresentOnly -Class SmartCardReader -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Status -ne 'OK') { return }
    [void]$readers.Add([pscustomobject]@{
      name = [string]$_.FriendlyName
      status = [string]$_.Status
      atr = ''
    })
  }
} catch {}

# Certificates already registered in this Windows session.
function Add-StoreCert($cert, $storePath) {
  if (-not $cert.HasPrivateKey) { return }
  $thumb = [string]$cert.Thumbprint
  if ([string]::IsNullOrWhiteSpace($thumb) -or $seen.ContainsKey($thumb)) { return }
  $seen[$thumb] = $true
  $eku = @()
  try { $eku = @($cert.EnhancedKeyUsageList | ForEach-Object { $_.FriendlyName } | Where-Object { $_ }) } catch {}
  [void]$items.Add([pscustomobject]@{
    commonName       = Get-CommonName $cert.Subject
    subject          = [string]$cert.Subject
    issuer           = [string]$cert.Issuer
    issuerCn         = Get-CommonName $cert.Issuer
    serialNumber     = [string]$cert.SerialNumber
    thumbprint       = $thumb
    notBefore        = $cert.NotBefore.ToUniversalTime().ToString('o')
    notAfter         = $cert.NotAfter.ToUniversalTime().ToString('o')
    friendlyName     = [string]$cert.FriendlyName
    store            = $storePath
    provider         = ''
    hasPrivateKey    = [bool]$cert.HasPrivateKey
    onHardwareToken  = $false
    enhancedKeyUsage = $eku
  })
}

foreach ($storePath in @('Cert:\CurrentUser\My', 'Cert:\LocalMachine\My')) {
  Get-ChildItem -Path $storePath -ErrorAction SilentlyContinue | ForEach-Object { Add-StoreCert $_ $storePath }
}

# PC/SC readers + certificates stored on the token (not only the Windows store).
try {
  $csPath = Join-Path $PSScriptRoot 'SmartCardList.cs'
  Add-Type -Path $csPath -ErrorAction Stop
  $native = [IndusDsc.SmartCardList]::Query($Pin)
  $pcscStatus = [string]$native.pcscStatus
  foreach ($r in @($native.readers)) {
    $n = [string]$r.name
    if ([string]::IsNullOrWhiteSpace($n)) { continue }
    $exists = $false
    foreach ($existing in $readers) {
      if ([string]$existing.name -eq $n) { $exists = $true; break }
    }
    if (-not $exists) {
      [void]$readers.Add([pscustomobject]@{
        name = $n
        status = [string]$r.status
        atr = [string]$r.atr
      })
    }
  }
  foreach ($c in @($native.certificates)) {
    $thumb = [string]$c.thumbprint
    if ([string]::IsNullOrWhiteSpace($thumb) -or $seen.ContainsKey($thumb)) { continue }
    $seen[$thumb] = $true
    [void]$items.Add([pscustomobject]@{
      commonName       = [string]$c.commonName
      subject          = [string]$c.subject
      issuer           = [string]$c.issuer
      issuerCn         = [string]$c.issuerCn
      serialNumber     = [string]$c.serialNumber
      thumbprint       = $thumb
      notBefore        = [string]$c.notBefore
      notAfter         = [string]$c.notAfter
      friendlyName     = [string]$c.friendlyName
      store            = [string]$c.store
      provider         = [string]$c.provider
      hasPrivateKey    = [bool]$c.hasPrivateKey
      onHardwareToken  = $true
      enhancedKeyUsage = @($c.enhancedKeyUsage)
    })
  }
} catch {
  if (-not $pcscStatus) { $pcscStatus = [string]$_.Exception.Message }
}

if ($items.Count -eq 0) { $certArr = @() }
else { $certArr = @($items | Sort-Object -Property commonName) }

$readerOut = New-Object object[] $readers.Count
for ($i = 0; $i -lt $readers.Count; $i++) { $readerOut[$i] = $readers[$i] }
$issueOut = New-Object object[] $usbIssues.Count
for ($i = 0; $i -lt $usbIssues.Count; $i++) { $issueOut[$i] = $usbIssues[$i] }

$ErrorActionPreference = 'Continue'
if ([string]::IsNullOrWhiteSpace($pcscStatus)) { $pcscStatus = 'unknown' }
$pcscEsc = $pcscStatus.Replace('\','\\').Replace('"','\"')
Write-Output ('{"certificates":' + (ConvertTo-JsonForceArray $certArr) + ',"readers":' + (ConvertTo-JsonForceArray $readerOut) + ',"usbIssues":' + (ConvertTo-JsonForceArray $issueOut) + ',"pcscStatus":"' + $pcscEsc + '"}')
