/**
 * Regression checks for appointment letter Word→PDF layout normalize.
 * Run: node tmp-letter-compare/assert-appt-layout.mjs
 */
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

const zip = new PizZip(built);
const doc = zip.file('word/document.xml').asText();
const styles = zip.file('word/styles.xml').asText();
const ns = styles.match(/<w:style[^>]*w:styleId="NoSpacing"[\s\S]*?<\/w:style>/)?.[0] || '';
const annex = doc.indexOf('<w:t>Annexure - I</w:t>');
const ack = doc.indexOf('I hereby acknowledge');
if (annex < 0 || ack < 0) throw new Error('missing ack/annexure markers');

const annexPara = doc.slice(doc.lastIndexOf('<w:p ', annex), doc.indexOf('</w:p>', annex) + 6);
const before = doc.slice(0, annex);
const paras = [...before.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)];
let nameEnd = -1;
for (let i = paras.length - 1; i >= 0; i--) {
  const p = paras[i][0];
  const abs = paras[i].index;
  const lastTc = before.lastIndexOf('<w:tc', abs);
  const lastTcEnd = before.lastIndexOf('</w:tc>', abs);
  if (lastTc > lastTcEnd) continue;
  // Prefer real text runs that contain the filled candidate name (ignore <w:tab/> false positives).
  if (!/<w:t[^>]*>Amit tesstttttttt<\/w:t>/.test(p)) continue;
  if (/pageBreakBefore/.test(p)) throw new Error('name paragraph must not page-break');
  nameEnd = abs + p.length;
  break;
}
if (nameEnd < 0) throw new Error('signature name paragraph not found');

const mid = doc.slice(nameEnd, doc.lastIndexOf('<w:p ', annex));
const midEmpties = [...mid.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].filter((m) => {
  // Count only true empty paragraphs (no <w:t>…</w:t> with content)
  return !/<w:t[^>]*>[^<]*\S[^<]*<\/w:t>/.test(m[0]);
}).length;

const unpinned = [...doc.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].filter((m) => {
  const p = m[0];
  if (!/w:val="NoSpacing"/.test(p)) return false;
  return !/<w:spacing\b/.test(p);
}).length;

const checks = {
  noSpacingStylePinned: /w:spacing/.test(ns) && /basedOn/.test(ns),
  annexPageBreak: /pageBreakBefore/.test(annexPara),
  noEmptiesBetweenNameAndAnnex: midEmpties === 0,
  allNoSpacingParasPinned: unpinned === 0,
  nameOnSameSectionAsAck: nameEnd > ack,
};

console.log(checks);
for (const [k, ok] of Object.entries(checks)) {
  if (!ok) {
    console.error('FAIL', k);
    process.exit(1);
  }
}
console.log('appointment layout asserts OK');
