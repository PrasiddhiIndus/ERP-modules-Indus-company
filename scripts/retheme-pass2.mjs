/**
 * Pass 2: map remaining hard-coded hex → semantic Tailwind utilities / CSS vars.
 * Prefer bg-accent over bg-[var(--accent)]. Skips theme tokens + PDF/print files.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

const SKIP_FILE_RE =
  /(Pdf|PDF|pdf|exportNodeToPdf|quotationPrint|InvoiceHtmlPreview|taxInvoice|print\.css|theme\/tokens\.)/;

/** Tailwind arbitrary [#hex] → utility suffix (prefix kept: bg-/text-/border-/…) */
const CLASS_HEX_TO_UTIL = [
  // Bright navy leftovers → accent-deep
  ['[#1a3278]', 'accent-deep'],
  ['[#1A3278]', 'accent-deep'],
  ['[#1a3275]', 'accent-deep'],
  ['[#1A3275]', 'accent-deep'],
  ['[#172e6e]', 'accent-deep'],
  ['[#172E6E]', 'accent-deep'],
  ['[#18306f]', 'accent-deep'],
  ['[#18306F]', 'accent-deep'],
  ['[#2c4084]', 'accent-deep'],
  ['[#2C4084]', 'accent-deep'],
  ['[#243670]', 'accent-deep'],
  ['[#1a3a6c]', 'accent'],
  ['[#1A3A6C]', 'accent'],

  // Warm parchment / salary CTC neutrals
  ['[#d4d0c8]', 'border-strong'],
  ['[#D4D0C8]', 'border-strong'],
  ['[#c4bfb6]', 'border-strong'],
  ['[#C4BFB6]', 'border-strong'],
  ['[#e5e1d8]', 'border'],
  ['[#E5E1D8]', 'border'],
  ['[#eceae4]', 'divider'],
  ['[#ECEAE4]', 'divider'],
  ['[#ebe7df]', 'border'],
  ['[#EBE7DF]', 'border'],
  ['[#f0eee8]', 'canvas'],
  ['[#F0EEE8]', 'canvas'],
  ['[#f3f1ec]', 'surface-sunken'],
  ['[#F3F1EC]', 'surface-sunken'],
  ['[#f7f5f1]', 'surface-raised'],
  ['[#F7F5F1]', 'surface-raised'],
  ['[#f7f5f0]', 'surface-raised'],
  ['[#F7F5F0]', 'surface-raised'],
  ['[#faf9f6]', 'row-hover'],
  ['[#FAF9F6]', 'row-hover'],
  ['[#f3ebe0]', 'warning-soft'],
  ['[#F3EBE0]', 'warning-soft'],
  ['[#f3e6d4]', 'warning-soft'],
  ['[#F3E6D4]', 'warning-soft'],
  ['[#e8f3ef]', 'accent-soft'],
  ['[#E8F3EF]', 'accent-soft'],
  ['[#8a857c]', 'ink-muted'],
  ['[#8A857C]', 'ink-muted'],
  ['[#9a958c]', 'ink-disabled'],
  ['[#9A958C]', 'ink-disabled'],
  ['[#b0aaa0]', 'ink-disabled'],
  ['[#B0AAA0]', 'ink-disabled'],
  ['[#d0cbc3]', 'ink-disabled'],
  ['[#D0CBC3]', 'ink-disabled'],
  ['[#6b665e]', 'ink-muted'],
  ['[#6B665E]', 'ink-muted'],
  ['[#5c584f]', 'ink-secondary'],
  ['[#5C584F]', 'ink-secondary'],
  ['[#7a5a2e]', 'warning'],
  ['[#7A5A2E]', 'warning'],
  ['[#1a1a1a]', 'ink-strong'],
  ['[#1A1A1A]', 'ink-strong'],
  ['[#2a2a2a]', 'ink'],
  ['[#2A2A2A]', 'ink'],

  // Cool blues → info / accent-soft
  ['[#f2f6ff]', 'info-soft'],
  ['[#F2F6FF]', 'info-soft'],
  ['[#e8edf5]', 'info-soft'],
  ['[#E8EDF5]', 'info-soft'],
  ['[#dbe4ee]', 'info-soft'],
  ['[#DBE4EE]', 'info-soft'],
  ['[#4a90c4]', 'info'],
  ['[#4A90C4]', 'info'],
  ['[#3d7aab]', 'info'],
  ['[#3D7AAB]', 'info'],
  ['[#55708a]', 'ink-secondary'],
  ['[#55708A]', 'ink-secondary'],
  ['[#1e3a5f]', 'accent'],
  ['[#1E3A5F]', 'accent'],

  // Datawizard accent buttons (desaturate to series)
  ['[#d976a3]', 'critical'],
  ['[#D976A3]', 'critical'],
  ['[#c86592]', 'critical'],
  ['[#C86592]', 'critical'],
  ['[#5cb8a8]', 'success'],
  ['[#5CB8A8]', 'success'],
  ['[#4aa797]', 'success'],
  ['[#4AA797]', 'success'],

  // Misc leftover greens/ambers still as hex
  ['[#ecfdf5]', 'success-soft'],
  ['[#ECFDF5]', 'success-soft'],
  ['[#d1fae5]', 'success-soft'],
  ['[#D1FAE5]', 'success-soft'],
  ['[#166534]', 'success'],
  ['[#166534]', 'success'],
  ['[#92400e]', 'warning'],
  ['[#92400E]', 'warning'],
  ['[#c2410c]', 'warning'],
  ['[#C2410C]', 'warning'],
  ['[#991b1b]', 'critical'],
  ['[#991B1B]', 'critical'],
];

