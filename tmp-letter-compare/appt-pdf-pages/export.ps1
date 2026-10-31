$ErrorActionPreference='Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open('C:\\Users\\P1\\Downloads\\Appointment-IFSPL-APT-2026-00005.pdf', $false, $true)
  if (Test-Path 'd:\\ERP-modules-Indus-company\\tmp-letter-compare\\appt-pdf-pages\\from-email.docx') { Remove-Item 'd:\\ERP-modules-Indus-company\\tmp-letter-compare\\appt-pdf-pages\\from-email.docx' -Force }
  $doc.SaveAs2([string]'d:\\ERP-modules-Indus-company\\tmp-letter-compare\\appt-pdf-pages\\from-email.docx', 16)
  $pages = $doc.ComputeStatistics(2)
  Write-Output ("PAGES=" + $pages)
  # Export each page as PNG via Print - use FixedFormat if available
  for ($i=1; $i -le [Math]::Min($pages,8); $i++) {
    $doc.ActiveWindow.Selection.GoTo(1,1,$i) | Out-Null # wdGoToPage=1
  }
  $doc.Close($false)
} finally { $word.Quit() }
