/**
 * Pass 4: finance greens + leftover navy hovers → tokens.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const SKIP =
  /(Pdf|PDF|pdf|exportNodeToPdf|quotationPrint|InvoiceHtmlPreview|taxInvoice|print\.css|theme\/tokens\.)/;

const CLASS = [
  ['bg-[#1F6F4E]', 'bg-accent'],
  ['bg-[#1f6f4e]', 'bg-accent'],
  ['hover:bg-[#1A5E42]', 'hover:bg-accent-deep'],
  ['hover:bg-[#1a5e42]', 'hover:bg-accent-deep'],
  ['hover:bg-[#172554]', 'hover:bg-accent-deep'],
  ['hover:bg-[#172c69]', 'hover:bg-accent-deep'],
  ['bg-[#172554]', 'bg-accent-deep'],
];

const STYLE = [
  ['#1F6F4E', 'var(--accent)'], // fallbacks — JS maps handled separately where TOKENS needed
  ['#1A5E42', 'var(--accent-deep)'],
  ['#16774E', 'var(--success)'],
  ['#B23F2A', 'var(--critical)'],
  ['#8A938C', 'var(--text-muted)'],
  ['#172554', 'var(--accent-deep)'],
  ['#172c69', 'var(--accent-deep)'],
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
  for (const [a, b] of CLASS) src = src.split(a).join(b);
  for (const [a, b] of STYLE) {
    if (!src.includes(a)) continue;
    // Don't blindly replace in ExpenseHeads palette / siteLedgerStore — handled below via TOKENS
    src = src.split(a).join(b);
  }
  if (src !== orig) {
    fs.writeFileSync(file, src);
    changed += 1;
    console.log(path.relative(ROOT, file));
  }
}
console.log(`\nUpdated ${changed} files`);
