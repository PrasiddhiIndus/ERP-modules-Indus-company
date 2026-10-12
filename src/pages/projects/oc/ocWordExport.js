/**
 * IEV PO At Glance — Word export. Same structure as the paper form (OC_Creation_Blank_Form.docx):
 * Arial, A4 portrait, header table + one 4-column grid (label | value | label | value).
 */
import {
  AlignmentType, BorderStyle, Document, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell,
  TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType,
} from "docx";
import { INDUS_LOGO_SRC } from "../../../constants/branding";
import {
  OC_COMPANY_NAME, OC_CONTACTS_HEADING, OC_DOC_REF, OC_FORM_TITLE, OC_SECURITY_HEADING, OC_SIGNOFF_HEADING,
  SIGNOFF_SLOTS, contactBlank, contractValueInWords, emdSummary, formatIndianAmount, formatOcDate, formatSignedAt,
  milestoneLines, penaltySummary, securityRowBlank, securityTypeLabel, splitList,
} from "./ocModel";

const FONT = "Arial";
const LABEL_FILL = "EFEFEF";
const HEADER_COLS = [5416, 3610];
const LOGO_COL = 1000;
const LOGO_PX = 48;
const GRID = [2100, 2700, 1700, 2526];
const FULL = GRID.reduce((s, w) => s + w, 0);
const LINE = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const MARGINS = { top: 30, bottom: 30, left: 70, right: 70 };

const run = (text, o = {}) => new TextRun({ text: String(text ?? ""), font: FONT, size: o.size ?? 16, bold: o.bold, italics: o.italics });

/** Paragraphs for a value: multi-line text keeps its line breaks. */
function lines(value, o = {}) {
  const list = Array.isArray(value) ? value : String(value ?? "").split("\n");
  const kids = [];
  list.forEach((l, i) => {
    if (i) kids.push(new TextRun({ break: 1, font: FONT, size: o.size ?? 16 }));
    kids.push(run(l, o));
  });
  return [new Paragraph({ alignment: o.align, spacing: { before: 0, after: 0 }, children: kids })];
}

function cell(content, { width, span, label = false, fill, align, valign } = {}) {
  const children = Array.isArray(content) && content[0] instanceof Paragraph
    ? content
    : lines(content, { bold: label, size: label ? 17 : 16, align });
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: span,
    shading: (fill || label) ? { type: ShadingType.CLEAR, color: "auto", fill: fill || LABEL_FILL } : undefined,
    margins: MARGINS,
    verticalAlign: valign ?? VerticalAlign.CENTER,
    children,
  });
}

const yesNo = (v) => `${v === true ? "☑" : "☐"} Yes    ${v === false ? "☑" : "☐"} No`;
const row = (cells, height) => new TableRow({ cantSplit: true, height: height ? { value: height, rule: "atLeast" } : undefined, children: cells });
const pair = (l1, v1, l2, v2) => row([cell(l1, { width: GRID[0], label: true }), cell(v1, { width: GRID[1] }), cell(l2, { width: GRID[2], label: true }), cell(v2, { width: GRID[3] })]);
const full = (l, v, height) => row([cell(l, { width: GRID[0], label: true }), cell(v, { width: FULL - GRID[0], span: 3 })], height);
const heading = (text) => row([cell(text, { width: FULL, span: 4, label: true })]);
const head4 = (labels) => row(labels.map((l, i) => cell(l, { width: GRID[i], label: true, align: AlignmentType.CENTER })));
const plain4 = (values, height) => row(values.map((v, i) => cell(v, { width: GRID[i] })), height);

function contractValueText(form) {
  const amount = formatIndianAmount(form.contract_value);
  if (!amount) return "";
  const symbol = form.currency === "INR" ? "₹ " : `${form.currency} `;
  return [`${symbol}${amount}`, `(${contractValueInWords(form.contract_value, form.currency)})`];
}

function paymentTermsText(form) {
  const out = [];
  if (form.payment_terms) out.push(...String(form.payment_terms).split("\n"));
  const ms = milestoneLines(form.payment_milestones);
  if (ms.length) out.push(...(out.length ? [""] : []), "Milestones:", ...ms.map((m, i) => `${i + 1}. ${m}`));
  return out.length ? out : "";
}

function signoffCell(slot, form, width) {
  const s = form.signoff[slot] || {};
  const signedAt = formatSignedAt(s.signed_at);
  const para = (children) => new Paragraph({ spacing: { before: 0, after: 40 }, children });
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: MARGINS,
    verticalAlign: VerticalAlign.TOP,
    children: [
      para([run("Name: ", { bold: true }), run(s.signed_by || "")]),
      para(signedAt ? [run("Digitally signed", { size: 14, italics: true })] : [run(" ")]),
      para([run("Date & time: ", { bold: true }), run(signedAt)]),
    ],
  });
}

/**
 * @param {object} form  OC form state (ocModel shape)
 * @param {{ logo?: ArrayBuffer|Uint8Array|null }} [opts]  Indus logo (PNG) for the header
 */
