/**
 * npm run test:mis — runs the Payroll MIS mock-data tests (Vitest, in memory, no database) and writes
 * docs/test-reports/Payroll_MIS_Test_Report_<YYYY-MM-DD>.docx from the Vitest JSON results and the
 * expected-vs-actual records the tests save. Exits with the Vitest exit code.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, Packer, PageNumber, PageOrientation,
  Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableOfContents, TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx';
import {
  COMPANY, DRILL_CODES, EXTRA_STATUS_PAYMENTS, FY_MONTHS, LOCKED_MONTHS, MOCK, RATE_SOURCES, STATE_NAME,
  VERTICAL_MAP, deviations,
} from '../../tests/fixtures/payrollMisMock.js';

const ROOT = process.cwd();
const pkgVersion = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', name, 'package.json'), 'utf8')).version;
const OUT_DIR = path.join(ROOT, 'node_modules/.cache/payroll-mis-test');
const JSON_PATH = path.join(OUT_DIR, 'vitest.json');
const TEST_FILES = ['tests/payrollMis.test.js', 'tests/payrollMisOps.test.js'];
const COMMAND = 'npm run test:mis';

// ---------------------------------------------------------------------------
// 1. Run the tests
// ---------------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const f of fs.readdirSync(OUT_DIR)) if (f.endsWith('.json')) fs.rmSync(path.join(OUT_DIR, f));
const run = spawnSync(`npx vitest run ${TEST_FILES.join(' ')} --reporter=default --reporter=json --outputFile.json="${JSON_PATH}"`, {
  stdio: 'inherit', shell: true, cwd: ROOT,
});
const exitCode = run.status ?? 1;

const vitest = fs.existsSync(JSON_PATH) ? JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')) : null;
const records = ['reports', 'ops'].flatMap((n) => {
  const p = path.join(OUT_DIR, `records-${n}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
});

const assertions = (vitest?.testResults || []).flatMap((f) => (f.assertionResults || []).map((a) => ({ ...a, file: path.relative(ROOT, f.name).replace(/\\/g, '/') })));
const stats = {
  total: vitest?.numTotalTests ?? 0,
  passed: vitest?.numPassedTests ?? 0,
  failed: vitest?.numFailedTests ?? 0,
  skipped: (vitest?.numPendingTests ?? 0) + (vitest?.numTodoTests ?? 0),
  checks: records.length,
  checksFailed: records.filter((r) => !r.pass).length,
};
const verdict = vitest && stats.failed === 0 && stats.checksFailed === 0 && exitCode === 0 ? 'PASS' : 'FAIL';
const PASS = verdict === 'PASS';

// ---------------------------------------------------------------------------
// 2. Formatting helpers
// ---------------------------------------------------------------------------
const NAVY = '1F3A5F';
const TEAL = '2E6F8E';
const SLATE = '475467';
const MUTED = '667085';
const LIGHT = 'EEF2F6';
const ZEBRA = 'F8FAFC';
const LINE = 'D0D5DD';
const GREEN_BG = 'DCFCE7';
const GREEN_TX = '166534';
const RED_BG = 'FEE2E2';
const RED_TX = '991B1B';
const AMBER_BG = 'FEF3C7';
const AMBER_TX = '92400E';
const FONT = 'Calibri';

// A4 content widths in twentieths of a point (page minus margins).
const PORTRAIT_W = 11906 - 2 * 1000;
const LANDSCAPE_W = 16838 - 2 * 900;
let pageW = PORTRAIT_W;

function inr(n) {
  const neg = n < 0;
  const [i, d] = Math.abs(n).toFixed(2).split('.');
  const last3 = i.slice(-3);
  const rest = i.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `${neg ? '−' : ''}${grouped}${d === '00' ? '' : `.${d}`}`;
}
function fmt(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return inr(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ') : '(none)';
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${x}`).join(', ');
  return String(v);
}

const txt = (text, o = {}) => new TextRun({ text: String(text), font: FONT, size: o.size ?? 20, bold: o.bold, color: o.color, italics: o.italics, allCaps: o.caps, characterSpacing: o.spacing });
const para = (text, o = {}) => new Paragraph({ spacing: { before: o.before ?? 0, after: o.after ?? 120, line: 276 }, alignment: o.align, keepNext: o.keepNext, children: [txt(text, o)] });
const bullet = (text, o = {}) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 60, line: 264 }, children: o.lead ? [txt(`${o.lead} `, { bold: true }), txt(text)] : [txt(text)] });
const spacer = (after = 160) => new Paragraph({ spacing: { after }, children: [] });

let h1No = 0;
let h2No = 0;
function h1(text, { breakBefore = true } = {}) {
  h1No += 1;
  h2No = 0;
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, pageBreakBefore: breakBefore, keepNext: true,
    spacing: { after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: TEAL, space: 4 } },
    children: [txt(`${h1No}.  `, { size: 32, bold: true, color: TEAL }), txt(text, { size: 32, bold: true, color: NAVY })],
  });
}
function h2(text) {
  h2No += 1;
  return new Paragraph({
    heading: HeadingLevel.HEADING_2, keepNext: true, spacing: { before: 280, after: 120 },
    children: [txt(`${h1No}.${h2No}  `, { size: 23, bold: true, color: TEAL }), txt(text, { size: 23, bold: true, color: NAVY })],
  });
}

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideHorizontal: BORDER, insideVertical: BORDER };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };
const R = AlignmentType.RIGHT;
const C = AlignmentType.CENTER;

function cell(content, o = {}) {
  const children = Array.isArray(content) ? content : [new Paragraph({
    alignment: o.align,
    children: [txt(content, { size: o.size ?? 18, bold: o.bold, color: o.color, italics: o.italics })],
  })];
  return new TableCell({
    width: o.width ? { size: o.width, type: WidthType.DXA } : undefined,
    shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
    margins: o.margins ?? { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: o.valign ?? VerticalAlign.CENTER,
    columnSpan: o.span,
    borders: o.borders,
    children,
  });
}

/** Fixed-layout table; `widths` are fractions of the current page width. */
function table(headers, rows, { widths, aligns = [], headerFill = NAVY } = {}) {
  const n = headers.length;
  const fr = widths ?? Array(n).fill(1 / n);
  const cols = fr.map((f) => Math.floor(f * pageW));
  const isNum = (v) => typeof v === 'string' && /^[−-]?[\d,]+(\.\d+)?%?$/.test(v);
  return new Table({
    width: { size: cols.reduce((s, x) => s + x, 0), type: WidthType.DXA },
    columnWidths: cols,
    layout: TableLayoutType.FIXED,
    borders: ALL_BORDERS,
    rows: [
      new TableRow({
        tableHeader: true, cantSplit: true,
        children: headers.map((h, i) => cell(h, { width: cols[i], fill: headerFill, bold: true, color: 'FFFFFF', align: aligns[i] })),
      }),
      ...rows.map((r, ri) => new TableRow({
        cantSplit: true,
        children: r.map((c, i) => (c instanceof TableCell ? c : cell(c, {
          width: cols[i], fill: ri % 2 ? ZEBRA : undefined, align: aligns[i] ?? (isNum(c) ? R : undefined),
        }))),
      })),
    ],
  });
}

