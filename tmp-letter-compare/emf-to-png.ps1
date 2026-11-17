$ErrorActionPreference = 'Stop'
$emf = (Resolve-Path '.\tmp-letter-compare\word\media\image1.emf' -ErrorAction SilentlyContinue)
if (-not $emf) {
  # extract from docx
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path '.\tmp-letter-compare\apt.docx'))
  $entry = $zip.Entries | Where-Object { $_.FullName -eq 'word/media/image1.emf' }
  $outDir = Join-Path (Get-Location) 'tmp-letter-compare'
  $outEmf = Join-Path $outDir 'image1.emf'
  [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $outEmf, $true)
  $zip.Dispose()
  $emf = $outEmf
}
Write-Host "EMF: $emf"

# Convert via Word/PowerPoint? Use System.Drawing Metafile
Add-Type -AssemblyName System.Drawing
$meta = New-Object System.Drawing.Imaging.Metafile($emf)
Write-Host ("EMF size {0}x{1}" -f $meta.Width, $meta.Height)
$bmp = New-Object System.Drawing.Bitmap([int]$meta.Width, [int]$meta.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$g.DrawImage($meta, 0, 0, $meta.Width, $meta.Height)
$png = Join-Path (Get-Location) 'tmp-letter-compare\image1-emf.png'
$bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $meta.Dispose()
Write-Host "Wrote $png"
