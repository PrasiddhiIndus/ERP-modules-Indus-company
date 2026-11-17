import fs from 'fs';
import PizZip from 'pizzip';

const buf = fs.readFileSync('tmp-letter-compare/apt.docx');
const z = new PizZip(buf);
console.log(
  'files',
  Object.keys(z.files).filter((f) => /header|footer|media|document/.test(f)),
);

for (const name of ['word/header1.xml', 'word/footer1.xml']) {
  const t = z.file(name)?.asText() || '';
  fs.writeFileSync(`tmp-letter-compare/${name.replace(/\//g, '_')}`, t);
  console.log(`\n==== ${name} len ${t.length}`);
  const widths = [...t.matchAll(/width:([0-9.]+)pt/g)].map((m) => m[1]);
  const heights = [...t.matchAll(/height:([0-9.]+)pt/g)].map((m) => m[1]);
  const mleft = [...t.matchAll(/margin-left:(-?[0-9.]+)pt/g)].map((m) => m[1]);
  const mtop = [...t.matchAll(/margin-top:(-?[0-9.]+)pt/g)].map((m) => m[1]);
  console.log({ widths, heights, mleft, mtop });
  console.log('has pict', /w:pict|v:imagedata|w:drawing/.test(t));
}

const doc = z.file('word/document.xml').asText();
const ax = doc.indexOf('Annexure II');
const chunk = doc.slice(ax, ax + 30000);
// Find table rows after Annexure II with Department
const deptIdx = chunk.indexOf('>Department<');
console.log('\nDepartment idx', deptIdx);
if (deptIdx >= 0) {
  // find enclosing <w:tr>
  const trStart = chunk.lastIndexOf('<w:tr', deptIdx);
  const nextTr = chunk.indexOf('<w:tr', deptIdx + 1);
  const tr = chunk.slice(trStart, nextTr > 0 ? nextTr : trStart + 4000);
  const paras = [...tr.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)];
  console.log(
    'Department row paras',
    paras.map((p) => {
      const text = [...p[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
      return JSON.stringify(text);
    }),
  );
}
const desIdx = chunk.indexOf('>Designation<');
if (desIdx >= 0) {
  const trStart = chunk.lastIndexOf('<w:tr', desIdx);
  const nextTr = chunk.indexOf('<w:tr', desIdx + 1);
  const tr = chunk.slice(trStart, nextTr > 0 ? nextTr : trStart + 4000);
  const paras = [...tr.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)];
  console.log(
    'Designation row paras',
    paras.map((p) => {
      const text = [...p[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
      return JSON.stringify(text);
    }),
  );
}

// media sizes
for (const name of Object.keys(z.files).filter((f) => f.startsWith('word/media/'))) {
  const raw = z.file(name).asUint8Array();
  console.log(name, raw.length);
}
