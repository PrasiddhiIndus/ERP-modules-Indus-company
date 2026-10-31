$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $src = Join-Path $env:USERPROFILE 'Downloads\offer letter format.doc'
  $dst = Join-Path (Resolve-Path '.\tmp-letter-compare').Path 'offer-letter-format.docx'
  if (Test-Path $dst) { Remove-Item $dst -Force }
  $doc = $word.Documents.Open($src, $false, $true)
  $null = $doc.SaveAs([string]$dst, 16)
  Write-Output ("InlineShapes: " + $doc.InlineShapes.Count)
  for ($i = 1; $i -le $doc.InlineShapes.Count; $i++) {
    $s = $doc.InlineShapes.Item($i)
    Write-Output ("  shape $i type=$($s.Type) w=$([math]::Round($s.Width,1)) h=$([math]::Round($s.Height,1))")
  }
  Write-Output ("Shapes: " + $doc.Shapes.Count)
  $text = $doc.Content.Text -replace "`r", "`n"
  $doc.Close($false)
  Set-Content -Path 'tmp-letter-compare\_fresh-user-text.txt' -Value $text -Encoding UTF8
  Write-Output '--- first 2200 chars ---'
  if ($text.Length -gt 2200) { $text.Substring(0, 2200) } else { $text }
} finally {
  $word.Quit() | Out-Null
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
