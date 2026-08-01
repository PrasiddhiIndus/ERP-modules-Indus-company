import { downloadBlob, exportNodeToPdfBlob } from '../../../lib/exportNodeToPdf';

/** Self-contained CSS (kept for reference / future iframe export). */
export const QUOTATION_PRINT_CSS = `
  @page { margin: 14mm; size: A4; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #0f172a;
    font-family: var(--font-sans); font-size: 11pt;
    font-size: 13px;
    line-height: 1.45;
  }
  .quotation-preview {
    width: 100%;
    max-width: 210mm;
    margin: 0 auto;
    background: #fff;
  }
`;

const QUOTATION_LETTERHEAD_SRC = `${(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')}indus-quotation-letterhead.png`;

function waitForImages(root) {
  const imgs = root.querySelectorAll('img');
  if (!imgs.length) return Promise.resolve();
  return Promise.all(
    [...imgs].map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) resolve();
          else {
            img.onload = resolve;
            img.onerror = resolve;
          }
        })
    )
  );
}

function buildQuotationPdfFileName(root) {
  const refLine = [...root.querySelectorAll('.qp-line')].find((l) =>
    String(l.textContent || '').trim().toLowerCase().startsWith('ref:')
  );
  const ref = refLine?.textContent?.replace(/^ref:\s*/i, '').trim();
  const safe = (ref || 'quotation').replace(/[^\w.-]+/g, '_').slice(0, 80);
  return `Quotation_${safe}.pdf`;
}

/** Capture the on-screen quotation preview and download as PDF (no popup). */
export async function downloadQuotationPdf() {
  const el = document.querySelector('.quotation-preview');
  if (!el) throw new Error('Quotation preview is not ready.');

  await waitForImages(el);
  const blob = await exportNodeToPdfBlob(el, { marginMm: 10 });
  downloadBlob(blob, buildQuotationPdfFileName(el));
  return blob;
}

export { QUOTATION_LETTERHEAD_SRC };
