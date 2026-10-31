/**
 * Replace offer-letter JPEG signature (Word chromakey) with a real transparent PNG
 * so LibreOffice/Word PDF export does not show a gray rectangle behind the stamp.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import PizZip from 'pizzip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const jpegPath = path.join(
  process.env.TEMP || process.env.TMP || '/tmp',
  'ifspl-sig-cmp',
  'image2.jpeg'
);
const outPng = path.join(process.env.TEMP || process.env.TMP || '/tmp', 'ifspl-sig-cmp', 'signature-transparent.png');
const assetsPng = path.join(root, 'public/templates/admin-recruitment/offer-assets/signature.png');
const docxPath = path.join(root, 'public/templates/admin-recruitment/offer-letter.docx');

const keyR = 0xc9;
const keyG = 0xca;
const keyB = 0xbc;

const { data, info } = await sharp(jpegPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const out = Buffer.from(data);

for (let i = 0; i < width * height; i += 1) {
  const o = i * channels;
  const r = out[o];
  const g = out[o + 1];
  const b = out[o + 2];
  const dr = r - keyR;
  const dg = g - keyG;
  const db = b - keyB;
  const dist = Math.sqrt(dr * dr + dg * dg + db * db);
  const maxc = Math.max(r, g, b);
  const minc = Math.min(r, g, b);
  const sat = maxc - minc;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const isInk = (b > r + 8 && b > g + 4 && sat > 18) || (sat > 35 && lum < 200);
  if (isInk) {
    out[o + 3] = 255;
    continue;
  }
  if (dist < 42 || (lum > 210 && sat < 28) || (lum > 185 && sat < 18 && dist < 70)) {
    const a = dist < 18 ? 0 : Math.max(0, Math.min(255, Math.round((dist - 18) * 6)));
    out[o + 3] = lum > 220 && sat < 20 ? 0 : a;
  } else if (lum > 230 && sat < 15) {
    out[o + 3] = 0;
  }
}

await sharp(out, { raw: { width, height, channels: 4 } }).png().toFile(outPng);
fs.copyFileSync(outPng, assetsPng);

const zip = new PizZip(fs.readFileSync(docxPath));
zip.file('word/media/image2.png', fs.readFileSync(outPng));
zip.remove('word/media/image2.jpeg');

let rels = zip.file('word/_rels/document.xml.rels').asText();
rels = rels.replace('media/image2.jpeg', 'media/image2.png');
zip.file('word/_rels/document.xml.rels', rels);

let doc = zip.file('word/document.xml').asText();
doc = doc.replace(/ chromakey="#c9cabc"/g, '');
zip.file('word/document.xml', doc);

const outDocx = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync(docxPath, outDocx);

const verify = new PizZip(fs.readFileSync(docxPath));
console.log(
  JSON.stringify(
    {
      pngBytes: fs.statSync(outPng).length,
      assetsBytes: fs.statSync(assetsPng).length,
      docxBytes: outDocx.length,
      media: Object.keys(verify.files).filter((k) => k.startsWith('word/media/')),
      relsHasPng: verify.file('word/_rels/document.xml.rels').asText().includes('image2.png'),
      chromakeyLeft: verify.file('word/document.xml').asText().includes('chromakey'),
    },
    null,
    2
  )
);
