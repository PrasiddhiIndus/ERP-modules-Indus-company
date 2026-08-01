import fs from 'fs';

const p = 'src/index.css';
let s = fs.readFileSync(p, 'utf8');
s = s.replaceAll("'IBM Plex Mono', ui-monospace, monospace", 'var(--font-mono)');
s = s.replaceAll("'IBM Plex Sans', system-ui, sans-serif", 'var(--font-sans)');
fs.writeFileSync(p, s);
console.log('normalized');
