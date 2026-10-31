/**
 * Maintenance (M&M) PO At Glance — Word export in the M&M format (IFSPL/M&M-OC/F&A/004, "M&M PO format.doc"):
 * A4 portrait, Arial 10 pt, header with the Indus Fire Safety logo, company name and document reference,
 * a 7-column order table, customer contacts, and the three dissemination sign-off boxes.
 * Uses the same form data as IEV PO At Glance (ocModel shape); only the layout differs.
 */
import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, Header, ImageRun, Packer, Paragraph, Table, TableCell, TableLayoutType,
  TableRow, TextRun, UnderlineType, VerticalAlign, VerticalMergeType, WidthType,
} from "docx";
import {
  OC_COMPANY_NAME, OC_FORM_TITLE, OC_SIGNOFF_HEADING, contactBlank, emdSummary, formatIndianAmount, formatSignedAt,
  milestoneLines, penaltySummary, securityRowBlank, securityTypeLabel, splitList,
} from "../../projects/oc/ocModel";
import { MM_OC_DOC_REF, MM_OC_SIGNOFF_SLOTS } from "./mmOcDepartment";

export const MM_LOGO_SRC = "/maintenance/indus-ifs-logo.jpeg";

const FONT = "Arial";
const SIZE = 20; // 10 pt
const LINE = { style: BorderStyle.SINGLE, size: 8, color: "000000" };
const BORDERS = { top: LINE, bottom: LINE, left: LINE, right: LINE, insideHorizontal: LINE, insideVertical: LINE };
const MARGINS = { top: 0, bottom: 0, left: 108, right: 108 };
// Tables start 0.55" left of the margin, as in the format (Word measures it to the cell text, so less one cell margin).
const INDENT = { size: -792 - MARGINS.left, type: WidthType.DXA };
// Column grids in twips, taken from the Word file.
const MAIN = [2130, 1710, 2670, 1095, 645, 1365, 1395];
const CONTACT = [1326, 2081, 2005, 5553];
const SIGN = [3452, 3969, 3618];
const sum = (a, from = 0, n = a.length) => a.slice(from, from + n).reduce((s, w) => s + w, 0);

const run = (text, o = {}) => new TextRun({
  text: String(text ?? ""), font: o.font ?? FONT, size: o.size ?? SIZE, bold: o.bold, italics: o.italics, color: o.color,
  underline: o.underline ? { type: UnderlineType.SINGLE } : undefined,
});
const para = (children, o = {}) => new Paragraph({
  alignment: o.align, indent: o.indent ? { left: o.indent } : undefined, spacing: { before: o.before ?? 0, after: 0 }, children,
});

/** Paragraphs for plain text; "\n" starts a new paragraph. */
function text(value, o = {}) {
  const list = Array.isArray(value) ? value : String(value ?? "").split("\n");
  return list.map((l) => para([run(l, o)], o));
}

function cell(content, { cols, from = 0, span = 1, align, merge, height, valign } = {}) {
  const children = Array.isArray(content) && content[0] instanceof Paragraph ? content : text(content, { align });
  return new TableCell({
    width: { size: sum(cols, from, span), type: WidthType.DXA },
    columnSpan: span > 1 ? span : undefined,
    verticalMerge: merge,
    margins: MARGINS,
    verticalAlign: valign ?? VerticalAlign.CENTER,
    children,
  });
}

const row = (cells, heightPt) => new TableRow({
  cantSplit: true,
  height: heightPt ? { value: Math.round(heightPt * 20), rule: "atLeast" } : undefined,
  children: cells,
});

const table = (cols, rows) => new Table({
  width: { size: sum(cols), type: WidthType.DXA },
  columnWidths: cols,
  indent: INDENT,
  layout: TableLayoutType.FIXED,
  borders: BORDERS,
  rows,
});

/** "No/Yes" (or "Yes/ No") with the chosen answer in bold, as the format marks it. */
function choice(value, order = "noYes", prefix = "") {
  const yes = run("Yes", { bold: value === true });
  const no = run(order === "noYes" ? "No" : " No", { bold: value === false });
  const runs = order === "noYes" ? [no, run("/"), yes] : [yes, run("/"), no];
  return [para(prefix ? [run(prefix), ...runs] : runs, { align: order === "noYes" ? AlignmentType.CENTER : undefined })];
}

