import fs from 'fs';
import PizZip from 'pizzip';

const zip = new PizZip(fs.readFileSync('public/templates/admin-recruitment/offer-letter.docx'));
const xml = zip.file('word/document.xml').asText();

for (const needle of ['I accept the above offer', 'Name: ____________________', 'Annexure A', 'Yours sincerely']) {
  const i = xml.indexOf(needle);
  console.log('\n====', needle, '@', i);
  // find enclosing paragraph
  const pStart = xml.lastIndexOf('<w:p ', i);
  const pEnd = xml.indexOf('</w:p>', i) + 6;
  const p = xml.slice(pStart, pEnd);
  console.log(p.replace(/\s+/g, ' ').slice(0, 600));
}

// Signature image size
const sigIdx = xml.indexOf('Yours sincerely');
const after = xml.slice(sigIdx, sigIdx + 8000);
const styles = [...after.matchAll(/style="[^"]*width:[^"]*"/g)].map((m) => m[0]);
const extents = [...after.matchAll(/wp:extent[^/]*\/>/g)].map((m) => m[0]);
console.log('\nsig styles', styles.slice(0, 5));
console.log('sig extents', extents.slice(0, 5));

// media sizes
for (const name of Object.keys(zip.files)) {
  if (!name.startsWith('word/media/')) continue;
  console.log(name, zip.file(name).asUint8Array().length);
}
