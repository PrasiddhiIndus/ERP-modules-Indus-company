import fs from 'fs';
import PizZip from 'pizzip';

function rawName(filePath, needle) {
  const xml = new PizZip(fs.readFileSync(filePath)).file('word/document.xml').asText();
  const annexIdx = xml.indexOf('<w:t>Annexure - I</w:t>');
  const idx = xml.lastIndexOf(needle, annexIdx > 0 ? annexIdx : undefined);
  const pStart = xml.lastIndexOf('<w:p ', idx);
  const pEnd = xml.indexOf('</w:p>', idx) + 6;
  const p = xml.slice(pStart, pEnd);
  console.log('\n====', filePath, '====');
  console.log(p);
  console.log('wellformed t closes', (p.match(/<w:t[\s>]/g) || []).length, (p.match(/<\/w:t>/g) || []).length);
}

rawName('tmp-letter-compare/appt-format.docx', 'Jayraj Dhobi');
rawName('public/templates/admin-recruitment/appointment-letter.docx', '{{CANDIDATE_NAME}}');