const resultCell = (kind) => {
  const map = {
    pass: ['✔  Pass', GREEN_BG, GREEN_TX],
    adjusted: ['✔  Pass *', AMBER_BG, AMBER_TX],
    fail: ['✘  Fail', RED_BG, RED_TX],
  };
  const [label, fill, color] = map[kind];
  return cell(label, { fill, color, bold: true, align: C });
};
const statusChip = (label, tone) => {
  const tones = { green: [GREEN_BG, GREEN_TX], red: [RED_BG, RED_TX], amber: [AMBER_BG, AMBER_TX], grey: [LIGHT, SLATE] };
  const [fill, color] = tones[tone];
  return cell(label, { fill, color, bold: true, align: C });
};

const isAdjusted = (r) => r.pass && r.note?.startsWith('Adjusted') && r.expected !== r.actual;
const kindOf = (r) => (!r.pass ? 'fail' : isAdjusted(r) ? 'adjusted' : 'pass');
function recordTable(list, labels = ['Figure / check', 'Expected', 'Actual', 'Result']) {
  return table(labels,
    list.map((r) => [r.label, isAdjusted(r) ? `${fmt(r.expected)} (spec)` : fmt(r.expected), fmt(r.actual), resultCell(kindOf(r))]),
    { widths: [0.44, 0.21, 0.21, 0.14], aligns: [undefined, R, R, C] });
}

/**
 * Lays "Row — Column" checks out as the report's own grid (e.g. vertical × metric, cost element × month),
 * each cell showing the actual value coloured by its result. Returns null when the labels do not form a grid.
 */
function reportGrid(list) {
  const parsed = list.map((r) => ({ r, m: r.label.match(/^(.+?) — ([^—]+)$/) })).filter((x) => x.m);
  const rows = [...new Set(parsed.map((x) => x.m[1]))];
  const cols = [...new Set(parsed.map((x) => x.m[2]))];
  if (parsed.length < 6 || rows.length < 2 || cols.length < 2 || cols.length > 8) return null;
  const at = new Map(parsed.map((x) => [`${x.m[1]}|${x.m[2]}`, x.r]));
  const first = 0.28;
  const rest = (1 - first) / cols.length;
  const tones = { pass: [GREEN_BG, GREEN_TX], adjusted: [AMBER_BG, AMBER_TX], fail: [RED_BG, RED_TX] };
  return table([' ', ...cols], rows.map((row) => [row, ...cols.map((c) => {
    const r = at.get(`${row}|${c}`);
    if (!r) return '—';
    const [fill, color] = tones[kindOf(r)];
    return cell(`${fmt(r.actual)}${r.pass ? '' : `  (exp. ${fmt(r.expected)})`}`, { fill, color, align: R, bold: kindOf(r) !== 'pass' });
  })]), { widths: [first, ...cols.map(() => rest)], aligns: [undefined, ...cols.map(() => R)] });
}

/** Coloured banner: "27 of 27 figures pass". */
function resultBanner(list) {
  const ok = list.filter((r) => r.pass).length;
  const all = ok === list.length;
  return new Table({
    width: { size: pageW, type: WidthType.DXA }, columnWidths: [pageW], layout: TableLayoutType.FIXED, borders: NO_BORDERS,
    rows: [new TableRow({
      children: [cell([new Paragraph({
        children: [
          txt(all ? '✔  ' : '✘  ', { bold: true, color: all ? GREEN_TX : RED_TX, size: 20 }),
          txt(`${ok} of ${list.length} checks pass`, { bold: true, color: all ? GREEN_TX : RED_TX, size: 20 }),
          ...(list.some(isAdjusted) ? [txt('   ·   * asserted against the adjusted value explained below', { color: AMBER_TX, size: 18 })] : []),
        ],
      })], { width: pageW, fill: all ? GREEN_BG : RED_BG, margins: { top: 90, bottom: 90, left: 160, right: 160 } })],
    })],
  });
}

