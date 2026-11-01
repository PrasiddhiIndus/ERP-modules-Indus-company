import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { convertDocxBufferToPdf } from '../server/adminRecruitmentLetterDocs.js';

const remapped = fs.readFileSync('tmp-letter-compare/user-appt-font-remapped.docx');
const pdf = await convertDocxBufferToPdf(remapped, 'Appointment-font-remap-check');
if (!pdf) {
  console.error('null pdf');
  process.exit(1);
}
fs.writeFileSync('tmp-letter-compare/user-appt-font-remapped-word.pdf', pdf);
const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
const raw = pdf.toString('latin1');
const fonts = [...new Set([...raw.matchAll(/\/BaseFont\s*\/([^\s\/\[]+)/g)].map((m) => m[1]))];
console.log('pages', doc.getPageCount(), 'bytes', pdf.length);
console.log('fonts', fonts.sort());
if (doc.getPageCount() !== 4) {
  console.error('FAIL expected 4 pages with metric-compatible fonts');
  process.exit(1);
}
console.log('PASS remapped DOCX still prints as 4 pages via Word');
