/**
 * USB DSC for Manage Invoices.
 *
 * Chrome cannot enumerate PKCS#11 e-tokens. Certificates on a plugged-in USB
 * DSC appear in the Windows personal store (vendor CSP). We list those certs
 * via the local API and stamp the selected certificate's real fields.
 */

import { fetchApiWithAuth } from './apiBase';

function formatSignedAt(d = new Date()) {
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatCertDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function wrapText(ctx, text, maxWidth) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const words = raw.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function renderCertAppearanceDataUrl({ width, height, certificate, signedAt }) {
  const cert = certificate && typeof certificate === 'object' ? certificate : null;
  if (!cert?.thumbprint && !cert?.serialNumber && !cert?.commonName && !cert?.subject) {
    return '';
  }

  const w = Math.max(220, Math.round(width));
  const h = Math.max(88, Math.round(height));
  const scale = 3;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, w, h);

  const pad = Math.max(6, Math.round(w * 0.04));
  const maxW = w - pad * 2;
  const cn = String(cert.commonName || cert.subject || '').trim();
  const serial = String(cert.serialNumber || '').trim();
  const issuer = String(cert.issuerCn || cert.issuer || '').trim();
  const thumb = String(cert.thumbprint || '').trim();
  const valid =
    cert.notBefore || cert.notAfter
      ? `${formatCertDate(cert.notBefore)} – ${formatCertDate(cert.notAfter)}`
      : '';
  const when = signedAt || formatSignedAt();

  const lines = [
    { text: 'Digitally signed by', weight: '600', color: '#0f766e' },
    { text: cn, weight: '700', color: '#0f172a' },
    serial ? { text: `Serial ${serial}`, weight: '400', color: '#334155' } : null,
    issuer ? { text: `Issuer ${issuer}`, weight: '400', color: '#334155' } : null,
    valid ? { text: `Valid ${valid}`, weight: '400', color: '#334155' } : null,
    thumb ? { text: `Thumbprint ${thumb}`, weight: '400', color: '#64748b' } : null,
    { text: when, weight: '500', color: '#115e59' },
  ].filter(Boolean);

  const fontSize = Math.max(9, Math.min(14, Math.floor(h / (lines.length + 1.6))));
  let y = pad;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  for (const row of lines) {
    ctx.fillStyle = row.color;
    ctx.font = `${row.weight} ${fontSize}px ui-sans-serif, system-ui, "Segoe UI", sans-serif`;
    const wrapped = wrapText(ctx, row.text, maxW);
    for (const part of wrapped) {
      if (y > h - pad) break;
      ctx.fillText(part, pad, y, maxW);
      y += fontSize + 2;
    }
    if (y > h - pad) break;
  }

  return canvas.toDataURL('image/png');
}

