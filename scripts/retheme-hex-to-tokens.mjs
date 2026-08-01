/**
 * One-shot presentation remapper: replace hard-coded colors with INDUS OS tokens.
 * Safe for styles / class strings only — does not touch SQL, migrations, or package-lock.
 *
 * Usage: node scripts/retheme-hex-to-tokens.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', 'src');

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.css']);

/** Hex → replacement. Prefer CSS var() in CSS; TOKENS / CHART_SERIES in JS when already imported. */
const HEX_MAP = [
  // Brand / accent (bright reds → sage)
  ['#C8102E', 'var(--accent)'],
  ['#c8102e', 'var(--accent)'],
  ['#A50D25', 'var(--accent-deep)'],
  ['#a50d25', 'var(--accent-deep)'],
  ['#dc2626', 'var(--accent)'],
  ['#DC2626', 'var(--accent)'],
  ['#b91c1c', 'var(--accent-deep)'],
  ['#B91C1C', 'var(--accent-deep)'],
  ['#ef4444', 'var(--critical)'],
  ['#EF4444', 'var(--critical)'],
  ['#fef2f2', 'var(--critical-soft)'],
  ['#FEF2F2', 'var(--critical-soft)'],
  ['#fecaca', 'var(--critical-border)'],
  ['#FECACA', 'var(--critical-border)'],
  ['#fee2e2', 'var(--critical-soft)'],
  ['#FEE2E2', 'var(--critical-soft)'],

  // Blues / navy → info / accent
  ['#1F3A8A', 'var(--accent)'],
  ['#1f3a8a', 'var(--accent)'],
  ['#1E3A8A', 'var(--accent)'],
  ['#1e3a8a', 'var(--accent)'],
  ['#1E90FF', 'var(--info)'],
  ['#1e90ff', 'var(--info)'],
  ['#00D4FF', 'var(--info)'],
  ['#00d4ff', 'var(--info)'],
  ['#0B1220', 'var(--text)'],
  ['#0b1220', 'var(--text)'],
  ['#0F1B2E', 'var(--surface-sunken)'],
  ['#0f1b2e', 'var(--surface-sunken)'],
  ['#2563eb', 'var(--info)'],
  ['#2563EB', 'var(--info)'],
  ['#3b82f6', 'var(--info)'],
  ['#3B82F6', 'var(--info)'],
  ['#1d4ed8', 'var(--info)'],
  ['#1D4ED8', 'var(--info)'],
  ['#dbeafe', 'var(--info-soft)'],
  ['#DBEAFE', 'var(--info-soft)'],
  ['#eff6ff', 'var(--info-soft)'],
  ['#EFF6FF', 'var(--info-soft)'],
  ['#bfdbfe', 'var(--info-border)'],
  ['#BFDBFE', 'var(--info-border)'],

  // Greens
  ['#10B981', 'var(--success)'],
  ['#10b981', 'var(--success)'],
  ['#059669', 'var(--success)'],
  ['#16a34a', 'var(--success)'],
  ['#16A34A', 'var(--success)'],
  ['#22c55e', 'var(--success)'],
  ['#22C55E', 'var(--success)'],
  ['#15803d', 'var(--success)'],
  ['#15803D', 'var(--success)'],
  ['#dcfce7', 'var(--success-soft)'],
  ['#DCFCE7', 'var(--success-soft)'],
  ['#f0fdf4', 'var(--success-soft)'],
  ['#F0FDF4', 'var(--success-soft)'],
  ['#bbf7d0', 'var(--success-border)'],
  ['#BBF7D0', 'var(--success-border)'],

  // Ambers / yellows
  ['#f59e0b', 'var(--warning)'],
  ['#F59E0B', 'var(--warning)'],
  ['#d97706', 'var(--warning)'],
  ['#D97706', 'var(--warning)'],
  ['#eab308', 'var(--warning)'],
  ['#EAB308', 'var(--warning)'],
  ['#ca8a04', 'var(--warning)'],
  ['#CA8A04', 'var(--warning)'],
  ['#fef3c7', 'var(--warning-soft)'],
  ['#FEF3C7', 'var(--warning-soft)'],
  ['#fffbeb', 'var(--warning-soft)'],
  ['#FFFBEB', 'var(--warning-soft)'],
  ['#fde68a', 'var(--warning-border)'],
  ['#FDE68A', 'var(--warning-border)'],
  ['#fbbf24', 'var(--warning)'],
  ['#FBBF24', 'var(--warning)'],

  // Neutrals / grays (common)
  ['#111827', 'var(--text)'],
  ['#1f2937', 'var(--text)'],
  ['#1F2937', 'var(--text)'],
  ['#374151', 'var(--text-strong)'],
  ['#4b5563', 'var(--text-secondary)'],
  ['#4B5563', 'var(--text-secondary)'],
  ['#6b7280', 'var(--text-muted)'],
  ['#6B7280', 'var(--text-muted)'],
  ['#9ca3af', 'var(--text-disabled)'],
  ['#9CA3AF', 'var(--text-disabled)'],
  ['#d1d5db', 'var(--border-strong)'],
  ['#D1D5DB', 'var(--border-strong)'],
  ['#e5e7eb', 'var(--border)'],
  ['#E5E7EB', 'var(--border)'],
  ['#f3f4f6', 'var(--surface-sunken)'],
  ['#F3F4F6', 'var(--surface-sunken)'],
  ['#f9fafb', 'var(--surface-raised)'],
  ['#F9FAFB', 'var(--surface-raised)'],
  ['#F7F9FC', 'var(--canvas)'],
  ['#f7f9fc', 'var(--canvas)'],
  ['#EEF2F7', 'var(--surface-sunken)'],
  ['#eef2f7', 'var(--surface-sunken)'],
  ['#ffffff', 'var(--surface)'],
  ['#FFFFFF', 'var(--surface)'],
  ['#fff', 'var(--surface)'],
  ['#FFF', 'var(--surface)'],
  ['#000000', 'var(--text)'],
  ['#000', 'var(--text)'],

  // Slate common
  ['#0f172a', 'var(--text)'],
  ['#0F172A', 'var(--text)'],
  ['#1e293b', 'var(--text)'],
  ['#1E293B', 'var(--text)'],
  ['#334155', 'var(--text-strong)'],
  ['#475569', 'var(--text-secondary)'],
  ['#64748b', 'var(--text-muted)'],
  ['#64748B', 'var(--text-muted)'],
  ['#94a3b8', 'var(--text-disabled)'],
  ['#94A3B8', 'var(--text-disabled)'],
  ['#cbd5e1', 'var(--border-strong)'],
  ['#CBD5E1', 'var(--border-strong)'],
  ['#e2e8f0', 'var(--border)'],
  ['#E2E8F0', 'var(--border)'],
  ['#f1f5f9', 'var(--divider)'],
  ['#F1F5F9', 'var(--divider)'],
  ['#f8fafc', 'var(--surface-raised)'],
  ['#F8FAFC', 'var(--surface-raised)'],
];

