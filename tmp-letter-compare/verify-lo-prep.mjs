import fs from 'fs';
import PizZip from 'pizzip';
import { prepareAppointmentDocxForLibreOffice } from '../server/adminRecruitmentLetterDocs.js';

const src = fs.readFileSync('C:/Users/Amit/Downloads/Appointment-IFSPL-APT-2026-00008.docx');
const prepared = prepareAppointmentDocxForLibreOffice(src);
fs.writeFileSync('tmp-letter-compare/user-appt-lo-prepared.docx', prepared);

const zip = new PizZip(prepared);
const doc = zip.file('word/document.xml').asText();
const styles = zip.file('word/styles.xml').asText();

function plain(p) {
  return [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((t) => t[1])
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

const annex = doc.indexOf('<w:t>Annexure - I</w:t>');
const annexPara = doc.slice(doc.lastIndexOf('<w:p ', annex), doc.indexOf('</w:p>', annex) + 6);
const before = doc.slice(0, annex);
const paras = [...before.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)];
let nameEnd = -1;
let nameText = '';
for (let i = paras.length - 1; i >= 0; i--) {
  const p = paras[i][0];
  const abs = paras[i].index;
  const lastTc = before.lastIndexOf('<w:tc', abs);
  const lastTcEnd = before.lastIndexOf('</w:tc>', abs);
  if (lastTc > lastTcEnd) continue;
  const text = plain(p);
  if (!text) continue;
  nameText = text;
  nameEnd = abs + p.length;
  if (/pageBreakBefore/.test(p)) throw new Error('name still has pageBreakBefore');
  break;
}
const mid = doc.slice(nameEnd, doc.lastIndexOf('<w:p ', annex));
const midEmpties = [...mid.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].filter((m) => !plain(m[0])).length;

const leftover = ['Aptos Narrow', 'Cambria', 'Calibri'].filter((f) => doc.includes(f));
const checks = {
  nameText,
  annexPageBreak: /pageBreakBefore/.test(annexPara),
  midEmpties,
  noSpacingPinned: /w:line="240"/.test(styles.match(/w:styleId="NoSpacing"[\s\S]*?<\/w:style>/)?.[0] || ''),
  leftoverMicrosoftFonts: leftover,
  hasCaladea: doc.includes('Caladea'),
  hasLiberationNarrow: doc.includes('Liberation Sans Narrow'),
};

console.log(checks);
if (checks.midEmpties !== 0) throw new Error('empties remain between name and annex');
if (!checks.annexPageBreak) throw new Error('annex missing page break');
if (checks.leftoverMicrosoftFonts.length) throw new Error('microsoft fonts remain');
if (!checks.hasCaladea || !checks.hasLiberationNarrow) throw new Error('substitutes missing');
if (checks.nameText !== 'Amit tesstttttttt') throw new Error('bad name text');
console.log('PASS LibreOffice prep: fonts remapped, blank gap stripped, annex page-break kept');
