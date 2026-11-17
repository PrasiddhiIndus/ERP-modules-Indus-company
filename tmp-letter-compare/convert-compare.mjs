/**
 * Convert the user's appointment DOCX via Word COM and LibreOffice, then report page counts.
 */
import fs from 'fs';
import path from 'path';
import {
  convertDocxBufferToPdf,
  prepareAppointmentDocxForLibreOffice,
} from '../server/adminRecruitmentLetterDocs.js';

const src = path.resolve('tmp-letter-compare/apt.docx');
const buf = fs.readFileSync(src);

async function meta(pdfPath) {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.load(fs.readFileSync(pdfPath));
  return { pages: pdf.getPageCount() };
}

// Word-preferred path (no FORCE)
delete process.env.FORCE_LIBREOFFICE_PDF;
const wordPdf = await convertDocxBufferToPdf(buf, 'appointment-letter-word');
if (wordPdf) {
  fs.writeFileSync('tmp-letter-compare/apt-word.pdf', wordPdf);
  console.log('Word/Graph path', await meta('tmp-letter-compare/apt-word.pdf'), wordPdf.length);
} else {
  console.log('Word/Graph path failed');
}

// Force LibreOffice
process.env.FORCE_LIBREOFFICE_PDF = '1';
const loPrepared = prepareAppointmentDocxForLibreOffice(buf);
fs.writeFileSync('tmp-letter-compare/apt-lo-prepared.docx', loPrepared);
const loPdf = await convertDocxBufferToPdf(buf, 'appointment-letter-lo');
if (loPdf) {
  fs.writeFileSync('tmp-letter-compare/apt-lo-fresh.pdf', loPdf);
  console.log('LibreOffice path', await meta('tmp-letter-compare/apt-lo-fresh.pdf'), loPdf.length);
} else {
  console.log('LibreOffice path failed');
}
