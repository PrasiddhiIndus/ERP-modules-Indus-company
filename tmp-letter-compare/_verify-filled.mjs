import fs from 'fs';
import PizZip from 'pizzip';
import sharp from 'sharp';

const z = new PizZip(fs.readFileSync('tmp-letter-compare/offer-built-now.docx'));
console.log('header rels', z.file('word/_rels/header1.xml.rels').asText());
console.log(
  'doc image targets',
  [...z.file('word/_rels/document.xml.rels').asText().matchAll(/Target="([^"]*image[^"]*)"/g)].map((m) => m[1])
);
for (const k of ['word/media/image1.png', 'word/media/image2.png', 'word/media/image3.png']) {
  const m = await sharp(z.file(k).asNodeBuffer()).metadata();
  console.log(k, `${m.width}x${m.height}`);
}
const flat = z.file('word/document.xml').asText().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
console.log('sincerely..accept snippet:');
const i = flat.indexOf('Yours sincerely');
console.log(flat.slice(i, i + 280));
