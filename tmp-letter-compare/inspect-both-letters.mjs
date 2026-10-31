import fs from 'fs';
import PizZip from 'pizzip';

function paras(xml) {
  const out = [];
  // match both <w:p>...</w:p> and self-closing <w:p .../>
  const re = /<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let m;
  while ((m = re.exec(xml))) {
    const p = m[0];
    const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join('');
    const selfClose = /\/>$/.test(p) && !p.includes('</w:p>');
    out.push({
      text: texts.replace(/\s+/g, ' ').trim().slice(0, 90),
      empty: selfClose || (!texts.trim() && !/w:drawing|w:pict|v:imagedata/.test(p)),
      pbb: /w:pageBreakBefore/.test(p),
      keepNext: /w:keepNext/.test(p),
      keepLines: /w:keepLines/.test(p),
      spacing: (p.match(/<w:spacing[^/]*\/>/) || [''])[0],
      drawing: /w:drawing|w:pict|v:imagedata/.test(p),
    });
  }
  return out;
}

function inspect(path) {
  const zip = new PizZip(fs.readFileSync(path));
  const xml = zip.file('word/document.xml').asText();
  console.log('\n====', path);
  console.log('pgMar', (xml.match(/<w:pgMar[^/]*\/>/) || [])[0]);
  console.log('pageBreakBefore count', (xml.match(/w:pageBreakBefore/g) || []).length);
  const list = paras(xml);
  const start = list.findIndex((p) => /Yours sincerely|Annexure|I accept|I hereby/i.test(p.text) || p.pbb);
  const from = Math.max(0, start - 3);
  for (let i = from; i < Math.min(list.length, from + 25); i++) {
    const p = list[i];
    console.log(
      String(i).padStart(3),
      p.empty ? 'EMPTY' : p.drawing ? 'IMG  ' : 'TXT  ',
      p.pbb ? 'PBB' : '   ',
      p.keepNext ? 'KN' : '  ',
      p.keepLines ? 'KL' : '  ',
      '|',
      p.text || ''
    );
  }
  // empty runs
  let run = 0;
  let maxRun = 0;
  let maxAt = -1;
  for (let i = 0; i < list.length; i++) {
    if (list[i].empty) {
      run++;
      if (run > maxRun) {
        maxRun = run;
        maxAt = i;
      }
    } else run = 0;
  }
  console.log('max empty run', maxRun, 'ending at', maxAt);
}

inspect('public/templates/admin-recruitment/offer-letter.docx');
inspect('public/templates/admin-recruitment/appointment-letter.docx');
