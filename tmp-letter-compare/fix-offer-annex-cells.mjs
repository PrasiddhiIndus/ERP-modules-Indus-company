/**
 * Fix offer annexure rows where prepare-script put M+PA into the monthly cell
 * and left the PA cell empty ( inflates row height → line items spill to next page).
 */
import fs from 'fs';
import PizZip from 'pizzip';

const path = process.argv[2] || 'public/templates/admin-recruitment/offer-letter.docx';
const zip = new PizZip(fs.readFileSync(path));
let xml = zip.file('word/document.xml').asText();

const pairs = [
  ['{{CONVEYANCE_M}}', '{{CONVEYANCE_PA}}'],
  ['{{BONUS_M}}', '{{BONUS_PA}}'],
  ['{{MEDICAL_M}}', '{{MEDICAL_PA}}'],
  ['{{EE_ESIC_M}}', '{{EE_ESIC_PA}}'],
  ['{{ER_ESIC_M}}', '{{ER_ESIC_PA}}'],
];

let fixed = 0;

for (const [mTok, paTok] of pairs) {
  // Find a table row that contains both tokens (broken layout).
  const mIdx = xml.indexOf(mTok);
  if (mIdx < 0) continue;
  const trStart = xml.lastIndexOf('<w:tr ', mIdx);
  const trEnd = xml.indexOf('</w:tr>', mIdx);
  if (trStart < 0 || trEnd < 0) continue;
  let row = xml.slice(trStart, trEnd + 7);
  if (!row.includes(paTok)) continue;

  // Split into cells
  const cells = [];
  const cellRe = /<w:tc[\s>][\s\S]*?<\/w:tc>/g;
  let cm;
  while ((cm = cellRe.exec(row))) cells.push(cm[0]);
  if (cells.length < 3) continue;

  // Build a single-paragraph right-aligned cell body like Basic/HRA rows.
  const sampleCell = cells[1];
  const pPrMatch = sampleCell.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
  const rPrMatch = sampleCell.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  const tcPrMatch = (idx) => {
    const m = cells[idx].match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
    return m ? m[0] : '<w:tcPr/>';
  };
  const pPr = pPrMatch ? pPrMatch[0] : '<w:pPr><w:jc w:val="right"/></w:pPr>';
  const rPr = rPrMatch ? rPrMatch[0] : '<w:rPr/>';

  const makeCell = (tcPr, token) =>
    `<w:tc>${tcPr}<w:p>${pPr}<w:r>${rPr}<w:t>${token}</w:t></w:r></w:p></w:tc>`;

  // Keep label cell as-is; rebuild amount cells with one para each.
  const newRow =
    row.slice(0, row.indexOf('<w:tc')) +
    cells[0] +
    makeCell(tcPrMatch(1), mTok) +
    makeCell(tcPrMatch(2), paTok) +
    '</w:tr>';

  // Prefer replacing from first <w:tc through </w:tr>
  const rowBodyStart = row.indexOf('<w:tc');
  const rebuilt = row.slice(0, rowBodyStart) + cells[0] + makeCell(tcPrMatch(1), mTok) + makeCell(tcPrMatch(2), paTok) + '</w:tr>';

  if (rebuilt !== row) {
    xml = xml.slice(0, trStart) + rebuilt + xml.slice(trEnd + 7);
    fixed += 1;
  }
}

zip.file('word/document.xml', xml);
fs.writeFileSync(path, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('fixed rows', fixed, 'in', path);
