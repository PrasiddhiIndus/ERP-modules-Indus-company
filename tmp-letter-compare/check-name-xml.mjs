import fs from 'fs';
import PizZip from 'pizzip';

const doc = new PizZip(fs.readFileSync('public/templates/admin-recruitment/appointment-letter.docx'))
  .file('word/document.xml')
  .asText();
const annex = doc.indexOf('<w:t>Annexure - I</w:t>');
const before = doc.slice(0, annex);
const tok = before.lastIndexOf('{{CANDIDATE_NAME}}');
const pStart = before.lastIndexOf('<w:p ', tok);
const pEnd = before.indexOf('</w:p>', tok) + 6;
const para = before.slice(pStart, pEnd);
console.log(para);
console.log('\n---');
console.log('well-formed w:t count for token only', (para.match(/<w:t>{{CANDIDATE_NAME}}<\/w:t>/g) || []).length);
console.log('contains literal closing run as text?', para.includes('&lt;/w:r&gt;') || /<w:t[^>]*>[\s\S]*<\/w:r>/.test(para));
