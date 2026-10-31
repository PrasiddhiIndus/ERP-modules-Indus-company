import fs from 'fs';
import PizZip from 'pizzip';

function fixAppointmentNoSpacingStyle(stylesXml) {
  let out = String(stylesXml || '');
  if (!out.includes('w:styleId="NoSpacing"')) return out;
  return out.replace(
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
}

function fixAppointmentAnnexureIPagination(xml) {
  let out = String(xml || '');
  const annexIdx = out.indexOf('<w:t>Annexure - I</w:t>');
  const nameTokIdx = out.indexOf('{{CANDIDATE_NAME}}');

  if (nameTokIdx >= 0 || annexIdx >= 0) {
    let target = null;
    let targetAbs = -1;
    if (nameTokIdx >= 0) {
      const pStart = out.lastIndexOf('<w:p ', nameTokIdx);
      const pEnd = out.indexOf('</w:p>', nameTokIdx);
      if (pStart >= 0 && pEnd > pStart) {
        target = out.slice(pStart, pEnd + 6);
        targetAbs = pStart;
      }
    }
    if (target && targetAbs >= 0) {
      let fixed = target;
      fixed = fixed.replace(/<w:pageBreakBefore\s*\/>/g, '');
      fixed = fixed.replace(/<w:jc w:val="both"\/>/g, '<w:jc w:val="center"/>');
      if (!/<w:jc\b/.test(fixed) && /<w:pPr>/.test(fixed)) {
        fixed = fixed.replace(/<w:pPr>/, '<w:pPr><w:jc w:val="center"/>');
      }
      fixed = fixed.replace(/(?:<w:r\b[^>]*>\s*(?:<w:rPr>[\s\S]*?<\/w:rPr>\s*)?<w:tab\/>\s*<\/w:r>\s*)+/g, '');
      out = `${out.slice(0, targetAbs)}${fixed}${out.slice(targetAbs + target.length)}`;
    }
  }

  if (out.includes('<w:t>Annexure - I</w:t>')) {
    const i = out.indexOf('<w:t>Annexure - I</w:t>');
    const head = out.slice(Math.max(0, i - 400), i);
    if (!/w:pageBreakBefore/.test(head)) {
      out = out.replace(
        /(<w:p\b[^>]*>\s*<w:pPr>)([\s\S]*?<w:t>Annexure - I<\/w:t>[\s\S]*?<\/w:p>)/,
        (full, open, rest) => (/w:pageBreakBefore/.test(full) ? full : `${open}<w:pageBreakBefore/>${rest}`)
      );
    }
  }

  const emptyPara =
    '(?:<w:p\\b[^>]*/>|<w:p\\b[^>]*>\\s*(?:<w:pPr>[\\s\\S]*?</w:pPr>\\s*)?</w:p>)';
  const gap = new RegExp(
    `(<w:t>(?:\\{\\{CANDIDATE_NAME\\}\\}|[^<]{2,80})</w:t>[\\s\\S]*?</w:p>)` +
      `((?:\\s*${emptyPara}){2,})` +
      `(\\s*<w:p\\b[^>]*>\\s*<w:pPr>[\\s\\S]*?<w:t>Annexure - I</w:t>)`
  );
  if (gap.test(out)) {
    const keepOne =
      '<w:p><w:pPr><w:pStyle w:val="NoSpacing"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:p>';
    out = out.replace(gap, (_, nameBlock, _empties, annexStart) => `${nameBlock}${keepOne}${annexStart}`);
  }
  return out;
}

const path = 'public/templates/admin-recruitment/appointment-letter.docx';
const zip = new PizZip(fs.readFileSync(path));
zip.file('word/styles.xml', fixAppointmentNoSpacingStyle(zip.file('word/styles.xml').asText()));
zip.file('word/document.xml', fixAppointmentAnnexureIPagination(zip.file('word/document.xml').asText()));
fs.writeFileSync(path, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));

const doc = new PizZip(fs.readFileSync(path)).file('word/document.xml').asText();
const nameIdx = doc.indexOf('{{CANDIDATE_NAME}}');
const namePara = doc.slice(doc.lastIndexOf('<w:p ', nameIdx), doc.indexOf('</w:p>', nameIdx) + 6);
const annexIdx = doc.indexOf('<w:t>Annexure - I</w:t>');
const annexPara = doc.slice(doc.lastIndexOf('<w:p ', annexIdx), doc.indexOf('</w:p>', annexIdx) + 6);
console.log('name tabs', (namePara.match(/<w:tab\/>/g) || []).length, 'pbb', /w:pageBreakBefore/.test(namePara), 'jc', (namePara.match(/<w:jc[^/]*\/>/) || [])[0]);
console.log('annex pbb', /w:pageBreakBefore/.test(annexPara));
