import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const dir = 'server/assets/letter-fonts';
const urls = [
  'http://ftp.us.debian.org/debian/pool/main/f/fonts-crosextra-caladea/fonts-crosextra-caladea_20130214-2.1_all.deb',
  'http://archive.ubuntu.com/ubuntu/pool/universe/f/fonts-crosextra-caladea/fonts-crosextra-caladea_20130214-2.1_all.deb',
  'https://mirrors.edge.kernel.org/debian/pool/main/f/fonts-crosextra-caladea/fonts-crosextra-caladea_20130214-2.1_all.deb',
];

const debPath = path.join(dir, 'caladea.deb');
let ok = false;
for (const u of urls) {
  try {
    execFileSync('curl.exe', ['-L', '--fail', '-o', debPath, u], { stdio: 'inherit' });
    ok = true;
    break;
  } catch {
    console.warn('failed', u);
  }
}
if (!ok) {
  console.error('could not download caladea');
  process.exit(1);
}

const tmp = path.join(dir, 'caladea-unpack');
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
execFileSync('tar', ['-xf', debPath, '-C', tmp], { stdio: 'inherit' });
const data = fs.readdirSync(tmp).find((n) => n.startsWith('data.tar'));
if (!data) throw new Error('no data.tar');
const dataDir = path.join(tmp, 'data');
fs.mkdirSync(dataDir, { recursive: true });
execFileSync('tar', ['-xf', path.join(tmp, data), '-C', dataDir], { stdio: 'inherit' });

function walk(d, out = []) {
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (p.toLowerCase().endsWith('.ttf')) out.push(p);
  }
  return out;
}
for (const ttf of walk(dataDir)) {
  const dest = path.join(dir, path.basename(ttf));
  fs.copyFileSync(ttf, dest);
  console.log('copied', path.basename(ttf), fs.statSync(dest).size);
}
fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(debPath, { force: true });
