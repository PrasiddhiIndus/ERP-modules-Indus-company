import html2canvas from "html2canvas";
import jsPDF from "jspdf";

// Render a DOM node to a multi-page A4 PDF that looks EXACTLY like the node on
// screen (what-you-see-is-what-you-get). The node is captured with html2canvas
// and the resulting image is sliced across A4 pages.
//
// The node should be a fixed-width "document" element (e.g. an A4-styled card).
// We avoid slicing through rows by honouring elements tagged with the
// `data-pdf-nosplit` attribute when a natural break would cut them in half.

async function nodeToCanvas(node) {
  return html2canvas(node, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: node.scrollWidth,
  });
}

/**
 * @param {HTMLElement} node
 * @param {{ marginMm?: number }} [options]
 * @returns {Promise<Blob>}
 */
export async function exportNodeToPdfBlob(node, { marginMm = 10 } = {}) {
  if (!node) throw new Error("No document node to export.");

  const canvas = await nodeToCanvas(node);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const contentW = pageW - marginMm * 2;
  const contentH = pageH - marginMm * 2;

  // How many canvas pixels map to one millimetre once scaled to the content width.
  const pxPerMm = canvas.width / contentW;
  const pageSliceHpx = Math.floor(contentH * pxPerMm);

  let offsetY = 0;
  let pageIndex = 0;

  while (offsetY < canvas.height) {
    const sliceHpx = Math.min(pageSliceHpx, canvas.height - offsetY);

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHpx;
    const ctx = pageCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, offsetY, canvas.width, sliceHpx, 0, 0, canvas.width, sliceHpx);

    const imgData = pageCanvas.toDataURL("image/jpeg", 0.96);
    const sliceHmm = sliceHpx / pxPerMm;

    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(imgData, "JPEG", marginMm, marginMm, contentW, sliceHmm);

    offsetY += sliceHpx;
    pageIndex += 1;
  }

  return pdf.output("blob");
}

/** Trigger a browser download for a blob. */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
