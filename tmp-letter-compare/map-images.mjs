import fs from 'fs';
import PizZip from 'pizzip';
import { PNG } from 'pngjs/browser'; // may not exist

const buf = fs.readFileSync('tmp-letter-compare/apt.docx');
const z = new PizZip(buf);

for (const part of ['header1', 'footer1', 'document']) {
  const rels = z.file(`word/_rels/${part}.xml.rels`)?.asText() || '';
  console.log('\n', part, 'rels:');
  console.log(rels);
}

// PNG dimensions via sharp if available
import sharp from 'sharp';
for (const name of ['word/media/image2.png', 'word/media/image3.png', 'word/media/image4.png']) {
  const raw = Buffer.from(z.file(name).asUint8Array());
  const meta = await sharp(raw).metadata();
  console.log(name, meta.width, 'x', meta.height);
  fs.writeFileSync(`tmp-letter-compare/${name.split('/').pop()}`, raw);
}
