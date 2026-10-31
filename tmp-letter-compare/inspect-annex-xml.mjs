import fs from 'fs';
import PizZip from 'pizzip';

const xml = new PizZip(fs.readFileSync('public/templates/admin-recruitment/offer-letter.docx'))
  .file('word/document.xml')
  .asText();

const i = xml.indexOf('Conveyance Allowance');
console.log(xml.slice(i - 200, i + 1200).replace(/\s+/g, ' '));
console.log('\n---\n');
const j = xml.indexOf('{{CONVEYANCE_PA}}');
console.log(xml.slice(j, j + 800).replace(/\s+/g, ' '));