const bySection = (name) => records.filter((r) => r.section === name);
const sectionsLike = (prefix) => [...new Set(records.map((r) => r.section))].filter((s) => s.startsWith(prefix));
const recordsLike = (prefix) => sectionsLike(prefix).flatMap(bySection);

// ---------------------------------------------------------------------------
// 3. Content
// ---------------------------------------------------------------------------
const DEV = deviations(MOCK);
const verticalName = { [VERTICAL_MAP.A]: 'Manpower', [VERTICAL_MAP.B]: 'AMC', [VERTICAL_MAP.C]: 'Projects', [VERTICAL_MAP.Corporate]: 'Corporate (shared)' };
const paidIn = (m, pred = () => true) => MOCK.rowsByMonth[m].filter((r) => r.paid_days > 0 && pred(r)).length;
const sumIn = (m, k) => MOCK.rowsByMonth[m].reduce((s, r) => s + r[k], 0);
const DEPTS_A = ['Operations / Field', 'Sales & Business Dev.', 'Service & Maintenance', 'Admin & Accounts'];

const REPORT_INFO = [
  {
    key: 'Report 1', title: 'Report 1 — Monthly Payroll Summary',
    purpose: 'Headcount, gross, deductions, net, employer cost, Total CTC and overtime for the month against the previous locked month, with Change % and colour flags.',
    data: [
      ['Current / previous month', 'Sep 2026 / Aug 2026 (both locked)'],
      ['Snapshot rows Sep / Aug', `${MOCK.rowsByMonth['2026-09'].length} / ${MOCK.rowsByMonth['2026-08'].length}`],
      ['Paid employees Sep / Aug', `${paidIn('2026-09')} / ${paidIn('2026-08')}`],
      ['Overtime', 'Stored in the snapshot overtime field — mock values only; real payroll overtime is 0 today'],
    ],
  },
  {
    key: 'Report 2', title: 'Report 2 — Month-on-Month Variance',
    purpose: 'Explains the CTC change from Aug to Sep employee by employee: joiners, exits, increments, overtime, incentives and arrears, loss of pay, other and employer cost.',
    data: [
      ['New joiners (Sep)', `${MOCK.newHires.length} (joined 10 Sep 2026, 21 of 30 days paid)`],
      ['Exits', '4 (last paid in Aug, exit date 01 Sep 2026)'],
      ['Increments effective Sep 2026', `${MOCK.increments.length} (${MOCK.increments.map((i) => `${i.employee_code} +${inr(i.increase)}`).join(', ')})`],
      ['Overtime drill-down codes', `${DRILL_CODES.OT_1}, ${DRILL_CODES.OT_2}, ${DRILL_CODES.OT_B}`],
      ['Incentives / arrears', 'Stored in the snapshot incentive and arrears fields — mock values only'],
    ],
  },
  {
    key: 'Report 3', title: 'Report 3 — CTC Cost Summary',
    purpose: 'Every cost element for the month, the previous month and YTD (Apr–Sep 2026), with each element’s share of Total CTC.',
    data: [
      ['YTD months', FY_MONTHS.join(', ')],
      ['Leave encashment provision', 'Set to 0 in every month so the spec totals tie exactly'],
      ['Insurance', 'Apr–Aug: CTC mediclaim fallback (no premium entered). Sep: group policy ₹7,20,000 / year ÷ 12 = ₹60,000'],
      ['Gujarat LWF', `June only: ₹6 employee / ₹12 employer × ${paidIn('2026-06')} employees`],
    ],
  },
  {
    key: 'Report 4', title: 'Report 4 — Vertical-wise Payroll Cost',
    purpose: 'Headcount, gross, employer cost and Total CTC per vertical, share of total, previous month and YTD.',
    data: Object.entries(VERTICAL_MAP).map(([k, v]) => [k === 'Corporate' ? 'Corporate' : `Vertical ${k}`, `${verticalName[v]} — ${paidIn('2026-09', (r) => r.vertical_code === v)} paid in Sep`]),
  },
  {
    key: 'Report 5', title: 'Report 5 — Department-wise Payroll Cost',
    purpose: 'Department rows inside each vertical with headcount, CTC, average CTC, overtime, hires, exits and change.',
    data: DEPTS_A.map((d) => [`Vertical A — ${d}`, `${paidIn('2026-09', (r) => r.department === d)} paid in Sep`]),
  },
  {
    key: 'Report 6', title: 'Report 6 — Statutory Contribution Summary',
    purpose: 'PF, ESI, Gujarat PT, Gujarat LWF and TDS: employees covered, wage base, employee and employer share, total to deposit; PF breakup and employee-wise tab.',
    data: [
      ['PF wages', 'Each PF wage is the smallest wage whose 12% equals the employee contribution'],
      ['ESI', '98 employees; ESI wage ≈ employer ESI ÷ 3.25%; totals 16,00,000 / 12,000 / 52,000'],
      ['Gujarat PT', `₹200 for gross above ₹12,000; ${MOCK.lowGrossIds.size} employees kept at ₹11,500 so 220 pay PT`],
      ['TDS', '64 highest-paid employees × ₹5,000'],
      ['UAN / ESIC numbers', 'Fake: 9999xxxxxxxx / 9999xxxxxx'],
    ],
  },
  {
    key: 'Report 7', title: 'Report 7 — Compliance Due-Date and Payment Tracker',
    purpose: 'One row per wage month and statute with due date (compliance calendar), amount from the lock, paid details and status; tiles for pending, overdue, paid late and interest.',
    data: [
      ['Tracker rows (locked Oct 2025 – Sep 2026)', String(MOCK.payments.length)],
      ['Viewed on', '10 Oct 2026 (system date mocked)'],
      ['Extra status rows (toggle)', `${EXTRA_STATUS_PAYMENTS.length} synthetic rows: due 12 Oct (Due soon) and 05 Oct (Overdue)`],
      ['State', STATE_NAME],
    ],
  },
  {
    key: 'New-hire', title: 'New-hire Summary (fixture for later Report 8)',
    purpose: 'Fixture check only (no report screen yet): hires split New / Replacement, monthly CTC added, amount paid in Sep, average CTC and hires without budget.',
    data: [
      ['Hires', `${MOCK.newHires.length} (position type from employee tags)`],
      ['Monthly CTC per hire', '₹28,500'],
      ['Budget', 'Budget headcount per vertical per month = actual headcount'],
    ],
  },
];

