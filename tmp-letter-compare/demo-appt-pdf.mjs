/**
 * Demo: build appointment letter for CAN-000012-like data, convert to PDF,
 * and compare page text density with the user-uploaded production PDF.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import {
  buildAppointmentLetterDocx,
  convertDocxBufferToPdf,
} from '../server/adminRecruitmentLetterDocs.js';

const require = createRequire(import.meta.url);
const OUT = 'tmp-letter-compare';

const appt = {
  appointment_ref: 'IFSPL/APT/2026/00008',
  joining_date: '2026-11-02',
  location: 'Head Office, Vadodara',
  reporting_to: 'HR Manager',
};
const offer = {
  offer_ref: 'IFSPL/OFR/2026/00008',
  joining_date: '2026-11-02',
  work_location: 'Head Office, Vadodara',
  designation: 'IT',
  annual_ctc: 1066656,
  salary_structure: {
    basic_monthly: 41000,
    hra_monthly: 16400,
    conveyance_monthly: 0,
    medical_monthly: 0,
    bonus_monthly: 0,
    gross_monthly: 81999,
    employee_pf_monthly: 3000,
    ptax_monthly: 200,
    employee_esic_monthly: 0,
    take_home_monthly: 78799,
    employer_pf_monthly: 3250,
    employer_esic_monthly: 0,
    gratuity_monthly: 1972,
    ex_gratia_monthly: 1667,
    part_b_monthly: 6889,
    ctc_monthly: 88888,
    ctc_annual: 1066656,
  },
};
const candidate = {
  full_name: 'Amit tesstttttttt',
  first_name: 'Amit',
  email: 'a@b.com',
  department: 'Business Analyst',
  address_line1: '',
  address_line2: '',
  address_line3: '',
};

async function pageSummary(pdfPath) {
  let getDocument;
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    getDocument = pdfjs.getDocument;
  } catch {
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    getDocument = pdfjs.getDocument;
  }
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await getDocument({ data, disableWorker: true }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const text = await page.getTextContent();
    const items = text.items.filter((it) => it.str && String(it.str).trim());
    const joined = items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
    pages.push({
      page: p,
      items: items.length,
      preview: joined.slice(0, 120),
      sparse: items.length > 0 && items.length <= 8,
    });
  }
  return { numPages: doc.numPages, pages };
}

const built = await buildAppointmentLetterDocx(
  appt,
  offer,
  candidate,
  'Indus Fire Safety Private Limited'
);
const docxPath = path.join(OUT, 'demo-appt-built.docx');
fs.writeFileSync(docxPath, built);
console.log('wrote', docxPath, built.length, 'bytes');

const pdf = await convertDocxBufferToPdf(built, 'Appointment-demo');
if (!pdf) {
  console.error('PDF conversion returned null (Word/LibreOffice/Graph unavailable?)');
  process.exit(1);
}
const pdfPath = path.join(OUT, 'demo-appt-built.pdf');
fs.writeFileSync(pdfPath, pdf);
console.log('wrote', pdfPath, pdf.length, 'bytes');

const demo = await pageSummary(pdfPath);
console.log('\n=== DEMO PDF (local Word/LibreOffice convert) ===');
console.log('pages', demo.numPages);
for (const p of demo.pages) {
  console.log(
    `p${p.page}: items=${p.items}${p.sparse ? ' SPARSE' : ''} | ${p.preview}`
  );
}

const uploaded =
  process.env.USERPROFILE +
  '\\.cursor\\projects\\c-Users-Amit-Desktop-ERP-modules-Indus-company\\attachments\\c81621b4-00df-488e-8465-de693f7dd325\\Appointment-IFSPL-APT-2026-00008.pdf';
if (fs.existsSync(uploaded)) {
  const prod = await pageSummary(uploaded);
  console.log('\n=== PRODUCTION UPLOADED PDF ===');
  console.log('pages', prod.numPages);
  for (const p of prod.pages) {
    console.log(
      `p${p.page}: items=${p.items}${p.sparse ? ' SPARSE' : ''} | ${p.preview}`
    );
  }
} else {
  console.log('uploaded PDF not found at', uploaded);
}
