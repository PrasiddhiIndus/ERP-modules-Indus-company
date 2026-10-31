import fs from 'fs';
import os from 'os';
import path from 'path';
import PizZip from 'pizzip';

function show(label, filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(label, 'MISSING', filePath);
    return;
  }
  const zip = new PizZip(fs.readFileSync(filePath));
  const styles = zip.file('word/styles.xml')?.asText() || '';
  const xml = zip.file('word/document.xml')?.asText() || '';
  const ns = styles.match(/<w:style[^>]*w:styleId="NoSpacing"[\s\S]*?<\/w:style>/);
  console.log('\n====', label);
  console.log('NoSpacing:', ns ? ns[0].replace(/\s+/g, ' ') : 'none');
  console.log('pgMar', (xml.match(/<w:pgMar[^/]*\/>/) || [])[0]);
  const emptyNoSp = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].filter(
    (m) => !/<w:t[^>]*>[^<]*\S/.test(m[0]) && /NoSpacing/.test(m[0]) && !/w:spacing/.test(m[0])
  ).length;
  console.log('empty NoSpacing without w:spacing:', emptyNoSp);
}

show('TEMPLATE', 'public/templates/admin-recruitment/appointment-letter.docx');
show('OFFER', 'public/templates/admin-recruitment/offer-letter.docx');
show('USER', 'tmp-letter-compare/user-appointment.docx');
show('SOURCE', path.join(os.tmpdir(), 'appt-format-check.docx'));
show('GEN5', path.join(os.homedir(), 'Downloads', 'Appointment-IFSPL-APT-2026-00002 (5).docx'));
