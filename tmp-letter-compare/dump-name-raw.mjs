import fs from 'fs';
import PizZip from 'pizzip';

const paths = [
  'C:/Users/Amit/Downloads/Appointment-IFSPL-APT-2026-00008.docx',
  'public/templates/admin-recruitment/appointment-letter.docx',
];

for (const path of paths) {
  const doc = new PizZip(fs.readFileSync(path)).file('word/document.xml').asText();
  const annex = doc.indexOf('<w:t>Annexure - I</w:t>');
  const before = doc.slice(0, annex);
  const ack = before.lastIndexOf('I hereby acknowledge');
  console.log('\n====', path);
  console.log('slice ack→annex length', annex - ack);
  // Find last <w:t>…</w:t> with real name-ish content before annex
  const texts = [...before.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)];
  for (const t of texts.slice(-8)) {
    console.log('T:', JSON.stringify(t[1]).slice(0, 120), 'at', t.index);
  }
  // Raw XML 800 chars before Annexure - I paragraph
  const pStart = before.lastIndexOf('<w:p ', before.lastIndexOf('<w:p ', annex - 1));
  console.log('\nRAW near end:\n', before.slice(-1200).replace(/\n/g, ''));
}