const RULE_GROUPS = [
  { title: 'Common rules', prefix: 'Common rules' },
  { title: 'Lock / unlock / re-lock', prefix: 'Lock / unlock / re-lock' },
  { title: 'Filters', prefix: 'Filters' },
  { title: 'Colours, Unassigned row and shared-staff allocation', prefix: 'Colours / Unassigned / allocation' },
  { title: 'Report 7 statuses, mark paid, challan upload and alerts', prefix: 'Report 7 statuses / alerts' },
  { title: 'Drill-downs', prefix: 'Drill-downs' },
  { title: 'Access and logging', prefix: 'Access / logging' },
  { title: 'Exports', prefix: 'Exports' },
  { title: 'No side effects', prefix: 'No side effects' },
];

const OBSERVATIONS = [
  { area: 'Report 3 — Gujarat LWF YTD', detail: DEV['R3 Employer LWF YTD'].why, severity: 'Info', expected: inr(6200), actual: inr(DEV['R3 Employer LWF YTD'].used) },
  { area: 'Report 3 — Gross YTD', detail: DEV['R3 Gross YTD'].why, severity: 'Info', expected: inr(35820000), actual: inr(DEV['R3 Gross YTD'].used) },
  { area: 'Report 6 — PF wage base', detail: DEV['R6 PF wage base'].why, severity: 'Info', expected: inr(3415000), actual: inr(DEV['R6 PF wage base'].used) },
  { area: 'Compliance calendar — March TDS', detail: 'The calendar has one day / month-offset rule per statute, so March TDS (statutory due date 30 April) gets 07 April. A March-specific override is not possible without a calendar change.', severity: 'Low', expected: '30 Apr', actual: '07 Apr' },
  { area: 'Compliance calendar — Gujarat PT', detail: 'Published Gujarat PT due dates differ (monthly by the 15th vs quarterly for 20+ employees). Monthly is configured; a quarterly rule cannot be expressed by the calendar today.', severity: 'Low', expected: 'Confirm with PT office', actual: '15th of next month' },
  { area: 'Mock data — ESI eligibility', detail: 'The spec’s department averages (₹22k–36k gross) leave fewer than 98 employees under the ₹21,000 ESI ceiling, so ESI cover is assigned to the lowest-paid staff per department without enforcing the ceiling on gross. Reports sum stored ESI figures, so results are unaffected.', severity: 'Info', expected: '—', actual: '—' },
];

const GAPS = [
  ['Snapshot builder (SQL)', 'Field mapping from payroll lines, proration, employer cost formulas, premium ÷ 12 / months remaining across mediclaim employees, CTC-mediclaim fallback', 'npm run payroll:check:mis (PGlite, in-memory Postgres) before release'],
  ['After-lock trigger and payment upsert (SQL)', 'Simulated in memory with the same rules; the real trigger is not executed here', 'npm run payroll:check:mis'],
  ['Due-date function (SQL)', 'Fixture due dates come from a JavaScript mirror of the calendar rule', 'npm run payroll:check:mis'],
  ['Vertical scoping and row-level security (SQL)', 'The mocked data service filters by the access table; real row-level security is not exercised', 'PGlite check, or a staging smoke test with a vertical-head login'],
  ['Mark-paid validation (SQL)', 'The mocked service applies the same rule; the app layer and its message are tested', 'npm run payroll:check:mis'],
  ['Screens (React)', 'Report assembly is reproduced from the MIS page logic; rendering, buttons and charts are not exercised', 'Manual UAT or a browser test'],
  ['PDF visual layout', 'PDFs are built and checked to be valid files; layout is not compared', 'Manual review of the sample PDFs in the scratch exports folder'],
  ['Email delivery and storage upload', 'Mail sender and storage are mocked; nothing is sent or uploaded', 'Staging test with a test mailbox and bucket'],
];

// ---------------------------------------------------------------------------
// 4. Document parts
// ---------------------------------------------------------------------------
const now = new Date();
const reportDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const longDate = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

