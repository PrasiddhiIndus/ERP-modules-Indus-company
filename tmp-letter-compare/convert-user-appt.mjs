import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { convertDocxBufferToPdf } from '../server/adminRecruitmentLetterDocs.js';

const require = createRequire(import.meta.url);
const docxPath =
  process.argv[2] || 'C:/Users/Amit/Downloads/Appointment-IFSPL-APT-2026-00008.docx';
const outPdf = process.argv[3] || 'tmp-letter-compare/user-appt-converted.pdf';

const buf = fs.readFileSync(docxPath);
console.log('converting', docxPath, 'bytes', buf.length);
const started = Date.now();
const pdf = await convertDocxBufferToPdf(buf, 'Appointment-IFSPL-APT-2026-00008');
console.log('elapsed ms', Date.now() - started);
if (!pdf) {
  console.error('conversion returned null');
  process.exit(1);
}
fs.writeFileSync(outPdf, pdf);
console.log('wrote', outPdf, 'bytes', pdf.length);

async function pagesOf(pdfPath) {
  let getDocument;
  try {
    ({ getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs'));
  } catch {
    try {
      ({ getDocument } = require('pdfjs-dist/legacy/build/pdf.js'));
    } catch {
      const { pathToFileURL } = require('url');
      const m = await import(
        pathToFileURL(path.join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href
      );
      getDocument = m.getDocument;
    }
  }
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await getDocument({ data, disableWorker: true }).promise;
  console.log(path.basename(pdfPath), 'pages', doc.numPages);
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const text = await page.getTextContent();
    const items = text.items.filter((it) => it.str && it.str.trim());
    console.log(
      `  p${p} items=${items.length} first="${items[0]?.str?.slice(0, 50) || ''}" last="${items.at(-1)?.str?.slice(0, 50) || ''}"`
    );
  }
}

await pagesOf(outPdf);
