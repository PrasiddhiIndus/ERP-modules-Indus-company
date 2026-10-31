# Build appointment-letter.docx from the sample appointment-with-letterhead Word file.
# Default source: Downloads\apppointment letter format.doc
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$dst = Join-Path $root "public\templates\admin-recruitment\appointment-letter.docx"
$src = if ($args[0]) { $args[0] } else { Join-Path $env:USERPROFILE "Downloads\apppointment letter format.doc" }
if (-not (Test-Path $src)) { throw "Missing sample appointment letter: $src" }

$tmp = Join-Path $env:TEMP "ifspl-appt-prepare"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$srcDocx = Join-Path $tmp "sample-appointment.docx"

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  if (Test-Path $srcDocx) { Remove-Item $srcDocx -Force }
  $d = $word.Documents.Open($src, $false, $true)
  $d.SaveAs([string]$srcDocx, 16)
  $d.Close($false)

  Copy-Item $srcDocx $dst -Force
  $doc = $word.Documents.Open($dst)

  function Replace-All([string]$find, [string]$replace) {
    $f = $doc.Content.Find
    $f.ClearFormatting() | Out-Null
    $f.Replacement.ClearFormatting() | Out-Null
    $null = $f.Execute($find, $true, $false, $false, $false, $false, $true, 1, $false, $replace, 2)
  }
  function Replace-Once([string]$find, [string]$replace) {
    $f = $doc.Content.Find
    $f.ClearFormatting() | Out-Null
    $f.Replacement.ClearFormatting() | Out-Null
    $null = $f.Execute($find, $true, $false, $false, $false, $false, $true, 1, $false, $replace, 1)
  }

  Replace-All "IFSPL/HR/AL-2026-27/003" "{{APPOINTMENT_REF}}"
  Replace-All "05.10.2026" "{{LETTER_DATE}}"
  Replace-All "Mr. Dhobi Jayraj Vipulbhai" "{{CANDIDATE_FULL}}"
  Replace-All "C-15 Devkutir Society Near" "{{ADDRESS_LINE1}}"
  Replace-All "Prathana complex TP-13 Chhani" "{{ADDRESS_LINE2}}"
  Replace-All "Jakat Naka Vadodara,Gujarat-390002" "{{ADDRESS_LINE3}}"
  Replace-All "Dear Jayraj," "Dear {{FIRST_NAME}},"
  Replace-All "Driver cum Operator" "{{DESIGNATION}}"
  Replace-All "05th October 2026" "{{JOINING_DATE_LONG}}"
  Replace-All "the Head Office, Vadodara" "{{LOCATION}}"
  Replace-All "HR Manager - Operation" "{{REPORTING_TO}}"
  Replace-All "3,11,916" "{{ANNUAL_CTC}}"
  Replace-All "with Indus Fire Safety Pvt Ltd." "with {{COMPANY_NAME}}"
  Replace-All "INDUS FIRE SAFETY PVT LTD." "{{COMPANY_NAME}}"
  Replace-All "Jayraj Dhobi" "{{CANDIDATE_NAME}}"
  Replace-All "Indus Fire Safety Private Limited" "{{COMPANY_NAME_FULL}}"
  Replace-All "Dashrath,Vadodara" "{{AX_LOCATION}}"
  Replace-All "11007" "{{EMPLOYEE_CODE}}"
  Replace-All "IFSPL, HO" "{{SEGMENT}}"
  Replace-All "06-Dec-05" "{{DOB}}"
  Replace-All "05-Oct-26" "{{DOJ_SHORT}}"
  Replace-All "COMPENSATION SCHEME-Year 2026-27" "COMPENSATION SCHEME-Year {{SCHEME_YEAR}}"
  Replace-All "w.e.f. 05.10.26" "w.e.f. {{WEF_SHORT}}"

  @(
    @("263184", "{{GROSS_PA}}"),
    @("239999", "{{TAKE_HOME_PA}}"),
    @("311916", "{{CTC_PA}}"),
    @("163020", "{{BASIC_PA}}"),
    @("21372", "{{MEDICAL_PA}}"),
    @("21193", "{{ER_PF_PA}}"),
    @("19562", "{{EE_PF_PA}}"),
    @("13580", "{{BONUS_PA}}"),
    @("1222.65", "{{EE_ESIC_PA}}"),
    @("65208", "{{HRA_PA}}"),
    @("48732", "{{TOTAL_B_PA}}"),
    @("25993", "{{CTC_M}}"),
    @("21932", "{{GROSS_M}}"),
    @("20000", "{{TAKE_HOME_M}}"),
    @("7841", "{{GRATUITY_PA}}"),
    @("6113", "{{ER_ESIC_PA}}"),
    @("5434", "{{HRA_M}}"),
    @("4061", "{{TOTAL_B_M}}"),
    @("1781", "{{MEDICAL_M}}"),
    @("1766", "{{ER_PF_M}}"),
    @("1630", "{{EE_PF_M}}"),
    @("2400", "{{PT_PA}}"),
    @("509", "{{ER_ESIC_M}}"),
    @("653", "{{GRATUITY_M}}"),
    @("200", "{{PT_M}}"),
    @("102", "{{EE_ESIC_M}}")
  ) | ForEach-Object { Replace-All $_[0] $_[1] }

  Replace-Once "13585" "{{BASIC_M}}"
  Replace-Once "13585" "{{EX_GRATIA_PA}}"
  Replace-Once "1132" "{{BONUS_M}}"
  Replace-Once "1132" "{{EX_GRATIA_M}}"

  $seenDeptLabel = $false
  for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
    $t = ($doc.Paragraphs.Item($i).Range.Text -replace '[\r\n\x07]', '').Trim()
    if ($t -eq "Department") { $seenDeptLabel = $true; continue }
    if ($seenDeptLabel -and $t -eq "HR") {
      $doc.Paragraphs.Item($i).Range.Text = "{{DEPARTMENT}}`r"
      break
    }
  }

  # Blank annexure amount cells via table cells (avoid Paragraph.Text + `r packing M+PA).
  function Set-AnnexureAmountRow([string]$label, [string]$mTok, [string]$paTok, [bool]$startsWith = $false) {
    foreach ($tbl in $doc.Tables) {
      for ($r = 1; $r -le $tbl.Rows.Count; $r++) {
        if ($tbl.Rows.Item($r).Cells.Count -lt 3) { continue }
        $labelText = ($tbl.Cell($r, 1).Range.Text -replace '[\r\n\x07]', '').Trim()
        $match = if ($startsWith) { $labelText.StartsWith($label) } else { $labelText -eq $label }
        if (-not $match) { continue }
        $tbl.Cell($r, 2).Range.Text = "$mTok"
        $tbl.Cell($r, 3).Range.Text = "$paTok"
        return $true
      }
    }
    return $false
  }
  $null = Set-AnnexureAmountRow "Conveyance Allowance" "{{CONVEYANCE_M}}" "{{CONVEYANCE_PA}}"
  $null = Set-AnnexureAmountRow "Advance Against Statutory Bonus" "{{BONUS_M}}" "{{BONUS_PA}}"
  $null = Set-AnnexureAmountRow "Medical Allowance" "{{MEDICAL_M}}" "{{MEDICAL_PA}}"
  $null = Set-AnnexureAmountRow "Less : Employee ESIC" "{{EE_ESIC_M}}" "{{EE_ESIC_PA}}" $true
  $null = Set-AnnexureAmountRow "ADD:Employer ESIC" "{{ER_ESIC_M}}" "{{ER_ESIC_PA}}" $true

  # Candidate name before Annexure - I used many default tabs to fake centering.
  # LibreOffice tab stops differ (x-axis drift). Center + page-break that line instead.
  for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
    $p = $doc.Paragraphs.Item($i)
    $t = ($p.Range.Text -replace '[\r\n\x07]', '').Trim()
    if ($t -eq "{{CANDIDATE_NAME}}") {
      $p.Range.Text = "{{CANDIDATE_NAME}}`r"
      $p.Format.Alignment = 1 # wdAlignParagraphCenter
      $p.Format.PageBreakBefore = $true
      break
    }
  }

  # Keep "Annexure II" with the compensation table (not orphaned at end of prior page).
  # Only force a page break when Annexure is mid-page — sample already starts it near the top.
  for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
    $p = $doc.Paragraphs.Item($i)
    $t = ($p.Range.Text -replace '[\r\n\x07]', '').Trim()
    if ($t -eq "Annexure II") {
      $vpos = $p.Range.Information(5) # wdVerticalPositionRelativeToPage
      if (-not $p.Format.PageBreakBefore -and $vpos -gt 120) {
        $p.Format.PageBreakBefore = $true
      }
      $p.Format.KeepWithNext = $true
      $p.Format.KeepTogether = $true
      break
    }
  }

  $doc.Save()
  $doc.Close($false)
  Write-Output "OK $dst"
}
finally {
  $word.Quit() | Out-Null
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
