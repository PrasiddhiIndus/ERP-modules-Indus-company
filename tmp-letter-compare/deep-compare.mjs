import fs from 'fs';
import PizZip from 'pizzip';

function load(path) {
  const zip = new PizZip(fs.readFileSync(path));
  return { zip, xml: zip.file('word/document.xml').asText() };
}

function mediaSizes(zip) {
  return Object.keys(zip.files)
    .filter((n) => n.startsWith('word/media/'))
    .map((n) => `${n}=${zip.file(n).asUint8Array().length}`);
}

const src = load('tmp-letter-compare/offer-letter-format.docx');
const tpl = load('public/templates/admin-recruitment/offer-letter.docx');
const gen = load('c:/Users/P1/Downloads/Offer-IFSPL-OFR-2026-00006.docx');

console.log('src media', mediaSizes(src.zip));
console.log('tpl media', mediaSizes(tpl.zip));
console.log('gen media', mediaSizes(gen.zip));

// Signature shape styles after sincerely
function sigStyle(xml) {
  const i = xml.indexOf('Yours sincerely');
  const slice = xml.slice(i, i + 5000);
  return [...slice.matchAll(/style="[^"]*width:[^"]*"/g)].map((m) => m[0]);
}
console.log('src sig', sigStyle(src.xml));
console.log('tpl sig', sigStyle(tpl.xml));
console.log('gen sig', sigStyle(gen.xml));

// Table widths
function tables(xml) {
  return {
    grid: [...xml.matchAll(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/g)].map((m) => m[0].replace(/\s+/g, ' ').slice(0, 120)),
    tcW: [...xml.matchAll(/<w:tcW[^/]*\/>/g)].slice(0, 8).map((m) => m[0]),
  };
}
console.log('src tables', tables(src.xml));
console.log('tpl tables', tables(tpl.xml));

// keepNext / keepLines
for (const [label, xml] of [
  ['src', src.xml],
  ['tpl', tpl.xml],
  ['gen', gen.xml],
]) {
  console.log(label, 'keepNext', (xml.match(/w:keepNext/g) || []).length, 'keepLines', (xml.match(/w:keepLines/g) || []).length, 'wordWrap', (xml.match(/w:wordWrap/g) || []).length, 'pbb', (xml.match(/w:pageBreakBefore/g) || []).length);
}

// Appointment corrupted para
const appt = load('public/templates/admin-recruitment/appointment-letter.docx');
const bad = appt.xml.match(/<w:t[^>]*>[^<]*<\/w:r>/);
console.log('\nappt bad text samples:');
for (const m of appt.xml.matchAll(/<w:t[^>]*>([^<]{0,80}<\/w:r>[^<]{0,80})<\/w:t>/g)) {
  console.log(' ', JSON.stringify(m[1]).slice(0, 120));
}
const idx = appt.xml.indexOf('</w:r><w:r');
console.log('literal tag in text?', idx, appt.xml.slice(Math.max(0, idx - 100), idx + 150).replace(/\s+/g, ' '));

// Count empty paras before Benefits
const apptParas = [...appt.xml.matchAll(/<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((m) => {
  const p = m[0];
  const t = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join('');
  return t.replace(/\s+/g, ' ').trim();
});
const ben = apptParas.findIndex((t) => t === 'Benefits');
console.log('empties before Benefits', apptParas.slice(Math.max(0, ben - 10), ben));
