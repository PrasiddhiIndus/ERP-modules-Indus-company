import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

async function tryPdfJs() {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    return pdfjs;
  } catch {
    try {
      return require('pdfjs-dist/legacy/build/pdf.js');
    } catch {
      return null;
    }
  }
}

const pdfPath = process.argv[2];
const outDir = process.argv[3] || 'tmp-letter-compare/appt-pdf-pages';
fs.mkdirSync(outDir, { recursive: true });

const pdfjs = await tryPdfJs();
if (!pdfjs) {
  console.log('no pdfjs');
  process.exit(0);
}

const data = new Uint8Array(fs.readFileSync(pdfPath));
const doc = await pdfjs.getDocument({ data, disableWorker: true }).promise;
console.log('pages', doc.numPages);
for (let i = 1; i <= doc.numPages; i += 1) {
  const page = await doc.getPage(i);
  const vp = page.getViewport({ scale: 1 });
  console.log(`page ${i} size`, vp.width, vp.height);
  const text = await page.getTextContent();
  const lines = text.items.map((t) => t.str).filter(Boolean);
  const footerish = lines.filter((t) => /Regd|GSTIN|firesafety|CIN|Vadodara/i.test(t));
  console.log(`page ${i} footer text hits`, footerish.length, footerish.slice(0, 3));
}
