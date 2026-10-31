import fs from 'fs';
import PizZip from 'pizzip';

function annexBlock(path) {
  const xml = new PizZip(fs.readFileSync(path)).file('word/document.xml').asText();
  const paras = [...xml.matchAll(/<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((m) => {
    const p = m[0];
    const t = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join('');
    return t.replace(/\s+/g, ' ').trim();
  });
  const start = paras.findIndex((t) => t === 'Annexure A');
  return paras.slice(start, start + 80);
}

const src = annexBlock('tmp-letter-compare/offer-letter-format.docx');
const gen = annexBlock('c:/Users/P1/Downloads/Offer-IFSPL-OFR-2026-00006.docx');
const tpl = annexBlock('public/templates/admin-recruitment/offer-letter.docx');

console.log('SRC annex rows', src.length);
src.forEach((t, i) => console.log(String(i).padStart(2), t || '(empty)'));
console.log('\nGEN vs SRC length', gen.length, src.length);
// show where they diverge
const n = Math.max(src.length, gen.length);
for (let i = 0; i < n; i++) {
  if ((src[i] || '') !== (gen[i] || '') && i < 60) {
    // only flag structural empties differences
  }
}
console.log('\nEmpty rows in annex src/gen/tpl', src.filter((t) => !t).length, gen.filter((t) => !t).length, tpl.filter((t) => !t).length);
console.log('\nTPL annex:');
tpl.forEach((t, i) => console.log(String(i).padStart(2), t || '(empty)'));
console.log('\nGEN annex:');
gen.forEach((t, i) => console.log(String(i).padStart(2), t || '(empty)'));