export function buildOcDocument(form, { logo = null } = {}) {
  const security = form.security_items.filter((r) => !securityRowBlank(r));
  const securityRows = (security.length ? security : [null, null]).map((r) => (r
    ? plain4([
      r.type === "SD" && r.applicable !== null ? `${securityTypeLabel(r.type)}: ${r.applicable ? "Yes" : "No"}` : securityTypeLabel(r.type),
      r.pct === "" ? "" : `${r.pct}%`,
      r.due_days === "" ? "" : `${r.due_days} days`,
      r.validity_text,
    ])
    : plain4(["", "", "", ""], 260)));

  const contacts = form.contacts.filter((c) => !contactBlank(c));
  const contactRows = (contacts.length ? contacts : [null, null]).map((c) => (c
    ? plain4([c.department, c.names, splitList(c.mobiles), splitList(c.emails)])
    : plain4(["", "", "", ""], 260)));

  const headerCols = logo ? [LOGO_COL, HEADER_COLS[0] - LOGO_COL, HEADER_COLS[1]] : HEADER_COLS;
  const logoCell = logo && new TableCell({
    width: { size: LOGO_COL, type: WidthType.DXA },
    margins: MARGINS,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [new ImageRun({ type: "png", data: logo, transformation: { width: LOGO_PX, height: LOGO_PX } })],
    })],
  });
  const header = new Table({
    width: { size: FULL, type: WidthType.DXA },
    columnWidths: headerCols,
    layout: TableLayoutType.FIXED,
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
    rows: [new TableRow({
      children: [
        ...(logoCell ? [logoCell] : []),
        new TableCell({ width: { size: headerCols[headerCols.length - 2], type: WidthType.DXA }, margins: MARGINS, verticalAlign: VerticalAlign.CENTER, children: lines(OC_COMPANY_NAME, { bold: true, size: 20 }) }),
        new TableCell({ width: { size: headerCols[headerCols.length - 1], type: WidthType.DXA }, margins: MARGINS, verticalAlign: VerticalAlign.CENTER, children: lines(OC_DOC_REF, { size: 14, align: AlignmentType.RIGHT }) }),
      ],
    })],
  });

  const grid = new Table({
    width: { size: FULL, type: WidthType.DXA },
    columnWidths: GRID,
    layout: TableLayoutType.FIXED,
    borders: { top: LINE, bottom: LINE, left: LINE, right: LINE, insideHorizontal: LINE, insideVertical: LINE },
    rows: [
      full("Cost Center in Tally", form.cost_center_tally),
      pair("OC No.", form.oc_no, "OC No. Date", formatOcDate(form.oc_date)),
      pair("Client Name & Address", [form.client_name, ...String(form.client_address || "").split("\n")].filter((x, i) => i === 0 || x !== ""), "Whether SEZ", yesNo(form.is_sez)),
      pair("PO/WO No.", form.po_wo_no, "PO/WO Date", formatOcDate(form.po_date)),
      full("Project Description", form.project_description, 380),
      pair("Duration of Job", form.duration_of_job, "Delivery Date", formatOcDate(form.delivery_date)),
      pair("Contract Value (Excluding Taxes)", contractValueText(form), "GST Applicability (%)", form.gst_pct === "" ? "" : `${form.gst_pct}%`),
      full("Payment Terms", paymentTermsText(form), 380),
      pair("LD / Penalty Clause, if any", yesNo(form.penalty.enabled), "Details", penaltySummary(form.penalty)),
      heading(OC_SECURITY_HEADING),
      head4(["Security type", "% of contract value", "Due within (days from PO date)", "Validity period"]),
      ...securityRows,
      pair("EMD", yesNo(form.emd.enabled), "Release date / adjust against SD", emdSummary(form.emd)),
      pair("Defect Liability Period", yesNo(form.dlp.enabled), "Details", form.dlp.enabled === true ? form.dlp.detail_text : ""),
      pair("Warranty", yesNo(form.warranty.enabled), "Details", form.warranty.enabled === true ? form.warranty.detail_text : ""),
      full("RTO / Insurance", form.rto_insurance),
      full("Any Other Information", form.other_information, 380),
      heading(OC_CONTACTS_HEADING),
      head4(["Department", "Name", "Mobile No.", "E-mail address"]),
      ...contactRows,
      full("Remarks", form.remarks, 380),
      full("Date", formatOcDate(form.remarks_date)),
      heading(OC_SIGNOFF_HEADING),
      head4(SIGNOFF_SLOTS.map((s) => s.label)),
      row(SIGNOFF_SLOTS.map((s, i) => signoffCell(s.slot, form, GRID[i])), 900),
    ],
  });

  return new Document({
    creator: OC_COMPANY_NAME,
    title: `${OC_FORM_TITLE} ${form.oc_no || ""}`.trim(),
    styles: { default: { document: { run: { font: FONT, size: 16 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 720, bottom: 720, left: 1440, right: 1440, header: 708, footer: 708 } } },
      children: [
        header,
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 }, children: [run(OC_FORM_TITLE, { bold: true, size: 22 })] }),
        grid,
      ],
    }],
  });
}

async function loadIndusLogo() {
  try {
    const res = await fetch(INDUS_LOGO_SRC);
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch (e) {
    console.warn("[PO At Glance] logo not loaded; exporting without it", e);
    return null;
  }
}

export const buildOcDocx = async (form) => Packer.toBlob(buildOcDocument(form, { logo: await loadIndusLogo() }));
export const buildOcDocxBuffer = (form, opts) => Packer.toBuffer(buildOcDocument(form, opts));