const header = new Header({
  children: [new Paragraph({
    tabStops: [{ type: 'right', position: PORTRAIT_W }],
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 4 } },
    children: [txt('Payroll MIS Reports — Test Report', { size: 16, color: NAVY, bold: true }), txt(`\t${COMPANY} · ${STATE_NAME} · Mock data`, { size: 16, color: MUTED })],
  })],
});
const landscapeHeader = new Header({
  children: [new Paragraph({
    tabStops: [{ type: 'right', position: LANDSCAPE_W }],
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 4 } },
    children: [txt('Payroll MIS Reports — Test Report', { size: 16, color: NAVY, bold: true }), txt(`\t${COMPANY} · ${STATE_NAME} · Mock data`, { size: 16, color: MUTED })],
  })],
});
const footer = new Footer({
  children: [new Paragraph({
    alignment: C,
    children: [new TextRun({ font: FONT, size: 16, color: MUTED, children: [`Generated ${longDate} by ${COMMAND}   ·   Page `, PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES] })],
  })],
});
const portrait = { page: { margin: { top: 1100, bottom: 1000, left: 1000, right: 1000, header: 500, footer: 450 } } };
const landscape = { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 1000, bottom: 900, left: 900, right: 900, header: 450, footer: 400 } } };

function coverPage() {
  pageW = PORTRAIT_W;
  const band = new Table({
    width: { size: pageW, type: WidthType.DXA }, columnWidths: [pageW], layout: TableLayoutType.FIXED, borders: NO_BORDERS,
    rows: [new TableRow({
      height: { value: 3600, rule: 'atLeast' },
      children: [cell([
        para('PAYROLL MIS', { size: 22, bold: true, color: 'B6D4E3', spacing: 60, after: 200 }),
        para('Payroll MIS Reports', { size: 60, bold: true, color: 'FFFFFF', after: 0 }),
        para('Test Report', { size: 60, bold: true, color: 'FFFFFF', after: 240 }),
        para('Reports 1–7 and the new-hire summary, tested end to end on in-memory mock data', { size: 24, color: 'DCE8F0', after: 0 }),
      ], { width: pageW, fill: NAVY, valign: VerticalAlign.CENTER, margins: { top: 500, bottom: 500, left: 600, right: 600 } })],
    })],
  });
  const verdictBox = new Table({
    width: { size: pageW, type: WidthType.DXA }, columnWidths: [Math.floor(pageW * 0.32), pageW - Math.floor(pageW * 0.32)], layout: TableLayoutType.FIXED, borders: NO_BORDERS,
    rows: [new TableRow({
      children: [
        cell([para(PASS ? '✔  PASS' : '✘  FAIL', { size: 40, bold: true, color: 'FFFFFF', align: C, after: 0 })],
          { width: Math.floor(pageW * 0.32), fill: PASS ? '15803D' : 'B91C1C', margins: { top: 260, bottom: 260, left: 200, right: 200 } }),
        cell([
          para(`${stats.passed} of ${stats.total} tests passed`, { size: 26, bold: true, color: PASS ? GREEN_TX : RED_TX, after: 40 }),
          para(`${stats.checks - stats.checksFailed} of ${stats.checks} expected-vs-actual figures matched · ${stats.failed} failed · ${stats.skipped} skipped`, { size: 19, color: SLATE, after: 0 }),
        ], { width: pageW - Math.floor(pageW * 0.32), fill: PASS ? GREEN_BG : RED_BG, margins: { top: 200, bottom: 200, left: 300, right: 200 } }),
      ],
    })],
  });
  const details = [
    ['Company', COMPANY],
    ['Test date', longDate],
    ['State', `${STATE_NAME} (all mock employees and statutory rules)`],
    ['Environment', 'In-memory mock data (no database used)'],
    ['Data viewed as on', '10 October 2026 (system date mocked)'],
    ['Prepared by', 'AI coding agent (Cursor) — generated automatically'],
  ];
  const lw = Math.floor(pageW * 0.28);
  const detailTable = new Table({
    width: { size: pageW, type: WidthType.DXA }, columnWidths: [lw, pageW - lw], layout: TableLayoutType.FIXED,
    borders: { ...NO_BORDERS, insideHorizontal: BORDER, bottom: BORDER, top: BORDER },
    rows: details.map(([k, v]) => new TableRow({
      children: [
        cell(k, { width: lw, bold: true, color: MUTED, size: 20, margins: { top: 110, bottom: 110, left: 100, right: 100 } }),
        cell(v, { width: pageW - lw, size: 20, color: '101828', margins: { top: 110, bottom: 110, left: 100, right: 100 } }),
      ],
    })),
  });
  return [
    band, spacer(500), verdictBox, spacer(600), detailTable, spacer(900),
    para('Contains placeholder data only (MOCK-E employee codes, fake UAN / ESIC numbers, @example.test addresses). No real employee data and no database were used.', { size: 17, italics: true, color: MUTED, align: C }),
  ];
}

