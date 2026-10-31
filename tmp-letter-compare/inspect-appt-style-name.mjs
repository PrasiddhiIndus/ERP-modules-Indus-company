import fs from 'fs';
import PizZip from 'pizzip';

function inspect(path, label) {
  const zip = new PizZip(fs.readFileSync(path));
  const styles = zip.file('word/styles.xml')?.asText() || '';
  const noSpacing = styles.match(/<w:style[^>]*w:styleId="NoSpacing"[\s\S]*?<\/w:style>/);
  console.log('\n====', label);
  console.log('NoSpacing style:', noSpacing?.[0]?.replace(/\s+/g, ' ').slice(0, 500) || 'MISSING');
  const xml = zip.file('word/document.xml').asText();
  // candidate name before Annexure - I
  const idx = xml.indexOf('Annexure - I');
  const before = xml.slice(Math.max(0, idx - 2500), idx + 200);
  const texts = [...before.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
  console.log('texts before Annexure-I:', texts.slice(-8));
  // count empty NoSpacing paras without explicit spacing
  const empties = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].filter((m) => {
    const p = m[0];
    const hasText = /<w:t[^>]*>[^<]*\S/.test(p);
    return !hasText && /w:val="NoSpacing"/.test(p) && !/w:spacing/.test(p);
  });
  console.log('empty NoSpacing without w:spacing:', empties.length);
  // fonts used
  const fonts = [...new Set([...xml.matchAll(/w:ascii="([^"]+)"/g)].map((m) => m[1]))];
  console.log('fonts', fonts);
}

inspect('public/templates/admin-recruitment/appointment-letter.docx', 'TEMPLATE');
inspect(
  process.env.USERPROFILE + '\\Downloads\\Appointment-IFSPL-APT-2026-00002 (5).docx',
  'GENERATED-5'
);
inspect(
  process.env.USERPROFILE + '\\Downloads\\Appointment-IFSPL-APT-2026-00002.docx',
  'GENERATED-ORIG'
);
inspect(process.env.USERPROFILE + '\\Downloads\\apppointment letter format.doc', 'FORMAT-DOC');
