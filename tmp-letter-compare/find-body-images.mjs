import fs from 'fs';
import PizZip from 'pizzip';

const z = new PizZip(fs.readFileSync('tmp-letter-compare/apt.docx'));
const doc = z.file('word/document.xml').asText();

const shapes = [];
const re = /<v:shape\b([^>]*)>([\s\S]*?)<\/v:shape>/g;
let m;
while ((m = re.exec(doc))) {
  const attrs = m[1];
  const body = m[2];
  const style = (attrs.match(/style="([^"]+)"/) || [])[1] || '';
  const rid = (body.match(/r:id="(rId\d+)"/) || [])[1] || '';
  shapes.push({ style, rid, snippet: m[0].slice(0, 180) });
}
console.log(JSON.stringify(shapes, null, 2));

// Also absolute positioned rects in body
const rects = [...doc.matchAll(/<v:rect\b([^>]*)\/>/g)].map((x) => x[1]);
console.log('rects', rects);
