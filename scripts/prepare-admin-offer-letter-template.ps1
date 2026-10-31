# Inject placeholders into Downloads\offer letter format.doc → public/templates/admin-recruitment/offer-letter.docx
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$dst = Join-Path $root "public\templates\admin-recruitment\offer-letter.docx"
$src = if ($args[0]) { $args[0] } else { Join-Path $env:USERPROFILE "Downloads\offer letter format.doc" }
if (-not (Test-Path $src)) { throw "Missing sample offer letter: $src" }

$tmp = Join-Path $env:TEMP "ifspl-offer-prepare"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$srcDocx = Join-Path $tmp "sample-offer.docx"

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  if (Test-Path $srcDocx) { Remove-Item $srcDocx -Force }
  $d = $word.Documents.Open($src, $false, $true)
  $null = $d.SaveAs([string]$srcDocx, 16)
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

  Replace-All "Sreelakshmi" "{{CANDIDATE_NAME}}"
  Replace-All "position of Business Analyst in the BA Department" "position of {{DESIGNATION}}{{DEPARTMENT_CLAUSE}}"
  Replace-All "Business Analyst" "{{DESIGNATION_PLAIN}}"
  Replace-All "Indus Fire Safety Private Limited" "{{COMPANY_NAME}}"
  Replace-All "31st  Oct 2026" "{{OFFER_DATE}}"
  Replace-All "5th November 2026" "{{JOINING_DATE_LONG}}"
  Replace-All "5th Nov 2026" "{{JOINING_DATE_SHORT}}"
  # Acceptance request + join-on date (filled at generate from joining_date).
  Replace-All "Please confirm your acceptance by signing and returning a copy of this letter on or before 7th Nov 2026. This offer will lapse if your acceptance is not received on or before 7th Nov 2026, or if you fail to join on the agreed date (5th Nov 2026)." "You are requested to accept or decline this offer within 24 hours from the date and time of issuance"
  Replace-All "I accept the above offer and confirm that I will join on [DD/MM/YYYY]" "I accept the above offer and confirm that I will join on {{JOINING_DATE_DDMMYYYY}}"
  Replace-All "indus HO" "{{LOCATION}}"
  Replace-All "COMPENSATION SCHEME-Year 2026-27" "COMPENSATION SCHEME-Year {{SCHEME_YEAR}}"
  Replace-All "w.e.f. 05.11.26" "w.e.f. {{WEF_SHORT}}"

  # Annual figures first (unique / longer), then monthly
  @(
    @("1080000", "{{CTC_PA}}"),
    @("997020", "{{GROSS_PA}}"),
    @("958620", "{{TAKE_HOME_PA}}"),
    @("498516", "{{BASIC_PA}}"),
    @("199404", "{{HRA_PA}}"),
    @("82980", "{{TOTAL_B_PA}}"),
    @("90000", "{{CTC_M}}"),
    @("83085", "{{GROSS_M}}"),
    @("79885", "{{TAKE_HOME_M}}"),
    @("41543", "{{BASIC_M}}"),
    @("39000", "{{ER_PF_PA}}"),
    @("36000", "{{EE_PF_PA}}"),
    @("23976", "{{GRATUITY_PA}}"),
    @("20004", "{{EX_GRATIA_PA}}"),
    @("16617", "{{HRA_M}}"),
    @("6915", "{{TOTAL_B_M}}"),
    @("3250", "{{ER_PF_M}}"),
    @("3000", "{{EE_PF_M}}"),
    @("2400", "{{PT_PA}}"),
    @("1998", "{{GRATUITY_M}}"),
    @("1667", "{{EX_GRATIA_M}}")
  ) | ForEach-Object { Replace-All $_[0] $_[1] }

  # PT monthly appears twice in sample text dump (value + possible duplicate) — replace once carefully
  Replace-Once "200" "{{PT_M}}"

  # Blank annexure amount cells: set table cells directly (never Paragraph.Text + `r —
  # that packed M+PA into one cell and left extras, inflating row height).
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

  # Remove blank lines between acceptance block and Annexure A, then start annexure
  # on a fresh page (avoids large white gap at end of page 1 / top of page 2).
  $annexIdx = 0
  for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
    $t = ($doc.Paragraphs.Item($i).Range.Text -replace '[\r\n\x07]', '').Trim()
    if ($t -eq "Annexure A") {
      # Prefer the heading (short) over the in-body "below as Annexure A." sentence
      if ($t.Length -le 12) { $annexIdx = $i; break }
    }
  }
  if ($annexIdx -gt 1) {
    for ($i = $annexIdx - 1; $i -ge 1; $i--) {
      $t = ($doc.Paragraphs.Item($i).Range.Text -replace '[\r\n\x07]', '').Trim()
      if ($t -eq "") {
        $doc.Paragraphs.Item($i).Range.Delete() | Out-Null
        $annexIdx--
      } else {
        break
      }
    }
    # Re-find heading after deletes
    for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
      $t = ($doc.Paragraphs.Item($i).Range.Text -replace '[\r\n\x07]', '').Trim()
      if ($t -eq "Annexure A") { $annexIdx = $i; break }
    }
    $p = $doc.Paragraphs.Item($annexIdx)
    $p.Format.PageBreakBefore = $true
    $p.Format.SpaceBefore = 0
    $p.Format.SpaceAfter = 0
  }

  $doc.Save()
  $doc.Close($false)
  Write-Output "OK $dst"
}
finally {
  $word.Quit() | Out-Null
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}

# Keep signature PNG transparent for PDF export (same as prior offer pipeline).
$extractDir = Join-Path $env:TEMP "ifspl-sig-cmp"
New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($dst)
try {
  $entry = $zip.GetEntry("word/media/image2.jpeg")
  if (-not $entry) { $entry = $zip.GetEntry("word/media/image2.png") }
  if (-not $entry) {
    foreach ($e in $zip.Entries) {
      if ($e.FullName -like "word/media/*") { Write-Output ("media: " + $e.FullName); }
    }
  }
  if ($entry) {
    $outJpeg = Join-Path $extractDir "image2.jpeg"
    if ($entry.FullName.EndsWith(".png")) { $outJpeg = Join-Path $extractDir "image2.png" }
    $stream = $entry.Open()
    $fs = [System.IO.File]::Create($outJpeg)
    $stream.CopyTo($fs)
    $fs.Close()
    $stream.Close()
    Write-Output ("extracted " + $entry.FullName)
  }
} finally {
  $zip.Dispose()
}

$hasSig = (Test-Path (Join-Path $extractDir "image2.jpeg")) -or (Test-Path (Join-Path $extractDir "image2.png"))
if ($hasSig) {
  node (Join-Path $PSScriptRoot "fix-offer-signature-transparency.mjs")
  if ($LASTEXITCODE -ne 0) { throw "Signature transparency fix failed." }
}
