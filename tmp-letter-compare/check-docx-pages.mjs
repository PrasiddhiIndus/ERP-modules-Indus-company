import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  convertDocxBufferToPdf,
  fixAppointmentFooterForPdf,
  finalizeAppointmentLetterDocx,
} from '../server/adminRecruitmentLetterDocs.js';

const execFileAsync = promisify(execFile);
const src = fs.readFileSync('tmp-letter-compare/apt.docx');
const fixed = fixAppointmentFooterForPdf(finalizeAppointmentLetterDocx(src));
const docxPath = path.join(os.tmpdir(), `appt-letter-check-${Date.now()}.docx`);
fs.writeFileSync(docxPath, fixed);

const script = `
$ErrorActionPreference = 'Stop'
$src = '${docxPath.replace(/'/g, "''")}'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($src, $false, $true)
  foreach ($section in $doc.Sections) {
    $section.PageSetup.PaperSize = 1
    $section.PageSetup.PageWidth = 612
    $section.PageSetup.PageHeight = 792
  }
  Write-Output ("PAGES=" + $doc.ComputeStatistics(2))
  Write-Output ("W=" + $doc.PageSetup.PageWidth)
  Write-Output ("H=" + $doc.PageSetup.PageHeight)
  Write-Output ("PAPER=" + $doc.PageSetup.PaperSize)
  Write-Output ("FOOTER_DIST=" + $doc.PageSetup.FooterDistance)
  Write-Output ("DIFFERENT_FIRST=" + $doc.PageSetup.DifferentFirstPageHeaderFooter)
  Write-Output ("ODD_EVEN=" + $doc.PageSetup.OddAndEvenPagesHeaderFooter)
  $footer = $doc.Sections.Item(1).Footers.Item(1)
  Write-Output ("FOOTER_SHAPES=" + $footer.Range.ShapeRange.Count)
  Write-Output ("FOOTER_INLINE=" + $footer.Range.InlineShapes.Count)
  Write-Output ("FOOTER_TEXT_LEN=" + $footer.Range.Text.Length)
  $doc.Close($false)
} finally {
  $word.Quit()
}
`;
const ps1 = path.join(os.tmpdir(), `appt-pages-${Date.now()}.ps1`);
fs.writeFileSync(ps1, script);
const { stdout, stderr } = await execFileAsync(
  'powershell.exe',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
  { windowsHide: true, timeout: 120000 },
);
console.log(String(stdout));
if (stderr) console.log('stderr', String(stderr).slice(0, 400));

// Force LO path too
process.env.FORCE_LIBREOFFICE_PDF = '1';
const loPdf = await convertDocxBufferToPdf(src, 'appointment-letter');
if (loPdf) {
  fs.writeFileSync('tmp-letter-compare/apt-lo-letter-fixed.pdf', loPdf);
  const s = loPdf.toString('latin1');
  console.log('LO PDF media', [...new Set([...s.matchAll(/MediaBox\s*\[\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\]/g)].map((m) => m.slice(1).join('x')))]);
  console.log('LO PDF pages', (s.match(/\/Type\s*\/Page\b/g) || []).length);
} else {
  console.log('LO PDF unavailable');
}
