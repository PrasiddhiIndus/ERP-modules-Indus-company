
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open('c:/Users/P1/Downloads/offer letter format.doc', $false, $true)
  if (Test-Path 'd:/ERP-modules-Indus-company/tmp-letter-compare/offer-letter-format.docx') { Remove-Item 'd:/ERP-modules-Indus-company/tmp-letter-compare/offer-letter-format.docx' -Force }
  $null = $doc.SaveAs([string]'d:/ERP-modules-Indus-company/tmp-letter-compare/offer-letter-format.docx', 16)
  Write-Output ("pages=" + $doc.ComputeStatistics(2) + " paras=" + $doc.Paragraphs.Count)
  $doc.Close($false)
} finally { $word.Quit() | Out-Null }
