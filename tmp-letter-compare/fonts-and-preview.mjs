import fs from 'fs';
import PizZip from 'pizzip';
import { execFileSync } from 'child_process';
import path from 'path';

const z = new PizZip(fs.readFileSync('tmp-letter-compare/apt.docx'));
const allXml = Object.keys(z.files)
  .filter((f) => /^word\/.+\.xml$/i.test(f) && !z.files[f].dir)
  .map((f) => z.file(f).asText())
  .join('\n');
const fonts = [...allXml.matchAll(/w:ascii="([^"]+)"/g)].map((m) => m[1]);
console.log('fonts', [...new Set(fonts)].sort());
console.log('textbox', (allXml.match(/wps:txbx|v:textbox|w:txbxContent/g) || []).length);
console.log('has INDUS HOUSE anywhere', /INDUS HOUSE|Dashrath|391740/i.test(allXml));

// Preview Word PDF page 1 with magick or mutool
const pdf = path.resolve('tmp-letter-compare/apt-word.pdf');
const out = path.resolve('tmp-letter-compare/preview-word.png');
for (const cmd of [
  ['magick', ['-density', '110', `${pdf}[0]`, out]],
  ['pdftoppm', ['-png', '-f', '1', '-l', '1', '-r', '110', pdf, 'tmp-letter-compare/preview-word']],
]) {
  try {
    execFileSync(cmd[0], cmd[1], { stdio: 'inherit', windowsHide: true });
    console.log('preview ok', cmd[0]);
    break;
  } catch (e) {
    console.log('fail', cmd[0], String(e.message || e).slice(0, 120));
  }
}

const lo = path.resolve('tmp-letter-compare/apt-lo.pdf');
const outLo = path.resolve('tmp-letter-compare/preview-lo.png');
try {
  execFileSync('magick', ['-density', '110', `${lo}[0]`, outLo], { stdio: 'inherit', windowsHide: true });
  console.log('lo preview ok');
} catch (e) {
  console.log('lo preview fail', String(e.message || e).slice(0, 120));
}

// Last page for footer
try {
  execFileSync('magick', ['-density', '110', `${lo}[3]`, 'tmp-letter-compare/preview-lo-p4.png'], {
    stdio: 'inherit',
    windowsHide: true,
  });
  execFileSync('magick', ['-density', '110', `${pdf}[3]`, 'tmp-letter-compare/preview-word-p4.png'], {
    stdio: 'inherit',
    windowsHide: true,
  });
  console.log('page4 previews ok');
} catch (e) {
  console.log('p4 fail', String(e.message || e).slice(0, 120));
}
