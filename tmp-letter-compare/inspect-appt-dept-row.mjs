import fs from 'fs';
import PizZip from 'pizzip';

const xml = new PizZip(fs.readFileSync('public/templates/admin-recruitment/appointment-letter.docx'))
  .file('word/document.xml')
  .asText();

const i = xml.indexOf('>Department<');
const trStart = xml.lastIndexOf('<w:tr ', i);
const trEnd = xml.indexOf('</w:tr>', i);
const row = xml.slice(trStart, trEnd + 7);
console.log('paras', (row.match(/<w:p\b/g) || []).length);
console.log('texts', [...row.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]));
console.log('row snippet', row.replace(/\s+/g, ' ').slice(0, 1500));

// Count empty paras inside each cell of header info table (Location..W.E.F.)
const annex = xml.indexOf('>Annexure II<');
const slice = xml.slice(annex, annex + 25000);
const rows = [...slice.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)];
console.log('\nfirst annexure rows para counts:');
rows.slice(0, 15).forEach((r, idx) => {
  const texts = [...r[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join(' | ');
  const ps = (r[0].match(/<w:p\b/g) || []).length;
  console.log(idx, 'paras=' + ps, texts.slice(0, 80));
});
