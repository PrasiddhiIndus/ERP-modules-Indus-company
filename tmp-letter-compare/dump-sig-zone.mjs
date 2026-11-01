import fs from 'fs';
import PizZip from 'pizzip';
import { buildAppointmentLetterDocx } from '../server/adminRecruitmentLetterDocs.js';

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

const doc = new PizZip(built).file('word/document.xml').asText();
const annex = doc.indexOf('<w:t>Annexure - I</w:t>');
const ack = doc.indexOf('I hereby acknowledge');
const zone = doc.slice(ack, annex + 80);
const paras = [...zone.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((m) => m[0]);
console.log('paras in ack→annex zone', paras.length);
for (const [i, p] of paras.entries()) {
  const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]);
  const joined = texts.join('').replace(/\s+/g, ' ').trim();
  const tabs = (p.match(/<w:tab\/>/g) || []).length;
  console.log(
    i,
    {
      texts: texts.length,
      tabs,
      pbb: /pageBreakBefore/.test(p),
      empty: !joined,
      preview: joined.slice(0, 90) || '(empty)',
      // show raw snippet if preview looks like XML leak
      leak: joined.includes('</w:r>') || joined.includes('<w:r'),
    }
  );
}
