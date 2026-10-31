import fs from 'fs';
import PizZip from 'pizzip';

function dump(label, filePath, needle) {
  const z = new PizZip(fs.readFileSync(filePath));
  const xml = z.file('word/document.xml').asText();
  const idx = xml.indexOf(needle);
  if (idx < 0) {
    console.log(label, 'needle not found', needle);
    return;
  }
  const pStart = xml.lastIndexOf('<w:p ', idx);
  const pEnd = xml.indexOf('</w:p>', idx) + 6;
  const p = xml.slice(pStart, pEnd);
  console.log('\n====', label, '====');
  console.log('pPr:', (p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [])[0]);
  console.log('tabs count', (p.match(/<w:tab\/>/g) || []).length);
  console.log('pbb', /pageBreakBefore/.test(p));
  // previous para
  const prevEnd = pStart;
  const prevStart = xml.lastIndexOf('<w:p ', prevEnd - 1);
  if (prevStart >= 0) {
    const prev = xml.slice(prevStart, xml.indexOf('</w:p>', prevStart) + 6);
    const t = [...prev.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join('');
    console.log('prev text', JSON.stringify(t), 'tabs', (prev.match(/<w:tab\/>/g) || []).length);
    console.log('prev pPr', (prev.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [])[0]);
  }
  // sect/pgSz for context
  const sect = (xml.match(/<w:pgMar[^/]*\/>/) || [])[0];
  console.log('pgMar', sect);
}

dump('ATTACHED', 'tmp-letter-compare/appt-format.docx', 'Jayraj Dhobi');
dump('TEMPLATE', 'public/templates/admin-recruitment/appointment-letter.docx', '{{CANDIDATE_NAME}}');
dump('DOWNLOADED', 'C:/Users/P1/Downloads/Appointment-IFSPL-APT-2026-00007.docx', 'Amit tesstttttttt');
