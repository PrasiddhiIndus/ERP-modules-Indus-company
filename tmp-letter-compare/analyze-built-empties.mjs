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
  {
    full_name: 'Amit tesstttttttt',
    first_name: 'Amit',
    email: 'a@b.com',
    department: 'Business Analyst',
  },
  'Indus Fire Safety Private Limited'
);

const zip = new PizZip(built);
const doc = zip.file('word/document.xml').asText();
const styles = zip.file('word/styles.xml').asText();
const ns = styles.match(/<w:style[^>]*w:styleId="NoSpacing"[\s\S]*?<\/w:style>/)[0];
console.log('NoSpacing has spacing', /w:spacing/.test(ns));
console.log('NoSpacing snippet', ns.replace(/\s+/g, ' ').slice(0, 280));

function sectionStats(label, a, b) {
  const i = doc.indexOf(a);
  const j = doc.indexOf(b);
  if (i < 0 || j < 0 || j <= i) {
    console.log(label, 'markers missing', { i, j });
    return;
  }
  const mid = doc.slice(i, j);
  const paras = [...mid.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((m) => m[0]);
  let empty = 0;
  let emptyNoSp = 0;
  let withTab = 0;
  let withExplicitSpacing = 0;
  for (const p of paras) {
    const t = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join('');
    if (t.trim()) continue;
    empty += 1;
    if (/NoSpacing/.test(p)) emptyNoSp += 1;
    if (/<w:tab\/>/.test(p)) withTab += 1;
    if (/<w:spacing\b/.test(p)) withExplicitSpacing += 1;
  }
  console.log(label, { empty, emptyNoSp, withTab, withExplicitSpacing, paras: paras.length });
}

sectionStats('Welcome..Benefits', 'Welcome on board', '4. Benefits');
sectionStats('Benefits..Retirement', '4. Benefits', '5. Retirement');
sectionStats('Retirement..Annexure', '5. Retirement', 'Annexure - I');
sectionStats('acknowledge..Annexure', 'I hereby acknowledge', 'Annexure - I');

const annex = doc.indexOf('<w:t>Annexure - I</w:t>');
const before = doc.slice(0, annex);
const paras = [...before.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)];
let name = null;
for (let i = paras.length - 1; i >= 0; i--) {
  const p = paras[i][0];
  const abs = paras[i].index;
  const lastTc = before.lastIndexOf('<w:tc', abs);
  const lastTcEnd = before.lastIndexOf('</w:tc>', abs);
  if (lastTc > lastTcEnd) continue;
  const t = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join('');
  if (!t.trim()) continue;
  name = {
    text: t,
    pbb: /pageBreakBefore/.test(p),
    tabs: (p.match(/<w:tab\/>/g) || []).length,
    style: (p.match(/w:val="([^"]+)"/) || [])[1],
  };
  break;
}
console.log('sig name', name);
const annexP = doc.slice(doc.lastIndexOf('<w:p ', annex), doc.indexOf('</w:p>', annex) + 6);
console.log('annex pbb', /pageBreakBefore/.test(annexP));

// Total empty NoSpacing without explicit spacing in whole body
const allParas = [...doc.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((m) => m[0]);
let emptyNoSpNoSpace = 0;
for (const p of allParas) {
  const t = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join('');
  if (t.trim()) continue;
  if (!/NoSpacing/.test(p)) continue;
  if (/<w:spacing\b/.test(p)) continue;
  emptyNoSpNoSpace += 1;
}
console.log('body empty NoSpacing without local spacing', emptyNoSpNoSpace);