export function formatFoxitDscDate(d = new Date()) {
  const date = d instanceof Date ? d : new Date(d || Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} +05'30'`;
}

export function buildFoxitDscAppearance(certificate, signedAt = new Date()) {
  const cn = String(certificate?.commonName || '').trim();
  const dn = String(certificate?.subject || certificate?.distinguishedName || '').trim();
  const dateStr = formatFoxitDscDate(signedAt);
  return {
    commonName: cn,
    subject: dn,
    thumbprint: String(certificate?.thumbprint || ''),
    serialNumber: String(certificate?.serialNumber || ''),
    reason: 'I am the author of this document',
    location: '',
    signedAt: dateStr,
    lines: [
      { text: cn ? `Digitally signed by ${cn}` : 'Digitally signed by', fontSize: 6.4, color: [15, 23, 42], bold: true },
      { text: dn ? `DN: ${dn}` : '', fontSize: 5.7, color: [71, 85, 105] },
      { text: cn ? `CN=${cn}` : '', fontSize: 5.7, color: [71, 85, 105] },
      { text: 'Reason: I am the author of this document', fontSize: 5.7, color: [71, 85, 105] },
      { text: 'Location:', fontSize: 5.7, color: [71, 85, 105] },
      { text: `Date: ${dateStr}`, fontSize: 5.7, color: [71, 85, 105] },
      { text: 'INDUS ERP', fontSize: 5.5, color: [100, 116, 139] },
    ].filter((row) => String(row.text || '').trim()),
  };
}

export async function signInvoicePdfWithUsbToken({ pdfBytes, certificate, pin }) {
  const bytes = pdfBytes instanceof ArrayBuffer ? new Uint8Array(pdfBytes) : new Uint8Array(pdfBytes || []);
  if (!bytes.length || !certificate?.thumbprint) {
    throw new Error('Plug in the USB DSC token and select a certificate, then download again.');
  }
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  const result = await fetchApiWithAuth('/api/billing/dsc/sign-pdf', {
    timeoutMs: 120_000,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pdfBase64: btoa(binary),
      thumbprint: certificate.thumbprint,
      pin: String(pin || ''),
      name: certificate.commonName || '',
      reason: 'I am the author of this document',
      location: '',
    }),
  });
  if (!result.ok || !result.data?.pdfBase64) {
    throw new Error(result.error || result.data?.message || 'Could not apply the USB DSC to the PDF.');
  }
  const raw = atob(result.data.pdfBase64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export async function listUsbDscCertificates(pin) {
  const result = await fetchApiWithAuth('/api/billing/dsc/usb-certificates', {
    timeoutMs: 45_000,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: String(pin || '') }),
  });
  const certificates = Array.isArray(result.data?.certificates) ? result.data.certificates : [];
  const readers = Array.isArray(result.data?.readers) ? result.data.readers : [];
  const usbIssues = Array.isArray(result.data?.usbIssues) ? result.data.usbIssues : [];
  const pcscStatus = String(result.data?.pcscStatus || '').trim();
  const warning = String(result.data?.warning || '').trim();
  if (!result.ok && !certificates.length && !readers.length) {
    throw new Error(result.error || result.data?.message || 'Could not read USB DSC certificates.');
  }
  return { certificates, readers, usbIssues, pcscStatus, warning };
}

async function tryHostHelper(pin, invoiceNumber) {
  if (typeof window.indusDsc?.sign === 'function') {
    const result = await window.indusDsc.sign({ pin, invoiceNumber });
    if (result?.imageDataUrl) return { imageDataUrl: result.imageDataUrl, signerName: result.signerName };
  }
  return null;
}

const LOCAL_SIGNER_URLS = [
  'https://127.0.0.1:1620/sign',
  'https://localhost:1620/sign',
  'https://127.0.0.1:1645/sign',
  'http://127.0.0.1:1620/sign',
];

async function tryLocalSigner(pin, invoiceNumber) {
  const body = JSON.stringify({ pin, invoiceNumber, action: 'sign' });
  for (const url of LOCAL_SIGNER_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      const imageDataUrl = data?.imageDataUrl || data?.signatureImage || data?.dataUrl;
      if (imageDataUrl) {
        return { imageDataUrl, signerName: data?.signerName || data?.cn || '' };
      }
    } catch {
      /* no local signer on this port */
    }
  }
  return null;
}

/**
 * @param {{ pin?: string, invoiceNumber?: string, boxWidth: number, boxHeight: number, certificate: object }} opts
 */
export async function fetchSignatureFromUsbToken({ pin, invoiceNumber, boxWidth, boxHeight, certificate }) {
  const cleanPin = String(pin || '').trim();

  if (cleanPin) {
    const helper = await tryHostHelper(cleanPin, invoiceNumber);
    if (helper?.imageDataUrl) {
      return {
        imageDataUrl: helper.imageDataUrl,
        signerName: helper.signerName || certificate?.commonName || '',
        tokenLabel: 'USB DSC token',
        certificate,
      };
    }

    const local = await tryLocalSigner(cleanPin, invoiceNumber);
    if (local?.imageDataUrl) {
      return {
        imageDataUrl: local.imageDataUrl,
        signerName: local.signerName || certificate?.commonName || '',
        tokenLabel: 'USB DSC token',
        certificate,
      };
    }
  }

  const imageDataUrl = renderCertAppearanceDataUrl({
    width: boxWidth,
    height: boxHeight,
    certificate,
    signedAt: formatSignedAt(),
  });
  if (!imageDataUrl) {
    throw new Error('Select a certificate from the USB token before applying it.');
  }
  return {
    imageDataUrl,
    signerName: certificate?.commonName || certificate?.subject || '',
    tokenLabel: certificate?.provider || 'USB DSC token',
    certificate,
  };
}
