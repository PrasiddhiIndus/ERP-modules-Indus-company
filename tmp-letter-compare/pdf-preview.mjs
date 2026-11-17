import fs from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';

// Use Word/PowerShell to export first page as image if possible, else pdf-lib note.
const pdfs = [
  ['apt-word.pdf', 'preview-word'],
  ['apt-lo.pdf', 'preview-lo'],
];

for (const [pdf, out] of pdfs) {
  const pdfPath = path.resolve('tmp-letter-compare', pdf);
  if (!fs.existsSync(pdfPath)) {
    console.log('missing', pdf);
    continue;
  }
  // Try pdftoppm / magick
  try {
    execFileSync('magick', ['-density', '120', `${pdfPath}[0]`, `tmp-letter-compare/${out}.png`], {
      stdio: 'inherit',
      windowsHide: true,
    });
    console.log('wrote', out, 'via magick');
    continue;
  } catch {}
  try {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `$pdf='${pdfPath}'; $out='${path.resolve('tmp-letter-compare', out + '.png')}'; Add-Type -AssemblyName System.Drawing; Write-Host 'no native pdf renderer'`,
      ],
      { windowsHide: true, encoding: 'utf8' },
    );
  } catch (e) {
    console.log(pdf, e.message);
  }
}
