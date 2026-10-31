import fs from 'fs';
import PizZip from 'pizzip';

const xml = new PizZip(fs.readFileSync('public/templates/admin-recruitment/appointment-letter.docx'))
  .file('word/document.xml')
  .asText();

const idx = xml.indexOf('{{CANDIDATE_NAME}}');
const pStart = xml.lastIndexOf('<w:p ', idx);
const pEnd = xml.indexOf('</w:p>', idx);
const p = xml.slice(pStart, pEnd + 6);
console.log('candidate name para length', p.length);
console.log('tabs', (p.match(/<w:tab\/>/g) || []).length);
console.log('jc', (p.match(/<w:jc[^/]*\/>/) || [])[0]);
console.log('tabsDef', (p.match(/<w:tabs>[\s\S]*?<\/w:tabs>/) || [])[0]);
console.log('full pPr', (p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [])[0]);
console.log('text runs summary', [...p.matchAll(/<w:(tab|t)[\s/>]/g)].map((m) => m[0]).slice(0, 20));

// Also check Benefits empty run — does it use spacing?
const bIdx = xml.indexOf('>Benefits<');
const before = xml.slice(bIdx - 3000, bIdx);
const emptyRun = [...before.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].slice(-10);
console.log('\n10 paras before Benefits:');
emptyRun.forEach((m, i) => {
  const t = [...m[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join('');
  console.log(i, t ? t.slice(0, 50) : 'EMPTY', /w:spacing/.test(m[0]), (m[0].match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [])[0]?.slice(0, 120));
});
