import fs from 'fs';
import PizZip from 'pizzip';

/** Safe template patch: NoSpacing style only (no document.xml surgery). */
const path = 'public/templates/admin-recruitment/appointment-letter.docx';
const zip = new PizZip(fs.readFileSync(path));
const before = zip.file('word/styles.xml').asText();
const after = before.replace(
  /<w:style([^>]*w:styleId="NoSpacing"[^>]*)>([\s\S]*?)<\/w:style>/,
  (full, attrs, body) => {
    if (/<w:spacing\b/.test(body) && /<w:pPr>/.test(body)) return full;
    let next = body;
    if (/<w:pPr>/.test(next)) {
      if (!/<w:spacing\b/.test(next)) {
        next = next.replace(
          /<w:pPr>/,
          '<w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>'
        );
      }
    } else {
      next = `<w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>${next}`;
    }
    return `<w:style${attrs}>${next}</w:style>`;
  }
);
zip.file('word/styles.xml', after);
fs.writeFileSync(path, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
const xml = new PizZip(fs.readFileSync(path)).file('word/document.xml').asText();
const styles = new PizZip(fs.readFileSync(path)).file('word/styles.xml').asText();
console.log('Dear', xml.includes('Dear'), 'ack', xml.includes('acknowledge'), 'CONV', xml.includes('CONVEYANCE'));
console.log('NoSpacing spacing', /w:styleId="NoSpacing"[\s\S]*?w:spacing/.test(styles));
