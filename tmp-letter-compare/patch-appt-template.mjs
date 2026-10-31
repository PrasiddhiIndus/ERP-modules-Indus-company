import fs from 'fs';
import { createRequire } from 'module';
import PizZip from 'pizzip';

const require = createRequire(import.meta.url);
// Re-use the same helpers by importing the module functions via dynamic eval of the file
// is awkward (side effects). Duplicate the small patch here to persist into the template.

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

function fixAppointmentCandidateNameBeforeAnnexure(xml) {
  let out = String(xml || '');
  const annexIdx = out.indexOf('<w:t>Annexure - I</w:t>');
  const nameTokIdx = out.indexOf('{{CANDIDATE_NAME}}');
  if (annexIdx < 0 && nameTokIdx < 0) return out;

  let target = null;
  let targetAbs = -1;
  const needleIdx = nameTokIdx >= 0 ? nameTokIdx : annexIdx;
  const pStart = out.lastIndexOf('<w:p ', needleIdx);
  const pEnd = out.indexOf('</w:p>', needleIdx);
  if (pStart >= 0 && pEnd > pStart) {
    let candidate = out.slice(pStart, pEnd + 6);
    if (nameTokIdx < 0 && candidate.includes('Annexure - I')) {
      const before = out.slice(Math.max(0, annexIdx - 5000), pStart);
      const paras = [...before.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)];
      candidate = null;
      for (let i = paras.length - 1; i >= 0; i--) {
        const p = paras[i][0];
        const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join('');
        if (!texts.trim()) continue;
        candidate = p;
        targetAbs = Math.max(0, annexIdx - 5000) + paras[i].index;
        break;
      }
    } else {
      targetAbs = pStart;
    }
    if (candidate) target = candidate;
  }
  if (!target || targetAbs < 0) return out;

  let fixed = target;
  fixed = fixed.replace(/<w:jc w:val="both"\/>/g, '<w:jc w:val="center"/>');
  if (!/<w:jc\b/.test(fixed) && /<w:pPr>/.test(fixed)) {
    fixed = fixed.replace(/<w:pPr>/, '<w:pPr><w:jc w:val="center"/>');
  }
  fixed = fixed.replace(/(?:<w:r\b[^>]*>\s*(?:<w:rPr>[\s\S]*?<\/w:rPr>\s*)?<w:tab\/>\s*<\/w:r>\s*)+/g, '');
  if (/<w:pPr>/.test(fixed) && !/w:pageBreakBefore/.test(fixed)) {
    fixed = fixed.replace(/<w:pPr>/, '<w:pPr><w:pageBreakBefore/>');
  }
  return `${out.slice(0, targetAbs)}${fixed}${out.slice(targetAbs + target.length)}`;
}

const path = 'public/templates/admin-recruitment/appointment-letter.docx';
const zip = new PizZip(fs.readFileSync(path));
const stylesAfter = fixAppointmentNoSpacingStyle(zip.file('word/styles.xml').asText());
const docAfter = fixAppointmentCandidateNameBeforeAnnexure(zip.file('word/document.xml').asText());
zip.file('word/styles.xml', stylesAfter);
zip.file('word/document.xml', docAfter);
fs.writeFileSync(path, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));

const verify = new PizZip(fs.readFileSync(path));
const ns = verify.file('word/styles.xml').asText().match(/<w:style[^>]*w:styleId="NoSpacing"[\s\S]*?<\/w:style>/)[0];
const doc = verify.file('word/document.xml').asText();
const nameIdx = doc.indexOf('{{CANDIDATE_NAME}}');
const namePara = doc.slice(doc.lastIndexOf('<w:p ', nameIdx), doc.indexOf('</w:p>', nameIdx) + 6);
console.log('NoSpacing has spacing:', /w:spacing/.test(ns));
console.log('name tabs', (namePara.match(/<w:tab\/>/g) || []).length);
console.log('name jc', (namePara.match(/<w:jc[^/]*\/>/) || [])[0]);
console.log('name pbb', /w:pageBreakBefore/.test(namePara));
console.log('name text', [...namePara.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join(''));
