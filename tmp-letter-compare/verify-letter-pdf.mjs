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
const wFoot = wz.file('word/footer1.xml').asText();
console.log('Word-path pgSz', [...wBody.matchAll(/<w:pgSz\b[^/]*\/>/g)].map((m) => m[0]));
console.log('Word-path black bar', /width:611\.55pt/.test(wFoot) && /margin-left:-49\.2pt/.test(wFoot));
console.log('Word-path no full png', !/footer-full/.test(wFoot));

const loBuf = prepareAppointmentDocxForLibreOffice(wordBuf);
const lz = new PizZip(loBuf);
const lBody = lz.file('word/document.xml').asText();
const lFoot = lz.file('word/footer1.xml').asText();
console.log('LO-path pgSz', [...lBody.matchAll(/<w:pgSz\b[^/]*\/>/g)].map((m) => m[0]));
console.log('LO-path footer width', [...lFoot.matchAll(/width:[0-9.]+pt/g)].map((m) => m[0]));
console.log('LO-path footer dist', [...lBody.matchAll(/w:footer="[^"]+"/g)].map((m) => m[0]).slice(0, 2));

delete process.env.FORCE_LIBREOFFICE_PDF;
const pdf = await convertDocxBufferToPdf(src, 'appointment-letter');
fs.writeFileSync('tmp-letter-compare/apt-letter-size-fixed.pdf', pdf);
const s = pdf.toString('latin1');
const boxes = [...s.matchAll(/MediaBox\s*\[\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\]/g)]
  .map((m) => m.slice(1).join('x'));
console.log('PDF mediaBoxes', [...new Set(boxes)]);
console.log('PDF pages', (s.match(/\/Type\s*\/Page\b/g) || []).length);
console.log('PDF bytes', pdf.length);
console.log('PDF has Regd/GSTIN text?', /Regd|GSTIN|Vadodara|firesafety/i.test(s));
