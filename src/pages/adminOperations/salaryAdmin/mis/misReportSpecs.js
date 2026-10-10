/**
 * Payroll MIS — download layouts (one per report), built from the same figures shown on screen.
 */
import {
  STATUTE_LABELS,
  formatChangePct,
  formatSharePct,
  monthLabel,
  verticalLabel,
} from './misMetrics';

export const REPORTS = [
  { id: 'r1', short: 'Summary', title: 'Monthly Payroll Summary' },
  { id: 'r2', short: 'Variance', title: 'Month-on-Month Variance' },
  { id: 'r3', short: 'CTC cost', title: 'CTC Cost Summary' },
  { id: 'r4', short: 'By vertical', title: 'Vertical-wise Payroll Cost' },
  { id: 'r5', short: 'By department', title: 'Department-wise Payroll Cost' },
  { id: 'r6', short: 'Statutory', title: 'Statutory Contribution Summary' },
  { id: 'r7', short: 'Due dates', title: 'Compliance Due-Date and Payment Tracker' },
];

const pctText = (v) => (v === undefined ? '—' : formatChangePct(v));
const pctOf = (v) => (v === null || v === undefined ? '' : `${Number(v).toFixed(1)}%`);

export function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${names[Number(m) - 1]} ${y}`;
}

export function r1Spec(r1, labels) {
  return {
    title: 'Monthly Payroll Summary',
    sheets: [{
      name: 'Summary',
      columns: [
        { label: 'Metric', kind: 'text' },
        { label: labels.current, kind: 'money' },
        { label: labels.previous, kind: 'money' },
        { label: 'Change', kind: 'money' },
        { label: 'Change %', kind: 'pct' },
      ],
      rows: r1.rows.map((r) => ({
        cells: r.money
          ? [r.label, r.current, r.previous, r.change, r.changePct]
          : [r.label, `${r.current}`, `${r.previous}`, `${r.change > 0 ? '+' : ''}${r.change}`, r.changePct],
        tones: [null, null, null, null, r.tone],
      })),
    }],
  };
}

export function r2Spec(r2, labels) {
  const rows = [{ cells: [`${labels.previous} Total CTC`, r2.previousCtc, '', ''], total: true }];
  for (const d of r2.drivers) rows.push({ cells: [d.label, d.amount, formatSharePct(d.share), d.count === null ? '—' : d.count] });
  rows.push({
    cells: [`${labels.current} Total CTC`, r2.currentCtc, `${r2.change >= 0 ? '+' : ''}${Math.round(r2.change).toLocaleString('en-IN')} (${formatChangePct(r2.changePct)})`, ''],
    total: true,
  });
  const detail = [];
  for (const d of r2.drivers) {
    for (const e of d.employees) {
      detail.push({ cells: [d.label, e.employee_code || '', e.employee_name || '', `${verticalLabel(e.vertical_code)} / ${e.department || '—'}`, e.previous ?? '', e.current ?? '', e.amount] });
    }
  }
  return {
    title: 'Month-on-Month Variance',
    sheets: [
      {
        name: 'Variance',
        columns: [
          { label: 'Driver', kind: 'text' },
          { label: 'Impact on CTC', kind: 'money' },
          { label: 'Share of change', kind: 'text' },
          { label: 'Count', kind: 'text' },
        ],
        rows,
      },
      {
        name: 'Employees',
        columns: [
          { label: 'Driver', kind: 'text' },
          { label: 'Emp code', kind: 'text' },
          { label: 'Name', kind: 'text' },
          { label: 'Vertical / Dept', kind: 'text' },
          { label: labels.previous, kind: 'money' },
          { label: labels.current, kind: 'money' },
          { label: 'Change', kind: 'money' },
        ],
        rows: detail,
      },
    ],
  };
}

export function r3Spec(r3, labels) {
  return {
    title: 'CTC Cost Summary',
    sheets: [{
      name: 'CTC cost',
      columns: [
        { label: 'Cost element', kind: 'text' },
        { label: labels.current, kind: 'money' },
        { label: labels.previous, kind: 'money' },
        { label: labels.ytd, kind: 'money' },
        { label: '% of CTC', kind: 'text' },
      ],
      rows: r3.rows.map((r) => ({ cells: [r.label, r.current, r.previous, r.ytd, pctOf(r.pctOfCtc)], total: !!r.total })),
    }],
  };
}

export function r4Spec(r4, labels) {
  const line = (label, r) => [label, r.headcount, r.gross, r.employerCost, r.totalCtc, pctOf(r.pctOfTotal), r.previousCtc, r.changePct, r.ytdCtc];
  return {
    title: 'Vertical-wise Payroll Cost',
    sheets: [{
      name: 'By vertical',
      columns: [
        { label: 'Vertical', kind: 'text' },
        { label: 'Headcount', kind: 'count' },
        { label: 'Gross', kind: 'money' },
        { label: 'Employer cost', kind: 'money' },
        { label: 'Total CTC', kind: 'money' },
        { label: '% of total', kind: 'text' },
        { label: `${labels.previous} CTC`, kind: 'money' },
        { label: 'Change %', kind: 'pct' },
        { label: 'YTD CTC', kind: 'money' },
      ],
      rows: [
        ...r4.rows.map((r) => ({ cells: line(r.label, r), tones: r.unassigned ? Array(9).fill('bad') : undefined })),
        { cells: line('Total', r4.total), total: true },
      ],
    }],
  };
}

export function r5Spec(r5, labels) {
  const line = (v, d, r) => [v, d, r.headcount, r.totalCtc, r.avgCtc, r.ot, r.newHires, r.exits, r.previousCtc, r.changePct];
  const rows = [];
  for (const g of r5.groups) {
    for (const d of g.departments) rows.push({ cells: line(g.label, d.department, d) });
    rows.push({ cells: line(g.label, `Subtotal ${g.label}`, g.subtotal), total: true });
  }
  rows.push({ cells: line('', 'Grand total', r5.total), total: true });
  return {
    title: 'Department-wise Payroll Cost',
    sheets: [{
      name: 'By department',
      columns: [
        { label: 'Vertical', kind: 'text' },
        { label: 'Department', kind: 'text' },
        { label: 'Headcount', kind: 'count' },
        { label: 'Total CTC', kind: 'money' },
        { label: 'Avg CTC', kind: 'money' },
        { label: 'OT amount', kind: 'money' },
        { label: 'New hires', kind: 'count' },
        { label: 'Exits', kind: 'count' },
        { label: `${labels.previous} CTC`, kind: 'money' },
        { label: 'Change %', kind: 'pct' },
      ],
      rows,
    }],
  };
}

export function r6Spec(r6, employees, pf) {
  const sheets = [{
    name: 'Statutory',
    columns: [
      { label: 'Statute', kind: 'text' },
      { label: 'Employees covered', kind: 'count' },
      { label: 'Wage base', kind: 'money' },
      { label: 'Employee share', kind: 'money' },
      { label: 'Employer share', kind: 'money' },
      { label: 'Total to deposit', kind: 'money' },
      { label: 'Employer change %', kind: 'text' },
    ],
    rows: [
      ...r6.rows.map((r) => ({ cells: [r.label, r.covered, r.wageBase === null ? '—' : r.wageBase, r.employeeShare, r.employerShare, r.totalDeposit, pctText(r.employerChangePct)] })),
      { cells: ['Total', '', '', r6.total.employeeShare, r6.total.employerShare, r6.total.totalDeposit, ''], total: true },
    ],
  }];
  if (pf) {
    sheets.push({
      name: 'PF breakup',
      columns: [{ label: 'Component', kind: 'text' }, { label: 'Amount', kind: 'money' }],
      rows: [
        ...pf.lines.map((l) => ({ cells: [l.label, l.amount] })),
        { cells: ['Employer PF in payroll', pf.employerPayroll], total: true },
        { cells: ['Difference vs rate master', pf.difference] },
      ],
    });
  }
  sheets.push({
    name: 'Employee-wise',
    columns: [
      { label: 'Emp code', kind: 'text' },
      { label: 'Name', kind: 'text' },
      { label: 'UAN', kind: 'text' },
      { label: 'ESIC number', kind: 'text' },
      { label: 'PF wage', kind: 'money' },
      { label: 'ESI wage', kind: 'money' },
      { label: 'Employee share', kind: 'money' },
      { label: 'Employer share', kind: 'money' },
    ],
    rows: employees.map((e) => ({ cells: [e.employee_code || '', e.employee_name || '', e.uan_no || '', e.esic_no || '', e.pf_wage, e.esi_wage, e.employeeShare, e.employerShare] })),
  });
  return { title: 'Statutory Contribution Summary', sheets };
}

export function r7Spec(r7) {
  return {
    title: 'Compliance Due-Date and Payment Tracker',
    sheets: [{
      name: 'Payments',
      columns: [
        { label: 'Wage month', kind: 'text' },
        { label: 'Statute', kind: 'text' },
        { label: 'State', kind: 'text' },
        { label: 'Due date', kind: 'text' },
        { label: 'Amount', kind: 'money' },
        { label: 'Paid on', kind: 'text' },
        { label: 'Challan / ref', kind: 'text' },
        { label: 'Status', kind: 'text' },
        { label: 'Days late', kind: 'text' },
        { label: 'Interest + penalty', kind: 'money' },
      ],
      rows: r7.rows.map((r) => ({
        cells: [
          monthLabel(r.wage_month), STATUTE_LABELS[r.statute] || r.statute, r.state === 'ALL' ? '' : r.state,
          r.due_date ? fmtDate(r.due_date) : 'Per state calendar', r.amount, r.paid_on ? fmtDate(r.paid_on) : '—',
          r.challan_ref || '—', r.status.label,
          r.status.key === 'paid_late' || r.status.key === 'paid_on_time' ? String(r.status.daysLate) : '—',
          r.paid_on ? r.interestPenalty : '—',
        ],
        tones: [null, null, null, null, null, null, null, r.status.tone === 'late' ? 'bad' : r.status.tone, null, null],
      })),
    }],
  };
}
