import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useAuth } from '../../../../contexts/AuthContext';
import {
  CollapsibleHelp,
  DenseTable,
  Drawer,
  FilterBar,
  InlineAlert,
  PageTaskHeader,
  TinySelect,
} from '../../components/AdminUi';
import toast from '../../../../lib/toast';
import {
  MIS_VERTICALS,
  UNASSIGNED,
  applyFilters,
  buildPfBreakup,
  buildR1,
  buildR2,
  buildR3,
  buildR4,
  buildR5,
  buildR6,
  buildR6Employees,
  buildR7,
  buildTrend,
  filterOptions,
  fyStartMonth,
  monthLabel,
  periodMonths,
  registerTieOut,
  rowsForMonths,
  shiftMonth,
  todayIso,
  verticalLabel,
  waterfallData,
} from './misMetrics';
import { REPORTS, r1Spec, r2Spec, r3Spec, r4Spec, r5Spec, r6Spec, r7Spec } from './misReportSpecs';
import { exportReportCsv, exportReportExcel, exportReportPdf } from './misExport';
import {
  fetchAllocations,
  fetchLockedMonths,
  fetchPayments,
  fetchRates,
  fetchRegisterTotals,
  fetchSettings,
  fetchSnapshotRows,
  logMisAction,
  rebuildSnapshot,
} from './misDb';
import { Report1, Report2, Report3, Report4, Report5, Report6, Report7 } from './MisReports';

const MisSetup = lazy(() => import('./MisSetup'));

const PERIOD_TYPES = [
  { id: 'month', label: 'Month' },
  { id: 'range', label: 'Range' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'fy', label: 'Financial year' },
  { id: 'ytd', label: 'Year to date' },
];

const FILTER_FIELDS = [
  { key: 'vertical', label: 'Vertical', option: 'verticals' },
  { key: 'department', label: 'Department', option: 'departments' },
  { key: 'location', label: 'Location', option: 'locations' },
  { key: 'costCentre', label: 'Cost centre', option: 'costCentres' },
  { key: 'grade', label: 'Grade', option: 'grades' },
  { key: 'employmentType', label: 'Employment type', option: 'employmentTypes' },
];

function fyOf(monthKey) {
  return Number(fyStartMonth(monthKey).slice(0, 4));
}

function quarterOf(monthKey) {
  const m = Number(String(monthKey).slice(5, 7));
  return m >= 4 ? Math.floor((m - 4) / 3) + 1 : 4;
}

