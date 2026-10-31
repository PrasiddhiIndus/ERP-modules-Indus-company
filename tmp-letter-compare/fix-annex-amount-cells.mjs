/**
 * Ensure annexure amount rows are Label | M | PA with one paragraph per cell.
 * Extra empty paragraphs inside amount cells inflate row height and push
 * later line items onto the next page (DOCX + PDF).
 */
import fs from 'fs';
import PizZip from 'pizzip';

const pairs = [
  ['{{CONVEYANCE_M}}', '{{CONVEYANCE_PA}}'],
  ['{{BONUS_M}}', '{{BONUS_PA}}'],
  ['{{MEDICAL_M}}', '{{MEDICAL_PA}}'],
  ['{{EE_ESIC_M}}', '{{EE_ESIC_PA}}'],
  ['{{ER_ESIC_M}}', '{{ER_ESIC_PA}}'],
];

function fixXml(xml) {
  let out = xml;
  let fixed = 0;

  for (const [mTok, paTok] of pairs) {
    let searchFrom = 0;
    while (true) {
      const mIdx = out.indexOf(mTok, searchFrom);
      if (mIdx < 0) break;
      const trStart = out.lastIndexOf('<w:tr ', mIdx);
      const trEnd = out.indexOf('</w:tr>', mIdx);
      if (trStart < 0 || trEnd < 0) {
        searchFrom = mIdx + mTok.length;
        continue;
      }
      const row = out.slice(trStart, trEnd + 7);
      if (!row.includes(paTok) && !row.includes(mTok)) {
        searchFrom = mIdx + mTok.length;
        continue;
      }

      const cells = [];
      const cellRe = /<w:tc[\s>][\s\S]*?<\/w:tc>/g;
      let cm;
      while ((cm = cellRe.exec(row))) cells.push(cm[0]);
      if (cells.length < 3) {
        searchFrom = trEnd + 7;
        continue;
      }

      const paraCount = (row.match(/<w:p\b/g) || []).length;
      // Healthy Basic/HRA rows have exactly 3 paragraphs.
      if (paraCount <= 3 && row.includes(mTok) && row.includes(paTok) && !cells[1].includes(paTok)) {
        searchFrom = trEnd + 7;
        continue;
      }

      const pPrMatch = cells[1].match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
      const rPrMatch = cells[1].match(/<w:r[^>]*>\s*<w:rPr>[\s\S]*?<\/w:rPr>/) || cells[1].match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
      const pPr = pPrMatch ? pPrMatch[0] : '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="right"/></w:pPr>';
      let rPr = '<w:rPr/>';
      if (rPrMatch) {
        const inner = rPrMatch[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
        if (inner) rPr = inner[0];
      }
      const tcPr = (idx) => {
        const m = cells[idx].match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
        return m ? m[0] : '<w:tcPr/>';
      };
      const makeCell = (idx, token) =>
        `<w:tc>${tcPr(idx)}<w:p>${pPr}<w:r>${rPr}<w:t>${token}</w:t></w:r></w:p></w:tc>`;

      const rowHead = row.slice(0, row.indexOf('<w:tc'));
      const rebuilt = `${rowHead}${cells[0]}${makeCell(1, mTok)}${makeCell(2, paTok)}</w:tr>`;
      out = out.slice(0, trStart) + rebuilt + out.slice(trEnd + 7);
      fixed += 1;
      searchFrom = trStart + rebuilt.length;
    }
  }
  return { xml: out, fixed };
}

for (const path of [
  'public/templates/admin-recruitment/offer-letter.docx',
  'public/templates/admin-recruitment/appointment-letter.docx',
]) {
  const zip = new PizZip(fs.readFileSync(path));
  const before = zip.file('word/document.xml').asText();
  const { xml, fixed } = fixXml(before);
  zip.file('word/document.xml', xml);
  fs.writeFileSync(path, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log(path, 'fixed', fixed);
}
