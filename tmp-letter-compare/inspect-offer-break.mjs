import fs from 'fs';
import PizZip from 'pizzip';

const path = process.argv[2] || 'public/templates/admin-recruitment/offer-letter.docx';
const zip = new PizZip(fs.readFileSync(path));
const xml = zip.file('word/document.xml').asText();
console.log('file', path, 'len', xml.length);

const idx = xml.indexOf('Annexure');
console.log('Annexure idx', idx);
if (idx >= 0) {
  console.log('--- before Annexure ---');
  console.log(xml.slice(Math.max(0, idx - 1500), idx + 120));
}

for (const pat of ['w:type="page"', 'w:type="nextPage"', 'w:pageBreakBefore', 'lastRenderedPageBreak', 'w:br ']) {
  let n = 0;
  let i = 0;
  while ((i = xml.indexOf(pat, i)) >= 0) {
    n++;
    if (n <= 8) console.log(pat, '@', i, xml.slice(Math.max(0, i - 80), i + 60).replace(/\s+/g, ' '));
    i += pat.length;
  }
  console.log(pat, 'count', n);
}

// Section properties / page size / margins
const sects = [...xml.matchAll(/<w:sectPr[\s\S]*?<\/w:sectPr>/g)];
console.log('sectPr count', sects.length);
sects.forEach((m, i) => {
  console.log('sect', i, m[0].replace(/\s+/g, ' ').slice(0, 500));
});

// Paragraphs with large spacing before/after near annexure
const slice = xml.slice(Math.max(0, idx - 4000), idx + 800);
const spacings = [...slice.matchAll(/w:spacing[^/]*\/>/g)].map((m) => m[0]);
console.log('spacings near annexure', spacings);

// List paragraph texts around accept → annexure
const texts = [];
for (const m of slice.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)) {
  texts.push(m[1]);
}
console.log('texts near annexure:', texts.join('|'));

// Headers
for (const name of Object.keys(zip.files)) {
  if (!/^word\/(header|footer)/i.test(name)) continue;
  const hx = zip.file(name).asText();
  console.log(name, 'len', hx.length, 'hasTbl', hx.includes('<w:tbl'), 'hasPict', hx.includes('drawing') || hx.includes('pict'));
  const sp = [...hx.matchAll(/w:(?:pgSz|pgMar|header|footer|spacing)[^/]*\/>/g)].map((x) => x[0]);
  if (sp.length) console.log('  props', sp.slice(0, 10));
}
