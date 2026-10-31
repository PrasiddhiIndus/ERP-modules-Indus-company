import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfPath =
  process.env.USERPROFILE +
  '\\Downloads\\Appointment-IFSPL-APT-2026-00005.pdf';

async function main() {
  let getDocument;
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    getDocument = pdfjs.getDocument;
  } catch (e) {
    try {
      const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
      getDocument = pdfjs.getDocument;
    } catch (e2) {
      console.error('pdfjs load failed', e.message, e2.message);
      process.exit(1);
    }
  }

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await getDocument({ data, disableWorker: true }).promise;
  console.log('pages', doc.numPages);

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const text = await page.getTextContent();
    const items = text.items.filter((it) => it.str && String(it.str).trim());
    const ys = items.map((it) => it.transform[5]);
    const minY = ys.length ? Math.min(...ys) : null;
    const maxY = ys.length ? Math.max(...ys) : null;
    const first = items.slice(0, 5).map((it) => ({
      str: it.str,
      x: Math.round(it.transform[4]),
      y: Math.round(it.transform[5]),
    }));
    const last = items.slice(-5).map((it) => ({
      str: it.str,
      x: Math.round(it.transform[4]),
      y: Math.round(it.transform[5]),
    }));
    console.log('\n=== page', p, 'size', Math.round(viewport.width), 'x', Math.round(viewport.height));
    console.log('text items', items.length, 'yRange', minY != null ? `${Math.round(minY)}..${Math.round(maxY)}` : 'none');
    console.log('first', first);
    console.log('last', last);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
