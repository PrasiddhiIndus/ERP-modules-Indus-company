import fs from 'fs';
import PizZip from 'pizzip';

const path = 'public/templates/admin-recruitment/offer-letter.docx';
const zip = new PizZip(fs.readFileSync(path));
let xml = zip.file('word/document.xml').asText();

const paraRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
let changed = 0;
xml = xml.replace(paraRe, (p) => {
  const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('');
  const flat = texts.replace(/\s+/g, ' ').trim();
  if (!/Please confirm your acceptance/i.test(flat)) return p;
  if (/within 24 hours from the date of issuance/i.test(flat) && !/\{\{VALID_UNTIL\}\}/.test(flat)) {
    return p;
  }

  // Keep paragraph properties; rebuild a single clean run with the 24-hour wording.
  const pPr = (p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [])[0] || '';
  const rPr =
    (p.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [])[0] ||
    '<w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>';
  const open = p.match(/^<w:p\b[^>]*>/)?.[0] || '<w:p>';
  const body =
    'Please confirm your acceptance by signing and returning a copy of this letter within 24 hours from the date of issuance of this offer. This offer will lapse if your acceptance is not received within 24 hours from the date of issuance of this offer, or if you fail to join on the agreed date ({{JOINING_DATE_SHORT}}).';
  changed += 1;
  return `${open}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${body}</w:t></w:r></w:p>`;
});

if (!changed) {
  console.error('Acceptance paragraph not found');
  process.exit(1);
}

zip.file('word/document.xml', xml);
fs.writeFileSync(path, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
const verify = new PizZip(fs.readFileSync(path)).file('word/document.xml').asText();
const has = /within 24 hours from the date of issuance of this offer/.test(verify);
const hasOld = /\{\{VALID_UNTIL\}\}/.test(verify) && /on or before/.test(verify);
console.log('patched paras', changed, 'has24h', has, 'stillOldValidUntilPhrase', hasOld);
