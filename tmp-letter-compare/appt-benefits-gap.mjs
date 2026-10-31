import fs from 'fs';
import PizZip from 'pizzip';

function emptiesBefore(path, label) {
  const xml = new PizZip(fs.readFileSync(path)).file('word/document.xml').asText();
  const paras = [...xml.matchAll(/<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((m) => {
    const p = m[0];
    const t = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join('');
    return t.replace(/\s+/g, ' ').trim();
  });
  const i = paras.findIndex((t) => t === label);
  let n = 0;
  for (let j = i - 1; j >= 0 && !paras[j]; j--) n++;
  return { i, n, totalEmpty: paras.filter((t) => !t).length, paras: paras.length };
}

console.log('user', emptiesBefore('tmp-letter-compare/user-appointment.docx', 'Benefits'));
console.log('tpl', emptiesBefore('public/templates/admin-recruitment/appointment-letter.docx', 'Benefits'));

// Find real Annexure II heading in both
function findAnnex2(path) {
  const xml = new PizZip(fs.readFileSync(path)).file('word/document.xml').asText();
  const paras = [...xml.matchAll(/<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((m) => {
    const p = m[0];
    const t = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join('');
    return { t: t.replace(/\s+/g, ' ').trim(), pbb: /w:pageBreakBefore/.test(p) };
  });
  return paras
    .map((p, i) => ({ i, ...p }))
    .filter((p) => p.t === 'Annexure II' || p.t === 'COMPENSATION SCHEME-Year {{SCHEME_YEAR}}' || /^COMPENSATION SCHEME/.test(p.t));
}
console.log('user annex markers', findAnnex2('tmp-letter-compare/user-appointment.docx'));
console.log('tpl annex markers', findAnnex2('public/templates/admin-recruitment/appointment-letter.docx'));
