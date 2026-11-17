$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$emfPath = Join-Path (Get-Location) 'tmp-letter-compare\image1.emf'
$meta = New-Object System.Drawing.Imaging.Metafile($emfPath)
# Full render
$full = New-Object System.Drawing.Bitmap([int]$meta.Width, [int]$meta.Height)
$g = [System.Drawing.Graphics]::FromImage($full)
$g.Clear([System.Drawing.Color]::White)
$g.DrawImage($meta, 0, 0, $meta.Width, $meta.Height)
$g.Dispose()

# cropright = 48124/65536 of width removed from the right
$cropRight = 48124.0 / 65536.0
$visW = [int][Math]::Round($full.Width * (1.0 - $cropRight))
$visH = $full.Height
Write-Host "Full $($full.Width)x$($full.Height); visible ${visW}x${visH}"
$crop = $full.Clone((New-Object System.Drawing.Rectangle(0, 0, $visW, $visH)), $full.PixelFormat)
$out = Join-Path (Get-Location) 'tmp-letter-compare\letterhead-left-cropped.png'
$crop.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$full.Dispose(); $crop.Dispose(); $meta.Dispose()
Write-Host "Wrote $out"
