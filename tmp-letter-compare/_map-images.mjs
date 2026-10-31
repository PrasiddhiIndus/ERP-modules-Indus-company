import fs from 'fs';
import PizZip from 'pizzip';
import sharp from 'sharp';

const path = process.argv[2] || 'public/templates/admin-recruitment/offer-letter.docx';
const z = new PizZip(fs.readFileSync(path));

function embeds(xml) {
  return [...String(xml || '').matchAll(/r:embed="(rId\d+)"/g)].map((m) => m[1]);
}

async function meta(name) {
  const f = z.file(name);
  if (!f) return null;
  const buf = f.asNodeBuffer();
  try {
    const m = await sharp(buf).metadata();
    return `${m.width}x${m.height} ${m.format} ${buf.length}b`;
  } catch {
    return `raw ${buf.length}b`;
  }
}

console.log('FILE', path);
for (const k of Object.keys(z.files).filter((x) => x.startsWith('word/media/'))) {
  console.log(' media', k, await meta(k));
}

const docRels = z.file('word/_rels/document.xml.rels')?.asText() || '';
const map = Object.fromEntries(
  [...docRels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]])
);
console.log(' document image embeds:', embeds(z.file('word/document.xml')?.asText()).map((id) => `${id}->${map[id]}`));

for (const part of ['header1', 'footer1']) {
  const xml = z.file(`word/${part}.xml`)?.asText();
  const rels = z.file(`word/_rels/${part}.xml.rels`)?.asText() || '';
  const rmap = Object.fromEntries(
    [...rels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]])
  );
  console.log(
    ` ${part} embeds:`,
    embeds(xml).map((id) => `${id}->${rmap[id]}`)
  );
}
