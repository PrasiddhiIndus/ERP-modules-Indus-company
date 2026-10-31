import fs from 'fs';
import PizZip from 'pizzip';

const path = process.argv[2] || 'public/templates/admin-recruitment/offer-letter.docx';
const zip = new PizZip(fs.readFileSync(path));
const xml = zip.file('word/document.xml').asText();

// Extract readable paragraph stream with spacing / pageBreakBefore
const paras = [];
for (const m of xml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)) {
  const p = m[0];
  const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join('');
  const spacing = (p.match(/<w:spacing[^/]*\/>/) || [])[0] || '';
  const pbb = /w:pageBreakBefore/.test(p);
  const keep = /w:keepNext/.test(p) || /w:keepLines/.test(p);
  const hasBr = /<w:br\b/.test(p);
  const hasDrawing = /w:drawing|v:imagedata|w:pict/.test(p);
  paras.push({
    text: texts.replace(/\s+/g, ' ').trim().slice(0, 100),
    spacing,
    pbb,
    keep,
    hasBr,
    hasDrawing,
    empty: !texts.trim() && !hasDrawing,
    len: p.length,
  });
}

console.log('total paras', paras.length);
const start = paras.findIndex((p) => /Yours sincerely/i.test(p.text));
const annexHeading = paras.findIndex((p, i) => i > start && /^Annexure A$/i.test(p.text));
console.log('sincerely@', start, 'annexHeading@', annexHeading);

const from = Math.max(0, start - 2);
const to = Math.min(paras.length, (annexHeading >= 0 ? annexHeading : start) + 8);
for (let i = from; i < to; i++) {
  const p = paras[i];
  console.log(
    String(i).padStart(3),
    p.empty ? 'EMPTY' : p.hasDrawing ? 'IMG' : 'TXT ',
    p.pbb ? 'PBB' : '   ',
    p.keep ? 'KEEP' : '    ',
    p.hasBr ? 'BR' : '  ',
    (p.spacing || '').slice(0, 70),
    '|',
    p.text || (p.hasDrawing ? '[drawing]' : '')
  );
}

// Also dump header height clues
const hdr = zip.file('word/header1.xml').asText();
const extents = [...hdr.matchAll(/cy="(\d+)"/g)].map((m) => Number(m[1]));
const cx = [...hdr.matchAll(/cx="(\d+)"/g)].map((m) => Number(m[1]));
console.log('header extents cy(EMU)', extents, '→ inches', extents.map((e) => (e / 914400).toFixed(2)));
console.log('header extents cx(EMU)', cx, '→ inches', cx.map((e) => (e / 914400).toFixed(2)));

const ftr = zip.file('word/footer1.xml').asText();
const fcy = [...ftr.matchAll(/cy="(\d+)"/g)].map((m) => Number(m[1]));
console.log('footer extents cy', fcy, '→ inches', fcy.map((e) => (e / 914400).toFixed(2)));

// Any floating shapes with absolute position that push content?
const abs = [...hdr.matchAll(/positionH|positionV|w:distT|w:distB|wps:|/g)];
console.log('header snippet', hdr.slice(0, 800).replace(/\s+/g, ' '));