const yesNoWord = (v) => (v === true ? "Yes" : v === false ? "No" : "");

/** yyyy-mm-dd → dd-mm-yyyy (the format's date style). */
export function mmDate(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** "41,200/-" (INR) or "USD 41,200/-". */
export function mmContractValue(form) {
  const amount = formatIndianAmount(form.contract_value);
  if (!amount) return "";
  return `${form.currency && form.currency !== "INR" ? `${form.currency} ` : ""}${amount}/-`;
}

export function mmDuration(form) {
  if (String(form.duration_of_job || "").trim()) return form.duration_of_job;
  const from = mmDate(form.po_date);
  const to = mmDate(form.delivery_date);
  return from && to ? `${from} To ${to}` : from || to;
}

function paymentTerms(form) {
  const out = String(form.payment_terms || "").split("\n").filter((l, i, a) => l !== "" || a.length === 1);
  const ms = milestoneLines(form.payment_milestones);
  if (ms.length) out.push("Milestones:", ...ms.map((m, i) => `${i + 1}. ${m}`));
  return out;
}

function securityDetail(r) {
  return [
    r.pct !== "" ? `${r.pct}% of Contract Value` : "",
    r.due_days !== "" ? `due within ${r.due_days} days from PO date` : "",
    r.validity_text ? `Validity: ${r.validity_text}` : "",
  ].filter(Boolean).join(", ");
}

/** SD row values; ABG / PBG (not on the M&M format) go to "Any Other Information". */
export function mmSecurity(form) {
  const items = form.security_items.filter((r) => !securityRowBlank(r));
  const sd = items.find((r) => r.type === "SD");
  const others = items.filter((r) => r !== sd).map((r) => {
    const label = r.type === "SD" ? `${securityTypeLabel(r.type)}${r.applicable !== null ? `: ${yesNoWord(r.applicable)}` : ""}` : securityTypeLabel(r.type);
    const detail = securityDetail(r);
    return detail ? `${label} — ${detail}` : label;
  });
  const applicable = sd ? sd.applicable : null;
  return {
    applicable,
    details: applicable === true ? securityDetail(sd) : applicable === false ? "No" : "",
    others,
  };
}

/** E-mail addresses as blue underlined mailto links, as in the format. */
function emailRuns(emails) {
  const out = [];
  emails.forEach((e, i) => {
    if (i) out.push(run(", "));
    out.push(new ExternalHyperlink({
      link: `mailto:${e}`,
      children: [new TextRun({ text: e, font: FONT, size: SIZE, color: "0563C1", underline: { type: UnderlineType.SINGLE } })],
    }));
  });
  return out.length ? out : [run("")];
}

const clauseDetail = (enabled, detail) => (enabled === true ? detail : enabled === false ? "No" : "");

function clauseRows(label, value, prompt, detail) {
  return [
    row([
      cell(label, { cols: MAIN, merge: VerticalMergeType.RESTART }),
      cell(value, { cols: MAIN, from: 1, align: AlignmentType.CENTER, merge: VerticalMergeType.RESTART, valign: VerticalAlign.CENTER }),
      cell(prompt, { cols: MAIN, from: 2, span: 5 }),
    ]),
    row([
      cell("", { cols: MAIN, merge: VerticalMergeType.CONTINUE }),
      cell("", { cols: MAIN, from: 1, merge: VerticalMergeType.CONTINUE }),
      cell(detail, { cols: MAIN, from: 2, span: 5 }),
    ]),
  ];
}

function signatureCell(slot, form, i) {
  const s = form.signoff[slot] || {};
  const signedAt = formatSignedAt(s.signed_at);
  const kids = s.signed_by
    ? [
      para([run(s.signed_by, { bold: true, size: 18 })], { align: AlignmentType.CENTER }),
      para([run(signedAt ? `Digitally signed on ${signedAt}` : "", { italics: true, size: 14 })], { align: AlignmentType.CENTER }),
    ]
    : [para([run("")], { align: AlignmentType.CENTER })];
  return cell(kids, { cols: SIGN, from: i, valign: VerticalAlign.BOTTOM });
}

/**
 * @param {object} form  PO At Glance form state (ocModel shape, Maintenance sign-off slots)
 * @param {{ logo?: ArrayBuffer|Uint8Array|null }} [opts]  Indus Fire Safety logo (JPEG) for the header
 */
export function buildMmOcDocument(form, { logo = null } = {}) {
  const sec = mmSecurity(form);
  const otherInfo = [
    ...String(form.other_information || "").split("\n").filter(Boolean),
    ...(form.rto_insurance ? [`RTO / Insurance: ${form.rto_insurance}`] : []),
    ...sec.others,
  ];
  const contacts = form.contacts.filter((c) => !contactBlank(c));
  const contactRows = (contacts.length ? contacts : [null, null]).map((c) => row([
    cell(c?.department ?? "", { cols: CONTACT }),
    cell([para([run(c?.names ?? "", { bold: true, font: "Aptos", color: "385623" })])], { cols: CONTACT, from: 1 }),
    cell([para([run(c ? splitList(c.mobiles).join(", ") : "", { bold: true, font: "Aptos", color: "385623" })])], { cols: CONTACT, from: 2 }),
    cell([para(c ? emailRuns(splitList(c.emails)) : [run("")])], { cols: CONTACT, from: 3 }),
  ], 19.85));

  const main = table(MAIN, [
    row([cell("Cost Center in Tally", { cols: MAIN }), cell(form.cost_center_tally, { cols: MAIN, from: 1, span: 6 })], 20),
    row([
      cell("OC No.", { cols: MAIN }),
      cell([para([run(form.oc_no, { bold: true })])], { cols: MAIN, from: 1, span: 3 }),
      cell("Date", { cols: MAIN, from: 4 }),
      cell(mmDate(form.oc_date), { cols: MAIN, from: 5, span: 2 }),
    ], 20),
    row([
      cell("Client Name & Address", { cols: MAIN }),
      cell([
        para([run(form.client_name, { bold: true, font: "Times New Roman", size: 24 })]),
        ...String(form.client_address || "").split("\n").filter(Boolean).map((l) => para([run(l, { font: "Times New Roman", size: 24 })])),
      ], { cols: MAIN, from: 1, span: 3 }),
      cell(choice(form.is_sez, "yesNo", "Whether SEZ: "), { cols: MAIN, from: 4, span: 3 }),
    ], 45.65),
    row([
      cell("PO/WO No.", { cols: MAIN }),
      cell(form.po_wo_no, { cols: MAIN, from: 1, span: 3 }),
      cell("Date", { cols: MAIN, from: 4 }),
      cell(mmDate(form.po_date), { cols: MAIN, from: 5, span: 2 }),
    ], 20),
    row([cell("Project Description", { cols: MAIN }), cell(form.project_description, { cols: MAIN, from: 1, span: 6 })], 20),
    row([cell("Duration of Job", { cols: MAIN }), cell(mmDuration(form), { cols: MAIN, from: 1, span: 6 })], 15.45),
    row([
      cell(["Contract Value", "(Excl. Taxes)"], { cols: MAIN }),
      cell(mmContractValue(form), { cols: MAIN, from: 1, span: 2 }),
      cell("GST Applicability (%)", { cols: MAIN, from: 3, span: 3 }),
      cell(form.gst_pct === "" ? "" : `${form.gst_pct}%`, { cols: MAIN, from: 6 }),
    ], 20),
    row([cell("Payment Terms", { cols: MAIN, valign: VerticalAlign.TOP }), cell(paymentTerms(form), { cols: MAIN, from: 1, span: 6 })]),
    // LD: "No/Yes" with the chosen answer in bold, and the answer again below it.
    row([
      cell(["LD / Penalty Clause, ", "if any"], { cols: MAIN, merge: VerticalMergeType.RESTART }),
      cell(choice(form.penalty.enabled), { cols: MAIN, from: 1 }),
      cell("If ‘YES’, Please specify applicable duration and % of Deduction", { cols: MAIN, from: 2, span: 5 }),
    ]),
    row([
      cell("", { cols: MAIN, merge: VerticalMergeType.CONTINUE }),
      cell(yesNoWord(form.penalty.enabled), { cols: MAIN, from: 1, align: AlignmentType.CENTER }),
      cell(clauseDetail(form.penalty.enabled, penaltySummary(form.penalty)), { cols: MAIN, from: 2, span: 5 }),
    ]),
    ...clauseRows("SD Applicability", choice(sec.applicable),
      "If \"YES\": Please specify applicable % of Contract Value and Validity period", sec.details),
    ...clauseRows("EMD", yesNoWord(form.emd.enabled),
      "If \"YES\": Confirm whether EMD Amount will be released (with date) or it will be adjusted against SD",
      clauseDetail(form.emd.enabled, emdSummary(form.emd))),
    ...clauseRows("Defect Liability Period", yesNoWord(form.dlp.enabled),
      "If \"YES\": Please specify Duration / Period", clauseDetail(form.dlp.enabled, form.dlp.detail_text)),
    ...clauseRows("Warranty / Guarantee", yesNoWord(form.warranty.enabled),
      "If \"YES\": Please specify", clauseDetail(form.warranty.enabled, form.warranty.detail_text)),
    row([cell("Any Other Information", { cols: MAIN }), cell(otherInfo.length ? otherInfo : "", { cols: MAIN, from: 1, span: 6 })], 13.5),
  ]);

  const contactTable = table(CONTACT, [
    row(["Department", "Name", "Mobile No.", "E-mail address"].map((h, i) => cell(h, { cols: CONTACT, from: i, align: AlignmentType.CENTER })), 14.1),
    ...contactRows,
    row([cell("Remarks", { cols: CONTACT }), cell(form.remarks, { cols: CONTACT, from: 1, span: 3 })], 19.85),
  ]);

  const signTable = table(SIGN, [
    row([cell([para([run(OC_SIGNOFF_HEADING, { bold: true })])], { cols: SIGN, span: 3 })], 19.65),
    row(MM_OC_SIGNOFF_SLOTS.map((s, i) => cell(s.label, { cols: SIGN, from: i, align: AlignmentType.CENTER })), 12.3),
    row(MM_OC_SIGNOFF_SLOTS.map((s, i) => signatureCell(s.slot, form, i)), 44.05),
  ]);

  const header = new Header({
    children: [
      // Same placement as the format: logo after 17 spaces, reference line indented 252 pt.
      para([run(" ".repeat(17), { size: 21 }), ...(logo ? [new ImageRun({ type: "jpg", data: logo, transformation: { width: 54, height: 51 } })] : [])]),
      para([run(OC_COMPANY_NAME, { bold: true, size: 21 })]),
      para([run(MM_OC_DOC_REF, { size: 21 })], { indent: 5040 }),
    ],
  });

  return new Document({
    creator: OC_COMPANY_NAME,
    title: `${OC_FORM_TITLE} ${form.oc_no || ""}`.trim(),
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 397, bottom: 425, left: 1440, right: 658, header: 170, footer: 709 },
        },
      },
      headers: { default: header },
      children: [
        para([run(OC_FORM_TITLE, { bold: true, size: 26, underline: true })], { align: AlignmentType.CENTER }),
        para([run("")]),
        main,
        para([run("Customer’s contact details:", { bold: true })], { before: 120 }),
        contactTable,
        para([run(`Date: ${mmDate(form.remarks_date)}`)]),
        signTable,
      ],
    }],
  });
}

async function loadLogo() {
  try {
    const res = await fetch(MM_LOGO_SRC);
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch (e) {
    console.warn("[PO At Glance] logo not loaded; exporting without it", e);
    return null;
  }
}

export const buildMmOcDocx = async (form) => Packer.toBlob(buildMmOcDocument(form, { logo: await loadLogo() }));
export const buildMmOcDocxBuffer = (form, opts) => Packer.toBuffer(buildMmOcDocument(form, opts));