function kpiTiles() {
  const tiles = [
    [String(stats.total), 'Tests run', LIGHT, NAVY],
    [String(stats.passed), 'Passed', GREEN_BG, GREEN_TX],
    [String(stats.failed), 'Failed', stats.failed ? RED_BG : LIGHT, stats.failed ? RED_TX : SLATE],
    [String(stats.skipped), 'Skipped', LIGHT, SLATE],
    [`${stats.checks - stats.checksFailed}/${stats.checks}`, 'Figures matched', PASS ? GREEN_BG : RED_BG, PASS ? GREEN_TX : RED_TX],
  ];
  const gap = 120;
  const w = Math.floor((pageW - gap * (tiles.length - 1)) / tiles.length);
  const cols = tiles.flatMap((_, i) => (i ? [gap, w] : [w]));
  return new Table({
    width: { size: cols.reduce((s, x) => s + x, 0), type: WidthType.DXA }, columnWidths: cols, layout: TableLayoutType.FIXED, borders: NO_BORDERS,
    rows: [new TableRow({
      children: tiles.flatMap(([v, label, fill, color], i) => [
        ...(i ? [cell('', { width: gap })] : []),
        cell([para(v, { size: 36, bold: true, color, align: C, after: 0 }), para(label, { size: 17, color: SLATE, align: C, after: 0 })],
          { width: w, fill, margins: { top: 160, bottom: 160, left: 80, right: 80 } }),
      ]),
    })],
  });
}

function areaRow(name, list) {
  const ok = list.filter((r) => r.pass).length;
  const adj = list.filter(isAdjusted).length;
  const tone = ok !== list.length ? 'red' : adj ? 'amber' : 'green';
  const label = ok !== list.length ? '✘  Fail' : adj ? '✔  Pass *' : '✔  Pass';
  return [name, String(list.length), String(ok), String(list.length - ok), statusChip(label, tone)];
}

function executiveSummary() {
  pageW = PORTRAIT_W;
  const summaryText = PASS
    ? `All ${stats.total} automated tests passed on in-memory Gujarat mock data. Every sample figure of Reports 1–7 and the new-hire summary was reproduced, and every cross-report tie-out holds: Total CTC agrees across Reports 1, 3, 4 and 5 (₹70,17,000 for Sep 2026), the Report 2 drivers add up exactly to the change, and Report 6 deposits equal the Report 7 tracker amounts. No database, network, storage or email was touched.`
    : `${stats.failed} test(s) and ${stats.checksFailed} recorded figure(s) failed — see “Defects / open issues”. ${stats.passed} of ${stats.total} tests passed.`;
  const areas = [
    ...REPORT_INFO.map((i) => [i.title.replace(/ \(.*\)$/, ''), i.key === 'New-hire' ? recordsLike('New-hire') : recordsLike(i.key)]),
    ['Cross-report tie-outs', bySection('Cross-report tie-outs')],
    ...RULE_GROUPS.map((g) => [g.title, recordsLike(g.prefix)]),
  ].filter(([, l]) => l.length);
  return [
    h1('Executive summary', { breakBefore: false }),
    kpiTiles(),
    spacer(200),
    para(summaryText),
    h2('Results by area'),
    table(['Area', 'Checks', 'Passed', 'Failed', 'Result'], areas.map(([n, l]) => areaRow(n, l)), { widths: [0.5, 0.11, 0.11, 0.11, 0.17], aligns: [undefined, R, R, R, C] }),
    para('* Passes against an adjusted value because the spec figure cannot be produced under real Gujarat / PF rules — see the report section and “Defects / open issues”.', { size: 17, italics: true, color: MUTED, before: 80 }),
    h2('Key findings'),
    bullet(`Spec LWF YTD ₹6,200 is not a multiple of ₹12; the mock uses ₹${inr(DEV['R3 Employer LWF YTD'].used)} and carries the difference in June gross, so Total CTC stays exact.`, { lead: 'Gujarat LWF:' }),
    bullet(`12% of ₹34,15,000 is ₹4,09,800, so the PF wage base comes out at ₹${inr(DEV['R6 PF wage base'].used)} to give exactly ₹4,10,000.`, { lead: 'PF rounding:' }),
    bullet('March TDS shows due 07 April instead of 30 April, and a quarterly Gujarat PT rule cannot be set up.', { lead: 'Compliance calendar:' }),
    bullet('SQL-side logic (snapshot build, trigger, row-level security) is covered by npm run payroll:check:mis, not by this run.', { lead: 'Not covered here:' }),
  ];
}

function contents() {
  return [
    h1('Contents'),
    new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-1' }),
    para('Page numbers fill in when the document is opened in Word (accept the prompt to update fields).', { size: 17, italics: true, color: MUTED, before: 120 }),
  ];
}

