import fs from 'fs';
import PizZip from 'pizzip';
import {
  convertDocxBufferToPdf,
  fixAppointmentFooterForPdf,
  prepareAppointmentDocxForLibreOffice,
} from '../server/adminRecruitmentLetterDocs.js';

const src = fs.readFileSync('tmp-letter-compare/apt.docx');
const wordBuf = fixAppointmentFooterForPdf(src);
const wz = new PizZip(wordBuf);
const wBody = wz.file('word/document.xml').asText();
console.log('Word-path footer dist', [...wBody.matchAll(/w:footer="[^"]+"/g)].map((m) => m[0]));

const lo = prepareAppointmentDocxForLibreOffice(wordBuf);
const lz = new PizZip(lo);
const lBody = lz.file('word/document.xml').asText();
const lFoot = lz.file('word/footer1.xml').asText();
console.log('LO-path footer dist', [...lBody.matchAll(/w:footer="[^"]+"/g)].map((m) => m[0]));
console.log('LO absolute footer', /position:absolute/.test(lFoot), /612pt/.test(lFoot));

delete process.env.FORCE_LIBREOFFICE_PDF;
const pdf = await convertDocxBufferToPdf(src, 'appointment-letter');
fs.writeFileSync('tmp-letter-compare/apt-no-footer-gap.pdf', pdf);
const s = pdf.toString('latin1');
console.log('PDF media', [...new Set([...s.matchAll(/MediaBox\s*\[\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\]/g)].map((m) => m.slice(1).join('x')))]);
console.log('PDF pages', (s.match(/\/Type\s*\/Page\b/g) || []).length);
console.log('PDF bytes', pdf.length);
