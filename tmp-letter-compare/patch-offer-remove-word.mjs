import fs from 'fs';
import PizZip from 'pizzip';

const path = 'public/templates/admin-recruitment/offer-letter.docx';
const zip = new PizZip(fs.readFileSync(path));
let xml = zip.file('word/document.xml').asText();

const replacements = [
  [
    /Subject:\s*Offer of Employment/i,
    'Subject: Letter of Employment',
  ],
  [
    /We are pleased to offer you the position of/i,
    'We are pleased to appoint you to the position of',
  ],
  [
    /This offer is subject to verification/i,
    'This letter is subject to verification',
  ],
  [
    /You are requested to accept or decline this offer within 24 hours from the date and time of issuance/i,
    'You are requested to accept or decline within 24 hours from the date and time of issuance',
  ],
  [
    /I accept the above offer and confirm that I will join on \{\{JOINING_DATE_DDMMYYYY\}\}/i,
    'I accept the above and confirm that I will join on {{JOINING_DATE_DDMMYYYY}}',
  ],
  [
    /I accept the above offer and confirm that I will join on/i,
    'I accept the above and confirm that I will join on',
  ],
];

function rebuildPara(p, newText) {
  const pPr = (p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [])[0] || '';
  const rPr =
    (p.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [])[0] ||
    '<w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>';
  const open = p.match(/^<w:p\b[^>]*>/)?.[0] || '<w:p>';
  const bold = /I accept the above/i.test(newText) || /Subject:/i.test(newText);
  let rPrUse = rPr;
  if (bold && !/<w:b[\s/>]/.test(rPr)) {
    rPrUse = rPr.replace(/<\/w:rPr>/, '<w:b/><w:bCs/></w:rPr>');
  }
  return `${open}${pPr}<w:r>${rPrUse}<w:t xml:space="preserve">${newText}</w:t></w:r></w:p>`;
}

let hits = 0;
xml = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (p) => {
  const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('');
  const flat = texts.replace(/\s+/g, ' ').trim();
  if (!flat || !/offer/i.test(flat)) return p;
  // Keep Date: {{OFFER_DATE}} — token name, not the word "offer" in prose.
  if (/^\s*Date:\s*\{\{OFFER_DATE\}\}\s*$/i.test(flat)) return p;

  let next = flat;
  for (const [re, to] of replacements) {
    if (re.test(next)) next = next.replace(re, to);
  }
  if (next === flat) return p;
  hits += 1;
  return rebuildPara(p, next);
});

zip.file('word/document.xml', xml);
fs.writeFileSync(path, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));

const v = new PizZip(fs.readFileSync(path)).file('word/document.xml').asText();
const paras = [...v.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
  .map((m) =>
    [...m[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((x) => x[1])
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
  )
  .filter(Boolean);
console.log('patched', hits);
paras.filter((p) => /offer/i.test(p)).forEach((p) => console.log('still has offer:', p.slice(0, 120)));
paras
  .filter((p) => /Letter of Employment|appoint you|accept the above and|accept or decline within/i.test(p))
  .forEach((p) => console.log('ok:', p.slice(0, 120)));
