import fs from 'fs';
import PizZip from 'pizzip';

const docxPath = process.argv[2] || 'C:/Users/Amit/Downloads/Appointment-IFSPL-APT-2026-00008.docx';
const zip = new PizZip(fs.readFileSync(docxPath));
const files = Object.keys(zip.files).filter((n) => n.endsWith('.xml'));
const counts = new Map();
for (const name of files) {
  const xml = zip.file(name).asText();
  for (const m of xml.matchAll(/w:(?:ascii|hAnsi|cs|eastAsia)="([^"]+)"/g)) {
    counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  }
  for (const m of xml.matchAll(/w:asciiTheme="([^"]+)"/g)) {
    counts.set('theme:' + m[1], (counts.get('theme:' + m[1]) || 0) + 1);
  }
}
console.log([...counts.entries()].sort((a, b) => b[1] - a[1]));

// Estimate body text font for non-empty paragraphs
const doc = zip.file('word/document.xml').asText();
const paras = [...doc.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)];
const bodyFonts = new Map();
for (const m of paras) {
  const p = m[0];
  const text = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join('').trim();
  if (!text) continue;
  const font = (p.match(/w:ascii="([^"]+)"/) || p.match(/w:hAnsi="([^"]+)"/) || [])[1] || '(inherit)';
  bodyFonts.set(font, (bodyFonts.get(font) || 0) + 1);
}
console.log('non-empty para primary fonts', [...bodyFonts.entries()].sort((a, b) => b[1] - a[1]));
