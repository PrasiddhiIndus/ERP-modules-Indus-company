/**
 * Candidate Requisition Form PDF — IFSPL/Admin/Form02/R4
 * Logo + vector tick boxes (Helvetica has no ✓ glyph).
 */
import jsPDF from "jspdf";
import { LETTERHEAD_ASSET_URLS } from "../../../lib/exitDocumentLetterhead";
import { supabase } from "../../../lib/supabase";

function text(v) {
  const s = String(v ?? "").trim();
  return s || "—";
}

export function titleCaseName(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

async function loadLogoDataUrl() {
  const res = await fetch(LETTERHEAD_ASSET_URLS.logo);
  if (!res.ok) throw new Error("Could not load company logo");
  const blob = await res.blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read company logo"));
    reader.readAsDataURL(blob);
  });
  const dims = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = dataUrl;
  });
  const mime = String(blob.type || "").toLowerCase();
  let format = "PNG";
  if (mime.includes("jpeg") || mime.includes("jpg") || String(dataUrl).startsWith("data:image/jpeg")) {
    format = "JPEG";
  } else if (mime.includes("webp") || String(dataUrl).startsWith("data:image/webp")) {
    format = "WEBP";
  }
  return { dataUrl, format, ...dims };
}

/** Square checkbox with vector ✓ (Helvetica has no check glyph — Unicode became '). */
function drawTickBox(doc, x, y, size = 3.6, checked = false) {
  doc.setDrawColor(30);
  doc.setLineWidth(0.35);
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, size, size, "FD");
  if (checked) {
    doc.setLineWidth(0.7);
    doc.setDrawColor(20, 20, 20);
    doc.line(x + size * 0.18, y + size * 0.52, x + size * 0.42, y + size * 0.78);
    doc.line(x + size * 0.42, y + size * 0.78, x + size * 0.84, y + size * 0.2);
    doc.setDrawColor(30);
    doc.setLineWidth(0.35);
  }
}

/** Prefer stored decided_by_name; else look up L1 approver. */
export async function resolveRequisitionApproverName(req) {
  const existing = String(req?.decidedBy || "").trim();
  if (existing) return titleCaseName(existing);
  if (!req?.id) return "";
  try {
    const { data, error } = await supabase.rpc("admin_recruitment_requisition_approver_name", {
      p_requisition_id: req.id,
    });
    if (!error && data) return titleCaseName(String(data));
  } catch {
    /* ignore */
  }
  return "";
}

function statusLine(req, approverName) {
  const when = new Date().toLocaleDateString("en-IN");
  const status = String(req?.status || "").toLowerCase();
  if (approverName && ["approved", "open", "filled"].includes(status)) {
    return `Status: Approved by ${approverName} · generated ${when}`;
  }
  if (approverName && status === "rejected") {
    return `Status: Rejected by ${approverName} · generated ${when}`;
  }
  if (["approved", "open", "filled"].includes(status)) {
    return `Status: Approved · generated ${when}`;
  }
  return `Status: ${text(req?.status)} · generated ${when}`;
}

/**
 * @param {object} req
 * @param {{ logo?: { dataUrl: string, w: number, h: number }, approverName?: string }} extras
 */
