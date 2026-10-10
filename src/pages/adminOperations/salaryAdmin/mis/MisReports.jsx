import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileUp, Paperclip } from 'lucide-react';
import { BarCompareChart, ChartPanel } from '../../../../components/charts/DashboardCharts';
import {
  DenseTable,
  InlineAlert,
  KpiTile,
  Modal,
  SectionCard,
  StatusChip,
  TinyInput,
} from '../../components/AdminUi';
import { MASKED_SECRET, salaryFiguresHidden } from '../salaryPrivacy';
import toast from '../../../../lib/toast';
import {
  STATUTE_LABELS,
  employerCost,
  formatChangePct,
  formatCount,
  formatInr,
  formatSharePct,
  isPaid,
  monthLabel,
  todayIso,
  totalCtc,
  verticalLabel,
  vertKey,
  deptKey,
} from './misMetrics';
import { fmtDate } from './misReportSpecs';
import { CtcHeadcountTrend, VarianceWaterfall, moneyTip } from './MisCharts';
import { challanUrl, markPaymentPaid, uploadChallan } from './misDb';

export function money(v, opts) {
  if (v === null || v === undefined || v === '') return '—';
  if (salaryFiguresHidden()) return MASKED_SECRET;
  return formatInr(v, opts);
}

const toneClass = { bad: 'text-red-700 font-semibold', good: 'text-emerald-700 font-semibold', warn: 'text-amber-700 font-semibold', neutral: '' };

function Num({ children, className = '', onClick, title }) {
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title || 'Show employees'}
        className={`tabular-nums text-right w-full hover:underline decoration-dotted ${className}`}>
        {children}
      </button>
    );
  }
  return <span className={`tabular-nums block text-right ${className}`}>{children}</span>;
}

