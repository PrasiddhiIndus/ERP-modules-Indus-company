import fs from 'fs';
import PizZip from 'pizzip';

const z = new PizZip(fs.readFileSync('public/templates/admin-recruitment/offer-letter.docx'));
const idRe = /r:(?:embed|id)="(rId\d+)"/g;
const imgRe = /image\d+\.(?:png|jpeg|jpg)/gi;

for (const part of ['document.xml', 'header1.xml', 'footer1.xml']) {
  const xml = z.file(`word/${part}`).asText();
  const ids = [...xml.matchAll(idRe)].map((m) => m[1]);
  const imgs = [...xml.matchAll(imgRe)].map((m) => m[0]);
  console.log(part, 'rIds', ids, 'imageRefs', imgs);
}
for (const part of ['document.xml.rels', 'header1.xml.rels', 'footer1.xml.rels']) {
  const p = `word/_rels/${part}`;
  console.log('---', p, '---');
  console.log(z.file(p)?.asText());
}
