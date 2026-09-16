import PizZip from 'pizzip';
import fs from 'fs';
import path from 'path';

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

function p(text) {
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

const body = [
  p('Ref No: {{REF_NO}}'),
  p('Date: {{LETTER_DATE}}'),
  p(''),
  p('To,'),
  p('{{EMP_NAME}}'),
  p('Emp Code: {{EMP_CODE}}'),
  p('Designation: {{DESIGNATION}}'),
  p('Department: {{DEPARTMENT}}'),
  p('Date of Joining: {{DOJ}}'),
  p(''),
  p('Subject: {{SUBJECT}}'),
  p(''),
  p('Dear {{EMP_NAME}},'),
  p(''),
  p('{{LETTER_BODY}}'),
  p(''),
  p('Reason / Particulars: {{REASON}}'),
  p('Effective Date: {{EFFECTIVE_DATE}}'),
  p('New Designation: {{NEW_DESIGNATION}}'),
  p('Notes: {{NOTES}}'),
  p(''),
  p('For Indus Fire Safety Pvt. Ltd.'),
  p(''),
  p('Authorized Signatory'),
].join('');

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}<w:sectPr/></w:body>
</w:document>`;

const zip = new PizZip();
zip.file('[Content_Types].xml', contentTypes);
zip.file('_rels/.rels', rels);
zip.file('word/document.xml', documentXml);
zip.file('word/_rels/document.xml.rels', docRels);
const out = zip.generate({ type: 'nodebuffer' });
const dest = path.join('public', 'templates', 'official-letters', 'official-letter.docx');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log('wrote', dest, out.length);