function approach() {
  pageW = PORTRAIT_W;
  return [
    h1('Test approach'),
    h2('What was tested'),
    para('The same JavaScript modules the Payroll MIS screens use: report builders (aggregation, drivers, Change %, rounding, colour and status rules, filters, shared-staff allocation), download layouts and export builders (Excel, PDF, CSV), the data-access layer and the daily compliance alert job.'),
    h2('What was mocked, and why no data was touched'),
    bullet('Replaced with an in-memory stand-in that answers the same tables and services from the fixture; every call is logged and none leaves the process.', { lead: 'Database client:' }),
    bullet('fetch, XMLHttpRequest and WebSocket are replaced so any real call fails the run; creating a real database client is blocked.', { lead: 'Network guard:' }),
    bullet('Challan upload and signed links go to an in-memory list.', { lead: 'Storage:' }),
    bullet('The mail sender is mocked; recipients are placeholder @example.test addresses.', { lead: 'Email:' }),
    bullet('The system date is fixed at 10 Oct 2026, 11:00 IST.', { lead: 'Date:' }),
    bullet('Lock, unlock and re-lock are simulated in memory, including the snapshot replacement and the one-row-per-statute tracker.', { lead: 'Lock lifecycle:' }),
    para('No migration, seed script or SQL was written or run, and no row was written to any database.', { bold: true, color: NAVY, before: 80 }),
    h2('Sample verticals mapped to billing verticals'),
    table(['Spec sample', 'Billing vertical used', 'Paid in Sep 2026'], Object.entries(VERTICAL_MAP).map(([k, v]) => [
      k === 'Corporate' ? 'Corporate' : `Vertical ${k}`, verticalName[v], String(paidIn('2026-09', (r) => r.vertical_code === v)),
    ]), { widths: [0.3, 0.45, 0.25], aligns: [undefined, undefined, R] }),
    h2('Gujarat and central rates used'),
    table(['Item', 'Value used', 'Status', 'Source / note'], RATE_SOURCES.map((r) => [
      r.item, r.value,
      statusChip(r.status, r.status === 'Verified' ? 'green' : r.status === 'Unconfirmed' ? 'red' : 'amber'),
      r.source,
    ]), { widths: [0.18, 0.27, 0.14, 0.41] }),
  ];
}

function reportSection(info, { breakBefore = true } = {}) {
  const list = info.key === 'New-hire' ? recordsLike('New-hire') : recordsLike(info.key);
  const notes = list.filter((r) => r.note);
  const grid = reportGrid(list);
  return [
    h1(info.title, { breakBefore }),
    resultBanner(list),
    spacer(120),
    h2('Purpose'), para(info.purpose),
    h2('Mock data used'), table(['Item', 'Detail'], info.data, { widths: [0.32, 0.68] }),
    ...(grid ? [h2('Report view'), para('Actual values as the report lays them out; green = matches the spec, amber = matches the adjusted value, red = mismatch.', { size: 17, italics: true, color: MUTED }), grid] : []),
    h2('Expected vs actual'), recordTable(list),
    ...(notes.length ? [h2('Notes on gaps'), ...notes.map((r) => bullet(`spec ${fmt(r.expected)}, actual ${fmt(r.actual)}. ${r.note.replace(/^Adjusted expected [^:]+: /, '')}`, { lead: `${r.label}:` }))] : []),
  ];
}

function tieOuts() {
  const list = bySection('Cross-report tie-outs');
  return [
    h1('Cross-report tie-out matrix'),
    resultBanner(list),
    spacer(120),
    para('Each row compares the same figure computed by two different reports (or a total against the sum of its parts).'),
    recordTable(list, ['Tie-out', 'Value 1', 'Value 2', 'Result']),
  ];
}

function rulesSection() {
  pageW = PORTRAIT_W;
  const all = RULE_GROUPS.flatMap((g) => recordsLike(g.prefix));
  return [
    h1('Common rules, filters, access, exports, status and colour tests'),
    resultBanner(all),
    ...RULE_GROUPS.flatMap((g) => {
      const list = recordsLike(g.prefix);
      return list.length ? [h2(`${g.title} — ${list.filter((r) => r.pass).length} of ${list.length} pass`), recordTable(list)] : [];
    }),
  ];
}

function defectsAndGaps() {
  pageW = LANDSCAPE_W;
  const failedAssertions = assertions.filter((a) => a.status === 'failed');
  const failedRecords = records.filter((r) => !r.pass);
  const sevChip = (s) => statusChip(s, s === 'High' ? 'red' : s === 'Low' ? 'amber' : 'grey');
  return [
    h1('Defects / open issues', { breakBefore: false }),
    h2('Test failures'),
    ...(failedAssertions.length || failedRecords.length
      ? [table(['Report / area', 'Check', 'Expected', 'Actual', 'Likely cause', 'Severity'], [
        ...failedRecords.map((r) => [r.section, r.label, fmt(r.expected), fmt(r.actual), r.note || 'See test output', sevChip('High')]),
        ...failedAssertions.filter((a) => !failedRecords.some((r) => a.title.includes(r.label))).map((a) => [a.ancestorTitles.join(' › '), a.title, '—', (a.failureMessages || []).join(' ').slice(0, 300), 'See test output', sevChip('High')]),
      ], { widths: [0.15, 0.2, 0.12, 0.12, 0.31, 0.1] })]
      : [table(['Result'], [[cell('None — every test passed.', { fill: GREEN_BG, color: GREEN_TX, bold: true })]], { widths: [1], headerFill: '15803D' })]),
    h2('Observations (not failures)'),
    table(['Area', 'Spec / expected', 'Mock / actual', 'Detail', 'Severity'], OBSERVATIONS.map((o) => [o.area, o.expected, o.actual, o.detail, sevChip(o.severity)]),
      { widths: [0.17, 0.11, 0.11, 0.51, 0.1], aligns: [undefined, R, R, undefined, C] }),
    h1('Coverage gaps'),
    para('Logic that lives in SQL (views, functions, trigger, row-level security) is not ported to JavaScript; the tests feed fixture rows shaped like the database results into the JavaScript layer instead.'),
    table(['Not covered here', 'What the tests do instead', 'How to cover it'], GAPS, { widths: [0.24, 0.46, 0.3] }),
  ];
}

