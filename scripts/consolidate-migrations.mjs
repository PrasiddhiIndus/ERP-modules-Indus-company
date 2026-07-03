/**
 * Regenerates supabase/all_migrations.sql by appending any migration files
 * from supabase/migrations/ that are not already included.
 *
 * Usage: node scripts/consolidate-migrations.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const allMigrationsPath = path.join(root, 'supabase', 'all_migrations.sql');

const existing = fs.readFileSync(allMigrationsPath, 'utf8');
const base = existing.replace(
  /\n-- =+\n-- END: Consolidated migrations\n-- =+\n?$/s,
  ''
);

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const toAppend = files.filter((f) => {
  const stem = f.replace(/\.sql$/, '');
  return !existing.includes(stem);
});

let out = base;
for (const f of toAppend) {
  const content = fs.readFileSync(path.join(migrationsDir, f), 'utf8').trimEnd();
  out += `\n-- =============================================================================\n`;
  out += `-- BEGIN: ${f}\n`;
  out += `-- =============================================================================\n`;
  out += `${content}\n`;
}

out += `\n-- =============================================================================\n`;
out += `-- END: Consolidated migrations\n`;
out += `-- =============================================================================\n`;

fs.writeFileSync(allMigrationsPath, out);
console.log(`Updated ${path.relative(root, allMigrationsPath)}`);
console.log(`  Appended ${toAppend.length} migration file(s)`);
if (toAppend.length) {
  toAppend.forEach((f) => console.log(`    + ${f}`));
}
