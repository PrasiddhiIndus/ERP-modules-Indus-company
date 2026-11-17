import { pdf } from 'pdf-to-img';
import fs from 'fs';
fs.mkdirSync('tmp-letter-compare/appt-pdf-pages', { recursive: true });
const doc = await pdf('tmp-letter-compare/apt-letter-size-fixed.pdf', { scale: 2 });
let i = 0;
for await (const image of doc) {
  i += 1;
  fs.writeFileSync('tmp-letter-compare/appt-pdf-pages/page-' + i + '.png', image);
  console.log('wrote page', i, image.length);
}
console.log('done', i);
