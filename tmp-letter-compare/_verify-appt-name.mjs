import fs from 'fs';
import PizZip from 'pizzip';
import { buildAppointmentLetterDocx, convertDocxBufferToPdf } from '../server/adminRecruitmentLetterDocs.js';

function namePara(xml) {
  const annexIdx = xml.indexOf('<w:t>Annexure - I</w:t>');
  const before = annexIdx > 0 ? xml.slice(0, annexIdx) : xml;
  const paras = [...before.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)];
  for (let i = paras.length - 1; i >= 0; i--) {
    const p = paras[i][0];
    const abs = paras[i].index;
    const lastTc = before.lastIndexOf('<w:tc', abs);
    const lastTcEnd = before.lastIndexOf('</w:tc>', abs);
    if (lastTc > lastTcEnd) continue;
    const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join('');
    if (!texts.trim()) continue;
    return {
      text: texts.trim().slice(0, 80),
      tabs: (p.match(/<w:tab\/>/g) || []).length,
      jc: (p.match(/<w:jc w:val="([^"]+)"/) || [])[1] || '-',
      pbb: /w:pageBreakBefore/.test(p),
    };
  }
  return null;
}

function annexPbb(xml) {
  const idx = xml.indexOf('<w:t>Annexure - I</w:t>');
  const pStart = xml.lastIndexOf('<w:p ', idx);
  const p = xml.slice(pStart, xml.indexOf('</w:p>', idx) + 6);
  return /w:pageBreakBefore/.test(p);
}

const tpl = new PizZip(fs.readFileSync('public/templates/admin-recruitment/appointment-letter.docx'))
  .file('word/document.xml')
  .asText();
console.log('TEMPLATE name', namePara(tpl), 'annexPbb', annexPbb(tpl));

const src = new PizZip(fs.readFileSync('tmp-letter-compare/appt-format.docx')).file('word/document.xml').asText();
console.log('ATTACHED name', namePara(src), 'annexPbb', annexPbb(src));

const appt = {
  appointment_ref: 'IFSPL/HR/AL-2026-27/099',
  joining_date: '2026-11-05',
  designation: 'Business Analyst',
  department: 'BA',
  location: 'the Head Office, Vadodara',
  reporting_to: 'HR Manager',
  segment: 'IFSPL, HO',
};
const offer = { annual_ctc: 1080000, monthly_gross: 90000, designation: 'Business Analyst', department: 'BA' };
const candidate = {
  full_name: 'Test Candidate',
  current_location: 'C-15 Devkutir Society Near',
  home_town: 'Vadodara',
  expected_ctc: 90000,
  date_of_birth: '2005-12-06',
  employee_code: '11099',
};

const docx = await buildAppointmentLetterDocx(appt, offer, candidate, 'Indus Fire Safety Pvt Ltd.');
fs.writeFileSync('tmp-letter-compare/appt-built-fixed.docx', docx);
const builtXml = new PizZip(docx).file('word/document.xml').asText();
console.log('BUILT name', namePara(builtXml), 'annexPbb', annexPbb(builtXml));

const pdf = await convertDocxBufferToPdf(docx, 'Appointment-IFSPL-APT-2026-00099');
if (pdf) {
  fs.writeFileSync('tmp-letter-compare/appt-built-fixed.pdf', pdf);
  console.log('PDF bytes', pdf.length);
} else {
  console.log('PDF convert returned null');
}
