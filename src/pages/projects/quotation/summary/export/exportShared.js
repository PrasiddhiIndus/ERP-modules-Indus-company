import { createRoot } from 'react-dom/client';
import { downloadBlob, exportNodeToPdfBlob } from '../../../../../lib/exportNodeToPdf';
import { computeNumbering, childHeadTotal, grandTotal, itemTotals, mainHeadTotal } from '../summaryHelpers';

export function formatExportNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function formatExportCurrency(value) {
  const n = formatExportNumber(value);
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function sanitizeFilePart(value, fallback = 'Draft') {
  const raw = String(value || '').trim();
  if (!raw || raw === 'New Quotation (unsaved)') return fallback;
  return raw.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(0, 60) || fallback;
}

export function sanitizeSheetName(label, fallback = 'Sheet') {
  let name = String(label || fallback)
    .replace(/[:\\/?*\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) name = fallback;
  return name.slice(0, 31);
}

export function resolveOfferToken({ activeQuotationId, label } = {}) {
  if (!activeQuotationId || String(activeQuotationId).startsWith('draft-')) {
    if (label && label !== 'New Quotation (unsaved)') return sanitizeFilePart(label, 'Draft');
    return 'Draft';
  }
  return sanitizeFilePart(label || activeQuotationId, 'Draft');
}

export function nowHhMm() {
  const d = new Date();
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Ensure numbered tree for export. */
export function numberedTree(mainHeads) {
  return computeNumbering(mainHeads || []);
}

export { childHeadTotal, grandTotal, itemTotals, mainHeadTotal };

/**
 * Mount a React element off-screen, capture to PDF, download, then clean up.
 */
export async function captureReactNodeToPdf(reactElement, fileName) {
  const host = document.createElement('div');
  host.setAttribute('data-summary-export-host', '1');
  host.style.cssText =
    'position:fixed;left:-12000px;top:0;width:210mm;background:#ffffff;z-index:-1;pointer-events:none;';
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    await new Promise((resolve) => {
      root.render(reactElement);
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    // Allow layout/fonts to settle
    await new Promise((r) => setTimeout(r, 50));

    const node = host.querySelector('[data-summary-export-root]');
    if (!node) throw new Error('Export preview failed to render.');

    const blob = await exportNodeToPdfBlob(node, { marginMm: 10 });
    downloadBlob(blob, fileName);
    return blob;
  } finally {
    try {
      root.unmount();
    } catch {
      /* ignore */
    }
    host.remove();
  }
}
