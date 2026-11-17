import fs from 'fs';
import PizZip from 'pizzip';
import { prepareAppointmentDocxForLibreOffice } from '../server/adminRecruitmentLetterDocs.js';

const src = fs.readFileSync('tmp-letter-compare/apt.docx');
const out = prepareAppointmentDocxForLibreOffice(src);
fs.writeFileSync('tmp-letter-compare/apt-lo-fixed.docx', out);
const z = new PizZip(out);

const rels = z.file('word/_rels/document.xml.rels').asText();
console.log('letterhead target', (rels.match(/image1\.[a-z]+/i) || [])[0]);
console.log('has png media', Boolean(z.file('word/media/image1.png')));
console.log('has emf media', Boolean(z.file('word/media/image1.emf')));

const doc = z.file('word/document.xml').asText();
console.log('crop attrs on rId7', /r:id="rId7"[^>]*crop/i.test(doc));

const footer = z.file('word/footer1.xml').asText();
console.log('footer absolute margin', /margin-left:-49/.test(footer));
console.log('footer shaded red', /w:fill="C00000"/.test(footer));
console.log('footer top border', /w:top w:val="single"/.test(footer));

const ax = doc.indexOf('Annexure II');
const chunk = doc.slice(ax, ax + 30000);
const deptIdx = chunk.indexOf('>Department<');
const trStart = chunk.lastIndexOf('<w:tr', deptIdx);
const nextTr = chunk.indexOf('<w:tr', deptIdx + 1);
const tr = chunk.slice(trStart, nextTr);
const paras = [...tr.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((p) =>
  [...p[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''),
);
console.log('Department row paras after LO prep', paras.map((t) => JSON.stringify(t)));
