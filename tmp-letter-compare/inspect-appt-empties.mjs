import fs from 'fs';
import PizZip from 'pizzip';

const path = 'public/templates/admin-recruitment/appointment-letter.docx';
const zip = new PizZip(fs.readFileSync(path));
const xml = zip.file('word/document.xml').asText();
const re = /<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
const list = [];
let m;
while ((m = re.exec(xml))) {
  const p = m[0];
  const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join('');
  const selfClose = /\/>$/.test(p) && !p.includes('</w:p>');
  list.push({
    text: texts.replace(/\s+/g, ' ').trim().slice(0, 90),
    empty: selfClose || (!texts.trim() && !/w:drawing|w:pict|v:imagedata/.test(p)),
    pbb: /w:pageBreakBefore/.test(p),
    before: Number((p.match(/w:before="(\d+)"/) || [])[1] || 0),
    after: Number((p.match(/w:after="(\d+)"/) || [])[1] || 0),
  });
}

console.log('total paras', list.length, 'empty', list.filter((p) => p.empty).length, 'pbb', list.filter((p) => p.pbb).length);

// Find annexure II and acknowledgement
for (const needle of ['Annexure II', 'Annexure - I', 'I hereby acknowledge', 'Yours sincerely', 'COMPENSATION']) {
  const i = list.findIndex((p) => p.text.includes(needle) || p.text === needle);
  console.log('\n--- around', needle, '@', i);
  if (i < 0) continue;
  for (let j = Math.max(0, i - 8); j < Math.min(list.length, i + 5); j++) {
    const p = list[j];
    console.log(String(j).padStart(3), p.empty ? 'E' : 'T', p.pbb ? 'PBB' : '   ', `b${p.before}/a${p.after}`, '|', p.text);
  }
}

// Longest empty runs with context
let runStart = -1;
let run = 0;
const runs = [];
for (let i = 0; i <= list.length; i++) {
  if (i < list.length && list[i].empty) {
    if (run === 0) runStart = i;
    run++;
  } else if (run > 0) {
    runs.push({ start: runStart, len: run, before: list[runStart - 1]?.text, after: list[i]?.text });
    run = 0;
  }
}
runs.sort((a, b) => b.len - a.len);
console.log('\nTop empty runs:');
runs.slice(0, 8).forEach((r) => console.log(r));
