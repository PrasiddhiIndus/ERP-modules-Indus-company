import fs from 'fs';
import PizZip from 'pizzip';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

function dump(label, buf) {
  const doc = new PizZip(buf).file('word/document.xml').asText();
  const annex = doc.indexOf('<w:t>Annexure - I</w:t>');
  const before = doc.slice(0, annex);
  const paras = [...before.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)];
  console.log('\n====', label);
  // last 12 body paras before annex
  const rows = [];
  for (let i = paras.length - 1; i >= 0 && rows.length < 12; i--) {
    const p = paras[i][0];
    const abs = paras[i].index;
    const lastTc = before.lastIndexOf('<w:tc', abs);
    const lastTcEnd = before.lastIndexOf('</w:tc>', abs);
    if (lastTc > lastTcEnd) continue;
    const text = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((t) => t[1])
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    rows.unshift({
      text: text || '(empty)',
      pbb: /w:pageBreakBefore/.test(p),
      noSpacing: /NoSpacing/.test(p),
      spacing: (p.match(/<w:spacing[^/]*\/>/) || ['none'])[0],
      tabs: (p.match(/<w:tab\/>/g) || []).length,
    });
  }
  for (const r of rows) console.log(JSON.stringify(r));
  const annexPara = doc.slice(doc.lastIndexOf('<w:p ', annex), doc.indexOf('</w:p>', annex) + 6);
  console.log('annex pbb', /w:pageBreakBefore/.test(annexPara), 'spacing', (annexPara.match(/<w:spacing[^/]*\/>/) || [])[0]);
}

const userPath = 'C:/Users/Amit/Downloads/Appointment-IFSPL-APT-2026-00008.docx';
dump('USER DOCX as-is', fs.readFileSync(userPath));

// Apply the same normalize used for LibreOffice
const mod = await import('../server/adminRecruitmentLetterDocs.js');
// normalizeAppointmentLetterDocxLayout is not exported — invoke via convert path mock by reading source
// Re-implement call through dynamic eval of internal by converting with forced LO isn't possible on Windows.
// Instead duplicate-read by exporting check: use fill+build normalize via convertDocxBufferToPdf side effect — no.
const src = fs.readFileSync('server/adminRecruitmentLetterDocs.js', 'utf8');
if (!src.includes('normalizeAppointmentLetterDocxLayout')) {
  console.log('normalize missing');
}

// Import and call by temporarily patching — call convertDocxViaLibreOffice's preprocess:
// We'll use Function to extract — easier: copy normalize by importing through a small harness.
const PizZip2 = PizZip;
function normalizeAppointmentLetterDocxLayout(docxBuffer) {
  // Import the real one by evaluating the module's export path: force LO path by mocking.
  return null;
}

// Use Node to import internal via rewriting — call assert-appt-layout helpers
const { buildAppointmentLetterDocx } = mod;
// Directly re-run normalize by duplicating import of private via vm — simplest: spawn script that patches exports.

console.log('\n(module loaded)', typeof buildAppointmentLetterDocx);
