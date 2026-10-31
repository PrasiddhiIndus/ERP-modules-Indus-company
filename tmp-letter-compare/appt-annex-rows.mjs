import fs from 'fs';
import PizZip from 'pizzip';

function block(path, startText) {
  const xml = new PizZip(fs.readFileSync(path)).file('word/document.xml').asText();
  const paras = [...xml.matchAll(/<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((m) => {
    const p = m[0];
    const t = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join('');
    return t.replace(/\s+/g, ' ').trim();
  });
  const start = paras.findIndex((t) => t === startText || t.includes(startText));
  return paras.slice(start, start + 70);
}

console.log('=== TPL Annexure II ===');
block('public/templates/admin-recruitment/appointment-letter.docx', 'Annexure II').forEach((t, i) =>
  console.log(String(i).padStart(2), t || '(empty)')
);
console.log('\nempty count', block('public/templates/admin-recruitment/appointment-letter.docx', 'Annexure II').filter((t) => !t).length);
