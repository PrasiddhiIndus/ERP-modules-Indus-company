import fs from 'fs';
import PizZip from 'pizzip';
import sharp from 'sharp';

const z = new PizZip(fs.readFileSync('tmp-letter-compare/apt.docx'));
const doc = z.file('word/document.xml').asText();
const sect = [...doc.matchAll(/<w:headerReference[^/]*\/>|<w:footerReference[^/]*\/>/g)].map((m) => m[0]);
console.log('sect refs', sect);
console.log('body pict count', (doc.match(/w:pict/g) || []).length);
console.log('body drawing count', (doc.match(/w:drawing/g) || []).length);
console.log('titlePg', /w:titlePg/.test(doc));

const rels = z.file('word/_rels/document.xml.rels').asText();
console.log(rels);

for (const name of ['word/media/image2.png', 'word/media/image3.png', 'word/media/image4.png']) {
  const raw = Buffer.from(z.file(name).asUint8Array());
  const meta = await sharp(raw).metadata();
  console.log(name, meta.width, 'x', meta.height);
  await sharp(raw).png().toFile(`tmp-letter-compare/${name.split('/').pop()}`);
}

// Where is image2 used?
for (const f of ['word/document.xml', 'word/header1.xml', 'word/footer1.xml']) {
  const relName = f.replace('word/', 'word/_rels/') + '.rels';
  const r = z.file(relName)?.asText() || '';
  console.log('\n', relName, '->', r.match(/Target="[^"]+"/g));
}
