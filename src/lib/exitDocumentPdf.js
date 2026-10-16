/**
 * PDF copy of a generated exit document (.docx) for email.
 * Uses the Word file’s page size and pagination so the PDF layout matches the .docx;
 * letterhead is drawn at the same positions as in Word (letterheadLayout).
 */
import { renderAsync } from "docx-preview";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import PizZip from "pizzip";
import { letterheadLayout, loadLetterheadAssets } from "./exitDocumentLetterhead";

/** Word points → CSS pixels at 96dpi (docx-preview’s coordinate system). */
const CSS_PX_PER_PT = 96 / 72;
/** Keep email PDFs sharp but small enough for production body limits (3× base64). */
const CAPTURE_SCALE = 2;
const JPEG_QUALITY = 0.84;
const DEFAULT_PAGE_W_PT = 612; // US Letter (exit templates)
const DEFAULT_PAGE_H_PT = 792;
/** Soft cap per PDF; server allows 5MB each / 15MB total (with buffer). */
const MAX_PDF_BYTES = 4 * 1024 * 1024;
/** No Due Certificate table column widths from the Word template (twips → pt). */
const NO_DUE_COL_WIDTHS_PT = [3397 / 20, 5845 / 20];

function unescapeXmlText(value) {
  return String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** One table cell → HTML, preserving bold + superscript from Word runs. */
function noDueCellXmlToHtml(tcXml) {
  const body = String(tcXml || "").replace(/<w:tcPr\b[\s\S]*?<\/w:tcPr>/, "");
  let html = "";
  const tokenRe = /<w:br\b[^>]*\/>|<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
  let match;
  while ((match = tokenRe.exec(body))) {
    if (match[0].startsWith("<w:br")) {
      html += "<br>";
      continue;
    }
    const run = match[1];
    const textMatch = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/.exec(run);
    if (!textMatch) continue;
    let text = escapeHtml(unescapeXmlText(textMatch[1]));
    const rPr = /<w:rPr\b[^>]*>([\s\S]*?)<\/w:rPr>/.exec(run)?.[1] || "";
    const bold =
      /<w:b\b/.test(rPr) &&
      !/<w:b\b[^>]*w:val="(?:0|false)"/i.test(rPr);
    const superscript = /<w:vertAlign\b[^>]*w:val="superscript"/i.test(rPr);
    if (bold) text = `<b>${text}</b>`;
    if (superscript) text = `<sup>${text}</sup>`;
    html += text;
  }
  return html;
}

/**
 * Read the filled No Due table from the .docx so the PDF can redraw it cleanly.
 * docx-preview + html2canvas mis-paint this table (borders through text).
 */
function readNoDueTableRows(documentXml) {
  const tableXml = /<w:tbl\b[\s\S]*?<\/w:tbl>/.exec(documentXml || "")?.[0];
  if (!tableXml) return null;
  const rows = [];
  for (const rowMatch of tableXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
    const cells = [];
    for (const cellMatch of rowMatch[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)) {
      cells.push(noDueCellXmlToHtml(cellMatch[0]));
    }
    if (cells.length) rows.push(cells);
  }
  return rows.length ? rows : null;
}

/**
 * Replace the preview table with a Word-faithful HTML table (borders, widths, alignment).
 * Scoped to No Due Certificate email PDF only.
 */
function replaceNoDueCertificateTable(root, rows) {
  const previewTable = root.querySelector("table");
  if (!previewTable || !rows?.length) return;

  const table = document.createElement("table");
  table.setAttribute("data-exit-nodue-table", "1");
  const tableWidthPt = NO_DUE_COL_WIDTHS_PT.reduce((sum, w) => sum + w, 0);
  table.style.cssText = [
    `width:${tableWidthPt}pt`,
    "max-width:100%",
    "border-collapse:collapse",
    "border-spacing:0",
    "margin-left:auto",
    "margin-right:auto",
    "table-layout:fixed",
    "font-family:'Times New Roman',Times,serif",
    "font-size:12pt",
    "line-height:normal",
    "color:#000000",
    "background:#ffffff",
  ].join(";");

  const colgroup = document.createElement("colgroup");
  for (const widthPt of NO_DUE_COL_WIDTHS_PT) {
    const col = document.createElement("col");
    col.style.width = `${widthPt}pt`;
    colgroup.appendChild(col);
  }
  table.appendChild(colgroup);

  for (const cells of rows) {
    const tr = document.createElement("tr");
    tr.style.background = "#ffffff";
    cells.forEach((cellHtml, index) => {
      const td = document.createElement("td");
      // Real borders only — inset box-shadow fills cells black in html2canvas.
      td.style.cssText = [
        "border:1px solid #000000",
        "padding:4pt 6pt",
        "vertical-align:middle",
        "text-align:center",
        "height:auto",
        "min-height:22pt",
        "overflow:visible",
        "word-wrap:break-word",
        "overflow-wrap:break-word",
        "background-color:#ffffff",
        "color:#000000",
        "box-shadow:none",
        index === 0 ? `width:${NO_DUE_COL_WIDTHS_PT[0]}pt` : `width:${NO_DUE_COL_WIDTHS_PT[1]}pt`,
      ].join(";");
      td.innerHTML = cellHtml || "&nbsp;";
      tr.appendChild(td);
    });
    table.appendChild(tr);
  }

  previewTable.replaceWith(table);
}

function readTwipsAttr(tag, attr) {
  const m = new RegExp(`w:${attr}="(-?\\d+)"`).exec(tag || "");
  return m ? Number(m[1]) : null;
}

/** Page box + margins from the Word file so the PDF matches Word, not the browser’s guess. */
function readDocxPageBoxFromXml(documentXml) {
  const sectPr = /<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/.exec(documentXml || "")?.[0] || "";
  const pgSz = /<w:pgSz\b[^>]*\/>/.exec(sectPr)?.[0] || "";
  const pgMar = /<w:pgMar\b[^>]*\/>/.exec(sectPr)?.[0] || "";
  const pageWPt = (readTwipsAttr(pgSz, "w") || DEFAULT_PAGE_W_PT * 20) / 20;
  const pageHPt = (readTwipsAttr(pgSz, "h") || DEFAULT_PAGE_H_PT * 20) / 20;
  return {
    pageWPt,
    pageHPt,
    marginPt: {
      top: (readTwipsAttr(pgMar, "top") || 1440) / 20,
      right: (readTwipsAttr(pgMar, "right") || 1440) / 20,
      bottom: (readTwipsAttr(pgMar, "bottom") || 1440) / 20,
      left: (readTwipsAttr(pgMar, "left") || 1440) / 20,
    },
  };
}

/**
 * Word keeps blank paragraphs as vertical space; HTML collapses them.
 * Restore that spacing so all three exit PDFs match the .docx layout.
 */
function preserveWordBlankParagraphSpacing(root) {
  for (const p of root.querySelectorAll("p")) {
    const hasVisibleContent =
      Boolean(p.textContent?.replace(/\u00a0/g, " ").trim()) ||
      Boolean(p.querySelector("img, table, svg, canvas"));
    if (hasVisibleContent) continue;

    const style = window.getComputedStyle(p);
    const lineHeight = style.lineHeight;
    const fontSizePx = parseFloat(style.fontSize) || 16;
    const minPx =
      lineHeight && lineHeight !== "normal" && !Number.isNaN(parseFloat(lineHeight))
        ? parseFloat(lineHeight)
        : fontSizePx * 1.15;

    p.style.minHeight = `${minPx}px`;
    p.style.marginTop = style.marginTop;
    p.style.marginBottom = style.marginBottom;
    if (!p.innerHTML.trim()) p.innerHTML = "&nbsp;";
  }
}

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
 * Lock the page to Word’s page size and margins so body spacing matches the .docx.
 * Do not force content height — Word page breaks create separate sections; overflow is sliced.
 */
function lockSectionToWordPage(section, pageWPt, pageHPt, marginPt) {
  const pageWPx = pageWPt * CSS_PX_PER_PT;
  const pageHPx = pageHPt * CSS_PX_PER_PT;
  section.style.boxSizing = "border-box";
  section.style.width = `${pageWPx}px`;
  section.style.minWidth = `${pageWPx}px`;
  section.style.maxWidth = `${pageWPx}px`;
  section.style.minHeight = `${pageHPx}px`;
  section.style.paddingTop = `${marginPt.top * CSS_PX_PER_PT}px`;
  section.style.paddingRight = `${marginPt.right * CSS_PX_PER_PT}px`;
  section.style.paddingBottom = `${marginPt.bottom * CSS_PX_PER_PT}px`;
  section.style.paddingLeft = `${marginPt.left * CSS_PX_PER_PT}px`;
  section.style.margin = "0";
  section.style.boxShadow = "none";
  section.style.background = "#ffffff";
  return { pageWPx, pageHPx };
}

function canvasToImageData(pageCanvas, quality = JPEG_QUALITY) {
  // JPEG keeps email payloads under production 413 limits; PNG was too large for 3 docs.
  return { dataUrl: pageCanvas.toDataURL("image/jpeg", quality), format: "JPEG" };
}

/** If a PDF is still oversized, rebuild page images at a lower JPEG quality. */
async function shrinkPdfBlobIfNeeded(buildAtQuality) {
  let quality = JPEG_QUALITY;
  let blob = await buildAtQuality(quality);
  while (blob.size > MAX_PDF_BYTES && quality > 0.55) {
    quality = Math.max(0.55, quality - 0.12);
    blob = await buildAtQuality(quality);
  }
  return blob;
}

/**
 * @param {Blob} docxBlob Word file from buildExitDocument (letterhead already applied).
 * @param {{ documentKey?: string }} [options]
 * @returns {Promise<Blob>}
 */
export async function exitDocumentDocxToPdf(docxBlob, options = {}) {
  const documentKey = String(options.documentKey || "");
  const docxBuffer = await docxBlob.arrayBuffer();
  const zip = new PizZip(docxBuffer);
  const documentXml = zip.file("word/document.xml")?.asText() || "";
  const noDueTableRows =
    documentKey === "noDueCertificate" ? readNoDueTableRows(documentXml) : null;

  const { pageWPt, pageHPt, marginPt } = readDocxPageBoxFromXml(documentXml);
  const assets = await loadLetterheadAssets();

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.className = "exit-doc-pdf-host";
  host.style.cssText =
    "position:fixed;left:-20000px;top:0;background:#ffffff;pointer-events:none;z-index:-1;";
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
      // Honour Word’s saved page breaks so PDF pages line up with the .docx.
      ignoreLastRenderedPageBreak: false,
      experimental: true,
      // Letterhead uses page-anchored drawings; painted onto the PDF below.
      renderHeaders: false,
      renderFooters: false,
      renderFootnotes: true,
      renderEndnotes: true,
      useBase64URL: true,
    });
    await waitForImages(host);
    if (document.fonts?.ready) await document.fonts.ready;
    preserveWordBlankParagraphSpacing(host);
    if (noDueTableRows) replaceNoDueCertificateTable(host, noDueTableRows);

    const sections = [...host.querySelectorAll("section.exit-doc-pdf")];
    if (!sections.length) throw new Error("Could not prepare the PDF.");

    const orientation = pageWPt > pageHPt ? "landscape" : "portrait";
    /** @type {{ canvas: HTMLCanvasElement, pageWPx: number, pageHPx: number }[]} */
    const pageCaptures = [];

    for (const section of sections) {
      const { pageWPx, pageHPx } = lockSectionToWordPage(section, pageWPt, pageHPt, marginPt);

      const canvas = await html2canvas(section, {
        scale: CAPTURE_SCALE,
        width: Math.round(pageWPx),
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        imageTimeout: 15_000,
        onclone(_doc, cloned) {
          cloned.style.boxShadow = "none";
          cloned.style.margin = "0";
          cloned.style.transform = "none";
          cloned.style.width = `${pageWPx}px`;
          cloned.style.maxWidth = `${pageWPx}px`;
          cloned.style.boxSizing = "border-box";
          cloned.style.paddingTop = `${marginPt.top * CSS_PX_PER_PT}px`;
          cloned.style.paddingRight = `${marginPt.right * CSS_PX_PER_PT}px`;
          cloned.style.paddingBottom = `${marginPt.bottom * CSS_PX_PER_PT}px`;
          cloned.style.paddingLeft = `${marginPt.left * CSS_PX_PER_PT}px`;
          preserveWordBlankParagraphSpacing(cloned);
          // Guard against preview CSS flipping the rebuilt No Due table to black fills.
          for (const td of cloned.querySelectorAll('table[data-exit-nodue-table] td')) {
            td.style.backgroundColor = "#ffffff";
            td.style.color = "#000000";
            td.style.boxShadow = "none";
            td.style.border = "1px solid #000000";
          }
        },
      });

      const sliceHPx = Math.round(pageHPx * CAPTURE_SCALE);
      // Prefer Word’s native page sections; only slice if a section grew past one page.
      for (let offset = 0; offset < canvas.height; offset += sliceHPx) {
        const height = Math.min(sliceHPx, canvas.height - offset);
        if (offset > 0 && height < CAPTURE_SCALE * 4) break;

        const page = document.createElement("canvas");
        page.width = canvas.width;
        page.height = sliceHPx;
        const ctx = page.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, page.width, page.height);
        ctx.drawImage(canvas, 0, offset, canvas.width, height, 0, 0, canvas.width, height);
        pageCaptures.push({ canvas: page, pageWPx, pageHPx });
      }
    }

    return shrinkPdfBlobIfNeeded(async (quality) => {
      let pdf = null;
      for (const { canvas: page } of pageCaptures) {
        if (!pdf) pdf = new jsPDF({ unit: "pt", format: [pageWPt, pageHPt], orientation, compress: true });
        else pdf.addPage([pageWPt, pageHPt], orientation);
        const { dataUrl, format } = canvasToImageData(page, quality);
        pdf.addImage(dataUrl, format, 0, 0, pageWPt, pageHPt, undefined, "FAST");
        drawLetterhead(pdf, assets, pageWPt, pageHPt);
      }
      return pdf.output("blob");
    });
  } finally {
    host.remove();
    styleHost.remove();
  }
}
