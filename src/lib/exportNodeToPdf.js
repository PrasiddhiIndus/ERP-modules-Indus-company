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
  // Prefer full scroll size so wide tables / long terms are not clipped.
  const width = Math.max(node.scrollWidth, node.offsetWidth, node.clientWidth);
  const height = Math.max(node.scrollHeight, node.offsetHeight, node.clientHeight);
  return html2canvas(node, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    width,
    height,
    windowWidth: Math.max(width, document.documentElement.clientWidth),
    windowHeight: Math.max(height, document.documentElement.clientHeight),
    scrollX: 0,
    scrollY: 0,
    x: 0,
    y: 0,
  });
}

function breakRanges(node, canvas) {
  const scaleY = canvas.height / Math.max(node.scrollHeight, node.offsetHeight, 1);
  const rootTop = node.getBoundingClientRect().top;
  const ranges = [];
  node.querySelectorAll("[data-pdf-nosplit], tr").forEach((el) => {
    const rect = el.getBoundingClientRect();
    const top = (rect.top - rootTop) * scaleY;
    const bottom = (rect.bottom - rootTop) * scaleY;
    const height = bottom - top;
    if (height > 4 && height < canvas.height * 0.85) ranges.push({ top, bottom });
  });
  return ranges;
}

function sliceEnd(offsetY, pageSliceHpx, canvasHeight, ranges) {
  const end = Math.min(offsetY + pageSliceHpx, canvasHeight);
  if (end >= canvasHeight - 2) return canvasHeight;
  const pageLimit = pageSliceHpx * 0.98;
  const crossing = ranges.filter(
    (range) =>
      range.bottom - range.top < pageLimit &&
      range.top > offsetY + 1 &&
      range.top < end &&
      range.bottom > end + 1
  );
  if (!crossing.length) return end;
  const breakAt = Math.floor(Math.min(...crossing.map((range) => range.top)));
  if (breakAt <= offsetY + 1) return end;
  return breakAt;
}

/**
 * @param {HTMLElement} node
 * @param {{ marginMm?: number, marginTopMm?: number, marginBottomMm?: number, avoidSplit?: boolean, imageFormat?: 'jpeg' | 'png' }} [options]
 * @returns {Promise<Blob>}
 */
export async function exportNodeToPdfBlob(node, options = {}) {
  const { marginMm = 10, avoidSplit = false, imageFormat = "jpeg" } = options;
  const marginTopMm = options.marginTopMm ?? marginMm;
  const marginBottomMm = options.marginBottomMm ?? marginMm;
  if (!node) throw new Error("No document node to export.");

  const canvas = await nodeToCanvas(node);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const contentW = pageW - marginMm * 2;
  const contentH = pageH - marginTopMm - marginBottomMm;

  // How many canvas pixels map to one millimetre once scaled to the content width.
  const pxPerMm = canvas.width / contentW;
  const pageSliceHpx = Math.floor(contentH * pxPerMm);
  const ranges = avoidSplit ? breakRanges(node, canvas) : [];

  let offsetY = 0;
  let pageIndex = 0;

  while (offsetY < canvas.height - 2) {
    let endY = sliceEnd(offsetY, pageSliceHpx, canvas.height, ranges);
    if (endY <= offsetY) endY = Math.min(canvas.height, offsetY + Math.max(1, pageSliceHpx));
    const sliceHpx = Math.max(1, endY - offsetY);

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHpx;
    const ctx = pageCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, offsetY, canvas.width, sliceHpx, 0, 0, canvas.width, sliceHpx);

    const png = imageFormat === "png";
    const imgData = png ? pageCanvas.toDataURL("image/png") : pageCanvas.toDataURL("image/jpeg", 0.96);
    const sliceHmm = Math.min(contentH, sliceHpx / pxPerMm);

    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(imgData, png ? "PNG" : "JPEG", marginMm, marginTopMm, contentW, sliceHmm);

    offsetY = endY;
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
