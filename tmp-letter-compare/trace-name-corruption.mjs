import fs from 'fs';
import PizZip from 'pizzip';
import { buildAppointmentLetterDocx } from '../server/adminRecruitmentLetterDocs.js';

function dumpNameZone(label, buf) {
  const doc = new PizZip(buf).file('word/document.xml').asText();
  const annex = doc.indexOf('<w:t>Annexure - I</w:t>');
  const ack = doc.indexOf('I hereby acknowledge');
  console.log('\n==', label, 'ack', ack, 'annex', annex);
  if (ack < 0 || annex < 0) return;
  const zone = doc.slice(ack, annex + 40);
  const paras = [...zone.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((m) => m[0]);
  for (const [i, p] of paras.entries()) {
    const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]);
    const joined = texts.join('');
    console.log(i, {
      tabs: (p.match(/<w:tab\/>/g) || []).length,
      textPreview: joined.replace(/\s+/g, ' ').slice(0, 100),
      leak: /<\/w:r>|<w:r/.test(joined),
      hasAmit: /Amit/i.test(joined),
      token: joined.includes('{{CANDIDATE_NAME}}'),
    });
  }
  // Also search for Amit anywhere before annex
  const before = doc.slice(0, annex);
  const hits = [...before.matchAll(/Amit[^<]{0,40}/g)].map((m) => m[0]);
  console.log('Amit hits before annex', hits.slice(0, 5));
}

const raw = fs.readFileSync('public/templates/admin-recruitment/appointment-letter.docx');
dumpNameZone('TEMPLATE', raw);

const built = await buildAppointmentLetterDocx(
  {
    appointment_ref: 'IFSPL/APT/2026/00008',
    joining_date: '2026-11-02',
    location: 'Head Office, Vadodara',
    reporting_to: 'HR Manager',
  },
  {
    offer_ref: 'x',
    joining_date: '2026-11-02',
    work_location: 'Head Office, Vadodara',
    designation: 'IT',
    annual_ctc: 1066656,
    salary_structure: null,
  },
  { full_name: 'Amit tesstttttttt', first_name: 'Amit', email: 'a@b.com', department: 'BA' },
  'Indus Fire Safety Private Limited'
);
dumpNameZone('BUILT+NORMALIZED', built);

// Peek raw XML around first Amit before annex in built
const doc = new PizZip(built).file('word/document.xml').asText();
const annex = doc.indexOf('<w:t>Annexure - I</w:t>');
const amit = doc.lastIndexOf('Amit', annex);
console.log('\nraw around last Amit before annex:');
console.log(doc.slice(Math.max(0, amit - 200), amit + 80));