function nowText() {
  return new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function PayrollMisPage({ access }) {
  const { user, userProfile } = useAuth();
  const full = !!access?.full;
  const [view, setView] = useState('reports');
  const [report, setReport] = useState('r1');
  const [months, setMonths] = useState([]);
  const [settings, setSettings] = useState({});
  const [allocations, setAllocations] = useState([]);
  const [rates, setRates] = useState([]);
  const [payments, setPayments] = useState([]);
  const [rows, setRows] = useState([]);
  const [register, setRegister] = useState([]);
  const [period, setPeriod] = useState(null);
  const [filters, setFilters] = useState({});
  const [split, setSplit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [drill, setDrill] = useState(null);
  const [rebuilding, setRebuilding] = useState('');

  const lockedKeys = useMemo(() => months.map((m) => m.month_key).sort(), [months]);

  const loadBase = useCallback(async () => {
    try {
      const [m, s, a, r] = await Promise.all([fetchLockedMonths(), fetchSettings(), fetchAllocations(), fetchRates()]);
      setMonths(m);
      setSettings(s);
      setAllocations(a);
      setRates(r);
      if (full) setPayments(await fetchPayments());
      setPeriod((p) => p || (m.length ? { type: 'month', month: m[0].month_key } : null));
      if (!m.length) setLoading(false);
    } catch (e) {
      setLoadError(e.message);
      setLoading(false);
    }
  }, [full]);

  useEffect(() => { loadBase(); }, [loadBase]);

  const pm = useMemo(() => (period ? periodMonths(period, lockedKeys) : null), [period, lockedKeys]);

  // One fetch covers the period, the comparison months, YTD and the 12-month trend.
  const fetchWindow = useMemo(() => {
    if (!pm || !pm.last) return null;
    const starts = [pm.from, fyStartMonth(pm.last), shiftMonth(pm.last, -11)];
    if (pm.previous.length) starts.push(pm.previous[0]);
    return { from: starts.sort()[0], to: pm.last };
  }, [pm]);

  useEffect(() => {
    if (!fetchWindow) return undefined;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    (async () => {
      try {
        const [data, reg] = await Promise.all([
          fetchSnapshotRows(fetchWindow.from, fetchWindow.to),
          full ? fetchRegisterTotals(fetchWindow.from, fetchWindow.to) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setRows(data);
        setRegister(reg);
      } catch (e) {
        if (!cancelled) setLoadError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchWindow, full]);

  const options = useMemo(() => filterOptions(rows), [rows]);
  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  const anyFilter = Object.values(filters).some(Boolean);

  const built = useMemo(() => {
    if (!pm || !pm.last) return null;
    const cur = rowsForMonths(filtered, pm.current);
    const prev = rowsForMonths(filtered, pm.previous);
    const ytdMonths = lockedKeys.filter((k) => k >= fyStartMonth(pm.last) && k <= pm.last);
    const ytd = rowsForMonths(filtered, ytdMonths);
    const prevLast = pm.previous[pm.previous.length - 1] || null;
    const labels = {
      current: pm.label,
      previous: pm.previous.length
        ? (pm.previous.length === 1 ? monthLabel(pm.previous[0]) : `${monthLabel(pm.previous[0])} – ${monthLabel(prevLast)}`)
        : 'Previous',
      ytd: `YTD ${monthLabel(fyStartMonth(pm.last))} – ${monthLabel(pm.last)}`,
    };
    const lastRows = rowsForMonths(filtered, [pm.last]);
    const prevLastRows = prevLast ? rowsForMonths(filtered, [prevLast]) : [];
    const r2 = buildR2(lastRows, prevLastRows, pm.last, prevLast);
    const r2Labels = { current: monthLabel(pm.last), previous: prevLast ? monthLabel(prevLast) : 'Previous' };
    return {
      cur,
      labels,
      r2Labels,
      lastRows,
      r1: buildR1(cur, prev),
      trend: buildTrend(filtered, lockedKeys, pm.last),
      r2,
      bars: waterfallData(r2),
      r3: buildR3(cur, prev, ytd),
      r4: buildR4(cur, prev, ytd, allocations, { split }),
      r5: buildR5(cur, prev, { from: pm.from, to: pm.to }, allocations, { split }),
      r6: buildR6(cur, prev),
      r6Employees: buildR6Employees(cur),
      pf: buildPfBreakup(cur, rates, pm.last),
      tieOut: full && !anyFilter ? registerTieOut(rows, register.filter((r) => pm.current.includes(r.month_key))) : null,
    };
  }, [pm, filtered, lockedKeys, allocations, split, rates, full, anyFilter, rows, register]);

  const r7 = useMemo(() => buildR7(payments, todayIso()), [payments]);

  const snapshotIssues = useMemo(() => months.filter((m) => (
    (pm?.current || []).includes(m.month_key) && (m.last_job_ok === false || Number(m.snapshot_count) !== Number(m.line_count))
  )), [months, pm]);

  const filterText = useMemo(() => {
    const parts = FILTER_FIELDS.filter((f) => filters[f.key]).map((f) => `${f.label}: ${f.key === 'vertical' ? verticalLabel(filters[f.key]) : filters[f.key]}`);
    if (!full && access?.scopes?.length) {
      parts.push(`Access: ${access.scopes.map((s) => `${verticalLabel(s.vertical)}${s.department ? ` / ${s.department}` : ''}`).join(', ')}`);
    }
    if (split && (report === 'r4' || report === 'r5')) parts.push('Shared staff split by allocation %');
    return parts.join(' · ') || 'None';
  }, [filters, full, access, split, report]);

  const reportMeta = REPORTS.find((r) => r.id === report);
  const header = useMemo(() => ({
    company: (typeof settings.company_name === 'string' && settings.company_name) || 'Indus Fire Safety Pvt. Ltd.',
    report: reportMeta?.title || '',
    period: report === 'r7' ? `As on ${todayIso()}` : report === 'r2' && built ? `${built.r2Labels.previous} vs ${built.r2Labels.current}` : pm?.label || '',
    filters: report === 'r7' ? 'None' : filterText,
    generatedOn: nowText(),
    generatedBy: userProfile?.username || userProfile?.email || user?.email || '',
  }), [settings, reportMeta, report, built, pm, filterText, userProfile, user]);

  // View log: once per report / period / filters combination.
  const lastLogged = useRef('');
  useEffect(() => {
    if (view !== 'reports' || (!built && report !== 'r7')) return;
    const key = JSON.stringify([report, pm?.from, pm?.to, filters]);
    if (lastLogged.current === key) return;
    lastLogged.current = key;
    logMisAction(reportMeta.title, 'view', null, pm ? { from: pm.from, to: pm.to } : null, filters);
  }, [view, report, pm, filters, built, reportMeta]);

  const blocked = (report === 'r1' && built?.tieOut && !built.tieOut.ok) || (report === 'r2' && built && !built.r2.check.ok);

  const specFor = () => {
    if (report === 'r7') return r7Spec(r7);
    if (!built) return null;
    switch (report) {
      case 'r1': return r1Spec(built.r1, built.labels);
      case 'r2': return r2Spec(built.r2, built.r2Labels);
      case 'r3': return r3Spec(built.r3, built.labels);
      case 'r4': return r4Spec(built.r4, built.labels);
      case 'r5': return r5Spec(built.r5, built.labels);
      case 'r6': return r6Spec(built.r6, built.r6Employees, built.pf);
      default: return null;
    }
  };

  const download = async (format) => {
    if (blocked) return;
    const spec = specFor();
    if (!spec) return;
    const h = { ...header, generatedOn: nowText() };
    try {
      if (format === 'xlsx') await exportReportExcel(spec, h);
      if (format === 'pdf') exportReportPdf(spec, h);
      if (format === 'csv') exportReportCsv(spec, h);
      logMisAction(reportMeta.title, 'download', format, pm ? { from: pm.from, to: pm.to } : null, filters);
    } catch (e) {
      console.error('[payroll-mis] download', e);
      toast.error('Download failed', 'Please try again.');
    }
  };

  const doRebuild = async (m) => {
    setRebuilding(m.month_key);
    try {
      await rebuildSnapshot(m.run_id);
      toast.success(`Report figures rebuilt for ${monthLabel(m.month_key)}`);
      const fresh = await fetchLockedMonths();
      setMonths(fresh);
      setPeriod((p) => ({ ...p }));
    } catch (e) {
      toast.error('Rebuild failed', e.message);
    } finally {
      setRebuilding('');
    }
  };

  const setPeriodType = (type) => {
    const last = pm?.last || lockedKeys[lockedKeys.length - 1];
    if (!last) return;
    if (type === 'month') setPeriod({ type, month: last });
    if (type === 'range') setPeriod({ type, from: shiftMonth(last, -2), to: last });
    if (type === 'quarter') setPeriod({ type, fy: fyOf(last), quarter: quarterOf(last) });
    if (type === 'fy') setPeriod({ type, fy: fyOf(last) });
    if (type === 'ytd') setPeriod({ type, month: last });
  };

  const fyChoices = [...new Set(lockedKeys.map(fyOf))].sort((a, b) => b - a);
  const monthChoices = [...lockedKeys].reverse();
  const verticalChoices = [...new Set([...MIS_VERTICALS.map((v) => v.code), ...options.verticals])];

  return (
    <div className="space-y-3">
      <PageTaskHeader
        title="Payroll MIS reports"
        subtitle="Figures from locked salary months only. Each month keeps the vertical, department, grade and location employees had when it was locked."
      >
        {full ? (
          <div className="flex gap-1">
            {[['reports', 'Reports'], ['setup', 'Setup']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setView(id)}
                className={`h-8 px-3 rounded text-xs font-medium border ${view === id ? 'bg-accent text-white border-accent' : 'bg-white text-ink-secondary border-border'}`}>
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </PageTaskHeader>

      {view === 'setup' && full ? (
        <Suspense fallback={<div className="h-40 flex items-center justify-center text-xs text-ink-muted">Loading…</div>}>
          <MisSetup onChanged={loadBase} months={months} />
        </Suspense>
      ) : (
        <>
          <nav className="flex flex-wrap gap-0 border-b border-divider" aria-label="Reports">
            {REPORTS.filter((r) => full || r.id !== 'r7').map((r, i) => (
              <button key={r.id} type="button" onClick={() => setReport(r.id)}
                className={`h-9 px-3 text-[12px] font-medium border-b-2 -mb-px ${report === r.id ? 'border-accent text-accent' : 'border-transparent text-ink-secondary hover:text-ink'}`}>
                {i + 1}. {r.short}
              </button>
            ))}
          </nav>

          {report !== 'r7' ? (
            <FilterBar>
              <label className="text-[11px] text-ink-secondary">Period
                <TinySelect value={period?.type || 'month'} onChange={(e) => setPeriodType(e.target.value)} className="block mt-1">
                  {PERIOD_TYPES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </TinySelect>
              </label>
              {period && (period.type === 'month' || period.type === 'ytd') ? (
                <label className="text-[11px] text-ink-secondary">{period.type === 'ytd' ? 'Up to' : 'Month'}
                  <TinySelect value={period.month} onChange={(e) => setPeriod({ ...period, month: e.target.value })} className="block mt-1">
                    {monthChoices.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                  </TinySelect>
                </label>
              ) : null}
              {period?.type === 'range' ? (
                <>
                  <label className="text-[11px] text-ink-secondary">From
                    <TinySelect value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} className="block mt-1">
                      {monthChoices.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                    </TinySelect>
                  </label>
                  <label className="text-[11px] text-ink-secondary">To
                    <TinySelect value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} className="block mt-1">
                      {monthChoices.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                    </TinySelect>
                  </label>
                </>
              ) : null}
              {period && (period.type === 'quarter' || period.type === 'fy') ? (
                <label className="text-[11px] text-ink-secondary">Financial year
                  <TinySelect value={period.fy} onChange={(e) => setPeriod({ ...period, fy: Number(e.target.value) })} className="block mt-1">
                    {fyChoices.map((y) => <option key={y} value={y}>{`FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`}</option>)}
                  </TinySelect>
                </label>
              ) : null}
              {period?.type === 'quarter' ? (
                <label className="text-[11px] text-ink-secondary">Quarter
                  <TinySelect value={period.quarter} onChange={(e) => setPeriod({ ...period, quarter: Number(e.target.value) })} className="block mt-1">
                    {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{`Q${q}`}</option>)}
                  </TinySelect>
                </label>
              ) : null}
              {FILTER_FIELDS.map((f) => (
                <label key={f.key} className="text-[11px] text-ink-secondary">{f.label}
                  <TinySelect value={filters[f.key] || ''} onChange={(e) => setFilters((s) => ({ ...s, [f.key]: e.target.value || undefined }))} className="block mt-1 max-w-[160px]">
                    <option value="">All</option>
                    {(f.key === 'vertical' ? verticalChoices : options[f.option]).map((v) => (
                      <option key={v} value={v}>{f.key === 'vertical' ? verticalLabel(v) : v}</option>
                    ))}
                    {f.key === 'vertical' && !verticalChoices.includes(UNASSIGNED) ? <option value={UNASSIGNED}>Unassigned</option> : null}
                  </TinySelect>
                </label>
              ))}
              {(report === 'r4' || report === 'r5') && allocations.length ? (
                <label className="text-[11px] text-ink-secondary inline-flex items-center gap-1.5 h-8">
                  <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
                  Split shared staff by allocation %
                </label>
              ) : null}
              {anyFilter ? (
                <button type="button" className="h-8 text-[11px] text-accent hover:underline" onClick={() => setFilters({})}>Clear filters</button>
              ) : null}
            </FilterBar>
          ) : null}

          <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-surface px-3.5 py-2.5">
            <dl className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
              <dt className="text-ink-muted">Company</dt><dd className="text-ink font-medium">{header.company}</dd>
              <dt className="text-ink-muted">Report</dt><dd className="text-ink font-medium">{header.report}</dd>
              <dt className="text-ink-muted">Period</dt><dd className="text-ink">{header.period}</dd>
              <dt className="text-ink-muted">Filters</dt><dd className="text-ink">{header.filters}</dd>
              <dt className="text-ink-muted">Generated on</dt><dd className="text-ink">{header.generatedOn}</dd>
              <dt className="text-ink-muted">Generated by</dt><dd className="text-ink">{header.generatedBy}</dd>
            </dl>
            <div className="flex items-center gap-1.5">
              {[['xlsx', 'Excel'], ['pdf', 'PDF'], ['csv', 'CSV']].map(([fmt, label]) => (
                <button key={fmt} type="button" disabled={blocked || loading || (!built && report !== 'r7')} onClick={() => download(fmt)}
                  title={blocked ? 'Resolve the mismatch shown below before downloading' : `Download ${label}`}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded border border-border bg-white text-[11px] font-medium text-ink-secondary hover:text-ink disabled:opacity-40">
                  <Download className="h-3.5 w-3.5" />{label}
                </button>
              ))}
            </div>
          </div>

          {loadError ? <InlineAlert tone="error">{loadError}</InlineAlert> : null}
          {full && snapshotIssues.length && report !== 'r7' ? (
            <InlineAlert tone="warning">
              <div className="space-y-1">
                {snapshotIssues.map((m) => (
                  <div key={m.month_key} className="flex flex-wrap items-center gap-2">
                    <span>{`${monthLabel(m.month_key)}: report figures are incomplete (${m.snapshot_count} of ${m.line_count} employees).`}</span>
                    <button type="button" disabled={!!rebuilding} onClick={() => doRebuild(m)}
                      className="inline-flex items-center gap-1 text-accent font-semibold hover:underline disabled:opacity-50">
                      <RefreshCw className={`h-3 w-3 ${rebuilding === m.month_key ? 'animate-spin' : ''}`} />Rebuild
                    </button>
                  </div>
                ))}
              </div>
            </InlineAlert>
          ) : null}

          {!loading && !lockedKeys.length && report !== 'r7' ? (
            <InlineAlert tone="info">No locked salary month yet. Lock a processed month in Salary Processing to see these reports.</InlineAlert>
          ) : null}

          {loading && report !== 'r7' ? (
            <div className="h-48 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
          ) : null}

          {!loading && built && report === 'r1' ? (
            <Report1 r1={built.r1} labels={built.labels} currentRows={built.cur} trend={built.trend} onDrill={setDrill} tieOut={built.tieOut} />
          ) : null}
          {!loading && built && report === 'r2' ? (
            pm.previous.length ? <Report2 r2={built.r2} bars={built.bars} labels={built.r2Labels} onDrill={setDrill} />
              : <InlineAlert tone="info">There is no earlier locked month to compare with.</InlineAlert>
          ) : null}
          {!loading && built && report === 'r3' ? <Report3 r3={built.r3} labels={built.labels} currentRows={built.cur} onDrill={setDrill} /> : null}
          {!loading && built && report === 'r4' ? <Report4 r4={built.r4} labels={built.labels} currentRows={built.cur} onDrill={setDrill} split={split} /> : null}
          {!loading && built && report === 'r5' ? <Report5 r5={built.r5} labels={built.labels} currentRows={built.cur} onDrill={setDrill} split={split} /> : null}
          {!loading && built && report === 'r6' ? <Report6 r6={built.r6} employees={built.r6Employees} pf={built.pf} labels={built.labels} onDrill={setDrill} /> : null}
          {report === 'r7' && full ? <Report7 r7={r7} canEdit={full} onChanged={async () => setPayments(await fetchPayments())} /> : null}

          <CollapsibleHelp label="how these figures are worked out">
            <ul className="list-disc pl-4 space-y-1">
              <li>Employer cost = employer PF + ESI + LWF + gratuity + bonus + leave encashment provisions + group insurance. Total CTC = gross + employer cost.</li>
              <li>Employer amounts are the monthly CTC figures × paid days ÷ month days, saved when the month is locked.</li>
              <li>Headcount counts employees with paid days above zero. For a range, amounts are added up and headcount is the last month&apos;s.</li>
              <li>Previous = the same number of locked months just before the period.</li>
            </ul>
          </CollapsibleHelp>
        </>
      )}

      <Drawer open={!!drill} title={drill?.title || ''} onClose={() => setDrill(null)} widthClass="max-w-3xl">
        {drill ? (
          <div className="space-y-2">
            <p className="type-meta text-ink-muted">{drill.rows.length} employees</p>
            <DenseTable columns={drill.columns} rows={drill.rows} rowKey="_key" stickyHeader scrollMaxHeight="calc(100dvh - 10rem)" />
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
