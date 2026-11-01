import fs from 'fs';
import PizZip from 'pizzip';
import {
  buildAppointmentLetterDocx,
  convertDocxBufferToPdf,
} from '../server/adminRecruitmentLetterDocs.js';

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
    salary_structure: {
      basic_monthly: 41000,
      hra_monthly: 16400,
      gross_monthly: 81999,
      employee_pf_monthly: 3000,
      ptax_monthly: 200,
      take_home_monthly: 78799,
      employer_pf_monthly: 3250,
      gratuity_monthly: 1972,
      ex_gratia_monthly: 1667,
      part_b_monthly: 6889,
      ctc_monthly: 88888,
      ctc_annual: 1066656,
    },
  },
  {
    full_name: 'Amit tesstttttttt',
    first_name: 'Amit',
    email: 'a@b.com',
    department: 'Business Analyst',
  },
  'Indus Fire Safety Private Limited'
);

fs.writeFileSync('tmp-letter-compare/demo-appt-fixed.docx', built);
const doc = new PizZip(built).file('word/document.xml').asText();
const styles = new PizZip(built).file('word/styles.xml').asText();
const ns = styles.match(/<w:style[^>]*w:styleId="NoSpacing"[\s\S]*?<\/w:style>/)[0];

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
  const t = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join('').trim();
  if (!t) continue;
  name = {
    text: t.slice(0, 80),
    pbb: /pageBreakBefore/.test(p),
    tabs: (p.match(/<w:tab\/>/g) || []).length,
  };
  break;
}

const nameEnd = name
  ? (() => {
      // find last body name para end
      for (let i = paras.length - 1; i >= 0; i--) {
        const p = paras[i][0];
        const abs = paras[i].index;
        const lastTc = before.lastIndexOf('<w:tc', abs);
        const lastTcEnd = before.lastIndexOf('</w:tc>', abs);
        if (lastTc > lastTcEnd) continue;
        const t = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join('').trim();
        if (!t) continue;
        return abs + p.length;
      }
      return -1;
    })()
  : -1;

const mid = nameEnd > 0 ? doc.slice(nameEnd, doc.lastIndexOf('<w:p ', annex)) : '';
const midEmpties = [...mid.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].filter((m) => {
  const t = [...m[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join('').trim();
  return !t;
}).length;

const emptyNoSpNoLocal = [...doc.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].filter((m) => {
  const p = m[0];
  if (!/NoSpacing/.test(p)) return false;
  const t = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join('').trim();
  if (t) return false;
  return !/<w:spacing\b/.test(p);
}).length;

console.log({
  noSpacingHasSpacing: /w:spacing/.test(ns),
  noSpacingBasedOn: /basedOn/.test(ns),
  name,
  emptiesBetweenNameAndAnnex: midEmpties,
  emptyNoSpWithoutLocalSpacing: emptyNoSpNoLocal,
  annexPbb: /pageBreakBefore/.test(
    doc.slice(doc.lastIndexOf('<w:p ', annex), doc.indexOf('</w:p>', annex) + 6)
  ),
});

const pdf = await convertDocxBufferToPdf(built, 'Appointment-fixed-demo');
if (!pdf) {
  console.error('PDF convert failed');
  process.exit(1);
}
fs.writeFileSync('tmp-letter-compare/demo-appt-fixed.pdf', pdf);
console.log('pdf bytes', pdf.length);

// Count pages via Word COM (reliable on this machine)
import { execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';
const execFileAsync = promisify(execFile);
const ps1 = path.join(os.tmpdir(), 'count-pdf-pages.ps1');
const pdfPath = path.resolve('tmp-letter-compare/demo-appt-fixed.pdf');
const prodPath = path.resolve(
  process.env.USERPROFILE +
    '/.cursor/projects/c-Users-Amit-Desktop-ERP-modules-Indus-company/attachments/c81621b4-00df-488e-8465-de693f7dd325/Appointment-IFSPL-APT-2026-00008.pdf'
);
fs.writeFileSync(
  ps1,
  `
$ErrorActionPreference='Stop'
function Pages($p) {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  try {
    $doc = $word.Documents.Open($p, $false, $true)
    $n = $doc.ComputeStatistics(2)
    $doc.Close($false)
    return $n
  } finally { $word.Quit() | Out-Null }
}
Write-Output ('FIXED=' + (Pages '${pdfPath.replace(/'/g, "''")}'))
if (Test-Path '${prodPath.replace(/'/g, "''")}') {
  Write-Output ('PROD=' + (Pages '${prodPath.replace(/'/g, "''")}'))
}
`
);
const { stdout } = await execFileAsync(
  'powershell.exe',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
  { timeout: 120000 }
);
console.log(stdout.trim());