function SimpleTable({ head, children, className = '' }) {
  return (
    <div className={`w-full overflow-x-auto rounded-lg border border-gray-200 ${className}`}>
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={`px-2.5 py-2 font-semibold whitespace-nowrap ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">{children}</tbody>
      </table>
    </div>
  );
}

const Td = ({ children, left, className = '' }) => (
  <td className={`px-2.5 py-1.5 whitespace-nowrap ${left ? 'text-left' : 'text-right'} ${className}`}>{children}</td>
);

// ---------------------------------------------------------------------------
// Drill-down
// ---------------------------------------------------------------------------
const METRIC_VALUE = {
  headcount: (r) => (isPaid(r) ? 1 : 0),
  gross: (r) => Number(r.gross) || 0,
  deductions: (r) => Number(r.total_deductions) || 0,
  net: (r) => Number(r.net_pay) || 0,
  employerCost,
  totalCtc,
  avgCtc: totalCtc,
  ot: (r) => Number(r.ot_amount) || 0,
};

/** Employee rows behind a total. */
export function snapshotDrill(title, rows, metricKey = 'totalCtc', metricLabel = 'Total CTC') {
  const value = METRIC_VALUE[metricKey] || totalCtc;
  const list = (metricKey === 'headcount' ? rows.filter(isPaid) : rows)
    .map((r) => ({ ...r, _value: value(r) }))
    .sort((a, b) => Math.abs(b._value) - Math.abs(a._value));
  return {
    title,
    rows: list.map((r, i) => ({ ...r, _key: `${r.month_key}-${r.employee_master_id}-${i}` })),
    columns: [
      { key: 'employee_code', label: 'Emp code' },
      { key: 'employee_name', label: 'Name' },
      { key: 'vd', label: 'Vertical / Dept', render: (r) => `${verticalLabel(r.vertical_code)} / ${r.department || '—'}` },
      { key: 'month', label: 'Month', render: (r) => monthLabel(r.month_key) },
      { key: 'paid', label: 'Paid days', render: (r) => `${Number(r.paid_days) || 0} / ${Number(r.total_days) || 0}` },
      ...(metricKey === 'headcount' ? [] : [{ key: '_value', label: metricLabel, render: (r) => <Num>{money(r._value)}</Num> }]),
    ],
  };
}

// ---------------------------------------------------------------------------
// Report 1
// ---------------------------------------------------------------------------
export function Report1({ r1, labels, currentRows, trend, onDrill, tieOut }) {
  return (
    <div className="space-y-3">
      {tieOut && !tieOut.ok ? (
        <InlineAlert tone="error">
          {`These totals do not match the salary register, so downloads are blocked until the figures are rebuilt.\n`}
          {tieOut.issues.map((i) => `${monthLabel(i.month)} · ${i.label}: report ${money(i.report)} vs register ${money(i.register)} (difference ${money(i.diff, { sign: true })})`).join('\n')}
        </InlineAlert>
      ) : null}
      {tieOut && tieOut.ok && tieOut.warnings.length ? (
        <InlineAlert tone="warning">
          Totals match the salary register lines. The month header saved on the salary sheet shows a different total, which can happen after a single-employee save; the register lines are used.
        </InlineAlert>
      ) : null}
      <SectionCard title="Monthly payroll summary">
        <SimpleTable head={['Metric', labels.current, labels.previous, 'Change', 'Change %']}>
          {r1.rows.map((r) => (
            <tr key={r.key}>
              <Td left className="font-medium text-ink">{r.label}</Td>
              <Td>
                <Num onClick={() => onDrill(snapshotDrill(`${r.label} · ${labels.current}`, currentRows, r.key, r.label))}>
                  {r.money ? money(r.current) : formatCount(r.current)}
                </Num>
              </Td>
              <Td><Num>{r.money ? money(r.previous) : formatCount(r.previous)}</Num></Td>
              <Td><Num>{r.money ? money(r.change, { sign: true }) : formatCount(r.change, { sign: true })}</Num></Td>
              <Td><Num className={toneClass[r.tone]}>{formatChangePct(r.changePct)}</Num></Td>
            </tr>
          ))}
        </SimpleTable>
        <p className="type-meta text-ink-muted mt-2">Change % is red when a cost rises more than 5% and green when it falls. Click a current-month figure to see the employees behind it.</p>
      </SectionCard>
      <ChartPanel title="Total CTC and headcount" subtitle="Last 12 locked months" height={240}>
        <CtcHeadcountTrend data={trend} />
      </ChartPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report 2
// ---------------------------------------------------------------------------
export function Report2({ r2, bars, labels, onDrill }) {
  const drill = (d) => onDrill({
    title: `${d.label} · ${labels.previous} → ${labels.current}`,
    rows: d.employees.map((e, i) => ({ ...e, _key: `${e.employee_master_id}-${i}` })),
    columns: [
      { key: 'employee_code', label: 'Emp code' },
      { key: 'employee_name', label: 'Name' },
      { key: 'vd', label: 'Vertical / Dept', render: (r) => `${verticalLabel(r.vertical_code)} / ${r.department || '—'}` },
      { key: 'previous', label: d.key === 'lop' ? `${labels.previous} paid days` : labels.previous, render: (r) => <Num>{d.key === 'lop' ? r.previous : money(r.previous)}</Num> },
      { key: 'current', label: d.key === 'lop' ? `${labels.current} paid days` : labels.current, render: (r) => <Num>{d.key === 'lop' ? r.current : money(r.current)}</Num> },
      { key: 'amount', label: 'Impact on CTC', render: (r) => <Num>{money(r.amount, { sign: true })}</Num> },
    ],
  });
  return (
    <div className="space-y-3">
      {!r2.check.ok ? (
        <InlineAlert tone="error">
          {`Previous CTC plus the drivers does not equal the current CTC (difference ${money(r2.check.diff, { sign: true })}). Downloads are blocked until this is resolved.`}
        </InlineAlert>
      ) : null}
      <SectionCard title="What changed Total CTC">
        <SimpleTable head={['Driver', 'Impact on CTC', 'Share of change', 'Count']}>
          <tr className="bg-gray-50/70">
            <Td left className="font-semibold">{labels.previous} Total CTC</Td>
            <Td><Num className="font-semibold">{money(r2.previousCtc)}</Num></Td>
            <Td /><Td />
          </tr>
          {r2.drivers.map((d) => (
            <tr key={d.key}>
              <Td left>{d.label}</Td>
              <Td><Num className={d.amount < 0 ? 'text-red-700' : ''}>{money(d.amount, { sign: true })}</Num></Td>
              <Td><Num>{formatSharePct(d.share)}</Num></Td>
              <Td>
                {d.count === null ? <Num>—</Num> : (
                  <Num onClick={d.count ? () => drill(d) : undefined}>{d.count}</Num>
                )}
              </Td>
            </tr>
          ))}
          <tr className="bg-gray-50/70">
            <Td left className="font-semibold">{labels.current} Total CTC</Td>
            <Td><Num className="font-semibold">{money(r2.currentCtc)}</Num></Td>
            <Td><Num className="font-semibold">{money(r2.change, { sign: true })} ({formatChangePct(r2.changePct)})</Num></Td>
            <Td />
          </tr>
        </SimpleTable>
        <p className="type-meta text-ink-muted mt-2">Share of change = driver ÷ total change. Click a count to see the employees.</p>
      </SectionCard>
      <ChartPanel title="Variance waterfall" height={280}>
        <VarianceWaterfall bars={bars} />
      </ChartPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report 3
// ---------------------------------------------------------------------------
const R3_METRIC = { gross: 'gross', er_pf: 'er_pf', er_esi: 'er_esi', er_lwf: 'er_lwf', gratuity_prov: 'gratuity_prov', bonus_prov: 'bonus_prov', leave_encash_prov: 'leave_encash_prov', insurance: 'insurance' };

export function Report3({ r3, labels, currentRows, onDrill }) {
  const drill = (r) => {
    if (r.key === 'totalCtc') return onDrill(snapshotDrill(`Total CTC · ${labels.current}`, currentRows));
    const k = R3_METRIC[r.key];
    const d = snapshotDrill(`${r.label} · ${labels.current}`, currentRows, 'gross', r.label);
    d.rows = currentRows.map((x, i) => ({ ...x, _value: Number(x[k]) || 0, _key: `${x.employee_master_id}-${i}` }))
      .filter((x) => x._value !== 0).sort((a, b) => b._value - a._value);
    return onDrill(d);
  };
  return (
    <SectionCard title="Full cost of employees">
      <SimpleTable head={['Cost element', labels.current, labels.previous, labels.ytd, '% of CTC']}>
        {r3.rows.map((r) => (
          <tr key={r.key} className={r.total ? 'bg-gray-50/70 font-semibold' : ''}>
            <Td left>{r.label}</Td>
            <Td><Num onClick={() => drill(r)}>{money(r.current)}</Num></Td>
            <Td><Num>{money(r.previous)}</Num></Td>
            <Td><Num>{money(r.ytd)}</Num></Td>
            <Td><Num>{r.pctOfCtc === null ? '—' : `${r.pctOfCtc.toFixed(1)}%`}</Num></Td>
          </tr>
        ))}
      </SimpleTable>
      <p className="type-meta text-ink-muted mt-2">
        Employer costs are this month&apos;s share of the CTC figures, by paid days. Group insurance uses the annual premium entered in Setup when one covers the month.
      </p>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Report 4
// ---------------------------------------------------------------------------
export function Report4({ r4, labels, currentRows, onDrill, split }) {
  const drill = (r) => onDrill(snapshotDrill(`${r.label} · ${labels.current}`, currentRows.filter((x) => vertKey(x) === r.vertical)));
  const chart = r4.rows.map((r) => ({ name: r.label, fullName: r.label, ctc: r.totalCtc }));
  return (
    <div className="space-y-3">
      {r4.hasUnassigned ? (
        <InlineAlert tone="error">Some employees have no vertical. They are listed as Unassigned until a vertical is set in Setup → Employee tags or on the department.</InlineAlert>
      ) : null}
      <ChartPanel title="Total CTC by vertical" height={Math.max(160, chart.length * 34)}>
        <BarCompareChart data={chart} layout="horizontal" series={[{ key: 'ctc', name: 'Total CTC' }]} formatter={moneyTip} height={Math.max(160, chart.length * 34)} />
      </ChartPanel>
      <SectionCard title="Cost and headcount by vertical" right={split ? <StatusChip label="Shared staff split by allocation %" severity="info" /> : null}>
        <SimpleTable head={['Vertical', 'Headcount', 'Gross', 'Employer cost', 'Total CTC', '% of total', `${labels.previous} CTC`, 'Change %', 'YTD CTC']}>
          {r4.rows.map((r) => (
            <tr key={r.vertical} className={r.unassigned ? 'text-red-700' : ''}>
              <Td left className={r.unassigned ? 'font-semibold' : ''}>{r.label}</Td>
              <Td><Num>{formatCount(r.headcount)}</Num></Td>
              <Td><Num>{money(r.gross)}</Num></Td>
              <Td><Num>{money(r.employerCost)}</Num></Td>
              <Td><Num onClick={split ? undefined : () => drill(r)}>{money(r.totalCtc)}</Num></Td>
              <Td><Num>{r.pctOfTotal === null ? '—' : `${r.pctOfTotal.toFixed(1)}%`}</Num></Td>
              <Td><Num>{money(r.previousCtc)}</Num></Td>
              <Td><Num>{formatChangePct(r.changePct)}</Num></Td>
              <Td><Num>{money(r.ytdCtc)}</Num></Td>
            </tr>
          ))}
          <tr className="bg-gray-50/70 font-semibold">
            <Td left>Total</Td>
            <Td><Num>{formatCount(r4.total.headcount)}</Num></Td>
            <Td><Num>{money(r4.total.gross)}</Num></Td>
            <Td><Num>{money(r4.total.employerCost)}</Num></Td>
            <Td><Num onClick={() => onDrill(snapshotDrill(`Total CTC · ${labels.current}`, currentRows))}>{money(r4.total.totalCtc)}</Num></Td>
            <Td><Num>{r4.total.pctOfTotal === null ? '—' : '100%'}</Num></Td>
            <Td><Num>{money(r4.total.previousCtc)}</Num></Td>
            <Td><Num>{formatChangePct(r4.total.changePct)}</Num></Td>
            <Td><Num>{money(r4.total.ytdCtc)}</Num></Td>
          </tr>
        </SimpleTable>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report 5
// ---------------------------------------------------------------------------
export function Report5({ r5, labels, currentRows, onDrill, split }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (v) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(v)) n.delete(v); else n.add(v);
    return n;
  });
  const cells = (r, drillRows, title) => (
    <>
      <Td><Num>{formatCount(r.headcount)}</Num></Td>
      <Td><Num onClick={split ? undefined : () => onDrill(snapshotDrill(title, drillRows))}>{money(r.totalCtc)}</Num></Td>
      <Td><Num>{money(r.avgCtc)}</Num></Td>
      <Td><Num>{money(r.ot)}</Num></Td>
      <Td><Num>{formatCount(r.newHires)}</Num></Td>
      <Td><Num>{formatCount(r.exits)}</Num></Td>
      <Td><Num>{money(r.previousCtc)}</Num></Td>
      <Td><Num>{formatChangePct(r.changePct)}</Num></Td>
    </>
  );
  return (
    <SectionCard
      title="Cost by department"
      right={(
        <div className="flex gap-2">
          <button type="button" className="type-meta text-accent hover:underline" onClick={() => setOpen(new Set(r5.groups.map((g) => g.vertical)))}>Expand all</button>
          <button type="button" className="type-meta text-accent hover:underline" onClick={() => setOpen(new Set())}>Collapse all</button>
        </div>
      )}
    >
      <SimpleTable head={['Vertical / Department', 'Headcount', 'Total CTC', 'Avg CTC', 'OT amount', 'New hires', 'Exits', `${labels.previous} CTC`, 'Change %']}>
        {r5.groups.map((g) => {
          const isOpen = open.has(g.vertical);
          const vRows = currentRows.filter((x) => vertKey(x) === g.vertical);
          return (
            <React.Fragment key={g.vertical}>
              <tr className={`bg-gray-50/70 font-semibold ${g.unassigned ? 'text-red-700' : ''}`}>
                <Td left>
                  <button type="button" onClick={() => toggle(g.vertical)} className="inline-flex items-center gap-1">
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    Subtotal {g.label}
                  </button>
                </Td>
                {cells(g.subtotal, vRows, `${g.label} · ${labels.current}`)}
              </tr>
              {isOpen ? g.departments.map((d) => (
                <tr key={`${g.vertical}-${d.department}`}>
                  <Td left className="pl-8">{d.department}</Td>
                  {cells(d, vRows.filter((x) => deptKey(x) === d.department), `${g.label} / ${d.department} · ${labels.current}`)}
                </tr>
              )) : null}
            </React.Fragment>
          );
        })}
        <tr className="bg-gray-100 font-semibold">
          <Td left>Grand total</Td>
          {cells(r5.total, currentRows, `All departments · ${labels.current}`)}
        </tr>
      </SimpleTable>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Report 6
// ---------------------------------------------------------------------------
export function Report6({ r6, employees, pf, labels, onDrill }) {
  const [tab, setTab] = useState('summary');
  const [showPf, setShowPf] = useState(false);
  const empColumns = [
    { key: 'employee_code', label: 'Emp code' },
    { key: 'employee_name', label: 'Name' },
    { key: 'uan_no', label: 'UAN', render: (r) => (salaryFiguresHidden() && r.uan_no ? MASKED_SECRET : r.uan_no || '—') },
    { key: 'esic_no', label: 'ESIC number', render: (r) => (salaryFiguresHidden() && r.esic_no ? MASKED_SECRET : r.esic_no || '—') },
    { key: 'pf_wage', label: 'PF wage', render: (r) => <Num>{money(r.pf_wage)}</Num> },
    { key: 'esi_wage', label: 'ESI wage', render: (r) => <Num>{money(r.esi_wage)}</Num> },
    { key: 'employeeShare', label: 'Employee share', render: (r) => <Num>{money(r.employeeShare)}</Num> },
    { key: 'employerShare', label: 'Employer share', render: (r) => <Num>{money(r.employerShare)}</Num> },
  ];
  const drillStatute = (s) => {
    const list = employees.filter((e) => (s.key === 'PF' ? e.emp_pf || e.er_pf : s.key === 'ESI' ? e.emp_esic || e.er_esi : s.key === 'PT' ? e.pt : s.key === 'TDS' ? e.tds : false));
    onDrill({ title: `${s.label} · ${labels.current}`, rows: list.map((e) => ({ ...e, _key: e.employee_master_id })), columns: empColumns });
  };
  return (
    <SectionCard
      title="Statutory contributions"
      right={(
        <div className="flex gap-1">
          {[['summary', 'Summary'], ['employees', 'Employee-wise']].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={`h-7 px-2.5 rounded text-[11px] font-medium border ${tab === id ? 'bg-accent text-white border-accent' : 'bg-white text-ink-secondary border-border'}`}>
              {label}
            </button>
          ))}
        </div>
      )}
    >
      {tab === 'summary' ? (
        <div className="space-y-3">
          <SimpleTable head={['Statute', 'Employees covered', 'Wage base', 'Employee share', 'Employer share', 'Total to deposit', 'Employer change %']}>
            {r6.rows.map((s) => (
              <tr key={s.key}>
                <Td left>
                  {s.key === 'PF' ? (
                    <button type="button" className="hover:underline inline-flex items-center gap-1" onClick={() => setShowPf((v) => !v)}>
                      {showPf ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}{s.label}
                    </button>
                  ) : s.label}
                </Td>
                <Td><Num onClick={s.covered ? () => drillStatute(s) : undefined}>{s.covered}</Num></Td>
                <Td><Num>{s.wageBase === null ? '—' : money(s.wageBase)}</Num></Td>
                <Td><Num>{money(s.employeeShare)}</Num></Td>
                <Td><Num>{money(s.employerShare)}</Num></Td>
                <Td><Num className="font-medium">{money(s.totalDeposit)}</Num></Td>
                <Td><Num>{s.employerChangePct === undefined ? '—' : formatChangePct(s.employerChangePct)}</Num></Td>
              </tr>
            ))}
            <tr className="bg-gray-50/70 font-semibold">
              <Td left>Total</Td><Td /><Td />
              <Td><Num>{money(r6.total.employeeShare)}</Num></Td>
              <Td><Num>{money(r6.total.employerShare)}</Num></Td>
              <Td><Num>{money(r6.total.totalDeposit)}</Num></Td>
              <Td />
            </tr>
          </SimpleTable>
          {showPf && pf ? (
            <div className="max-w-md">
              <p className="type-meta font-semibold text-ink mb-1">Provident Fund breakup (as in the ECR file)</p>
              <SimpleTable head={['Component', 'Amount']}>
                {pf.lines.map((l) => (
                  <tr key={l.key}><Td left>{l.label}</Td><Td><Num>{money(l.amount)}</Num></Td></tr>
                ))}
                <tr className="bg-gray-50/70 font-semibold"><Td left>Employer PF in payroll</Td><Td><Num>{money(pf.employerPayroll)}</Num></Td></tr>
              </SimpleTable>
              {pf.ratesMissing ? <p className="type-meta text-amber-700 mt-1">PF rates are missing in Setup → Statutory rates.</p> : null}
              {!pf.ratesMissing && Math.abs(pf.difference) >= 1 ? (
                <p className="type-meta text-ink-muted mt-1">Employer PF in payroll differs from the rate master by {money(pf.difference, { sign: true })}.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <DenseTable columns={empColumns} rows={employees} rowKey="employee_master_id" stickyHeader />
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Report 7
// ---------------------------------------------------------------------------
const STATUS_SEVERITY = { pending: 'neutral', due_soon: 'warning', overdue: 'critical', paid_on_time: 'info', paid_late: 'critical' };

function PaidModal({ payment, onClose, onSaved }) {
  const [paidOn, setPaidOn] = useState(todayIso());
  const [challanRef, setChallanRef] = useState('');
  const [interest, setInterest] = useState('');
  const [penalty, setPenalty] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canSave = paidOn && challanRef.trim();
  const save = async () => {
    if (!canSave) {
      setError('Enter the paid-on date and the challan reference.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await markPaymentPaid(payment.id, { paidOn, challanRef, interest, penalty });
      if (file) await uploadChallan(payment, file);
      toast.success('Payment marked as paid');
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title={`Mark paid · ${STATUTE_LABELS[payment.statute]} · ${monthLabel(payment.wage_month)}`} onClose={onClose}
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" className="h-8 px-3 rounded border border-border text-xs" onClick={onClose}>Cancel</button>
          <button type="button" disabled={busy || !canSave} onClick={save}
            className="h-8 px-3 rounded bg-accent text-white text-xs font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Mark paid'}</button>
        </div>
      )}>
      <div className="space-y-3">
        <p className="type-meta text-ink-secondary">Amount {money(payment.amount)} · due {payment.due_date ? fmtDate(payment.due_date) : 'per state calendar'}</p>
        <label className="block text-xs">Paid on *<TinyInput type="date" value={paidOn} onChange={(e) => setPaidOn(e?.target ? e.target.value : e)} className="w-full mt-1" /></label>
        <label className="block text-xs">Challan / reference *<TinyInput value={challanRef} onChange={(e) => setChallanRef(e.target.value)} className="w-full mt-1" placeholder="CIN / TRRN / challan number" /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs">Interest<TinyInput type="number" min="0" value={interest} onChange={(e) => setInterest(e.target.value)} className="w-full mt-1" /></label>
          <label className="block text-xs">Penalty<TinyInput type="number" min="0" value={penalty} onChange={(e) => setPenalty(e.target.value)} className="w-full mt-1" /></label>
        </div>
        <label className="block text-xs">Challan PDF (optional)
          <input type="file" accept="application/pdf" className="block mt-1 text-xs" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
        {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      </div>
    </Modal>
  );
}

export function Report7({ r7, canEdit, onChanged }) {
  const [paying, setPaying] = useState(null);
  const openChallan = async (p) => {
    try {
      window.open(await challanUrl(p.challan_path), '_blank', 'noopener');
    } catch (e) {
      toast.error('Could not open the challan', e.message);
    }
  };
  const attach = async (p, file) => {
    if (!file) return;
    try {
      await uploadChallan(p, file);
      toast.success('Challan uploaded');
      onChanged();
    } catch (e) {
      toast.error('Upload failed', e.message);
    }
  };
  const columns = useMemo(() => [
    { key: 'wage_month', label: 'Wage month', render: (r) => monthLabel(r.wage_month) },
    { key: 'statute', label: 'Statute', render: (r) => `${STATUTE_LABELS[r.statute] || r.statute}${r.state && r.state !== 'ALL' ? ` · ${r.state}` : ''}` },
    { key: 'due_date', label: 'Due date', render: (r) => (r.due_date ? fmtDate(r.due_date) : 'Per state calendar') },
    { key: 'amount', label: 'Amount', render: (r) => <Num>{money(r.amount)}</Num> },
    { key: 'paid_on', label: 'Paid on', render: (r) => (r.paid_on ? fmtDate(r.paid_on) : '—') },
    { key: 'challan_ref', label: 'Challan / ref', render: (r) => r.challan_ref || '—' },
    {
      key: 'status', label: 'Status', render: (r) => (
        <span className="inline-flex items-center gap-1">
          {r.status.key === 'paid_late'
            ? <span className="text-red-700 font-semibold text-[11px]">Paid late</span>
            : <StatusChip label={r.status.label} severity={STATUS_SEVERITY[r.status.key]} />}
          {r.amount_changed_after_payment ? <StatusChip label="Amount changed after payment" severity="warning" /> : null}
        </span>
      ),
    },
    { key: 'days', label: 'Days late', render: (r) => <Num>{r.paid_on ? r.status.daysLate : '—'}</Num> },
    { key: 'ip', label: 'Interest + penalty', render: (r) => <Num>{r.paid_on ? money(r.interestPenalty) : '—'}</Num> },
    {
      key: 'actions', label: '', render: (r) => (
        <span className="inline-flex items-center gap-2">
          {canEdit && !r.paid_on ? (
            <button type="button" className="text-accent text-[11px] font-semibold hover:underline" onClick={() => setPaying(r)}>Mark paid</button>
          ) : null}
          {r.challan_path ? (
            <button type="button" title="Open challan" className="text-ink-secondary hover:text-ink" onClick={() => openChallan(r)}><Paperclip className="h-3.5 w-3.5" /></button>
          ) : null}
          {canEdit ? (
            <label title="Upload challan PDF" className="cursor-pointer text-ink-secondary hover:text-ink">
              <FileUp className="h-3.5 w-3.5" />
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => attach(r, e.target.files?.[0])} />
            </label>
          ) : null}
        </span>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [canEdit]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Pending amount" value={`₹${money(r7.tiles.pendingAmount)}`} />
        <KpiTile label="Overdue items" value={r7.tiles.overdueCount} tone={r7.tiles.overdueCount ? 'border-red-300' : 'border-border'} />
        <KpiTile label="Paid late this FY" value={r7.tiles.paidLateThisFy} />
        <KpiTile label="Interest and penalty YTD" value={`₹${money(r7.tiles.interestPenaltyYtd)}`} />
      </div>
      <SectionCard title="Statutory payments">
        <DenseTable columns={columns} rows={r7.rows} rowKey="id" stickyHeader />
        <p className="type-meta text-ink-muted mt-2">Rows are created when a salary month is locked. Due soon = within 3 days of the due date.</p>
      </SectionCard>
      {paying ? <PaidModal payment={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); onChanged(); }} /> : null}
    </div>
  );
}
