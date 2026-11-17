import fs from 'fs';
import { convertDocxBufferToPdf } from '../server/adminRecruitmentLetterDocs.js';

delete process.env.FORCE_LIBREOFFICE_PDF;
const buf = fs.readFileSync('tmp-letter-compare/apt-lo-fixed.docx');
const pdf = await convertDocxBufferToPdf(buf, 'appointment-letter-fixed-preview');
fs.writeFileSync('tmp-letter-compare/apt-lo-fixed-via-word.pdf', pdf);
console.log('wrote preview pdf', pdf.length);