export function buildRequisitionFormPdf(req, extras = {}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const right = pageW - margin;
  let y = 10;

  const line = (x1, y1, x2, y2) => doc.line(x1, y1, x2, y2);
  const box = (x, by, w, h) => doc.rect(x, by, w, h);
  const label = (str, x, by, opts = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.size || 9);
    doc.text(String(str), x, by);
  };

  // Logo — natural aspect (circular emblem + wordmark); never squash
  const logo = extras.logo;
  const logoMaxW = 38;
  const logoMaxH = 24;
  let logoDrawW = 0;
  let logoDrawH = 0;
  if (logo?.dataUrl) {
    const aspect = (logo.w || 1) / (logo.h || 1);
    if (aspect >= logoMaxW / logoMaxH) {
      logoDrawW = logoMaxW;
      logoDrawH = logoMaxW / aspect;
    } else {
      logoDrawH = logoMaxH;
      logoDrawW = logoMaxH * aspect;
    }
    try {
      doc.addImage(logo.dataUrl, logo.format || "PNG", right - logoDrawW, y, logoDrawW, logoDrawH);
    } catch {
      try {
        doc.addImage(logo.dataUrl, "PNG", right - logoDrawW, y, logoDrawW, logoDrawH);
      } catch {
        logoDrawW = 0;
      }
    }
  }

  const headerRight = logoDrawW > 0 ? right - logoDrawW - 3 : right;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("INDUS FIRE SAFETY PVT.LTD", margin, y + 5);
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Block No. 501, Opp. GSFC Main Gate, Dashrath, Vadodara, Gujarat-391740", margin, y);
  y = Math.max(y + 5, 10 + logoDrawH + 2);
  doc.setFontSize(8);
  doc.text("Format No: IFSPL/Admin/Form02/R4", margin, y);
  doc.text("Page 1 of 1", headerRight, y, { align: "right" });
  y += 3;
  line(margin, y, right, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("CANDIDATE REQUISITION FORM", pageW / 2, y, { align: "center" });
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Requisition No: ${text(req.requisitionNo)}`, margin, y);
  y += 6;

  const approverName = titleCaseName(extras.approverName || req.decidedBy || "");

  const sigH = 22;
  box(margin, y, right - margin, sigH);
  const colW = (right - margin) / 3;
  label("Requirement raised by Name and Sign:", margin + 2, y + 5, { size: 8, bold: true });
  label(text(req.raisedBy), margin + 2, y + 11, { size: 9 });
  label("Signature:", margin + 2, y + 18, { size: 8 });
  line(margin + colW, y, margin + colW, y + sigH);
  label("HR Name & Sign", margin + colW + 2, y + 5, { size: 8, bold: true });
  label("Signature:", margin + colW + 2, y + 18, { size: 8 });
  line(margin + 2 * colW, y, margin + 2 * colW, y + sigH);
  label("Approving Authority", margin + 2 * colW + 2, y + 5, { size: 8, bold: true });
  if (approverName) label(approverName, margin + 2 * colW + 2, y + 11, { size: 8 });
  label("Signature:", margin + 2 * colW + 2, y + 18, { size: 8 });
  y += sigH + 6;

  const rowH = 8;
  const drawRow = (lbl, val, h = rowH) => {
    box(margin, y, right - margin, h);
    doc.setFillColor(245, 245, 245);
    doc.rect(margin, y, 52, h, "F");
    box(margin, y, right - margin, h);
    line(margin + 52, y, margin + 52, y + h);
    label(lbl, margin + 2, y + 5.2, { size: 8, bold: true });
    const lines = doc.splitTextToSize(text(val), right - margin - 56);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(lines, margin + 54, y + 5.2);
    y += h;
  };

  drawRow("JOB TITLE", req.designation);

  // Hiring type with proper tick boxes
  box(margin, y, right - margin, rowH);
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y, 52, rowH, "F");
  box(margin, y, right - margin, rowH);
  line(margin + 52, y, margin + 52, y + rowH);
  label("Please Tick", margin + 2, y + 5.2, { size: 8, bold: true });
  const isNew = req.hiringType === "new_recruitment" || (!req.hiringType && !req.replacementOf);
  const isRep = req.hiringType === "replacement" || Boolean(req.replacementOf);
  // Labels + checkbox inside parentheses (no Unicode ✓ — draws as ')
  let tx = margin + 54;
  label("New Recruitment (", tx, y + 5.2, { size: 9 });
  tx += doc.getTextWidth("New Recruitment (") + 0.6;
  drawTickBox(doc, tx, y + 2.1, 3.8, isNew);
  tx += 4.4;
  label(")", tx, y + 5.2, { size: 9 });
  tx += doc.getTextWidth(")") + 6;
  label("Replacement (", tx, y + 5.2, { size: 9 });
  tx += doc.getTextWidth("Replacement (") + 0.6;
  drawTickBox(doc, tx, y + 2.1, 3.8, isRep);
  tx += 4.4;
  label(")", tx, y + 5.2, { size: 9 });
  y += rowH;

  if (isRep || req.replacementOf) {
    drawRow("Replacement Of Person", req.replacementOf);
  }

  drawRow("CANDIDATE GENDER", req.candidateGender);
  drawRow("POSITION DEPARTMENT", req.department);
  drawRow("AGE LIMIT", req.ageLimit);
  drawRow("REQUIRED EDUCATION\nQUALIFICATION", req.qualification, 12);
  drawRow(
    "WORK EXPERIENCE REQUIRED",
    req.workExperience || (req.experienceMin != null ? `${req.experienceMin}+ years` : "")
  );

  // Job description = skills / justification — omit when it only duplicates education
  const qual = String(req.qualification || "").trim().toLowerCase();
  const skills = String(req.skills || "").trim();
  const just = String(req.justification || "").trim();
  const pickJd = (...vals) => {
    for (const v of vals) {
      const t = String(v || "").trim();
      if (t && t.toLowerCase() !== qual) return t;
    }
    return "";
  };
  const jd = pickJd(skills, just);
  const jdLines = doc.splitTextToSize(text(jd), right - margin - 56);
  const jdH = Math.max(20, 6 + jdLines.length * 4);
  box(margin, y, right - margin, jdH);
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y, 52, jdH, "F");
  box(margin, y, right - margin, jdH);
  line(margin + 52, y, margin + 52, y + jdH);
  label("Job Description", margin + 2, y + 5.2, { size: 8, bold: true });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(jdLines, margin + 54, y + 5.2);
  y += jdH;

  // Position detail tick boxes
  box(margin, y, right - margin, 16);
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y, 52, 16, "F");
  box(margin, y, right - margin, 16);
  line(margin + 52, y, margin + 52, y + 16);
  label("POSITION DETAIL", margin + 2, y + 5, { size: 8, bold: true });
  label("Please tick in box", margin + 2, y + 11, { size: 7 });
  const et = String(req.employmentType || "").toLowerCase();
  const types = [
    ["FULL TIME", /full/.test(et)],
    ["PART TIME", /part/.test(et)],
    ["CONTRACT", /contract/.test(et)],
    ["INTERN", /intern/.test(et)],
  ];
  types.forEach(([name, on], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = margin + 56 + col * 62;
    const ty = y + 4 + row * 6;
    label(`${name} [`, x, ty + 2.8, { size: 8 });
    const nameW = doc.getTextWidth(`${name} [`);
    drawTickBox(doc, x + nameW + 0.4, ty + 0.2, 3.8, on);
    label("]", x + nameW + 4.6, ty + 2.8, { size: 8 });
  });
  y += 18;

  drawRow("REQUIRED LOCALITY", req.location);

  y += 4;
  label("For Office/ HR Use: -", margin, y, { size: 9, bold: true });
  y += 3;
  const officeH = 28;
  box(margin, y, right - margin, officeH);
  const ow = (right - margin) / 3;
  line(margin + ow, y, margin + ow, y + officeH);
  line(margin + 2 * ow, y, margin + 2 * ow, y + officeH);
  label("Present Salary ( With /", margin + 2, y + 6, { size: 7, bold: true });
  label("Without Statutory Compliance)", margin + 2, y + 10, { size: 7, bold: true });
  label("Final Salary( With / Without Statutory", margin + ow + 2, y + 6, { size: 7, bold: true });
  label("Compliance)", margin + ow + 2, y + 10, { size: 7, bold: true });
  label("Hired/ Not Hired/ Hold", margin + 2 * ow + 2, y + 6, { size: 7, bold: true });

  y = Math.min(y + officeH + 8, 285);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30);
  doc.text(statusLine(req, approverName), margin, y);
  doc.setTextColor(0);

  return doc;
}

export async function downloadRequisitionFormPdf(req) {
  const [logo, approverName] = await Promise.all([
    loadLogoDataUrl().catch(() => null),
    resolveRequisitionApproverName(req),
  ]);
  // Persist resolved name onto the in-memory row for UI refresh callers
  if (approverName && req && !req.decidedBy) req.decidedBy = approverName;
  const doc = buildRequisitionFormPdf(req, { logo, approverName });
  const name = `Candidate_Requisition_${String(req.requisitionNo || req.id || "form").replace(/[^\w.-]+/g, "_")}.pdf`;
  doc.save(name);
  return approverName;
}
