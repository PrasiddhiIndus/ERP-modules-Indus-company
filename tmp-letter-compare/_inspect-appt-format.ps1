$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $src = Join-Path $env:USERPROFILE 'Downloads\apppointment letter format.doc'
  $dst = Join-Path (Resolve-Path '.\tmp-letter-compare').Path 'appt-format.docx'
  if (Test-Path $dst) { Remove-Item $dst -Force }
  $doc = $word.Documents.Open($src, $false, $true)
  $null = $doc.SaveAs([string]$dst, 16)

  Write-Output ("pages=" + $doc.ComputeStatistics(2))
  Write-Output ("paras=" + $doc.Paragraphs.Count)

  # Find candidate name near acknowledgement / before Annexure
  $found = @()
  for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
    $p = $doc.Paragraphs.Item($i)
    $t = ($p.Range.Text -replace '[\r\n\x07]', '').Trim()
    if ($t -match 'Annexure|acknowledge|CEO|{{CANDIDATE_NAME}}|Mr\.|Ms\.' -or ($t.Length -gt 2 -and $t.Length -lt 60 -and $t -notmatch '^[A-Z\s\-]{8,}$' -and $i -gt 20)) {
      $align = $p.Format.Alignment # 0 left, 1 center, 2 right, 3 justify
      $indent = $p.Format.LeftIndent
      $first = $p.Format.FirstLineIndent
      $spaceBefore = $p.Format.SpaceBefore
      $spaceAfter = $p.Format.SpaceAfter
      $pbb = $p.Format.PageBreakBefore
      $found += [pscustomobject]@{ i=$i; text=$t.Substring(0, [Math]::Min(80,$t.Length)); align=$align; left=$indent; first=$first; pbb=$pbb }
    }
  }
  $found | Select-Object -First 40 | Format-Table -AutoSize | Out-String | Write-Output

  # Dump paragraphs around CEO / name / Annexure
  Write-Output '--- around name/CEO/annex ---'
  for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
    $t = ($doc.Paragraphs.Item($i).Range.Text -replace '[\r\n\x07]', '').Trim()
    if ($t -match 'CEO|Annexure|I hereby|acknowledge' -or ($t -match '^[A-Z][a-z]+ [A-Z]' -and $t.Length -lt 40)) {
      $p = $doc.Paragraphs.Item($i)
      Write-Output ("P$i align=$($p.Format.Alignment) left=$([math]::Round($p.Format.LeftIndent,1)) first=$([math]::Round($p.Format.FirstLineIndent,1)) tabs=$($p.Range.ParagraphFormat.TabStops.Count) text=[$t]")
    }
  }

  $text = $doc.Content.Text
  $doc.Close($false)
  Set-Content -Path 'tmp-letter-compare\_appt-format-text.txt' -Value $text -Encoding UTF8
} finally {
  $word.Quit() | Out-Null
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
