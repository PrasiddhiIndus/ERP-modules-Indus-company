import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

function meta(raw) {
  const grab = (re) => {
    const m = raw.match(re);
    return m ? m[1] : '';
  };
  // PDFDocEncoding / literal strings; also try hex
  return {
    producer: grab(/\/Producer\s*\((?:\\.|[^\\)])*\)/) || grab(/\/Producer\s*<([0-9A-Fa-f]+)>/),
    creator: grab(/\/Creator\s*\((?:\\.|[^\\)])*\)/),
    producerRaw: (raw.match(/\/Producer[^\n\r]{0,120}/) || [])[0] || '',
    creatorRaw: (raw.match(/\/Creator[^\n\r]{0,120}/) || [])[0] || '',
    fonts: [...new Set([...raw.matchAll(/\/BaseFont\s*\/([^\s\/\[\(]+)/g)].map((m) => m[1]))].sort(),
  };
}

async function inspect(label, p) {
  const bytes = fs.readFileSync(p);
  const raw = bytes.toString('latin1');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const m = meta(raw);
  console.log('\n====', label);
  console.log('pages', doc.getPageCount(), 'bytes', bytes.length);
  console.log('producerRaw', m.producerRaw);
  console.log('creatorRaw', m.creatorRaw);
  console.log('fonts', m.fonts);
  // Check for LibreOffice markers
  console.log('has LibreOffice?', /LibreOffice|OpenOffice|writer/i.test(raw));
  console.log('has Microsoft?', /Microsoft|Word/i.test(raw.slice(0, 50000)));
}

await inspect('BAD user pdf', 'C:/Users/Amit/Downloads/Appointment-IFSPL-APT-2026-00008 (2).pdf');
await inspect('Word COM converted', 'tmp-letter-compare/user-appt-converted.pdf');
