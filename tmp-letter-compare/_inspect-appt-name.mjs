import fs from 'fs';
import PizZip from 'pizzip';

function dumpName(label, filePath) {
  const z = new PizZip(fs.readFileSync(filePath));
  const xml = z.file('word/document.xml').asText();
  const annexIdx = xml.indexOf('<w:t>Annexure - I</w:t>');
  const before = annexIdx > 0 ? xml.slice(0, annexIdx) : xml;
  const paras = [...before.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)];
  console.log('\n===', label, '===');
  for (let i = Math.max(0, paras.length - 12); i < paras.length; i++) {
    const p = paras[i][0];
    const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join('');
    const tabs = (p.match(/<w:tab\/>/g) || []).length;
    const jc = (p.match(/<w:jc w:val="([^"]+)"/) || [])[1] || '-';
    const ind = (p.match(/<w:ind [^>]+\/?>/) || [])[0] || '';
    const pbb = /w:pageBreakBefore/.test(p);
    const style = (p.match(/w:val="([^"]+)"\/>/) && p.includes('pStyle')
      ? (p.match(/<w:pStyle w:val="([^"]+)"/) || [])[1]
      : '-') || '-';
    if (!texts.trim() && !tabs) {
      console.log(`#${i} EMPTY pbb=${pbb} jc=${jc}`);
      continue;
    }
    console.log(
      `#${i} jc=${jc} tabs=${tabs} pbb=${pbb} style=${style} ind=${ind} text=${JSON.stringify(texts.trim().slice(0, 90))}`
    );
  }
}

dumpName('ATTACHED', 'tmp-letter-compare/appt-format.docx');
dumpName('TEMPLATE', 'public/templates/admin-recruitment/appointment-letter.docx');
if (fs.existsSync('C:/Users/P1/Downloads/Appointment-IFSPL-APT-2026-00007.docx')) {
  dumpName('DOWNLOADED', 'C:/Users/P1/Downloads/Appointment-IFSPL-APT-2026-00007.docx');
}
