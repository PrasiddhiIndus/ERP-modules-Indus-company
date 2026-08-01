import fs from 'fs';
import path from 'path';
import postcss from 'postcss';
import tailwind from 'tailwindcss';

const css = fs.readFileSync('src/index.css', 'utf8');
try {
  const r = await postcss([tailwind]).process(css, { from: 'src/index.css' });
  console.log('CSS OK', r.css.length);
} catch (e) {
  console.error('CSS ERR', e.message);
  process.exitCode = 1;
}

function walk(d, a = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(e.name)) continue;
      walk(f, a);
    } else if (/\.(js|jsx|css|tsx|ts|html)$/.test(e.name)) a.push(f);
  }
  return a;
}

const bad = /Segoe UI|Montserrat|Space Grotesk|fonts\.googleapis|fontFamily:\s*['"]Arial|Times New Roman|Courier New/;
const hits = [];
for (const f of [...walk('src'), 'index.html']) {
  if (bad.test(fs.readFileSync(f, 'utf8'))) hits.push(f);
}
console.log('Legacy font hits:', hits.length);
hits.forEach((h) => console.log(h));
