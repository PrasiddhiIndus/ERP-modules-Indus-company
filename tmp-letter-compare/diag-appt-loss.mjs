import fs from 'fs';
import PizZip from 'pizzip';
import {
  buildAppointmentLetterDocx,
} from '../server/adminRecruitmentLetterDocs.js';

const tpl = new PizZip(fs.readFileSync('public/templates/admin-recruitment/appointment-letter.docx'))
  .file('word/document.xml')
  .asText();
console.log(
  'template len',
  tpl.length,
  'dear',
  tpl.includes('Dear'),
  'ack',
  tpl.includes('acknowledge'),
  'annex',
  tpl.indexOf('Annexure - I'),
  'candName count',
  (tpl.match(/\{\{CANDIDATE_NAME\}\}/g) || []).length
);

const built = await buildAppointmentLetterDocx(
  {
    appointment_ref: 'IFSPL/APT/2026/00005',
    joining_date: '2026-11-02',
    location: 'Banglore',
    reporting_to: 'Amit',
  },
  {
    offer_ref: 'x',
    joining_date: '2026-11-02',
    work_location: 'Banglore',
    designation: 'data analyst',
    annual_ctc: 1440000,
    salary_structure: null,
  },
  {
    full_name: 'Rahul Raj',
    first_name: 'Rahul',
    email: 'a@b.com',
    department: 'IT',
    address_line1: 'Banglore',
    address_line2: '',
    address_line3: '',
  },
  'Indus Fire Safety Private Limited'
);
fs.writeFileSync('tmp-letter-compare/appt-built-fixed.docx', built);
const doc = new PizZip(built).file('word/document.xml').asText();
console.log(
  'built len',
  doc.length,
  'dear',
  doc.includes('Dear'),
  'ack',
  doc.includes('acknowledge'),
  'Welcome',
  doc.includes('Welcome'),
  'annex',
  doc.indexOf('Annexure - I')
);
console.log('built head texts', [...doc.slice(0, 8000).matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).slice(0, 40));
