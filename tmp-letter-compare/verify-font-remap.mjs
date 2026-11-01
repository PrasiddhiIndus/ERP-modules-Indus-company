import fs from 'fs';
import PizZip from 'pizzip';

// Import remap by forcing LO path internals — call convert with mocked soffice is hard.
// Replicate remap list and assert the user DOCX would lose Microsoft-only fonts.
const REMAP = [
  ['Aptos Narrow', 'Liberation Sans Narrow'],
  ['Aptos Display', 'Liberation Sans'],
  ['Aptos', 'Liberation Sans'],
  ['Cambria Math', 'Liberation Serif'],
  ['Cambria', 'Caladea'],
  ['Calibri Light', 'Carlito'],
  ['Calibri', 'Carlito'],
];

const docxPath = 'C:/Users/Amit/Downloads/Appointment-IFSPL-APT-2026-00008.docx';
const zip = new PizZip(fs.readFileSync(docxPath));
let changed = 0;
for (const name of Object.keys(zip.files)) {
  if (!/^word\/.+\.xml$/i.test(name) || zip.files[name].dir) continue;
  let xml = zip.file(name).asText();
  const before = xml;
  for (const [from, to] of REMAP) xml = xml.split(from).join(to);
  if (xml !== before) {
    zip.file(name, xml);
    changed += 1;
  }
}
const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync('tmp-letter-compare/user-appt-font-remapped.docx', out);

const doc = new PizZip(out).file('word/document.xml').asText();
const leftover = ['Aptos Narrow', 'Aptos Display', 'Cambria', 'Calibri'].filter((f) => doc.includes(f));
const present = ['Liberation Sans Narrow', 'Caladea', 'Carlito', 'Montserrat'].filter((f) =>
  doc.includes(f)
);
console.log({ changedFiles: changed, leftover, present, outBytes: out.length });
if (leftover.length) {
  console.error('FAIL leftover Microsoft fonts', leftover);
  process.exit(1);
}
if (!present.includes('Liberation Sans Narrow') || !present.includes('Caladea')) {
  console.error('FAIL expected substitute fonts missing', present);
  process.exit(1);
}

const fontsDir = 'server/assets/letter-fonts';
const needed = [
  'Caladea-Regular.ttf',
  'Caladea-Bold.ttf',
  'Carlito-Regular.ttf',
  'Carlito-Bold.ttf',
  'LiberationSansNarrow-Regular.ttf',
  'LiberationSansNarrow-Bold.ttf',
  'LiberationSans-Regular.ttf',
  'Montserrat-Regular.ttf',
];
const missing = needed.filter((n) => !fs.existsSync(`${fontsDir}/${n}`));
if (missing.length) {
  console.error('FAIL missing bundled fonts', missing);
  process.exit(1);
}
console.log('PASS font remap + bundled fonts ready for LibreOffice');
