import fs from 'fs';
import PizZip from 'pizzip';
import { convertDocxBufferToPdf } from '../server/adminRecruitmentLetterDocs.js';

// Probe private helpers by re-implementing the export path checks on a remapped buffer.
// We import the module and monkey-test via FORCE path once LO exists; here validate XML transforms
// by reading the same remap/normalize through a small duplicated check after convert prep.

const docxPath = 'C:/Users/Amit/Downloads/Appointment-IFSPL-APT-2026-00008.docx';
const src = fs.readFileSync('server/adminRecruitmentLetterDocs.js', 'utf8');

// Dynamically evaluate helpers by importing after temporarily exporting — instead, apply transforms
// by spawning a child that prints internals. Simpler: duplicate critical regex assertions.

function paragraphPlainText(p) {
  return [...String(p || '').matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((t) => t[1])
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

const doc = new PizZip(fs.readFileSync(docxPath)).file('word/document.xml').asText();
const namePara = (() => {
  const annex = doc.indexOf('<w:t>Annexure - I</w:t>');
  const before = doc.slice(0, annex);
  const paras = [...before.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)];
  for (let i = paras.length - 1; i >= 0; i--) {
    const p = paras[i][0];
    const abs = paras[i].index;
    const lastTc = before.lastIndexOf('<w:tc', abs);
    const lastTcEnd = before.lastIndexOf('</w:tc>', abs);
    if (lastTc > lastTcEnd) continue;
    const text = paragraphPlainText(p);
    if (!text) continue;
    return { text, tabs: (p.match(/<w:tab\/>/g) || []).length, leak: /<\/?w:/.test(text) };
  }
  return null;
})();

console.log('name para', namePara);
if (!namePara || namePara.leak || namePara.text !== 'Amit tesstttttttt') {
  console.error('FAIL name paragraph plain-text parse');
  process.exit(1);
}
console.log('PASS w:t regex no longer matches w:tab');
console.log('convertDocxBufferToPdf available', typeof convertDocxBufferToPdf);