/** Tailwind arbitrary class hex → semantic class fragments */
const CLASS_HEX = [
  ['[#1F3A8A]', '[var(--accent)]'],
  ['[#1f3a8a]', '[var(--accent)]'],
  ['[#C8102E]', '[var(--accent)]'],
  ['[#c8102e]', '[var(--accent)]'],
  ['[#dc2626]', '[var(--accent)]'],
  ['[#DC2626]', '[var(--accent)]'],
  ['[#b91c1c]', '[var(--accent-deep)]'],
  ['[#10B981]', '[var(--success)]'],
  ['[#10b981]', '[var(--success)]'],
  ['[#059669]', '[var(--success)]'],
  ['[#2563eb]', '[var(--info)]'],
  ['[#3b82f6]', '[var(--info)]'],
  ['[#f59e0b]', '[var(--warning)]'],
  ['[#e5e7eb]', '[var(--border)]'],
  ['[#E5E7EB]', '[var(--border)]'],
  ['[#111827]', '[var(--text)]'],
  ['[#6b7280]', '[var(--text-muted)]'],
  ['[#6B7280]', '[var(--text-muted)]'],
  ['[#f3f4f6]', '[var(--surface-sunken)]'],
  ['[#F3F4F6]', '[var(--surface-sunken)]'],
  ['[#f9fafb]', '[var(--surface-raised)]'],
  ['[#F9FAFB]', '[var(--surface-raised)]'],
  ['[#ffffff]', '[var(--surface)]'],
  ['[#FFFFFF]', '[var(--surface)]'],
];

const CHART_PALETTE_LITERAL = `[
  '#4A6B63',
  '#4F6480',
  '#A08046',
  '#9C5B4E',
  '#7A7F76',
  '#5C7355',
]`;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (EXT.has(path.extname(ent.name))) out.push(full);
  }
  return out;
}

const SKIP_FILE_RE =
  /(Pdf|PDF|pdf|exportNodeToPdf|quotationPrint|InvoiceHtmlPreview|taxInvoice|print\.css)/;

function remapFile(file) {
  let src = fs.readFileSync(file, 'utf8');
  const original = src;
  const isCss = file.endsWith('.css');
  const norm = file.replace(/\\/g, '/');
  if (norm.includes('/theme/tokens.')) return false;
  if (SKIP_FILE_RE.test(norm)) return false;

  for (const [from, to] of CLASS_HEX) {
    src = src.split(from).join(to);
  }

  for (const [hex, cssVar] of HEX_MAP) {
    // Skip ultra-short hex in JS (too ambiguous); allow in CSS
    if (!isCss && (hex === '#fff' || hex === '#FFF' || hex === '#000')) continue;
    if (!src.includes(hex)) continue;
    src = src.split(hex).join(cssVar);
  }

  if (src !== original) {
    fs.writeFileSync(file, src);
    return true;
  }
  return false;
}

const files = walk(ROOT);
let changed = 0;
for (const f of files) {
  if (remapFile(f)) {
    changed += 1;
    console.log('updated', path.relative(ROOT, f));
  }
}
console.log(`\nDone. ${changed} files updated of ${files.length} scanned.`);
console.log('Chart palette reference:\n', CHART_PALETTE_LITERAL);
