import fs from 'fs';
import PizZip from 'pizzip';

function texts(path) {
  const xml = new PizZip(fs.readFileSync(path)).file('word/document.xml').asText();
  return [...xml.matchAll(/<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((m) => {
    const p = m[0];
    const t = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join('');
    const empty = (!t.trim() && !/w:drawing|w:pict/.test(p)) || (/\/>$/.test(p) && !p.includes('</w:p>'));
    return {
      t: t.replace(/\s+/g, ' ').trim(),
      empty,
      pbb: /w:pageBreakBefore/.test(p),
      after: Number((p.match(/w:after="(\d+)"/) || [])[1] || 0),
      line: Number((p.match(/w:line="(\d+)"/) || [])[1] || 0),
    };
  });
}

const src = texts('tmp-letter-compare/offer-letter-format.docx');
const tpl = texts('public/templates/admin-recruitment/offer-letter.docx');
const gen = texts('c:/Users/P1/Downloads/Offer-IFSPL-OFR-2026-00006.docx');

console.log('counts', { src: src.length, tpl: tpl.length, gen: gen.length });
console.log('\nSRC body (0..annex):');
src.slice(0, 35).forEach((p, i) => console.log(String(i).padStart(2), p.empty ? 'E' : 'T', `a${p.after}/l${p.line}`, p.pbb ? 'PBB' : '', p.t.slice(0, 80)));
console.log('\nTPL body (0..annex):');
tpl.slice(0, 35).forEach((p, i) => console.log(String(i).padStart(2), p.empty ? 'E' : 'T', `a${p.after}/l${p.line}`, p.pbb ? 'PBB' : '', p.t.slice(0, 80)));

// spacing totals
function sumAfter(list, endPred) {
  let end = list.findIndex(endPred);
  if (end < 0) end = list.length;
  return list.slice(0, end).reduce((s, p) => s + p.after, 0);
}
console.log('\nsum spacing after before Annexure A heading:');
console.log('src', sumAfter(src, (p) => p.t === 'Annexure A'));
console.log('tpl', sumAfter(tpl, (p) => p.t === 'Annexure A'));
console.log('gen', sumAfter(gen, (p) => p.t === 'Annexure A'));

// Appointment: empty run before Benefits — compare to user sample if any
const appt = texts('public/templates/admin-recruitment/appointment-letter.docx');
const userAppt = 'c:/Users/P1/Downloads/Jayraj Dhobi - Appointment letter_003.doc';
console.log('\nappt empty count', appt.filter((p) => p.empty).length, 'of', appt.length);
const benefits = appt.findIndex((p) => p.t === 'Benefits');
console.log('empty run length before Benefits', (() => {
  let n = 0;
  for (let i = benefits - 1; i >= 0 && appt[i].empty; i--) n++;
  return n;
})());
