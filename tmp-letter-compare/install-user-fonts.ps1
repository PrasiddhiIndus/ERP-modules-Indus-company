$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
# tmp-letter-compare -> repo root is one level up
$root = Split-Path $PSScriptRoot -Parent
$src = Join-Path $root 'server\assets\letter-fonts'
$dest = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$reg = 'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
if (-not (Test-Path $reg)) { New-Item -Path $reg -Force | Out-Null }

Write-Output "fonts from $src"
Get-ChildItem $src -Filter *.ttf | ForEach-Object {
  $target = Join-Path $dest $_.Name
  Copy-Item $_.FullName $target -Force
  $valueName = "$($_.BaseName) (TrueType)"
  New-ItemProperty -Path $reg -Name $valueName -Value $target -PropertyType String -Force | Out-Null
  Write-Output "installed $($_.Name)"
}
