
$ErrorActionPreference='Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open((Join-Path $env:USERPROFILE 'Downloads\offer letter format.doc'), $false, $true)
  if (Test-Path 'tmp-letter-compare\\offer-letter-format.docx') { Remove-Item 'tmp-letter-compare\\offer-letter-format.docx' -Force }
  $null = $doc.SaveAs([string](Resolve-Path .\tmp-letter-compare).Path + '\offer-letter-format.docx', 16)
  $doc.Close($false)
} finally { $word.Quit() | Out-Null }
