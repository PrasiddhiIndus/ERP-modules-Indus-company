import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const thisDir = path.dirname(fileURLToPath(import.meta.url));

let listQueue = Promise.resolve();

function unwrap(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.value)) return value.value;
  if (value && typeof value === 'object' && (value.name || value.thumbprint)) return [value];
  return [];
}

function parsePayload(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return { certificates: [], readers: [], usbIssues: [], pcscStatus: '' };
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let parsed = null;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].startsWith('{')) continue;
    try {
      parsed = JSON.parse(lines[i]);
      break;
    } catch {
      /* keep looking */
    }
  }
  if (!parsed) {
    try {
      parsed = JSON.parse(text);
    } catch {
      return { certificates: [], readers: [], usbIssues: [], pcscStatus: 'bad_json' };
    }
  }
  if (Array.isArray(parsed)) return { certificates: parsed, readers: [], usbIssues: [], pcscStatus: '' };
  return {
    certificates: unwrap(parsed?.certificates),
    readers: unwrap(parsed?.readers),
    usbIssues: unwrap(parsed?.usbIssues),
    pcscStatus: String(parsed?.pcscStatus || ''),
  };
}

function runPowershell(scriptPath, pin) {
  return new Promise((resolve) => {
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
    const child = execFile(
      'powershell.exe',
      args,
      {
        timeout: pin ? 30000 : 12000,
        windowsHide: !pin,
        maxBuffer: 4 * 1024 * 1024,
        env: pin
          ? Object.fromEntries(
              Object.entries({ ...process.env, INDUS_DSC_PIN: pin }).filter(([, v]) => typeof v === 'string')
            )
          : undefined,
      },
      (err, stdout, stderr) => {
        resolve({
          stdout: String(stdout || ''),
          stderr: String(stderr || ''),
          error: err ? String(err.message || err) : '',
        });
      }
    );
    child.on('error', (err) => {
      resolve({ stdout: '', stderr: '', error: String(err?.message || err) });
    });
  });
}

export async function listUsbDscCertificatesFromWindows(options = {}) {
  if (process.platform !== 'win32') {
    return {
      certificates: [],
      readers: [],
      usbIssues: [],
      pcscStatus: 'not_windows',
      warning: 'USB DSC listing is available on Windows workstations only.',
    };
  }

  const scriptPath = path.join(thisDir, 'dsc', 'listUsbCertificates.ps1');
  const pin = String(options.pin || '');

  const run = listQueue.then(async () => {
    const { stdout, stderr, error } = await runPowershell(scriptPath, pin);
    const parsed = parsePayload(stdout);
    return {
      certificates: parsed.certificates,
      readers: parsed.readers,
      usbIssues: parsed.usbIssues,
      pcscStatus: parsed.pcscStatus || (error ? 'spawn_error' : ''),
      warning: [stderr, error && !parsed.certificates.length && !parsed.readers.length ? error : '']
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .join('\n')
        .slice(0, 800),
    };
  });

  listQueue = run.then(
    () => undefined,
    () => undefined
  );

  try {
    return await run;
  } catch (err) {
    return {
      certificates: [],
      readers: [],
      usbIssues: [],
      pcscStatus: 'error',
      warning: String(err?.message || err || 'Could not read the USB token.'),
    };
  }
}
