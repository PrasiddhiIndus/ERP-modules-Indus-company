import fs from 'fs';
import PizZip from 'pizzip';

const xml = new PizZip(fs.readFileSync('public/templates/admin-recruitment/appointment-letter.docx'))
  .file('word/document.xml')
  .asText();

function rowAround(token) {
  const i = xml.indexOf(token);
  if (i < 0) return console.log('missing', token);
  const trStart = xml.lastIndexOf('<w:tr ', i);
  const trEnd = xml.indexOf('</w:tr>', i);
  if (trStart < 0 || trEnd < 0) return console.log('not in table', token);
  const row = xml.slice(trStart, trEnd + 7);
  const texts = [...row.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
  const allPs = (row.match(/<w:p\b/g) || []).length;
  console.log(token, '→ texts', texts, 'paras', allPs);
}

for (const t of [
  'Basic',
  'Conveyance Allowance',
  '{{CONVEYANCE_M}}',
  '{{CONVEYANCE_PA}}',
  '{{BONUS_M}}',
  '{{MEDICAL_M}}',
  '{{EE_ESIC_M}}',
  '{{BASIC_M}}',
]) {
  rowAround(t);
}
console.log('pageBreakBefore', (xml.match(/w:pageBreakBefore/g) || []).length);
