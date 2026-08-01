/**
 * Pass 3: mop up remaining presentation hex outside tokens / PDF files.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const SKIP =
  /(Pdf|PDF|pdf|exportNodeToPdf|quotationPrint|InvoiceHtmlPreview|taxInvoice|print\.css|theme\/tokens\.)/;

const REPLACEMENTS = [
  ['#c084fc', 'var(--accent)'],
  ['#a855f7', 'var(--accent-deep)'],
  ['#2980b9', 'var(--info)'],
  ['#e6f0ff', 'var(--info-soft)'],
  ['#f8f9fa', 'var(--surface-raised)'],
  ['#60a5fa', 'var(--info)'],
  ['#a78bfa', 'var(--info)'],
  ['#6d28d9', 'var(--accent-deep)'],
  ['#1e40af', 'var(--info)'],
  ['#faf5ff', 'var(--accent-soft)'],
  ['#f5f3ff', 'var(--accent-soft)'],
  ['#e9d5ff', 'var(--accent-border)'],
  ['#18307a', 'var(--accent-deep)'],
  ['#f4f6f9', 'var(--canvas)'],
  ['#eef2f8', 'var(--info-soft)'],
  ['#f0f9ff', 'var(--info-soft)'],
  ['#eef2ff', 'var(--accent-soft)'],
];

const CLASS_REPLACEMENTS = [
  ['bg-[#f4f6f9]', 'bg-canvas'],
  ['bg-[#eef2f8]', 'bg-info-soft'],
  ['hover:bg-[#18307a]', 'hover:bg-accent-deep'],
  ['bg-[#f0f9ff]', 'bg-info-soft'],
  ['bg-[#eef2ff]', 'bg-accent-soft'],
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(ent.name)) continue;
      walk(full, out);
    } else if (/\.(js|jsx|ts|tsx|css)$/.test(ent.name)) out.push(full);
  }
  return out;
}

let changed = 0;
for (const file of walk(ROOT)) {
  const norm = file.replace(/\\/g, '/');
  if (SKIP.test(norm)) continue;
  let src = fs.readFileSync(file, 'utf8');
  const orig = src;
  for (const [a, b] of CLASS_REPLACEMENTS) src = src.split(a).join(b);
  for (const [a, b] of REPLACEMENTS) {
    if (src.includes(a)) src = src.split(a).join(b);
  }
  // Chart white strokes/fills
  src = src.replace(/stroke="#fff"/g, 'stroke="var(--surface)"');
  src = src.replace(/stroke='#fff'/g, "stroke='var(--surface)'");
  src = src.replace(/fill:\s*"#fff"/g, 'fill: "var(--surface)"');
  src = src.replace(/fill:\s*'#fff'/g, "fill: 'var(--surface)'");
  // Strip purple sticky gradients → solid accent-soft
  src = src.replace(
    /background-image:\s*linear-gradient\(90deg,\s*var\(--accent-soft\)\s*0%,\s*var\(--accent-soft\)\s*100%\)\s*!important;/g,
    'background-image: none !important;'
  );
  if (src !== orig) {
    fs.writeFileSync(file, src);
    changed += 1;
    console.log(path.relative(ROOT, file));
  }
}
console.log(`\nUpdated ${changed} files`);
