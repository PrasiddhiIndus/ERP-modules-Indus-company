/**
 * Commercial PO At Glance — Word export in the Commercial OC format ("OC Format - commercial.doc",
 * IFSPL/C&B/06, R-0). Table grids, row heights, indents and page margins are taken from that file.
 */
import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, Header, ImageRun, Packer, Paragraph, Table, TableCell,
  TableLayoutType, TableRow, TabStopType, TextRun, UnderlineType, VerticalAlign, WidthType,
} from "docx";
import {
  CM_OC_APPROVAL_HEADING, CM_OC_APPROVER_SLOT, CM_OC_COMPANY_NAME, CM_OC_DISSEMINATION_SLOTS, CM_OC_DOC_REF, CM_OC_FORM_TITLE,
  CM_OC_SIGNOFF_HEADING, cmCategoryLabel, cmCategoryStages,
} from "./cmOcDepartment";
import { CM_MANPOWER_FIELDS, cmContactBlank, formatCmDate, formatSignedAt, isBlank, splitList } from "./cmOcModel";

export const CM_LOGO_SRC = "/maintenance/indus-ifs-logo.jpeg";

const FONT = "Arial";
const SIZE = 21; // 10.5 pt, as in the format
const LINE = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const BORDERS = { top: LINE, bottom: LINE, left: LINE, right: LINE, insideHorizontal: LINE, insideVertical: LINE };
const MARGINS = { top: 0, bottom: 0, left: 108, right: 108 };
const ROW_H = 19.85; // 397 twips

// Column grids in twips, taken from the Word file.
const HEAD = [2100, 4819, 851, 2490];
const DESC = [2100, 8160];
const TERMS = [1710, 1350, 1024, 776, 1710, 349, 851, 510, 1980];
const CREW = [1004, 1409, 1407, 1407, 1550, 1957, 1520];
const WAGE = [1249, 1276, 2126, 5609];
const SCOPE = [3375, 1894, 483, 1468, 3040];
const CONTACT = [1419, 3121, 2008, 3712];
const REMARKS = [1533, 8727];
const DISSEM = [2357, 1701, 2835, 1701, 1748];
const sum = (a, from = 0, n = a.length) => a.slice(from, from + n).reduce((s, w) => s + w, 0);

const run = (text, o = {}) => new TextRun({
  text: String(text ?? ""), font: o.font ?? FONT, size: o.size ?? SIZE, bold: o.bold, italics: o.italics, color: o.color,
  underline: o.underline ? { type: UnderlineType.SINGLE } : undefined,
});
const para = (children, o = {}) => new Paragraph({
  alignment: o.align, indent: o.indent ? { left: o.indent } : undefined, spacing: { before: o.before ?? 0, after: o.after ?? 0 },
  tabStops: o.tabStops, children,
});

/** Paragraphs for plain text; "\n" starts a new paragraph. */
function text(value, o = {}) {
  const list = Array.isArray(value) ? value : String(value ?? "").split("\n");
  return list.map((l) => para([run(l, o)], o));
}

function cell(content, { cols, from = 0, span = 1, align, bold, valign } = {}) {
  const children = Array.isArray(content) && content[0] instanceof Paragraph ? content : text(content, { align, bold });
  return new TableCell({
    width: { size: sum(cols, from, span), type: WidthType.DXA },
    columnSpan: span > 1 ? span : undefined,
    margins: MARGINS,
    verticalAlign: valign ?? VerticalAlign.CENTER,
    children,
  });
}

const row = (cells, heightPt = ROW_H) => new TableRow({
  cantSplit: true,
  height: heightPt ? { value: Math.round(heightPt * 20), rule: "atLeast" } : undefined,
  children: cells,
});

const table = (cols, rows, indent = -432) => new Table({
  width: { size: sum(cols), type: WidthType.DXA },
  columnWidths: cols,
  indent: { size: indent, type: WidthType.DXA },
  layout: TableLayoutType.FIXED,
  borders: BORDERS,
  rows,
});

/** Blank values print as "-", as on the format. */
const dash = (v) => (isBlank(v) ? "-" : String(v));
const yesNo = (v) => (v === true ? "Yes" : v === false ? "No" : "");

/** E-mail addresses as blue underlined mailto links. */
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

