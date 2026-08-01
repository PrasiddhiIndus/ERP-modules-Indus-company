/**
 * Convert broken Tailwind arbitrary classes like bg-[var(--accent)] → bg-accent
 * (hex remapper left CSS vars inside [] which breaks Tailwind's parser).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

const TOKEN_NAME = {
  accent: 'accent',
  'accent-deep': 'accent-deep',
  'accent-soft': 'accent-soft',
  'accent-border': 'accent-border',
  critical: 'critical',
  'critical-soft': 'critical-soft',
  'critical-border': 'critical-border',
  warning: 'warning',
  'warning-soft': 'warning-soft',
  'warning-border': 'warning-border',
  success: 'success',
  'success-soft': 'success-soft',
  'success-border': 'success-border',
  info: 'info',
  'info-soft': 'info-soft',
  'info-border': 'info-border',
  canvas: 'canvas',
  surface: 'surface',
  'surface-raised': 'surface-raised',
  'surface-sunken': 'surface-sunken',
  border: 'border',
  'border-strong': 'border-strong',
  divider: 'divider',
  text: 'ink',
  'text-strong': 'ink-strong',
  'text-secondary': 'ink-secondary',
  'text-muted': 'ink-muted',
  'text-caption': 'ink-caption',
  'text-disabled': 'ink-disabled',
  'row-hover': 'row-hover',
  'chart-inactive': 'chart-inactive',
  'neutral-state': 'neutral-state',
};

const PREFIXES = [
  'bg',
  'text',
  'border',
  'ring',
  'from',
  'to',
  'via',
  'outline',
  'fill',
  'stroke',
  'decoration',
  'divide',
  'accent',
  'caret',
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(ent.name)) continue;
      walk(full, out);
    } else if (/\.(js|jsx|ts|tsx)$/.test(ent.name)) out.push(full);
  }
  return out;
}

const utilRe = new RegExp(
  `\\b(${PREFIXES.join('|')})-\\[var\\(--([a-z0-9-]+)\\)\\](\\/\\d+)?`,
  'g'
);

let changed = 0;
for (const file of walk(ROOT)) {
  let src = fs.readFileSync(file, 'utf8');
  const orig = src;

  src = src.replace(/shadow-\[0_1px_0_0_var\(--[^)]+\)\]/g, 'border-b border-border');

  src = src.replace(utilRe, (match, pref, tok, opac) => {
    const name = TOKEN_NAME[tok];
    if (!name) return match;
    return `${pref}-${name}${opac || ''}`;
  });

  if (src !== orig) {
    fs.writeFileSync(file, src);
    changed += 1;
    console.log(path.relative(ROOT, file));
  }
}

console.log(`\nUpdated ${changed} files`);
