import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { PDFDocument } from 'pdf-lib';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { SignPdf, Signer } from '@signpdf/signpdf';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const MM_TO_PT = 72 / 25.4;

class UsbTokenSigner extends Signer {
  constructor(signFn) {
    super();
    this.signFn = signFn;
  }

  async sign(pdfBuffer, signingTime) {
    return this.signFn(pdfBuffer, signingTime);
  }
}

function runPowershell(scriptPath, namedArgs, timeoutMs) {
  const argv = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
  for (const [key, value] of Object.entries(namedArgs)) {
    argv.push(`-${key}`, String(value));
  }
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      argv,
      { timeout: timeoutMs, windowsHide: false, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const detail = [stderr, stdout, err?.message].map((s) => String(s || '').trim()).filter(Boolean).join('\n');
        if (err) {
          reject(new Error(detail || 'USB DSC signing failed.'));
          return;
        }
        resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
      }
    );
  });
}

function computeWidgetRect() {
  const pageW = 210 * MM_TO_PT;
  const margin = 14 * MM_TO_PT;
  const x2 = pageW - margin;
  const x1 = x2 - 52 * MM_TO_PT;
  const y1 = 18 * MM_TO_PT;
  const y2 = y1 + 28 * MM_TO_PT;
  return [x1, y1, x2, y2];
}

async function cmsSignBytes(thumbprint, bytesToSign, pin) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'indus-dsc-'));
  const inPath = path.join(dir, 'to-sign.bin');
  const outPath = path.join(dir, 'signature.p7s');
  const pinPath = path.join(dir, 'pin.txt');
  const scriptPath = path.join(thisDir, 'dsc', 'signPdfCms.ps1');
  try {
    fs.writeFileSync(inPath, bytesToSign);
    if (pin) fs.writeFileSync(pinPath, String(pin), 'utf8');
    await runPowershell(
      scriptPath,
      { Thumbprint: String(thumbprint), InputPath: inPath, OutputPath: outPath },
      120000
    );
    if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 64) {
      throw new Error('The USB token did not return a PKCS#7 signature.');
    }
    return fs.readFileSync(outPath);
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export async function signPdfWithWindowsDsc(pdfBytes, meta) {
  if (process.platform !== 'win32') {
    const err = new Error('USB DSC PDF signing is available on Windows workstations only.');
    err.status = 501;
    throw err;
  }
  const thumbprint = String(meta?.thumbprint || '').replace(/\s+/g, '');
  if (!thumbprint) {
    throw new Error('Select a USB DSC certificate before downloading the signed PDF.');
  }

  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  pdflibAddPlaceholder({
    pdfDoc,
    reason: String(meta?.reason || 'I am the author of this document'),
    contactInfo: String(meta?.contactInfo || ''),
    name: String(meta?.name || 'Authorised Signatory'),
    location: String(meta?.location || ''),
    signatureLength: 32768,
    widgetRect: computeWidgetRect(),
    appName: 'INDUS ERP',
  });
  const withPlaceholder = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));

  const signPdf = new SignPdf();
  const signer = new UsbTokenSigner(async (pdfBuffer) =>
    cmsSignBytes(thumbprint, Buffer.from(pdfBuffer), meta?.pin)
  );
  const signed = await signPdf.sign(withPlaceholder, signer);
  return Buffer.from(signed);
}