function signatureContent(form, slot) {
  const s = form.signoff?.[slot] || {};
  if (isBlank(s.signed_by)) return [para([run("")], { align: AlignmentType.CENTER })];
  const at = formatSignedAt(s.signed_at);
  return [
    para([run(s.signed_by, { bold: true, size: 18 })], { align: AlignmentType.CENTER }),
    para([run(at ? `Digitally signed on ${at}` : "", { italics: true, size: 14 })], { align: AlignmentType.CENTER }),
  ];
}

/** Approval stage cell: the signer's own signature image (when available), name, and signing date and time. */
function stageSignatureContent(form, slot, image) {
  const s = form.signoff?.[slot] || {};
  const name = s.saved_by || s.signed_by;
  if (isBlank(name)) return [para([run("")], { align: AlignmentType.CENTER })];
  const at = formatSignedAt(s.signed_at);
  return [
    ...(image
      ? [para([new ImageRun({ type: image.type, data: image.data, transformation: { width: image.width, height: image.height } })], { align: AlignmentType.CENTER })]
      : []),
    para([run(name, { bold: true, size: 18 })], { align: AlignmentType.CENTER }),
    para([run(at ? `Digitally signed on ${at}` : "", { italics: true, size: 14 })], { align: AlignmentType.CENTER }),
  ];
}

