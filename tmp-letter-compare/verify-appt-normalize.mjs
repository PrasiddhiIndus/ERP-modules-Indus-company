import fs from 'fs';
import PizZip from 'pizzip';
import { convertDocxBufferToPdf, buildAppointmentLetterDocx } from '../server/adminRecruitmentLetterDocs.js';

// Unit-check normalize path by reading template, simulating fill of name, running through convertDocxBufferToPdf's appointment branch markers.
const raw = fs.readFileSync('public/templates/admin-recruitment/appointment-letter.docx');
const zip0 = new PizZip(raw);
let xml = zip0.file('word/document.xml').asText().replaceAll('{{CANDIDATE_NAME}}', 'Rahul Raj');
zip0.file('word/document.xml', xml);
const filledLike = zip0.generate({ type: 'nodebuffer' });

// Import normalize indirectly: convertDocxBufferToPdf always normalizes appointment buffers first.
// We only need the normalized docx — monkey by calling build path helpers via re-read of module source is heavy.
// Instead duplicate a light check: re-apply by importing file and using Function? Simpler: patch filledLike through the same public build if possible.

const appt = {
  appointment_ref: 'IFSPL/APT/2026/00099',
  joining_date: '2026-11-02',
  location: 'Banglore',
  reporting_to: 'Manager',
};
const offer = {
  offer_ref: 'IFSPL/OFR/2026/00006',
  joining_date: '2026-11-02',
  work_location: 'Banglore',
  designation: 'data analyst',
  annual_ctc: 1348560,
  salary_structure: null,
};
const candidate = {
  full_name: 'Rahul Raj',
  first_name: 'Rahul',
  email: 'a@b.com',
  department: 'IT',
  address_line1: 'x',
  address_line2: '',
  address_line3: '',
};

const built = await buildAppointmentLetterDocx(appt, offer, candidate, 'Indus Fire Safety Pvt. Ltd.');
const z = new PizZip(built);
const styles = z.file('word/styles.xml').asText();
const doc = z.file('word/document.xml').asText();
const ns = styles.match(/<w:style[^>]*w:styleId="NoSpacing"[\s\S]*?<\/w:style>/)[0];
const nameIdx = doc.indexOf('Rahul Raj');
// find the name occurrence before Annexure - I
const annexIdx = doc.indexOf('<w:t>Annexure - I</w:t>');
const beforeAnnex = doc.slice(0, annexIdx);
const lastRahul = beforeAnnex.lastIndexOf('Rahul Raj');
const namePara = doc.slice(doc.lastIndexOf('<w:p ', lastRahul), doc.indexOf('</w:p>', lastRahul) + 6);

console.log('built bytes', built.length);
console.log('NoSpacing spacing?', /w:spacing/.test(ns));
console.log('name before annex tabs', (namePara.match(/<w:tab\/>/g) || []).length);
console.log('name jc', (namePara.match(/<w:jc[^/]*\/>/) || [])[0]);
console.log('name pbb', /w:pageBreakBefore/.test(namePara));
console.log('conveyance healthy paras', (() => {
  const i = doc.indexOf('{{CONVEYANCE_M}}') >= 0 ? doc.indexOf('{{CONVEYANCE_M}}') : doc.indexOf('Conveyance Allowance');
  const tr = doc.slice(doc.lastIndexOf('<w:tr', i), doc.indexOf('</w:tr>', i) + 7);
  return (tr.match(/<w:p\b/g) || []).length;
})());
