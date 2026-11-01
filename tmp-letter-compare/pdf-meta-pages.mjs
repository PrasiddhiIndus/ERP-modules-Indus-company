import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

const paths = process.argv.slice(2);
for (const p of paths) {
  if (!fs.existsSync(p)) {
    console.log('missing', p);
    continue;
  }
  const bytes = fs.readFileSync(p);
  const raw = bytes.toString('latin1');
  const producer = (raw.match(/\/Producer\s*\(([^)]*)\)/) || [])[1] || '';
  const creator = (raw.match(/\/Creator\s*\(([^)]*)\)/) || [])[1] || '';
  const title = (raw.match(/\/Title\s*\(([^)]*)\)/) || [])[1] || '';
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPageCount();
  const size = doc.getPage(0).getSize();
  console.log(JSON.stringify({
    file: p.split(/[\\/]/).pop(),
    bytes: bytes.length,
    pages,
    page0: `${Math.round(size.width)}x${Math.round(size.height)}`,
    producer,
    creator,
    title,
  }));

  // Extract rough text density via content stream lengths
  for (let i = 0; i < pages; i++) {
    const page = doc.getPage(i);
    const { width, height } = page.getSize();
    console.log(`  page ${i + 1}: ${Math.round(width)}x${Math.round(height)}`);
  }
}