/** Date part (yyyy-mm-dd) of a sign-off timestamp in India time. */
function signedDate(ts) {
  const d = ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

/**
 * @param {object} form  Commercial PO At Glance form state (cmOcModel shape)
 * @param {{ logo?: ArrayBuffer|Uint8Array|null, signatures?: Record<string, { data: Uint8Array, type: string, width: number, height: number }> }} [opts]
 *   Indus Fire Safety logo (JPEG) for the header, and each signed stage's signature image (by slot).
 */
export function buildCmOcDocument(form, { logo = null, signatures = {} } = {}) {
  const head = table(HEAD, [
    row([cell("Cost Center in Tally", { cols: HEAD }), cell(form.cost_center_tally, { cols: HEAD, from: 1, span: 3 })]),
    row([
      cell("OC No.", { cols: HEAD }),
      cell(form.oc_no, { cols: HEAD, from: 1, bold: true }),
      cell("Date", { cols: HEAD, from: 2 }),
      cell(formatCmDate(form.oc_date), { cols: HEAD, from: 3 }),
    ]),
    row([
      cell("Customer", { cols: HEAD }),
      cell([
        para([run(form.client_name, { bold: true })]),
        ...String(form.client_address || "").split("\n").filter(Boolean).map((l) => para([run(l)])),
      ], { cols: HEAD, from: 1 }),
      cell(`Whether SEZ: ${yesNo(form.is_sez)}`, { cols: HEAD, from: 2, span: 2 }),
    ]),
    row([
      cell("WO No.", { cols: HEAD }),
      cell(form.po_wo_no, { cols: HEAD, from: 1 }),
      cell("Date", { cols: HEAD, from: 2 }),
      cell(formatCmDate(form.po_date), { cols: HEAD, from: 3 }),
    ]),
  ]);

  const desc = table(DESC, [
    row([cell("Description of work", { cols: DESC }), cell(form.project_description, { cols: DESC, from: 1 })]),
  ]);

  const gstPct = isBlank(form.gst_pct) ? "" : `${form.gst_pct}%`;
  const gstApplicable = form.gst_applicable === true ? "Applicable" : form.gst_applicable === false ? "Not Applicable" : "";
  const terms = table(TERMS, [
    row([
      cell("Duration", { cols: TERMS }),
      cell(form.duration_text, { cols: TERMS, from: 1 }),
      cell("From", { cols: TERMS, from: 2, span: 2 }),
      cell(formatCmDate(form.duration_from), { cols: TERMS, from: 4, span: 2 }),
      cell("To", { cols: TERMS, from: 6 }),
      cell(formatCmDate(form.duration_to), { cols: TERMS, from: 7, span: 2 }),
    ]),
    row([
      cell("Date of actual mobilization", { cols: TERMS, span: 2 }),
      cell(formatCmDate(form.mobilization_date), { cols: TERMS, from: 2, span: 3 }),
      cell("Payment terms", { cols: TERMS, from: 5, span: 3 }),
      cell(form.payment_terms, { cols: TERMS, from: 8 }),
    ]),
    row([
      cell("GST", { cols: TERMS, span: 2 }),
      cell(gstPct, { cols: TERMS, from: 2 }),
      cell(gstApplicable, { cols: TERMS, from: 3, span: 6 }),
    ], 15),
  ]);

  // Only columns still present on the form: built-ins with a value, plus any custom designation rows.
  const fixedCrew = CM_MANPOWER_FIELDS
    .filter((f) => !isBlank(form[f.key]))
    .map((f) => ({ label: f.label, value: form[f.key] }));
  const extraCrew = (form.extra_deployment || [])
    .filter((r) => !isBlank(r.label) || !isBlank(r.count))
    .map((r) => ({ label: r.label || "-", value: r.count }));
  const crewItems = [...fixedCrew, ...extraCrew];
  const crewWidth = sum(CREW);
  const crewCols = crewItems.length === CREW.length
    ? CREW
    : Array.from({ length: Math.max(crewItems.length, 1) }, (_, i, arr) => {
      const base = Math.floor(crewWidth / arr.length);
      return i === arr.length - 1 ? crewWidth - base * (arr.length - 1) : base;
    });
  const crew = table(crewCols, [
    row(crewItems.map((item, i) => cell(item.label, { cols: crewCols, from: i, align: AlignmentType.CENTER })), 8.1),
    row(crewItems.map((item, i) => cell(dash(item.value), { cols: crewCols, from: i, align: AlignmentType.CENTER })), 8.1),
  ]);

  const wage = table(WAGE, [
    row([
      cell("Insurance", { cols: WAGE }),
      cell(dash(form.insurance), { cols: WAGE, from: 1 }),
      cell("Minimum wage rate", { cols: WAGE, from: 2 }),
      cell(dash(form.minimum_wage_rate), { cols: WAGE, from: 3 }),
    ]),
  ]);

  const sdOn = form.sd_ra_applicable === true;
  const scope = table(SCOPE, [
    row([cell("Scope of Relievers", { cols: SCOPE }), cell(dash(form.relievers_scope), { cols: SCOPE, from: 1, span: 4 })]),
    row([cell("Duty pattern", { cols: SCOPE }), cell(dash(form.duty_pattern), { cols: SCOPE, from: 1, span: 4 })]),
    row([cell("Accommodation & Transportation", { cols: SCOPE }), cell(dash(form.accommodation_transport), { cols: SCOPE, from: 1, span: 4 })]),
    row([
      cell("SD Deduction from RA Bill", { cols: SCOPE }),
      cell(sdOn ? "Applicable" : form.sd_ra_applicable === false ? "N/A" : "", { cols: SCOPE, from: 1 }),
      cell("%", { cols: SCOPE, from: 2 }),
      cell(sdOn ? dash(form.sd_ra_pct) : "-", { cols: SCOPE, from: 3 }),
      cell(`Release Period – ${sdOn ? form.sd_release_period || "" : ""}`, { cols: SCOPE, from: 4 }),
    ]),
    row([cell("SD - PBG", { cols: SCOPE }), cell(dash(form.sd_pbg), { cols: SCOPE, from: 1, span: 4 })]),
    row([cell("Details of EMD paid, if any", { cols: SCOPE }), cell(dash(form.emd_details), { cols: SCOPE, from: 1, span: 4 })]),
  ]);

  const contacts = form.contacts.filter((c) => !cmContactBlank(c) || !isBlank(c.department));
  const contactTable = table(CONTACT, [
    row(["Department", "Name", "Mobile No.", "E-mail address"].map((h, i) => cell(h, { cols: CONTACT, from: i, align: i ? AlignmentType.CENTER : undefined }))),
    ...(contacts.length ? contacts : [null]).map((c) => row([
      cell(c?.department ?? "", { cols: CONTACT }),
      cell(c?.names ?? "", { cols: CONTACT, from: 1 }),
      cell(c ? splitList(c.mobiles).join(", ") : "", { cols: CONTACT, from: 2 }),
      cell([para(c ? emailRuns(splitList(c.emails)) : [run("")])], { cols: CONTACT, from: 3 }),
    ])),
  ]);

  const remarks = table(REMARKS, [
    row([cell("Remarks", { cols: REMARKS }), cell(form.remarks, { cols: REMARKS, from: 1 })]),
  ]);

  // Records with a PO category use the category's approval stages; older records keep the format's boxes.
  const stages = cmCategoryStages(form.po_category);
  const approver = stages.length ? { slot: "COMMERCIAL_MANAGER", label: "Commercial Manager" } : CM_OC_APPROVER_SLOT;
  const vp = form.signoff?.[approver.slot] || {};
  const signLine = [
    para([
      run(`Date: ${formatCmDate(signedDate(vp.signed_at))}`),
      run("\t"),
      run("Signature: "),
      run(vp.signed_by || "______________", { bold: Boolean(vp.signed_by) }),
      run(` (${approver.label})`),
    ], { tabStops: [{ type: TabStopType.LEFT, position: 4320 }] }),
  ];

  const [b, ir, sal, ops, adm, pnc, acc, arun, atin] = CM_OC_DISSEMINATION_SLOTS;
  const approvalCols = stages.map(() => Math.floor(10260 / Math.max(stages.length, 1)));
  const approvals = stages.length ? table(approvalCols, [
    row([cell([para([run(`${CM_OC_APPROVAL_HEADING} — ${cmCategoryLabel(form.po_category)}`, { bold: true })])], {
      cols: approvalCols, span: stages.length,
    })], 22),
    row(stages.map((s, i) => cell(`${i + 1}. ${s.label}`, { cols: approvalCols, from: i, align: AlignmentType.CENTER, bold: true })), 19.45),
    row(stages.map((s, i) => cell(stageSignatureContent(form, s.slot, signatures[s.slot]), {
      cols: approvalCols, from: i, valign: VerticalAlign.BOTTOM,
    })), 70),
  ]) : null;
  const dissem = approvals || table(DISSEM, [
    row([cell([para([run(CM_OC_SIGNOFF_HEADING, { bold: true })])], { cols: DISSEM, span: 5 })], 28.55),
    row([b, ir, sal, ops, adm].map((s, i) => cell(s.label, { cols: DISSEM, from: i, align: AlignmentType.CENTER })), 19.45),
    row([b, ir, sal, ops, adm].map((s, i) => cell(signatureContent(form, s.slot), { cols: DISSEM, from: i, valign: VerticalAlign.BOTTOM })), 34.5),
    row([
      cell(pnc.label, { cols: DISSEM, span: 2, align: AlignmentType.CENTER }),
      ...[acc, arun, atin].map((s, i) => cell(s.label, { cols: DISSEM, from: i + 2, align: AlignmentType.CENTER })),
    ], 19.3),
    row([
      cell(signatureContent(form, pnc.slot), { cols: DISSEM, span: 2, valign: VerticalAlign.BOTTOM }),
      ...[acc, arun, atin].map((s, i) => cell(signatureContent(form, s.slot), { cols: DISSEM, from: i + 2, valign: VerticalAlign.BOTTOM })),
    ], 43),
  ]);

  const header = new Header({
    children: [
      para([run(" ".repeat(17), { bold: true }), ...(logo ? [new ImageRun({ type: "jpg", data: logo, transformation: { width: 54, height: 51 } })] : [])]),
      para([run(CM_OC_COMPANY_NAME, { bold: true })]),
      para([run(CM_OC_DOC_REF)], { align: AlignmentType.RIGHT }),
    ],
  });

  const gap = () => para([run("")]);

  return new Document({
    creator: CM_OC_COMPANY_NAME,
    title: `${CM_OC_FORM_TITLE} ${form.oc_no || ""}`.trim(),
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 284, bottom: 142, left: 1440, right: 746, header: 113, footer: 708 },
        },
      },
      headers: { default: header },
      children: [
        para([run(CM_OC_FORM_TITLE, { bold: true, underline: true })], { align: AlignmentType.CENTER, after: 120 }),
        head, gap(), desc, gap(), terms, gap(), crew, gap(), wage, gap(), scope,
        para([run("Customer’s contact details:", { bold: true })], { before: 120 }),
        contactTable, gap(), remarks, gap(),
        ...signLine,
        dissem,
      ],
    }],
  });
}

async function loadLogo() {
  try {
    const res = await fetch(CM_LOGO_SRC);
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch (e) {
    console.warn("[Commercial PO At Glance] logo not loaded; exporting without it", e);
    return null;
  }
}

/** Browser export. `signatures` comes from cmSignatureImages.loadCmSignatureImages (each signer's own upload). */
export const buildCmOcDocx = async (form, { signatures = {} } = {}) =>
  Packer.toBlob(buildCmOcDocument(form, { logo: await loadLogo(), signatures }));
export const buildCmOcDocxBuffer = (form, opts) => Packer.toBuffer(buildCmOcDocument(form, opts));
