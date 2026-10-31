import fs from 'fs';
import PizZip from 'pizzip';

const path = 'public/templates/admin-recruitment/offer-letter.docx';
const zip = new PizZip(fs.readFileSync(path));
let xml = zip.file('word/document.xml').asText();

const ACCEPT_MSG =
  'You are requested to accept or decline this offer within 24 hours from the date and time of issuance';
const JOIN_LINE =
  'I accept the above offer and confirm that I will join on {{JOINING_DATE_DDMMYYYY}}';

function rebuildPara(p, newText) {
  const pPr = (p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [])[0] || '';
  const rPr =
    (p.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [])[0] ||
    '<w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>';
  const open = p.match(/^<w:p\b[^>]*>/)?.[0] || '<w:p>';
  const bold = /I accept the above offer/i.test(newText);
  const rPrUse = bold
    ? rPr.includes('<w:b')
      ? rPr
      : rPr.replace(/<\/w:rPr>/, '<w:b/><w:bCs/></w:rPr>')
    : rPr;
  return `${open}${pPr}<w:r>${rPrUse}<w:t xml:space="preserve">${newText}</w:t></w:r></w:p>`;
}

let acceptHit = 0;
let joinHit = 0;
xml = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (p) => {
  const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('');
  const flat = texts.replace(/\s+/g, ' ').trim();
  if (
    /Please confirm your acceptance/i.test(flat) ||
    /You are requested to accept or decline/i.test(flat) ||
    (/within 24 hours from the date of issuance/i.test(flat) && /acceptance is not received/i.test(flat))
  ) {
    acceptHit += 1;
    return rebuildPara(p, ACCEPT_MSG);
  }
  if (/I accept the above offer and confirm that I will join on/i.test(flat)) {
    joinHit += 1;
    return rebuildPara(p, JOIN_LINE);
  }
  return p;
});

if (!acceptHit || !joinHit) {
  console.error('Missing paragraphs', { acceptHit, joinHit });
  process.exit(1);
}

zip.file('word/document.xml', xml);
fs.writeFileSync(path, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
const v = new PizZip(fs.readFileSync(path)).file('word/document.xml').asText();
console.log('accept msg', v.includes(ACCEPT_MSG));
console.log('join placeholder', v.includes('{{JOINING_DATE_DDMMYYYY}}'));
console.log('old DD/MM literal gone', !v.includes('[DD/MM/YYYY]'));
