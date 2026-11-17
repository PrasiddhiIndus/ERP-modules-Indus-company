import fs from 'fs';
import PizZip from 'pizzip';

const files = [
  'tmp-letter-compare/apt.docx',
  'tmp-letter-compare/Appointment-IFSPL-APT-2026-00014.docx',
  'tmp-letter-compare/user-appointment.docx',
  'tmp-letter-compare/exact-appt.docx',
  'tmp-letter-compare/apt-footer-fixed.pdf',
  'c:/Users/P1/.cursor/projects/d-ERP-modules-Indus-company/attachments/b97a16f6-0e80-44ed-bf54-ff15a8e3af36/Appointment-IFSPL-APT-2026-00015__1_.pdf',
];

function pdfMediaBoxes(buf) {
  const s = buf.toString('latin1');
  return [...s.matchAll(/MediaBox\s*\[\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\]/g)]
    .map((m) => m.slice(1).map(Number));
}

for (const f of files) {
  if (!fs.existsSync(f)) {
    console.log('missing', f);
    continue;
  }
  const buf = fs.readFileSync(f);
  console.log('\n====', f, 'bytes', buf.length);
  if (f.endsWith('.pdf')) {
    const boxes = pdfMediaBoxes(buf);
    console.log('mediaBoxes unique', [...new Set(boxes.map((b) => b.join('x')))]);
    console.log('page count approx', (buf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length);
    continue;
  }
  const z = new PizZip(buf);
  const body = z.file('word/document.xml')?.asText() || '';
  console.log('pgSz', [...body.matchAll(/<w:pgSz\b[^/]*\/>/g)].map((m) => m[0]));
  console.log('pgMar', [...body.matchAll(/<w:pgMar\b[^/]*\/>/g)].map((m) => m[0]).slice(0, 2));
  const foot = z.file('word/footer1.xml')?.asText() || '';
  console.log('footer widths', [...foot.matchAll(/width:[0-9.]+pt/g)].map((m) => m[0]));
  console.log('footer margin-left', [...foot.matchAll(/margin-left:-?[0-9.]+/g)].map((m) => m[0]).slice(0, 5));
}

const png = fs.readFileSync('server/assets/appointment-footer-full.png');
console.log('\nfooter png wh', png.readUInt32BE(16), png.readUInt32BE(20));
console.log('at 150dpi pt', (png.readUInt32BE(16) * 72) / 150, (png.readUInt32BE(20) * 72) / 150);
