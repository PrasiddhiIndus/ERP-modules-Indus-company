import fs from 'fs';
import PizZip from 'pizzip';

const zip = new PizZip(fs.readFileSync('public/templates/admin-recruitment/offer-letter.docx'));
const xml = zip.file('word/document.xml').asText();

// Find all Annexure occurrences
let i = 0;
while ((i = xml.indexOf('Annexure', i)) >= 0) {
  const pStart = xml.lastIndexOf('<w:p ', i);
  const pEnd = xml.indexOf('</w:p>', i) + 6;
  const p = xml.slice(pStart, pEnd);
  const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join('');
  console.log('---', i, JSON.stringify(texts));
  console.log(p.replace(/\s+/g, ' ').slice(0, 500));
  i += 8;
}

// What is immediately before the Annexure A heading-only para?
const headingIdx = [...xml.matchAll(/<w:t>Annexure A<\/w:t>/g)].map((m) => m.index);
console.log('heading-only idxs', headingIdx);
for (const hi of headingIdx) {
  // look back for previous paragraph end and page-related tags
  const window = xml.slice(Math.max(0, hi - 2500), hi + 200);
  console.log('\nWINDOW before heading:');
  // show structural tags only
  const tags = [...window.matchAll(/<\/?w:(?:p|pPr|r|br|sectPr|tbl|tr|tc|drawing|pict|spacing|pageBreakBefore|jc|b)[^>]*>|<w:t[^>]*>[^<]*<\/w:t>/g)]
    .map((m) => m[0].replace(/\s+/g, ' ').slice(0, 120));
  tags.slice(-40).forEach((t) => console.log(t));
}

// Check if Word COM fill adds page breaks - generate a filled doc
import { buildOfferLetterDocx } from '../server/adminRecruitmentLetterDocs.js';

const buf = await buildOfferLetterDocx(
  {
    designation: 'Business Analyst',
    department: 'BA',
    location: 'Indus HO',
    joining_date: '2026-11-05',
    offer_date: '2026-10-31',
    valid_until: '2026-11-07',
    employment_type: 'Permanent',
    salary_monthly: 90000,
  },
  {
    full_name: 'Test Candidate',
    expected_ctc: 90000,
    experience_years: 3,
  },
  'Indus Fire Safety Private Limited'
);
fs.writeFileSync('tmp-letter-compare/offer-built-now.docx', buf);
console.log('\nbuilt bytes', buf.length);

const zip2 = new PizZip(buf);
const xml2 = zip2.file('word/document.xml').asText();
console.log('page breaks in built', (xml2.match(/w:type="page"|pageBreakBefore/g) || []).length);
console.log('sectPr count', (xml2.match(/<w:sectPr/g) || []).length);

// Compare pgMar
const mar = xml2.match(/<w:pgMar[^/]*\/>/);
console.log('pgMar', mar?.[0]);