/** Bare hex in CSS / inline styles → var(--token) */
const STYLE_HEX = [
  ['#1a3278', 'var(--accent-deep)'],
  ['#1A3278', 'var(--accent-deep)'],
  ['#1a3275', 'var(--accent-deep)'],
  ['#1A3275', 'var(--accent-deep)'],
  ['#172e6e', 'var(--accent-deep)'],
  ['#172E6E', 'var(--accent-deep)'],
  ['#18306f', 'var(--accent-deep)'],
  ['#18306F', 'var(--accent-deep)'],
  ['#2c4084', 'var(--accent-deep)'],
  ['#2C4084', 'var(--accent-deep)'],
  ['#243670', 'var(--accent-deep)'],
  ['#1a3a6c', 'var(--accent)'],
  ['#1A3A6C', 'var(--accent)'],

  ['#f2f6ff', 'var(--info-soft)'],
  ['#F2F6FF', 'var(--info-soft)'],
  ['#e8edf5', 'var(--info-soft)'],
  ['#E8EDF5', 'var(--info-soft)'],
  ['#dbe4ee', 'var(--info-soft)'],
  ['#DBE4EE', 'var(--info-soft)'],
  ['#4a90c4', 'var(--info)'],
  ['#4A90C4', 'var(--info)'],
  ['#3d7aab', 'var(--info)'],
  ['#55708a', 'var(--text-secondary)'],
  ['#1e3a5f', 'var(--accent)'],

  ['#ecfdf5', 'var(--success-soft)'],
  ['#ECFDF5', 'var(--success-soft)'],
  ['#d1fae5', 'var(--success-soft)'],
  ['#D1FAE5', 'var(--success-soft)'],
  ['#166534', 'var(--success)'],
  ['#92400e', 'var(--warning)'],
  ['#92400E', 'var(--warning)'],
  ['#c2410c', 'var(--warning)'],
  ['#C2410C', 'var(--warning)'],
  ['#991b1b', 'var(--critical)'],
  ['#991B1B', 'var(--critical)'],
  // chart-grid leftover
  ['#f0f0f0', 'var(--chart-grid)'],
  ['#F0F0F0', 'var(--chart-grid)'],

  // Site ledger leftover surfaces
  ['#fafbfc', 'var(--surface-raised)'],
  ['#FAFBFC', 'var(--surface-raised)'],
  ['#f0f1f3', 'var(--divider)'],
  ['#F0F1F3', 'var(--divider)'],
  ['#eceff3', 'var(--surface-sunken)'],
  ['#ECEFF3', 'var(--surface-sunken)'],
  ['#e8f1ec', 'var(--success-soft)'],
  ['#E8F1EC', 'var(--success-soft)'],
  ['#f8ece9', 'var(--critical-soft)'],
  ['#F8ECE9', 'var(--critical-soft)'],
  ['#fffbfb', 'var(--critical-soft)'],
  ['#FFFBFB', 'var(--critical-soft)'],
  ['#fafafa', 'var(--surface-raised)'],
  ['#FAFAFA', 'var(--surface-raised)'],

  // Product catalog black borders → ink
  ['#000000', 'var(--text)'],
  ['#000', 'var(--text)'],

  // Common whites in CSS blocks (not JS ambiguous)
  // handled per-file for CSS-in-JS strings below
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

function remapClassHex(src) {
  let out = src;
  for (const [arb, util] of CLASS_HEX_TO_UTIL) {
    if (!out.includes(arb)) continue;
    // Match optional variants + color prefix + -[ #hex ] + optional opacity
    // e.g. hover:bg-[#18306f]/50 → hover:bg-accent-deep/50
    const esc = arb.replace(/[[\]]/g, (c) => `\\${c}`);
    const re = new RegExp(
      `((?:[\\w-]+:)*)(bg|text|border|ring|from|to|via|outline|fill|stroke|decoration|divide|accent|caret)-${esc}(\\/\\d+)?`,
      'g'
    );
    out = out.replace(re, (_, variants, pref, opac) => `${variants}${pref}-${util}${opac || ''}`);
  }
  return out;
}

function remapStyleHex(src, isCss) {
  let out = src;
  for (const [hex, cssVar] of STYLE_HEX) {
    if (!out.includes(hex)) continue;
    if (!isCss && (hex === '#000' || hex === '#fff' || hex === '#FFF')) {
      // only replace when clearly in style/CSS string context
      out = out.replaceAll(`'${hex}'`, `'${cssVar}'`);
      out = out.replaceAll(`"${hex}"`, `"${cssVar}"`);
      out = out.replaceAll(`solid ${hex}`, `solid ${cssVar}`);
      out = out.replaceAll(`: ${hex}`, `: ${cssVar}`);
      continue;
    }
    if (!isCss && hex.length <= 4) continue;
    out = out.split(hex).join(cssVar);
  }
  return out;
}

/** Strip decorative brand gradients → solid accent */
function stripGradients(src) {
  let out = src;
  out = out.replace(
    /bg-gradient-to-r\s+from-accent\s+to-accent-deep/g,
    'bg-accent'
  );
  out = out.replace(
    /bg-gradient-to-r\s+from-accent\s+to-\[#[0-9a-fA-F]+\]/g,
    'bg-accent'
  );
  out = out.replace(
    /from-accent\s+to-accent-deep/g,
    'bg-accent'
  );
  out = out.replace(
    /from-accent\s+to-\[#[0-9a-fA-F]+\]/g,
    'bg-accent'
  );
  // CSS linear-gradient chrome
  out = out.replace(
    /linear-gradient\(180deg,\s*#fff\s*0%,\s*var\(--surface-raised\)\s*100%\)/g,
    'var(--surface)'
  );
  out = out.replace(
    /linear-gradient\(180deg,\s*var\(--surface\)\s*0%,\s*var\(--surface-raised\)\s*100%\)/g,
    'var(--surface)'
  );
  return out;
}

const files = walk(ROOT);
let changed = 0;
for (const file of files) {
  const norm = file.replace(/\\/g, '/');
  if (SKIP_FILE_RE.test(norm)) continue;
  let src = fs.readFileSync(file, 'utf8');
  const orig = src;
  const isCss = file.endsWith('.css');
  src = remapClassHex(src);
  src = remapStyleHex(src, isCss);
  src = stripGradients(src);
  // CSS #fff leftovers in style blocks
  if (isCss || /style=\{\{|`[\s\S]*--/.test(src)) {
    src = src.replace(/background:#fff\b/g, 'background:var(--surface)');
    src = src.replace(/background: #fff\b/g, 'background: var(--surface)');
    src = src.replace(/color:#fff\b/g, 'color:var(--surface)');
    src = src.replace(/,\s*#fff\b/g, ',var(--surface)');
  }
  if (src !== orig) {
    fs.writeFileSync(file, src);
    changed += 1;
    console.log(path.relative(ROOT, file));
  }
}
console.log(`\nUpdated ${changed} files`);
