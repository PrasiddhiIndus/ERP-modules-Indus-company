import fs from 'fs';
import PizZip from 'pizzip';

// Reuse the same layout normalizer used when sending offers.
const { buildOfferLetterDocx } = await import('../server/adminRecruitmentLetterDocs.js');

// Direct OOXML patch of the stored template (no placeholder fill).
const templatePath = 'public/templates/admin-recruitment/offer-letter.docx';
const zip = new PizZip(fs.readFileSync(templatePath));
let xml = zip.file('word/document.xml').asText();

const emptyPara =
  '(?:<w:p\\b[^>]*/>|<w:p\\b[^>]*>\\s*(?:<w:pPr>[\\s\\S]*?</w:pPr>\\s*)?</w:p>)';
const boundary = new RegExp(
  `(<w:t>Name: ____________________[\\s\\S]*?</w:p>)` +
    `((?:\\s*${emptyPara})+)` +
    `(\\s*<w:p\\b[^>]*>\\s*<w:pPr>)` +
    `([\\s\\S]*?<w:jc w:val="center"/>[\\s\\S]*?<w:t>Annexure A</w:t>[\\s\\S]*?</w:p>)`
);

if (!boundary.test(xml)) {
  console.error('Boundary not found — template not patched');
  process.exit(1);
}

xml = xml.replace(boundary, (_, nameBlock, _empties, annexOpen, annexRest) => {
  const open = /w:pageBreakBefore/.test(annexOpen + annexRest)
    ? annexOpen
    : annexOpen.replace(/<w:pPr>/, '<w:pPr><w:pageBreakBefore/>');
  return `${nameBlock}${open}${annexRest}`;
});

zip.file('word/document.xml', xml);
fs.writeFileSync(templatePath, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));

const verify = new PizZip(fs.readFileSync(templatePath));
const vxml = verify.file('word/document.xml').asText();
const chunk = (vxml.match(/Name: ____________________[\s\S]*?<w:t>Annexure A<\/w:t>/) || [''])[0];
console.log('empties left', (chunk.match(/<w:p\b[^>]*\/>/g) || []).length);
console.log('pageBreakBefore', vxml.includes('w:pageBreakBefore'));
