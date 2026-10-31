import fs from 'fs';
import PizZip from 'pizzip';
import { buildAppointmentLetterDocx, convertDocxBufferToPdf } from '../server/adminRecruitmentLetterDocs.js';

const appt = {
  appointment_ref: 'IFSPL/APT/2026/00005',
  joining_date: '2026-11-02',
  location: 'Banglore',
  reporting_to: 'Amit Omprakash Prajapati',
};
const offer = {
  offer_ref: 'IFSPL/OFR/2026/00006',
  joining_date: '2026-11-02',
  work_location: 'Banglore',
  designation: 'data analyst',
  annual_ctc: 1440000,
  salary_structure: null,
};
const candidate = {
  full_name: 'Rahul Raj',
  first_name: 'Rahul',
  email: 'a@b.com',
  department: 'IT',
  address_line1: 'Banglore',
  address_line2: '',
  address_line3: '',
};

const built = await buildAppointmentLetterDocx(appt, offer, candidate, 'Indus Fire Safety Private Limited');
fs.writeFileSync('tmp-letter-compare/appt-built-fixed.docx', built);

const doc = new PizZip(built).file('word/document.xml').asText();
const annexIdx = doc.indexOf('<w:t>Annexure - I</w:t>');
const annexPara = doc.slice(doc.lastIndexOf('<w:p ', annexIdx), doc.indexOf('</w:p>', annexIdx) + 6);
console.log('annex pbb', /w:pageBreakBefore/.test(annexPara));

// Find body name before annex
const before = doc.slice(0, annexIdx);
const paras = [...before.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)];
for (let i = paras.length - 1; i >= 0; i--) {
  const abs = paras[i].index;
  const lastTc = before.lastIndexOf('<w:tc', abs);
  const lastTcEnd = before.lastIndexOf('</w:tc>', abs);
  if (lastTc > lastTcEnd) continue;
  const p = paras[i][0];
  const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join('');
  if (!texts.trim()) continue;
  console.log('body name-ish', texts.slice(0, 40), 'pbb', /w:pageBreakBefore/.test(p), 'tabs', (p.match(/<w:tab\/>/g) || []).length, 'jc', (p.match(/<w:jc[^/]*\/>/) || [])[0]);
  break;
}

const pdf = await convertDocxBufferToPdf(built, 'appointment-letter');
if (!pdf) {
  console.error('PDF convert failed');
  process.exit(1);
}
fs.writeFileSync('tmp-letter-compare/appt-built-fixed.pdf', pdf);

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(pdf), disableWorker: true }).promise;
console.log('FIXED pages', pdfDoc.numPages);
for (let p = 1; p <= pdfDoc.numPages; p++) {
  const page = await pdfDoc.getPage(p);
  const text = await page.getTextContent();
  const items = text.items.filter((it) => it.str && it.str.trim());
  console.log(
    `p${p}`,
    'items',
    items.length,
    'first',
    items[0]?.str?.slice(0, 50),
    'last',
    items.at(-1)?.str?.slice(0, 50)
  );
}
