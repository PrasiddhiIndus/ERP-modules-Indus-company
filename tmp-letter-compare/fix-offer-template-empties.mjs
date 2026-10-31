/**
 * Remove leftover blank paragraphs after amount placeholder pairs in offer Annexure A.
 * Prepare script left duplicates when Word Range.Text inserted placeholders.
 */
import fs from 'fs';
import PizZip from 'pizzip';

const path = 'public/templates/admin-recruitment/offer-letter.docx';
const zip = new PizZip(fs.readFileSync(path));
let xml = zip.file('word/document.xml').asText();

const emptyPara =
  '(?:<w:p\\b[^>]*/>|<w:p\\b[^>]*>\\s*(?:<w:pPr>[\\s\\S]*?</w:pPr>\\s*)?</w:p>)';

// After each of these closing placeholder texts, drop following empty paras before next content.
const markers = [
  '{{CONVEYANCE_PA}}',
  '{{BONUS_PA}}',
  '{{MEDICAL_PA}}',
  '{{EE_ESIC_PA}}',
  '{{ER_ESIC_PA}}',
];

let removed = 0;
for (const marker of markers) {
  const re = new RegExp(
    `(<w:t[^>]*>${marker.replace(/[{}]/g, '\\$&')}<\\/w:t>[\\s\\S]*?<\\/w:p>)((?:\\s*${emptyPara})+)`,
    'g'
  );
  xml = xml.replace(re, (_, head, empties) => {
    const count = (empties.match(/<w:p\b/g) || []).length;
    removed += count;
    return head; // drop leftover empties after PA placeholder
  });
}

zip.file('word/document.xml', xml);
fs.writeFileSync(path, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('removed leftover empty paras', removed);
