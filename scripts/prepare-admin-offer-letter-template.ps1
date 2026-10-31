# Inject placeholders into New-IFSPL offer letter → public/templates/admin-recruitment/offer-letter.docx
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$src = Join-Path $root "tmp-new-ifspl-offer.docx"
$dst = Join-Path $root "public\templates\admin-recruitment\offer-letter.docx"
if (-not (Test-Path $src)) { throw "Missing $src" }
Copy-Item $src $dst -Force

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($dst)

  function Replace-All([string]$find, [string]$replace) {
    $rng = $doc.Content
    $f = $rng.Find
    $f.ClearFormatting() | Out-Null
    $f.Replacement.ClearFormatting() | Out-Null
    $f.Text = $find
    $f.Replacement.Text = $replace
    $f.Forward = $true
    $f.Wrap = 1
    $f.Format = $false
    $f.MatchCase = $true
    $f.MatchWholeWord = $false
    $f.MatchWildcards = $false
    $f.MatchSoundsLike = $false
    $f.MatchAllWordForms = $false
    # ReplaceAll = 2
    $null = $f.Execute(
      $find, $false, $false, $false, $false, $false, $true, 1, $false, $replace, 2
    )
  }

  Replace-All "Aditya Yadav" "{{CANDIDATE_NAME}}"
  Replace-All "in the HR Department" "{{DEPARTMENT_CLAUSE}}"
  Replace-All "Dashrath, Vadodara" "{{LOCATION}}"
  Replace-All "INDUS FIRE SAFETY PVT LTD" "{{COMPANY_NAME}}"
  Replace-All "19th  Oct 2026" "{{OFFER_DATE}}"
  Replace-All "19th November 2026" "{{JOINING_DATE_LONG}}"
  Replace-All "19th Nov 2026" "{{JOINING_DATE_SHORT}}"
  Replace-All "20th Oct 2026" "{{VALID_UNTIL}}"
  Replace-All "20th  Oct 2026" "{{VALID_UNTIL}}"
  Replace-All "position of Executive " "position of {{DESIGNATION}}"
  Replace-All "COMPENSATION SCHEME-Year 2026-27" "COMPENSATION SCHEME-Year {{SCHEME_YEAR}}"
  Replace-All "w.e.f. 02.11.26" "w.e.f. {{WEF_SHORT}}"

  # Remaining "Executive" (details table)
  Replace-All "Executive" "{{DESIGNATION_PLAIN}}"

  # Annual figures first (unique), then monthly
  @(
    @("343851", "{{CTC_PA}}"),
    @("28654", "{{CTC_M}}"),
    @("49851", "{{TOTAL_B_PA}}"),
    @("4154", "{{TOTAL_B_M}}"),
    @("21679", "{{ER_PF_PA}}"),
    @("1807", "{{ER_PF_M}}"),
    @("270338", "{{TAKE_HOME_PA}}"),
    @("22528", "{{TAKE_HOME_M}}"),
    @("294000", "{{GROSS_PA}}"),
    @("24500", "{{GROSS_M}}"),
    @("20012", "{{EE_PF_PA}}"),
    @("1668", "{{EE_PF_M}}"),
    @("166764", "{{BASIC_PA}}"),
    @("13897", "{{BASIC_M}}"),
    @("66706", "{{HRA_PA}}"),
    @("5559", "{{HRA_M}}"),
    @("16639", "{{CONVEYANCE_PA}}"),
    @("1387", "{{CONVEYANCE_M}}"),
    @("13891", "{{BONUS_PA}}"),
    @("1158", "{{BONUS_M}}"),
    @("30000", "{{MEDICAL_PA}}"),
    @("2500", "{{MEDICAL_M}}"),
    @("2400", "{{PT_PA}}"),
    @("8021", "{{GRATUITY_PA}}"),
    @("668", "{{GRATUITY_M}}"),
    @("521", "{{ER_ESIC_M}}"),
    @("104", "{{EE_ESIC_M}}"),
    @("200", "{{PT_M}}"),
    @("5000", "{{ER_ESIC_PA}}")
  ) | ForEach-Object { Replace-All $_[0] $_[1] }

  # Ex Gratia monthly shared 1158 with bonus — already BONUS_M; set annual if leftover
  Replace-All "{{BONUS_M}}" "{{BONUS_M}}" # no-op keep
  # Second 1158 was Ex Gratia monthly — if still present as number it was replaced as BONUS_M already (same value)

  # EE ESIC annual often blank in sample; ensure placeholder exists for PA column near EE ESIC
  # Ex Gratia PA was 13897 = same as BONUS_PA — already replaced as BONUS_PA; add EX_GRATIA aliases in filler

  $doc.Save()
  $doc.Close() | Out-Null
  Write-Output "OK $dst"
}
finally {
  $word.Quit() | Out-Null
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}

# JPEG stamp uses Word chromakey; PDF export keeps a gray box — replace with transparent PNG.
$extractDir = Join-Path $env:TEMP "ifspl-sig-cmp"
New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($dst)
try {
  $entry = $zip.GetEntry("word/media/image2.jpeg")
  if (-not $entry) { $entry = $zip.GetEntry("word/media/image2.png") }
  if ($entry) {
    $outJpeg = Join-Path $extractDir "image2.jpeg"
    $stream = $entry.Open()
    $fs = [System.IO.File]::Create($outJpeg)
    $stream.CopyTo($fs)
    $fs.Close()
    $stream.Close()
  }
} finally {
  $zip.Dispose()
}
node (Join-Path $PSScriptRoot "fix-offer-signature-transparency.mjs")
if ($LASTEXITCODE -ne 0) { throw "Signature transparency fix failed." }
