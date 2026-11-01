import fs from 'fs';
import PizZip from 'pizzip';

const path = 'public/templates/admin-recruitment/appointment-letter.docx';
const zip = new PizZip(fs.readFileSync(path));
const before = zip.file('word/styles.xml').asText();
const after = before.replace(
  /<w:style([^>]*w:styleId="NoSpacing"[^>]*)>([\s\S]*?)<\/w:style>/,
  (_full, attrs, body) => {
    let next = body;
    if (!/<w:basedOn\b/.test(next)) next = '<w:basedOn w:val="Normal"/>' + next;
    if (/<w:pPr>/.test(next)) {
      if (!/<w:spacing\b/.test(next)) {
        next = next.replace(
          '<w:pPr>',
          '<w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>'
        );
      }
    } else {
      next =
        '<w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>' +
        next;
    }
    return `<w:style${attrs}>${next}</w:style>`;
  }
);

if (after === before) {
  console.log('template styles already have NoSpacing spacing (or style missing)');
} else {
  zip.file('word/styles.xml', after);
  fs.writeFileSync(path, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log('patched template NoSpacing style');
}

const ns = new PizZip(fs.readFileSync(path))
  .file('word/styles.xml')
  .asText()
  .match(/<w:style[^>]*w:styleId="NoSpacing"[\s\S]*?<\/w:style>/)?.[0];
console.log(ns ? ns.replace(/\s+/g, ' ').slice(0, 400) : 'NoSpacing missing');
