import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import PizZip from 'pizzip';

const require = createRequire(import.meta.url);
const docxPath = process.argv[2] || 'C:/Users/Amit/Downloads/Appointment-IFSPL-APT-2026-00008.docx';
const pdfPaths = [
  'C:/Users/Amit/Downloads/Appointment-IFSPL-APT-2026-00008.pdf',
  'C:/Users/Amit/Downloads/Appointment-IFSPL-APT-2026-00008 (1).pdf',
  'C:/Users/Amit/Downloads/Appointment-IFSPL-APT-2026-00008 (2).pdf',
  'C:/Users/Amit/.cursor/projects/c-Users-Amit-Desktop-ERP-modules-Indus-company/attachments/c8ef9532-c7ee-4ab0-9b63-2fd35516cb40/Appointment-IFSPL-APT-2026-00008__2_.pdf',
];

async function loadPdfJs() {
  try {
    return await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch {
    try {
      return require('pdfjs-dist/legacy/build/pdf.js');
    } catch {
      const candidates = [
        path.join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.mjs'),
        path.join(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.mjs'),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) return await import(pathToFileURLCompat(c));
      }
      throw new Error('pdfjs-dist not found');
    }
  }
}

function pathToFileURLCompat(p) {
  const { pathToFileURL } = require('url');
  return pathToFileURL(p).href;
}

const zip = new PizZip(fs.readFileSync(docxPath));
const doc = zip.file('word/document.xml').asText();
const styles = zip.file('word/styles.xml')?.asText() || '';
console.log('=== DOCX', path.basename(docxPath), 'bytes', fs.statSync(docxPath).size);
const sect = (doc.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g) || []).at(-1);
console.log('sectPr', sect?.replace(/</g, '\n<').slice(0, 600));
const noSpacing = styles.match(/<w:style[^>]*w:styleId="NoSpacing"[^>]*>[\s\S]*?<\/w:style>/);
console.log('NoSpacing has compact spacing?', /w:line="240"/.test(noSpacing?.[0] || ''));
console.log('pageBreakBefore', (doc.match(/w:pageBreakBefore/g) || []).length);

// theme fonts / default
const theme = zip.file('word/theme/theme1.xml')?.asText() || '';
const major = theme.match(/majorFont[\s\S]*?<\/a:majorFont>/)?.[0]?.match(/typeface="([^"]+)"/g);
const minor = theme.match(/minorFont[\s\S]*?<\/a:minorFont>/)?.[0]?.match(/typeface="([^"]+)"/g);
console.log('theme major', major?.slice(0, 5));
console.log('theme minor', minor?.slice(0, 5));

const pdfjs = await loadPdfJs();
const getDocument = pdfjs.getDocument;
for (const pdfPath of pdfPaths) {
  if (!fs.existsSync(pdfPath)) continue;
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await getDocument({ data, disableWorker: true }).promise;
  console.log('\n=== PDF', path.basename(pdfPath), 'pages', pdf.numPages, 'bytes', data.length);
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const text = await page.getTextContent();
    const items = text.items.filter((it) => it.str && String(it.str).trim());
    const ys = items.map((it) => it.transform[5]);
    console.log(
      `p${p}`,
      Math.round(viewport.width) + 'x' + Math.round(viewport.height),
      'items',
      items.length,
      'y',
      ys.length ? `${Math.round(Math.min(...ys))}..${Math.round(Math.max(...ys))}` : '-',
      '|',
      items.slice(0, 3).map((i) => i.str).join(' · '),
      '…',
      items.slice(-2).map((i) => i.str).join(' · ')
    );
  }
}
