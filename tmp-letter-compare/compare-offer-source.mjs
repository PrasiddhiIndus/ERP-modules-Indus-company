import fs from 'fs';
import { execFileSync } from 'child_process';
import PizZip from 'pizzip';

function paras(xml) {
  const out = [];
  const re = /<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let m;
  while ((m = re.exec(xml))) {
    const p = m[0];
    const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join('');
    const selfClose = /\/>$/.test(p) && !p.includes('</w:p>');
    out.push({
      text: texts.replace(/\s+/g, ' ').trim().slice(0, 100),
      empty: selfClose || (!texts.trim() && !/w:drawing|w:pict|v:imagedata/.test(p)),
      pbb: /w:pageBreakBefore/.test(p),
      spacing: (p.match(/<w:spacing[^/]*\/>/) || [''])[0],
      before: Number((p.match(/w:before="(\d+)"/) || [])[1] || 0),
      after: Number((p.match(/w:after="(\d+)"/) || [])[1] || 0),
      line: Number((p.match(/w:line="(\d+)"/) || [])[1] || 0),
    });
  }
  return out;
}

function dump(label, path) {
  const zip = new PizZip(fs.readFileSync(path));
  const xml = zip.file('word/document.xml').asText();
  const list = paras(xml);
  console.log('\n####', label, 'paras', list.length, 'pbb', list.filter((p) => p.pbb).length);
  console.log('pgMar', (xml.match(/<w:pgMar[^/]*\/>/) || [])[0]);
  const idx = list.findIndex((p) => /Yours sincerely/i.test(p.text));
  const annex = list.findIndex((p, i) => i > idx && /^Annexure A$/i.test(p.text));
  for (let i = Math.max(0, idx - 1); i < Math.min(list.length, (annex >= 0 ? annex : idx) + 6); i++) {
    const p = list[i];
    console.log(String(i).padStart(3), p.empty ? 'E' : 'T', p.pbb ? 'PBB' : '   ', `b${p.before}/a${p.after}/l${p.line}`, '|', p.text);
  }
  // Count empties between accept and annex
  if (idx >= 0 && annex > idx) {
    const between = list.slice(idx, annex + 1);
    console.log('empties between sincerely..annex', between.filter((p) => p.empty).length);
  }
}

// Convert source format if needed
const srcDoc = 'c:/Users/P1/Downloads/offer letter format.doc';
const srcDocx = 'd:/ERP-modules-Indus-company/tmp-letter-compare/offer-letter-format.docx';
if (!fs.existsSync(srcDocx) || fs.statSync(srcDoc).mtimeMs > fs.statSync(srcDocx).mtimeMs) {
  const ps = `
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open('${srcDoc.replace(/'/g, "''")}', $false, $true)
  if (Test-Path '${srcDocx}') { Remove-Item '${srcDocx}' -Force }
  $null = $doc.SaveAs([string]'${srcDocx}', 16)
  Write-Output ("pages=" + $doc.ComputeStatistics(2) + " paras=" + $doc.Paragraphs.Count)
  $doc.Close($false)
} finally { $word.Quit() | Out-Null }
`;
  fs.writeFileSync('tmp-letter-compare/_conv.ps1', ps);
  console.log(execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'tmp-letter-compare/_conv.ps1'], { encoding: 'utf8' }));
}

dump('SOURCE format', srcDocx);
dump('TEMPLATE', 'public/templates/admin-recruitment/offer-letter.docx');

const gen = 'c:/Users/P1/Downloads/Offer-IFSPL-OFR-2026-00006.docx';
if (fs.existsSync(gen)) dump('GENERATED 00006', gen);

const gen2 = 'c:/Users/P1/Downloads/Offer-IFSPL-OFR-2026-00004.docx';
if (fs.existsSync(gen2)) dump('GENERATED 00004', gen2);
