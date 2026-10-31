/**
 * Replace the offer-letter BODY signature (Word chromakey JPEG/PNG) with a real
 * transparent PNG so LibreOffice/Word PDF export does not show a gray rectangle.
 *
 * Never touch header/footer media — those are letterhead/footer artwork.
 * Older prepares wrongly rewrote image2 (header letterhead) as the HR signature.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import PizZip from 'pizzip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const extractDir = path.join(process.env.TEMP || process.env.TMP || '/tmp', 'ifspl-sig-cmp');
const outPng = path.join(extractDir, 'signature-transparent.png');
const assetsPng = path.join(root, 'public/templates/admin-recruitment/offer-assets/signature.png');
const letterheadPng = path.join(root, 'public/templates/admin-recruitment/offer-assets/letterhead.png');
const docxPath = path.join(root, 'public/templates/admin-recruitment/offer-letter.docx');

fs.mkdirSync(extractDir, { recursive: true });

const zip = new PizZip(fs.readFileSync(docxPath));

function relMap(relsXml) {
  return Object.fromEntries(
    [...String(relsXml || '').matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]])
  );
}

function toMediaPart(target) {
  if (!target) return null;
  if (target.startsWith('media/')) return `word/${target}`;
  if (target.startsWith('../media/')) return `word/media/${path.basename(target)}`;
  if (/^word\/media\//i.test(target)) return target;
  return null;
}

function resolveBodySignatureTarget() {
  const docXml = zip.file('word/document.xml')?.asText() || '';
  const docRels = zip.file('word/_rels/document.xml.rels')?.asText() || '';
  const imageRels = Object.fromEntries(
    [...docRels.matchAll(/Id="(rId\d+)"[^>]*Type="[^"]*\/image"[^>]*Target="([^"]+)"/g)].map((m) => [
      m[1],
      m[2],
    ])
  );
  // Also accept Target-before-Type attribute order.
  for (const m of docRels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"[^>]*Type="[^"]*\/image"/g)) {
    imageRels[m[1]] = m[2];
  }

  const referenced = [
    ...docXml.matchAll(/r:embed="(rId\d+)"/g),
    ...docXml.matchAll(/r:id="(rId\d+)"/g),
  ].map((m) => m[1]);

  for (const id of referenced) {
    const part = toMediaPart(imageRels[id]);
    if (part && zip.file(part)) return part;
  }

  const only = Object.values(imageRels).map(toMediaPart).filter((p) => p && zip.file(p));
  if (only.length === 1) return only[0];
  throw new Error('No body signature image found in offer-letter.docx');
}

function resolveHeaderLetterheadTarget() {
  const rels = zip.file('word/_rels/header1.xml.rels')?.asText() || '';
  const map = relMap(rels);
  const hdr = zip.file('word/header1.xml')?.asText() || '';
  const embeds = [...hdr.matchAll(/r:embed="(rId\d+)"/g)].map((m) => m[1]);
  for (const id of embeds) {
    const t = map[id];
    if (t && /media\//i.test(t)) {
      return t.startsWith('media/') ? `word/${t}` : `word/media/${path.basename(t)}`;
    }
  }
  return null;
}

const sigPath = resolveBodySignatureTarget();
const sigEntry = zip.file(sigPath);
if (!sigEntry) throw new Error(`Missing signature part: ${sigPath}`);
const sigBuf = sigEntry.asNodeBuffer();
const srcExtract = path.join(extractDir, path.basename(sigPath));
fs.writeFileSync(srcExtract, sigBuf);

const keyR = 0xc9;
const keyG = 0xca;
const keyB = 0xbc;

const { data, info } = await sharp(sigBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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

const pngBytes = fs.readFileSync(outPng);
const pngPart = sigPath.replace(/\.(jpeg|jpg|png)$/i, '.png');
zip.file(pngPart, pngBytes);
if (pngPart !== sigPath) zip.remove(sigPath);

function rewriteRels(relsPath) {
  const f = zip.file(relsPath);
  if (!f) return;
  let rels = f.asText();
  const oldName = path.basename(sigPath);
  const newName = path.basename(pngPart);
  if (oldName !== newName) {
    rels = rels.split(oldName).join(newName);
    zip.file(relsPath, rels);
  }
}

rewriteRels('word/_rels/document.xml.rels');

let doc = zip.file('word/document.xml').asText();
doc = doc.replace(/ chromakey="#[0-9a-fA-F]{6}"/g, '');
zip.file('word/document.xml', doc);

const headerMedia = resolveHeaderLetterheadTarget();
if (headerMedia && zip.file(headerMedia)) {
  fs.writeFileSync(letterheadPng, zip.file(headerMedia).asNodeBuffer());
}

const outDocx = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync(docxPath, outDocx);

const verify = new PizZip(fs.readFileSync(docxPath));
console.log(
  JSON.stringify(
    {
      bodySignatureWas: sigPath,
      bodySignatureNow: pngPart,
      pngBytes: fs.statSync(outPng).length,
      assetsBytes: fs.statSync(assetsPng).length,
      letterheadBytes: fs.existsSync(letterheadPng) ? fs.statSync(letterheadPng).length : 0,
      docxBytes: outDocx.length,
      media: Object.keys(verify.files).filter((k) => k.startsWith('word/media/')),
      chromakeyLeft: verify.file('word/document.xml').asText().includes('chromakey'),
    },
    null,
    2
  )
);
