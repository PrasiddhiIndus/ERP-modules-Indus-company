import fs from 'fs';
import PizZip from 'pizzip';

const path = 'public/templates/admin-recruitment/offer-letter.docx';
const zip = new PizZip(fs.readFileSync(path));
let xml = zip.file('word/document.xml').asText();
const NEXT = 'I accept the offer and confirm that I will join on {{JOINING_DATE_DDMMYYYY}}';

let hits = 0;
xml = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (p) => {
  const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('');
  const flat = texts.replace(/\s+/g, ' ').trim();
  if (
    !/I accept the (above )?offer and confirm that I will join on/i.test(flat) &&
    !/I accept the above and confirm that I will join on/i.test(flat)
  ) {
    return p;
  }
  const pPr = (p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [])[0] || '';
  let rPr =
    (p.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [])[0] ||
    '<w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>';
  if (!/<w:b[\s/>]/.test(rPr)) rPr = rPr.replace(/<\/w:rPr>/, '<w:b/><w:bCs/></w:rPr>');
  const open = p.match(/^<w:p\b[^>]*>/)?.[0] || '<w:p>';
  hits += 1;
  return `${open}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${NEXT}</w:t></w:r></w:p>`;
});

if (!hits) {
  console.error('accept paragraph not found');
  process.exit(1);
}
zip.file('word/document.xml', xml);
fs.writeFileSync(path, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('patched', hits);
