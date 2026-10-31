import fs from 'fs';
import { execFileSync } from 'child_process';
import PizZip from 'pizzip';
import path from 'path';
import os from 'os';

function paras(xml) {
  const out = [];
  const re = /<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let m;
  while ((m = re.exec(xml))) {
    const p = m[0];
    const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join('');
    const selfClose = /\/>$/.test(p) && !p.includes('</w:p>');
    out.push({
      text: texts.replace(/\s+/g, ' ').trim().slice(0, 120),
      empty: selfClose || (!texts.trim() && !/w:drawing|w:pict|v:imagedata/.test(p)),
      pbb: /w:pageBreakBefore/.test(p),
    });
  }
  return out;
}

function dump(label, filePath) {
  const zip = new PizZip(fs.readFileSync(filePath));
  const xml = zip.file('word/document.xml').asText();
  const list = paras(xml);
  const idx = list.findIndex((p) => /Yours sincerely/i.test(p.text));
  const annex = list.findIndex((p, i) => i > idx && /^Annexure A$/i.test(p.text));
  const between = annex > idx ? list.slice(idx, annex + 1) : [];
  console.log(
    label,
    'paras',
    list.length,
    'pbb',
    list.filter((p) => p.pbb).length,
    'empties sincerely..annex',
    between.filter((p) => p.empty).length,
    'annexPbb',
    annex >= 0 ? list[annex].pbb : null
  );
  const flat = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  console.log(
    '  24h=',
    /within 24 hours from the date and time of issuance/.test(flat),
    'above offer=',
    /I accept the above offer/.test(flat),
    'Offer of Employment=',
    /Offer of Employment/.test(flat)
  );
}

const srcDoc = path.join(os.homedir(), 'Downloads', 'offer letter format.doc');
const srcDocx = path.join('tmp-letter-compare', 'offer-letter-format.docx');
const ps = `
$ErrorActionPreference='Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open((Join-Path $env:USERPROFILE 'Downloads\\offer letter format.doc'), $false, $true)
  if (Test-Path '${srcDocx.replace(/\\/g, '\\\\')}') { Remove-Item '${srcDocx.replace(/\\/g, '\\\\')}' -Force }
  $null = $doc.SaveAs([string](Resolve-Path .\\tmp-letter-compare).Path + '\\offer-letter-format.docx', 16)
  $doc.Close($false)
} finally { $word.Quit() | Out-Null }
`;
fs.writeFileSync('tmp-letter-compare/_conv.ps1', ps);
execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'tmp-letter-compare/_conv.ps1'], {
  encoding: 'utf8',
  stdio: 'inherit',
});

dump('SOURCE', srcDocx);
dump('TEMPLATE', 'public/templates/admin-recruitment/offer-letter.docx');
