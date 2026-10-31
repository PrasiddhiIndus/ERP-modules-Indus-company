import fs from 'fs';
import PizZip from 'pizzip';

function list(path, label) {
  const xml = new PizZip(fs.readFileSync(path)).file('word/document.xml').asText();
  const re = /<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  const paras = [];
  let m;
  while ((m = re.exec(xml))) {
    const p = m[0];
    const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join('');
    const empty = !texts.trim() && !/w:drawing|w:pict|v:imagedata|w:object/.test(p);
    const line = Number((p.match(/w:line="(\d+)"/) || [])[1] || 0);
    const after = Number((p.match(/w:after="(\d+)"/) || [])[1] || 0);
    const before = Number((p.match(/w:before="(\d+)"/) || [])[1] || 0);
    paras.push({
      text: texts.replace(/\s+/g, ' ').trim().slice(0, 100),
      empty,
      line,
      after,
      before,
      pbb: /w:pageBreakBefore/.test(p),
    });
  }
  console.log('\n====', label, 'paras', paras.length, 'empty', paras.filter((p) => p.empty).length);
  const sect = xml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)[0];
  console.log('pgMar', (sect.match(/<w:pgMar[^/]*\/>/) || [])[0]);
  console.log('pgSz', (sect.match(/<w:pgSz[^/]*\/>/) || [])[0]);

  for (const needle of ['CEO', 'I hereby acknowledge', 'Annexure - I', 'CODE OF CONDUCT', 'Annexure II']) {
    const idxs = paras.map((p, i) => (p.text.includes(needle) ? i : -1)).filter((i) => i >= 0);
    console.log('needle', needle, idxs);
  }
  const i = paras.findIndex((p) => p.text === 'CEO' || p.text.endsWith('CEO'));
  if (i >= 0) {
    console.log('-- around CEO');
    for (let j = i - 2; j <= i + 14 && j < paras.length; j++) {
      const p = paras[j];
      console.log(j, p.empty ? 'E' : 'T', `line${p.line}`, `a${p.after}`, `b${p.before}`, p.pbb ? 'PBB' : '', '|', p.text);
    }
  }
  const heights = [...xml.matchAll(/w:trHeight w:val="(\d+)"/g)].map((x) => Number(x[1]));
  console.log('trHeights', [...new Set(heights)].sort((a, b) => a - b), 'n=', heights.length);

  // default paragraph style from styles.xml
  const styles = new PizZip(fs.readFileSync(path)).file('word/styles.xml')?.asText() || '';
  const docDefaults = styles.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/);
  console.log('docDefaults spacing', (docDefaults?.[0].match(/<w:spacing[^/]*\/>/) || [])[0]);
  console.log('docDefaults fonts', (docDefaults?.[0].match(/<w:rFonts[^/]*\/>/) || []).slice(0, 2));
}

list('public/templates/admin-recruitment/appointment-letter.docx', 'TEMPLATE');
list('tmp-letter-compare/user-appointment.docx', 'USER');
