/**
 * Force LibreOffice conversion of the user appointment DOCX and assert 4 pages
 * (matching Word), with no isolated name-only page.
 *
 *   set FORCE_LIBREOFFICE_PDF=1
 *   node tmp-letter-compare/verify-lo-fix.mjs
 */
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { convertDocxBufferToPdf } from '../server/adminRecruitmentLetterDocs.js';

const docxPath =
  process.argv[2] || 'C:/Users/Amit/Downloads/Appointment-IFSPL-APT-2026-00008.docx';
const outPdf = 'tmp-letter-compare/user-appt-lo-fixed.pdf';

process.env.FORCE_LIBREOFFICE_PDF = '1';

const buf = fs.readFileSync(docxPath);
console.log('DOCX', docxPath, buf.length);
const pdf = await convertDocxBufferToPdf(buf, 'Appointment-IFSPL-APT-2026-00008');
if (!pdf) {
  console.error('LibreOffice conversion returned null');
  process.exit(1);
}
fs.writeFileSync(outPdf, pdf);

const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
const pages = doc.getPageCount();
const raw = pdf.toString('latin1');
const fonts = [...new Set([...raw.matchAll(/\/BaseFont\s*\/([^\s\/\[]+)/g)].map((m) => m[1]))];
console.log('pages', pages, 'bytes', pdf.length);
console.log('fonts', fonts.sort());

const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
const pdfDoc = await getDocument({ data: new Uint8Array(pdf), disableWorker: true }).promise;
const summaries = [];
for (let p = 1; p <= pdfDoc.numPages; p++) {
  const page = await pdfDoc.getPage(p);
  const text = await page.getTextContent();
  const items = text.items.filter((it) => it.str && it.str.trim());
  const joined = items.map((it) => it.str).join(' ').replace(/\s+/g, ' ');
  summaries.push({ p, n: items.length, head: joined.slice(0, 100) });
  console.log(`p${p} items=${items.length} ${joined.slice(0, 120)}`);
}

const nameOnly = summaries.filter((s) => s.n <= 3 && /Amit|tesst/i.test(s.head));
if (pages !== 4) {
  console.error('FAIL expected 4 pages, got', pages);
  process.exit(1);
}
if (nameOnly.length) {
  console.error('FAIL isolated name page(s)', nameOnly);
  process.exit(1);
}
console.log('PASS LibreOffice appointment PDF is 4 pages without isolated name page');
console.log('wrote', outPdf);
