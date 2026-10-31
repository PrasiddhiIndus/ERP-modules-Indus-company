import fs from 'fs';
import PizZip from 'pizzip';

function analyze(path) {
  const zip = new PizZip(fs.readFileSync(path));
  const xml = zip.file('word/document.xml').asText();
  const nameIdx = xml.indexOf('Name: ____________________');
  const annexIdx = xml.indexOf('<w:t>Annexure A</w:t>', nameIdx);
  const between = xml.slice(nameIdx, annexIdx);
  const selfClose = [...between.matchAll(/<w:p\b[^>]*\/>/g)];
  const emptyOpen = [...between.matchAll(/<w:p\b[^>]*>\s*(?:<w:pPr>[\s\S]*?<\/w:pPr>\s*)?<\/w:p>/g)];
  console.log(path);
  console.log('  self-close empty', selfClose.length, selfClose.map((m) => m[0].slice(0, 80)));
  console.log('  empty open/close', emptyOpen.length);
  console.log('  between len', between.length);
}

analyze('public/templates/admin-recruitment/offer-letter.docx');
analyze('tmp-letter-compare/offer-built-now.docx');
