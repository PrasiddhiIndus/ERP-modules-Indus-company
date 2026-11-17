import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);
const pdfPath = path.resolve('tmp-letter-compare/apt-letter-size-fixed.pdf');

// Use Word to open PDF is unreliable; use PowerShell + Acrobat-free approach:
// extract with pdfium unavailable — fall back to checking XObject image counts per page via raw scan.
const buf = fs.readFileSync(pdfPath);
const s = buf.toString('latin1');
const pages = [...s.matchAll(/\/Type\s*\/Page\b/g)].length;
const media = [...new Set([...s.matchAll(/MediaBox\s*\[\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\]/g)].map((m) => m.slice(1).join('x')))];
const imageXObjects = (s.match(/\/Subtype\s*\/Image\b/g) || []).length;
const redHints = (s.match(/c00000|C00000|0\.75\s+0\s+0|1\s+0\s+0/g) || []).length;
console.log({ pages, media, imageXObjects, redHints, bytes: buf.length });

// Also convert DOCX (with Word-path footer fix) page count via Word
const script = `
$ErrorActionPreference = 'Stop'
$src = '${pdfPath.replace(/'/g, "''").replace(/\\/g, '\\\\')}'
# Count pages via Word Open of the PDF if Word can open PDF; else skip
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
  $doc = $word.Documents.Open($src, $false, $true)
  Write-Output ("WORD_PDF_PAGES=" + $doc.ComputeStatistics(2))
  Write-Output ("WORD_PAPER_W=" + $doc.PageSetup.PageWidth)
  Write-Output ("WORD_PAPER_H=" + $doc.PageSetup.PageHeight)
  Write-Output ("WORD_PAPER_SIZE=" + $doc.PageSetup.PaperSize)
  $doc.Close($false)
} catch {
  Write-Output ("WORD_OPEN_FAIL=" + $_.Exception.Message)
} finally {
  $word.Quit()
}
`;
const tmp = path.join(os.tmpdir(), `check-pdf-${Date.now()}.ps1`);
fs.writeFileSync(tmp, script);
try {
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmp], {
    windowsHide: true,
    timeout: 90000,
  });
  console.log(String(stdout));
} catch (e) {
  console.log('word check failed', e.message);
} finally {
  try { fs.unlinkSync(tmp); } catch { /* */ }
}
