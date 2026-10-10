/**
 * Email CTC details (Annexure-I PDFs) to the employee's login email.
 * The server picks the recipient; the browser only builds the PDFs.
 */
import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";
import { fetchApiWithAuth } from "../../../lib/apiBase";
import { annexureMonthlyValue, annexurePaValue, annexureRowsFor, roundRupee } from "./ctcEngine";
import { recordToComponents } from "./annexureCtcRecord";
import { annexureParts } from "./annexurePrint";

// Mirrors the Print Annexure page: A4, 14 mm margins, Arial 11px body (CSS px → mm / pt).
const PX_MM = 0.2646;
const PX_PT = 0.75;
const MARGIN = 14;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LINE = 1.15;
const TEXT = 17;
const BORDER = 153;
const FILL_HEAD = [229, 231, 235];
const FILL_KEY = [243, 244, 246];
const AMOUNT_COL_MM = 35;

const CELL = {
  font: "helvetica",
  fontSize: 11 * PX_PT,
  textColor: TEXT,
  lineColor: BORDER,
  lineWidth: PX_MM,
  cellPadding: { top: 3 * PX_MM, bottom: 3 * PX_MM, left: 6 * PX_MM, right: 6 * PX_MM },
  minCellHeight: 0,
  valign: "middle",
};

function money(v) {
  return roundRupee(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read the file."));
    reader.readAsDataURL(blob);
  });
}

async function loadImage(src) {
  const dataUrl = String(src).startsWith("data:") ? src : await blobToDataUrl(await (await fetch(src)).blob());
  const size = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
  return size ? { dataUrl, ...size } : null;
}

function centered(doc, text, y, { px, underline = false }) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(px * PX_PT);
  doc.text(text, PAGE_W / 2, y, { align: "center", baseline: "top" });
  if (underline) {
    const w = doc.getTextWidth(text);
    const uy = y + px * PX_MM * 0.95;
    doc.setLineWidth(0.2);
    doc.setDrawColor(TEXT);
    doc.line(PAGE_W / 2 - w / 2, uy, PAGE_W / 2 + w / 2, uy);
  }
  return y + px * LINE * PX_MM;
}

/** Annexure-I (same layout as Print Annexure, employee copy) → base64 PDF. */
export async function annexurePdfBase64({ employee, record, ruleVersion, segment }) {
  const parts = annexureParts({ employee, record, ruleVersion, segment });
  const cur = recordToComponents(record);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setTextColor(TEXT);

  let y = MARGIN;
  y = centered(doc, parts.companyName, y, { px: 15 });
  y += 4 * PX_MM;
  y = centered(doc, parts.title, y, { px: 12 });
  y += 2 * PX_MM;
  y = centered(doc, "Annexure-I", y, { px: 11, underline: true });
  y += 10 * PX_MM;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: CONTENT_W,
    theme: "grid",
    styles: CELL,
    columnStyles: { 0: { cellWidth: CONTENT_W * 0.3, fontStyle: "bold", fillColor: FILL_KEY } },
    body: parts.info,
  });
  y = doc.lastAutoTable.finalY + 10 * PX_MM;

  const body = annexureRowsFor(null, cur).map((row) => {
    if (row.heading) {
      return [{ content: row.label, colSpan: 3, styles: { fontStyle: "bold", fillColor: FILL_HEAD, halign: "left" } }];
    }
    const v = Number(cur[row.key]) || 0;
    const pa = annexurePaValue(cur, row.key);
    const monthlyEmpty = cur[row.key] != null && annexureMonthlyValue(cur, row.key) == null;
    const style = row.total ? { fontStyle: "bold", fillColor: FILL_KEY } : {};
    return [
      { content: row.label, styles: { ...style, halign: "left" } },
      { content: monthlyEmpty ? "" : money(v), styles: { ...style, halign: "right" } },
      { content: pa == null ? "" : money(pa), styles: { ...style, halign: "right" } },
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN },
    tableWidth: CONTENT_W,
    theme: "grid",
    styles: CELL,
    headStyles: { fillColor: FILL_HEAD, textColor: TEXT, fontStyle: "bold", halign: "right" },
    columnStyles: { 1: { cellWidth: AMOUNT_COL_MM }, 2: { cellWidth: AMOUNT_COL_MM } },
    head: [[{ content: "Particulars", styles: { halign: "left" } }, "Monthly", "P.A."]],
    body,
  });
  y = doc.lastAutoTable.finalY;

  if (parts.note) {
    y += 10 * PX_MM;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10 * PX_PT);
    const lines = doc.splitTextToSize(parts.note, CONTENT_W);
    doc.text(lines, MARGIN, y, { baseline: "top", lineHeightFactor: LINE });
    y += lines.length * 10 * LINE * PX_MM;
  }

  const sign = parts.signatureImage ? await loadImage(parts.signatureImage).catch(() => null) : null;
  const signH = 70 * PX_MM;
  const signW = sign ? (sign.w / sign.h) * signH : 0;
  const lineH = 11 * LINE * PX_MM;
  const blockH = 36 * PX_MM + lineH + (sign ? 10 * PX_MM + signH : 40 * PX_MM) + lineH;
  if (y + blockH > PAGE_H - MARGIN) {
    doc.addPage();
    y = MARGIN - 36 * PX_MM;
  }

  const right = PAGE_W - MARGIN;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11 * PX_PT);
  y += 36 * PX_MM;
  doc.text(parts.sigCompany, right, y, { align: "right", baseline: "top" });
  y += lineH;
  if (sign) {
    y += 6 * PX_MM;
    doc.addImage(sign.dataUrl, "PNG", right - signW, y, signW, signH);
    y += signH + 4 * PX_MM;
  } else {
    y += 40 * PX_MM;
  }
  doc.text(parts.sigTitle, right, y, { align: "right", baseline: "top" });

  return blobToDataUrl(doc.output("blob")).then((url) => url.replace(/^data:[^,]*,/, ""));
}

export async function fetchCtcEmailRecipient(employeeId) {
  const res = await fetchApiWithAuth(
    `/api/admin/salary/ctc-email/recipient?employeeId=${encodeURIComponent(employeeId)}`,
    { method: "GET", timeoutMs: 20_000 }
  );
  if (!res.ok) throw new Error(res.error || "Could not find the employee email.");
  return res.data?.email || "";
}

/** @param {{ employeeId: string|number, attachments: { fileName: string, label: string, pdfBase64: string }[] }} p */
export async function sendCtcEmail({ employeeId, attachments }) {
  const res = await fetchApiWithAuth("/api/admin/salary/ctc-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId, attachments }),
    timeoutMs: 120_000,
  });
  if (!res.ok) throw new Error(res.error || "Could not send the email.");
  return res.data;
}
