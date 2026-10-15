/**
 * PDF copy of a generated exit document (.docx) for email. The letter body is laid out
 * in the browser from the same Word file; the letterhead is drawn at the same page
 * positions as in the Word file (letterheadLayout).
 */
import { renderAsync } from "docx-preview";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { letterheadLayout, loadLetterheadAssets } from "./exitDocumentLetterhead";

const PT_PER_CSS_PX = 0.75;
const CAPTURE_SCALE = 2;

function waitForImages(root) {
  const images = [...root.querySelectorAll("img")];
  return Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          })
    )
  );
}

function drawLetterhead(pdf, assets, pageWPt, pageHPt) {
  const layout = letterheadLayout(assets, pageWPt, pageHPt);
  for (const key of ["logo", "rule", "footerAddress", "redBar"]) {
    const { xPt, yPt, wPt, hPt } = layout[key];
    pdf.addImage(assets[key].bytes, "PNG", xPt, yPt, wPt, hPt, `letterhead-${key}`, "FAST");
  }
}

/**
 * @param {Blob} docxBlob Word file from buildExitDocument (letterhead already applied).
 * @returns {Promise<Blob>}
 */
export async function exitDocumentDocxToPdf(docxBlob) {
  const assets = await loadLetterheadAssets();
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-20000px;top:0;background:#ffffff;pointer-events:none;";
  const styleHost = document.createElement("div");
  document.body.append(host, styleHost);

  try {
    await renderAsync(docxBlob, host, styleHost, {
      className: "exit-doc-pdf",
      inWrapper: false,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      renderHeaders: false,
      renderFooters: false,
      renderFootnotes: true,
      renderEndnotes: true,
      useBase64URL: true,
    });
    await waitForImages(host);
    if (document.fonts?.ready) await document.fonts.ready;

    const sections = [...host.querySelectorAll("section.exit-doc-pdf")];
    if (!sections.length) throw new Error("Could not prepare the PDF.");

    let pdf = null;
    for (const section of sections) {
      section.style.margin = "0";
      section.style.boxShadow = "none";
      section.style.background = "#ffffff";
      const pageWPx = section.offsetWidth;
      const pageWPt = pageWPx * PT_PER_CSS_PX;
      // min-height is the Word page height; longer content runs onto extra pages.
      const pageHPx = parseFloat(getComputedStyle(section).minHeight) || section.offsetHeight;
      const pageHPt = pageHPx * PT_PER_CSS_PX;

      const canvas = await html2canvas(section, {
        scale: CAPTURE_SCALE,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const pxPerPt = canvas.width / pageWPt;
      const sliceHPx = Math.floor(pageHPt * pxPerPt);

      for (let offset = 0; offset < canvas.height; offset += sliceHPx) {
        const height = Math.min(sliceHPx, canvas.height - offset);
        // Skip a trailing sliver left by rounding.
        if (offset > 0 && height < pxPerPt * 4) break;
        const page = document.createElement("canvas");
        page.width = canvas.width;
        page.height = height;
        const ctx = page.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, page.width, page.height);
        ctx.drawImage(canvas, 0, offset, canvas.width, height, 0, 0, canvas.width, height);

        const orientation = pageWPt > pageHPt ? "landscape" : "portrait";
        if (!pdf) pdf = new jsPDF({ unit: "pt", format: [pageWPt, pageHPt], orientation, compress: true });
        else pdf.addPage([pageWPt, pageHPt], orientation);
        pdf.addImage(page.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageWPt, height / pxPerPt, undefined, "FAST");
        drawLetterhead(pdf, assets, pageWPt, pageHPt);
      }
    }
    return pdf.output("blob");
  } finally {
    host.remove();
    styleHost.remove();
  }
}