function appendix() {
  pageW = PORTRAIT_W;
  const vertCodes = Object.values(VERTICAL_MAP);
  return [
    h1('Appendix', { breakBefore: false }),
    h2('Paid employees per vertical and month'),
    table(['Month', ...vertCodes.map((v) => verticalName[v]), 'Total', 'Gross (₹)'], LOCKED_MONTHS.map((m) => [
      new Date(`${m}-01`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
      ...vertCodes.map((v) => String(paidIn(m, (r) => r.vertical_code === v))), String(paidIn(m)), inr(sumIn(m, 'gross')),
    ]), { widths: [0.13, 0.12, 0.1, 0.11, 0.17, 0.1, 0.27], aligns: [undefined, R, R, R, R, R, R] }),
    h2('Vertical A departments (Sep 2026)'),
    table(['Department', 'Paid', 'Hires', 'Exits'], DEPTS_A.map((d) => [
      d, String(paidIn('2026-09', (r) => r.department === d)),
      String(MOCK.newHires.filter((r) => r.department === d).length),
      String(MOCK.rowsByMonth['2026-09'].filter((r) => r.department === d && r.date_of_exit).length),
    ]), { widths: [0.55, 0.15, 0.15, 0.15] }),
    h2('Fixture contents'),
    table(['Fixture', 'Rows'], [
      ['Employees (MOCK-E…)', String(MOCK.employees.length)], ['Employee tags', String(MOCK.tags.length)],
      ['Departments', String(MOCK.departments.length)], ['Shared-staff allocations (off by default)', String(MOCK.allocations.length)],
      ['Statutory rates', String(MOCK.rates.length)], ['Compliance calendar', String(MOCK.calendar.length)],
      ['Budget rows', String(MOCK.budget.length)], ['Insurance premiums', String(MOCK.premiums.length)],
      ['Increment log', String(MOCK.increments.length)], ['MIS access rows', String(MOCK.access.length)],
      ['Alert recipients', String(MOCK.recipients.length)], ['Payroll runs (12 locked + 1 draft)', String(MOCK.runs.length)],
      ['Snapshot rows', String(MOCK.snapshot.length)], ['Draft Oct 2026 lines (never reported)', String(MOCK.draftLines.length)],
      ['Statutory payment rows', String(MOCK.payments.length)],
    ], { widths: [0.75, 0.25] }),
    h2('Test files, command and versions'),
    table(['Item', 'Detail'], [
      ['Fixture', 'tests/fixtures/payrollMisMock.js'],
      ['Test kit (mocks, in-memory lock simulation)', 'tests/helpers/payrollMisKit.js'],
      ['Tests', TEST_FILES.join(', ')],
      ['Report generator', 'scripts/payrollMis/test-report.mjs'],
      ['Command', COMMAND],
      ['Node', process.version],
      ['Vitest', pkgVersion('vitest')],
      ['docx', pkgVersion('docx')],
      ['Sample exports', 'node_modules/.cache/payroll-mis-test/exports (scratch, not committed)'],
    ], { widths: [0.35, 0.65] }),
    spacer(300),
    para('— End of report —', { color: MUTED, italics: true, align: C }),
  ];
}

// Built in page order so section numbers run 1, 2, 3…; each builder sets the page width its tables use.
// The first heading of each section skips its page break because the section itself starts a new page.
const coverChildren = coverPage();
const portraitA = [...executiveSummary(), ...contents(), ...approach(), ...REPORT_INFO.slice(0, 3).flatMap((i) => reportSection(i))];
pageW = LANDSCAPE_W;
const landscapeA = [...reportSection(REPORT_INFO[3], { breakBefore: false }), ...reportSection(REPORT_INFO[4]), ...tieOuts()];
pageW = PORTRAIT_W;
const portraitB = [...reportSection(REPORT_INFO[5], { breakBefore: false }), ...REPORT_INFO.slice(6).flatMap((i) => reportSection(i)), ...rulesSection()];
const landscapeB = defectsAndGaps();
const portraitC = appendix();

const sectionDefaults = (props, hdr = header) => ({ properties: props, headers: { default: hdr }, footers: { default: footer } });
const doc = new Document({
  creator: 'Payroll MIS test run',
  title: 'Payroll MIS Reports — Test Report',
  description: `Payroll MIS mock-data test results — ${verdict}`,
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 20, color: '1D2939' } } },
    paragraphStyles: [
      { id: 'TOC1', name: 'toc 1', basedOn: 'Normal', next: 'Normal', run: { size: 21, color: NAVY }, paragraph: { spacing: { before: 60, after: 60 } } },
    ],
  },
  sections: [
    { properties: { ...portrait, titlePage: true }, children: coverChildren },
    { ...sectionDefaults(portrait), children: portraitA },
    { ...sectionDefaults(landscape, landscapeHeader), children: landscapeA },
    { ...sectionDefaults(portrait), children: portraitB },
    { ...sectionDefaults(landscape, landscapeHeader), children: landscapeB },
    { ...sectionDefaults(portrait), children: portraitC },
  ],
});

const outDir = path.join(ROOT, 'docs/test-reports');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `Payroll_MIS_Test_Report_${reportDate}.docx`);
fs.writeFileSync(outFile, await Packer.toBuffer(doc));
console.log(`\nPayroll MIS test report: ${path.relative(ROOT, outFile)}`);
console.log(`Tests ${stats.passed}/${stats.total} passed, ${stats.failed} failed, ${stats.skipped} skipped · figures ${stats.checks - stats.checksFailed}/${stats.checks} matched · verdict ${verdict}`);
process.exit(exitCode);
