/**
 * Probation review PDF export — ported verbatim from Indus One
 * (`src/indus-one/utils/exportNodeToPdf.ts`) so the downloaded PDF matches.
 * Renders the fixed-width document node to a multi-page A4 PDF (WYSIWYG).
 * - Replaces <input>/<textarea> in the clone so text is not clipped
 * - Inlines signature images as data URLs so html2canvas always paints them
 */
import { forceLightThemeOnClone } from '../../../lib/captureLightTheme';
async function toDataUrl(src) {
    if (!src)
        return null;
    if (src.startsWith('data:'))
        return src;
    try {
        const res = await fetch(src);
        if (!res.ok)
            return null;
        const blob = await res.blob();
        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    }
    catch {
        return null;
    }
}
async function inlineImagesAsDataUrls(root) {
    const imgs = Array.from(root.querySelectorAll('img.pr-sigimg, img'));
    const restores = [];
    await Promise.all(imgs.map(async (img) => {
        const prev = img.getAttribute('src') || img.src || '';
        if (!prev || prev.startsWith('data:')) {
            try {
                await img.decode();
            }
            catch {
                /* ignore */
            }
            return;
        }
        const dataUrl = await toDataUrl(prev);
        if (!dataUrl)
            return;
        img.src = dataUrl;
        restores.push(() => {
            img.src = prev;
        });
        try {
            await img.decode();
        }
        catch {
            /* ignore */
        }
    }));
    return () => restores.forEach((fn) => fn());
}
function nextPageEnd(offsetY, pageSliceHpx, canvasHeight, blockedRanges) {
    let end = Math.min(offsetY + pageSliceHpx, canvasHeight);
    const hit = blockedRanges.find((range) => range.top > offsetY + 48 && range.top < end && range.bottom > end + 4);
    if (hit)
        end = Math.floor(hit.top);
    if (end <= offsetY + 24)
        end = Math.min(offsetY + pageSliceHpx, canvasHeight);
    return end;
}
function blockedRangesFor(node, scale) {
    const rootTop = node.getBoundingClientRect().top;
    return Array.from(node.querySelectorAll('.pr-fld, .pr-sig, .pr-rub, .pr-recs, .pr-summary, .pr-rem > div, .pr-doc-head'))
        .map((el) => {
        const rect = el.getBoundingClientRect();
        const top = (rect.top - rootTop) * scale;
        return { top, bottom: top + rect.height * scale };
    })
        .filter((range) => range.bottom - range.top > 8 && range.bottom - range.top < 900);
}
export async function exportNodeToPdfBlob(node, { marginMm = 10 } = {}) {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
    ]);
    node.classList.add('pr-pdf-mode');
    const restoreImages = await inlineImagesAsDataUrls(node);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const captureWidth = Math.max(node.offsetWidth, 794);
    try {
        const canvas = await html2canvas(node, {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#ffffff',
            logging: false,
            width: captureWidth,
            windowWidth: captureWidth,
            scrollX: 0,
            scrollY: 0,
            onclone: (_doc, cloned) => {
                forceLightThemeOnClone(_doc);
                cloned.querySelectorAll('.pr-no-print').forEach((el) => {
                    el.style.display = 'none';
                });
                cloned.querySelectorAll('img.pr-sigimg').forEach((img) => {
                    img.style.display = 'inline-block';
                    img.style.height = '72px';
                    img.style.width = 'auto';
                    img.style.maxWidth = '100%';
                    img.style.maxHeight = '72px';
                    img.style.objectFit = 'contain';
                    img.style.verticalAlign = 'middle';
                });
                cloned.querySelectorAll('.pr-fld input').forEach((input) => {
                    replaceControlWithTextDiv(input, false);
                });
                cloned.querySelectorAll('textarea').forEach((ta) => {
                    replaceControlWithTextDiv(ta, true);
                });
            },
        });
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const contentW = pageW - marginMm * 2;
        const contentH = pageH - marginMm * 2;
        const pxPerMm = canvas.width / contentW;
        const pageSliceHpx = Math.floor(contentH * pxPerMm);
        const scale = canvas.width / captureWidth;
        const blocked = blockedRangesFor(node, scale);
        let offsetY = 0;
        let pageIndex = 0;
        while (offsetY < canvas.height - 1) {
            const sliceHpx = nextPageEnd(offsetY, pageSliceHpx, canvas.height, blocked) - offsetY;
            const pageCanvas = document.createElement('canvas');
            pageCanvas.width = canvas.width;
            pageCanvas.height = sliceHpx;
            const ctx = pageCanvas.getContext('2d');
            if (!ctx)
                throw new Error('Canvas is not supported on this device.');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
            ctx.drawImage(canvas, 0, offsetY, canvas.width, sliceHpx, 0, 0, canvas.width, sliceHpx);
            if (pageIndex > 0)
                pdf.addPage();
            pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', marginMm, marginMm, contentW, sliceHpx / pxPerMm);
            offsetY += sliceHpx;
            pageIndex += 1;
        }
        return pdf.output('blob');
    }
    finally {
        node.classList.remove('pr-pdf-mode');
        restoreImages();
    }
}
/** Mirror an input/textarea as a div so html2canvas paints full glyphs. */
function replaceControlWithTextDiv(el, multiline) {
    const doc = el.ownerDocument;
    const win = doc.defaultView;
    if (!win)
        return;
    const cs = win.getComputedStyle(el);
    const div = doc.createElement('div');
    div.textContent = el.value || '';
    const width = el.offsetWidth;
    const boxH = Math.max(el.offsetHeight, multiline ? el.scrollHeight : 0);
    div.style.boxSizing = 'border-box';
    div.style.width = `${width}px`;
    div.style.margin = '0';
    div.style.padding = cs.padding;
    div.style.borderTop = cs.borderTop;
    div.style.borderRight = cs.borderRight;
    div.style.borderBottom = cs.borderBottom;
    div.style.borderLeft = cs.borderLeft;
    div.style.borderRadius = cs.borderRadius;
    div.style.background = cs.backgroundColor;
    div.style.color = cs.color;
    div.style.font = cs.font;
    div.style.letterSpacing = cs.letterSpacing;
    div.style.wordSpacing = cs.wordSpacing;
    div.style.textAlign = cs.textAlign;
    div.style.webkitFontSmoothing = 'antialiased';
    if (multiline) {
        div.style.minHeight = `${boxH}px`;
        div.style.height = 'auto';
        div.style.whiteSpace = 'pre-wrap';
        div.style.wordBreak = 'break-word';
        div.style.overflow = 'visible';
        div.style.lineHeight = cs.lineHeight === 'normal' ? '1.45' : cs.lineHeight;
    }
    else {
        div.style.minHeight = `${Math.max(boxH, 38)}px`;
        div.style.height = 'auto';
        div.style.display = 'block';
        div.style.whiteSpace = 'normal';
        div.style.wordBreak = 'break-word';
        div.style.overflow = 'visible';
        div.style.lineHeight = '1.35';
        div.style.paddingTop = '8px';
        div.style.paddingBottom = '8px';
    }
    el.parentNode?.replaceChild(div, el);
}
export function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
