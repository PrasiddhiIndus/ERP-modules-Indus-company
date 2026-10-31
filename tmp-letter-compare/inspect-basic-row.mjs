import fs from 'fs';
import PizZip from 'pizzip';

const xml = new PizZip(fs.readFileSync('public/templates/admin-recruitment/offer-letter.docx'))
  .file('word/document.xml')
  .asText();

function rowAround(token) {
  const i = xml.indexOf(`<w:t>${token}</w:t>`);
  if (i < 0) return console.log('missing', token);
  const trStart = xml.lastIndexOf('<w:tr ', i);
  const trEnd = xml.indexOf('</w:tr>', i) + 7;
  const row = xml.slice(trStart, trEnd);
  const texts = [...row.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
  const emptyPs = (row.match(/<w:p\b[^>]*>\s*<w:pPr>[\s\S]*?<\/w:pPr>\s*<\/w:p>|<w:p\b[^>]*\/>/g) || []).length;
  const allPs = (row.match(/<w:p\b/g) || []).length;
  console.log('\n', token, 'texts=', texts, 'paras=', allPs, 'emptyP=', emptyPs);
}

for (const t of [
  'Basic',
  'Conveyance Allowance',
  'Advance Against Statutory Bonus',
  'Medical Allowance',
  'Less : Employee ESIC',
  'ADD:Employer ESIC',
  'HRA',
]) {
  rowAround(t);
}
