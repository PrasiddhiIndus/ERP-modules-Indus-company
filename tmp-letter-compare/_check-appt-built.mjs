import fs from 'fs';
import PizZip from 'pizzip';

function parasAroundAnnex(filePath) {
  const xml = new PizZip(fs.readFileSync(filePath)).file('word/document.xml').asText();
  const annexIdx = xml.indexOf('<w:t>Annexure - I</w:t>');
  const before = xml.slice(0, annexIdx);
  const paras = [...before.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)];
  console.log('\nFILE', filePath);
  for (let i = Math.max(0, paras.length - 8); i < paras.length; i++) {
    const p = paras[i][0];
    const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]);
    const joined = texts.join('');
    console.log(
      `#${i}`,
      'tabs',
      (p.match(/<w:tab\/>/g) || []).length,
      'jc',
      (p.match(/w:jc w:val="([^"]+)"/) || [])[1],
      'pbb',
      /pageBreakBefore/.test(p),
      'texts',
      JSON.stringify(texts),
      'joined',
      JSON.stringify(joined)
    );
  }
  console.log(
    'has Test Candidate',
    xml.includes('Test Candidate'),
    'has {{CANDIDATE_NAME}}',
    xml.includes('{{CANDIDATE_NAME}}'),
    'has Jayraj',
    xml.includes('Jayraj')
  );
}

parasAroundAnnex('public/templates/admin-recruitment/appointment-letter.docx');
parasAroundAnnex('tmp-letter-compare/appt-built-fixed.docx');
parasAroundAnnex('tmp-letter-compare/appt-format.docx');
