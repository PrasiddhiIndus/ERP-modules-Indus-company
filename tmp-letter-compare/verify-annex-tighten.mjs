import fs from 'fs';
import PizZip from 'pizzip';
import { buildOfferLetterDocx } from '../server/adminRecruitmentLetterDocs.js';

// Patch template in place via the same normalize used at send time
const templatePath = 'public/templates/admin-recruitment/offer-letter.docx';
const beforeZip = new PizZip(fs.readFileSync(templatePath));
const beforeXml = beforeZip.file('word/document.xml').asText();
const emptyBefore = (beforeXml.match(/Name: ____________________[\s\S]*?<w:t>Annexure A<\/w:t>/) || [''])[0];
const emptyCountBefore = (emptyBefore.match(/<w:p\b[^>]*\/>/g) || []).length;
console.log('template empty self-close before annex', emptyCountBefore);
console.log('template has pageBreakBefore', beforeXml.includes('w:pageBreakBefore'));

const built = await buildOfferLetterDocx(
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
  { full_name: 'Test Candidate', expected_ctc: 90000, experience_years: 3 },
  'Indus Fire Safety Private Limited'
);
fs.writeFileSync('tmp-letter-compare/offer-built-fixed.docx', built);

const afterZip = new PizZip(built);
const afterXml = afterZip.file('word/document.xml').asText();
const emptyAfter = (afterXml.match(/Name: ____________________[\s\S]*?<w:t>Annexure A<\/w:t>/) || [''])[0];
const emptyCountAfter = (emptyAfter.match(/<w:p\b[^>]*\/>/g) || []).length;
console.log('built empty self-close before annex', emptyCountAfter);
console.log('built has pageBreakBefore', afterXml.includes('w:pageBreakBefore'));

// Show boundary snippet
const idx = afterXml.indexOf('Name: ____________________');
const annex = afterXml.indexOf('<w:t>Annexure A</w:t>', idx);
console.log('boundary snippet:\n', afterXml.slice(idx, annex + 40).replace(/\s+/g, ' ').slice(0, 800));
