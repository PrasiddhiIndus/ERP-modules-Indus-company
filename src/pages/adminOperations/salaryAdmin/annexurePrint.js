/**
 * Annexure-I (salary breakup) — printable HTML from a CTC record.
 * Used by the Employee Master CTC tab (current / history / revision) and letters.
 */

import { annexureMonthlyValue, annexurePaValue, annexureRowsFor, roundRupee, schemeLabel } from "./ctcEngine";
import { recordToComponents, statusLabel } from "./annexureCtcRecord";
import signatureImage from "../../../assets/annexure-signature.png?inline";

export const DEFAULT_COMPANY_NAME = "INDUS FIRE SAFETY PRIVATE LIMITED";
const SIGNATORY_TITLE = "Authorized Signatory";

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(v) {
  return roundRupee(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function fmtDate(d) {
  const s = String(d || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  const [y, m, day] = s.split("-");
  return `${day}-${m}-${y}`;
}

/** Text shared by the printed Annexure-I and the emailed PDF. */
export function annexureParts({ employee, record, ruleVersion, segment }) {
  return {
    companyName: DEFAULT_COMPANY_NAME,
    title: ruleVersion?.annexure_title || "COMPENSATION SCHEME – YEAR 2026-27",
    note: ruleVersion?.annexure_note || "",
    sigCompany: ruleVersion?.signatory_company || "For Indus Fire Safety Private Limited",
    sigTitle: SIGNATORY_TITLE,
    signatureImage,
    info: [
      ["Location", employee?.location],
      ["Employee Code", employee?.employee_code || employee?.employee_id],
      ["Employee Name", employee?.full_name],
      ["Department", employee?.department],
      ["Designation", employee?.designation],
      ["Segment", segment],
      ["DOB", fmtDate(employee?.date_of_birth)],
      ["DOJ", fmtDate(employee?.date_of_joining)],
      ["W.E.F.", fmtDate(record?.wef_date)],
    ].map(([k, v]) => [k, v || "—"]),
  };
}

/**
 * @param {object} p
 * @param {object} p.employee   employee master row
 * @param {object} p.record     CTC record (current row or archived snapshot)
 * @param {object} [p.previous] previous record — adds Previous / New / Difference columns
 * @param {object} [p.ruleVersion] rule version (title, note, signatory)
 * @param {string} [p.segment]  segment label
 * @param {boolean} [p.internal] internal copy: shows Custom marker and system values
 */
export function buildAnnexureHtml({ employee, record, previous, ruleVersion, segment, internal = false }) {
  const cur = recordToComponents(record);
  const prev = previous ? recordToComponents(previous) : null;
  const parts = annexureParts({ employee, record, ruleVersion, segment });
  const { title, note, sigCompany, sigTitle } = parts;
  const overrides = internal && record?.is_custom ? record.custom_overrides_json || {} : {};
  const systemValues = internal && record?.is_custom ? record.system_values_json || {} : {};

  const head = prev
    ? `<tr><th rowspan="2" class="l">Particulars</th><th colspan="2">Previous</th><th colspan="2">New</th><th colspan="2">Difference</th></tr>
       <tr><th>Monthly</th><th>P.A.</th><th>Monthly</th><th>P.A.</th><th>Monthly</th><th>P.A.</th></tr>`
    : `<tr><th class="l">Particulars</th><th>Monthly</th><th>P.A.</th></tr>`;

  const body = annexureRowsFor(prev, cur).map((row) => {
    if (row.heading) {
      return `<tr class="heading"><td colspan="${prev ? 7 : 3}" class="l">${esc(row.label)}</td></tr>`;
    }
    const v = Number(cur[row.key]) || 0;
    const vPa = annexurePaValue(cur, row.key);
    const monthlyCell = (vals, x) =>
      vals?.[row.key] != null && annexureMonthlyValue(vals, row.key) == null ? "" : money(x);
    const paCell = (x) => (x == null ? "" : money(x));
    const mark =
      overrides[row.key] != null
        ? ` <span class="custom">(Custom; system ₹${money(systemValues[row.key])})</span>`
        : "";
    const cls = row.total ? ' class="total"' : "";
    if (prev) {
      const p = Number(prev[row.key]) || 0;
      const pPa = annexurePaValue(prev, row.key);
      return `<tr${cls}><td class="l">${esc(row.label)}${mark}</td><td>${monthlyCell(prev, p)}</td><td>${paCell(pPa)}</td><td>${monthlyCell(cur, v)}</td><td>${paCell(vPa)}</td><td>${money(v - p)}</td><td>${money((vPa ?? 0) - (pPa ?? 0))}</td></tr>`;
    }
    return `<tr${cls}><td class="l">${esc(row.label)}${mark}</td><td>${monthlyCell(cur, v)}</td><td>${paCell(vPa)}</td></tr>`;
  }).join("");

  const info = parts.info.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("");

  const internalLine = internal
    ? `<p class="meta">Internal copy · ${esc(schemeLabel(record?.salary_scheme))} · ${esc(statusLabel(record?.employee_status))}${
        record?.salary_band ? ` · Band ${esc(record.salary_band)}` : ""
      }${record?.is_custom ? ` · <span class="custom">Custom</span>${record?.revision_reason ? ` (${esc(record.revision_reason)})` : ""}` : ""}</p>`
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>Annexure-I</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11px; }
  h1 { font-size: 15px; text-align: center; margin: 0; }
  h2 { font-size: 12px; text-align: center; margin: 4px 0 2px; }
  h3 { font-size: 11px; text-align: center; margin: 0 0 10px; text-decoration: underline; }
  table { border-collapse: collapse; width: 100%; }
  .info td { border: 1px solid #999; padding: 3px 6px; }
  .info td.k { width: 30%; font-weight: bold; background: #f3f4f6; }
  .brk { margin-top: 10px; }
  .brk th, .brk td { border: 1px solid #999; padding: 3px 6px; text-align: right; }
  .brk th { background: #e5e7eb; }
  .brk .l { text-align: left; }
  .brk tr.total td { font-weight: bold; background: #f3f4f6; }
  .brk tr.heading td { font-weight: bold; background: #e5e7eb; }
  .note { margin-top: 10px; font-size: 10px; font-style: italic; }
  .sig { margin-top: 36px; text-align: right; font-weight: bold; }
  .sig .sign { display: block; height: 70px; margin: 6px 0 4px auto; }
  .meta { font-size: 10px; color: #444; margin: 4px 0 0; }
  .custom { color: #b45309; font-weight: bold; font-size: 9px; }
</style></head><body>
  <h1>${esc(DEFAULT_COMPANY_NAME)}</h1>
  <h2>${esc(title)}</h2>
  <h3>Annexure-I</h3>
  <table class="info">${info}</table>
  ${internalLine}
  <table class="brk"><thead>${head}</thead><tbody>${body}</tbody></table>
  ${note ? `<p class="note">${esc(note)}</p>` : ""}
  <div class="sig"><div>${esc(sigCompany)}</div><img class="sign" src="${signatureImage}" alt="" /><div>${esc(sigTitle)}</div></div>
</body></html>`;
}

/** Print through a hidden iframe (same approach as official letters). */
export function printAnnexure(params) {
  const html = buildAnnexureHtml(params);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  const done = () => window.setTimeout(() => iframe.remove(), 1000);
  iframe.contentWindow.focus();
  window.setTimeout(() => {
    iframe.contentWindow.print();
    done();
  }, 250);
}
