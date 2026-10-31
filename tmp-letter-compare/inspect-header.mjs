import fs from 'fs';
import PizZip from 'pizzip';

const zip = new PizZip(fs.readFileSync('public/templates/admin-recruitment/offer-letter.docx'));
for (const name of ['word/header1.xml', 'word/footer1.xml']) {
  const xml = zip.file(name).asText();
  fs.writeFileSync(`tmp-letter-compare/${name.replace(/\//g, '_')}`, xml);
  console.log('\n====', name, 'len', xml.length);
  // images
  for (const re of [
    /wp:extent[^/]*\/>/g,
    /a:ext[^/]*\/>/g,
    /style="[^"]*"/g,
    /v:shape[^>]*>/g,
    /<w:spacing[^/]*\/>/g,
    /w:pgMar[^/]*\/>/g,
    /<w:p[\s>][\s\S]*?<\/w:p>/g,
  ]) {
    const hits = [...xml.matchAll(re)].slice(0, 15);
    if (!hits.length) continue;
    console.log(re.source.slice(0, 40), '→', hits.length);
    hits.slice(0, 6).forEach((h) => console.log(' ', h[0].replace(/\s+/g, ' ').slice(0, 200)));
  }
  const texts = [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
  console.log('texts', texts);
}
