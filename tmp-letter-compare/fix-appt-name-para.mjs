import fs from 'fs';
import PizZip from 'pizzip';

const path = 'public/templates/admin-recruitment/appointment-letter.docx';
const zip = new PizZip(fs.readFileSync(path));
let doc = zip.file('word/document.xml').asText();

const tokenIdx = doc.indexOf('{{CANDIDATE_NAME}}');
console.log('token count', (doc.match(/\{\{CANDIDATE_NAME\}\}/g) || []).length);
console.log('token idx', tokenIdx);

// Show raw XML around the signature-page token (last one before Annexure - I)
const annex = doc.indexOf('<w:t>Annexure - I</w:t>');
const before = doc.slice(0, annex);
const lastTok = before.lastIndexOf('{{CANDIDATE_NAME}}');
const pStart = before.lastIndexOf('<w:p ', lastTok);
const pEnd = before.indexOf('</w:p>', lastTok) + 6;
const para = before.slice(pStart, pEnd);
console.log('\n=== CURRENT NAME PARA ===');
console.log(para);
console.log('\nlength', para.length);

// Rebuild a clean Word-faithful name paragraph:
// NoSpacing + both justify + 11 tabs (sample indent) + bold Cambria name token.
const clean = `<w:p w14:paraId="7A1B2C3D" w14:textId="77777777" w:rsidR="00A40D6B" w:rsidRDefault="00A40D6B" w:rsidP="00A40D6B"><w:pPr><w:pStyle w:val="NoSpacing"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>${Array.from(
  { length: 11 },
  () =>
    '<w:r><w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria" w:cs="Arial"/><w:b/><w:bCs/></w:rPr><w:tab/></w:r>'
).join('')}<w:r><w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria" w:cs="Arial"/><w:b/><w:bCs/></w:rPr><w:t>{{CANDIDATE_NAME}}</w:t></w:r></w:p>`;

doc = `${doc.slice(0, pStart)}${clean}${doc.slice(pEnd)}`;
zip.file('word/document.xml', doc);
fs.writeFileSync(path, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));

const verify = new PizZip(fs.readFileSync(path)).file('word/document.xml').asText();
const a2 = verify.indexOf('<w:t>Annexure - I</w:t>');
const b2 = verify.slice(0, a2);
const lt = b2.lastIndexOf('{{CANDIDATE_NAME}}');
const ps = b2.lastIndexOf('<w:p ', lt);
const pe = b2.indexOf('</w:p>', lt) + 6;
const fixedPara = b2.slice(ps, pe);
const texts = [...fixedPara.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]);
console.log('\n=== FIXED NAME PARA texts ===', texts);
console.log('tabs', (fixedPara.match(/<w:tab\/>/g) || []).length);
console.log('leak', texts.some((t) => /<\/w:r>|<w:r/.test(t)));
console.log('ok');
