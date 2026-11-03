#!/usr/bin/env node
/**
 * Point this clone at .githooks (blocks committing local env / env.server secrets).
 */
import { chmodSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hooksPath = join(root, '.githooks');
const preCommit = join(hooksPath, 'pre-commit');

if (!existsSync(preCommit)) {
  console.error('Missing .githooks/pre-commit — aborting.');
  process.exit(1);
}

chmodSync(preCommit, 0o755);
const r = spawnSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], {
  cwd: root,
  encoding: 'utf8',
});
if (r.status !== 0) {
  console.error(r.stderr || r.stdout || 'git config failed');
  process.exit(r.status || 1);
}
console.log('Installed git hooksPath → .githooks');
