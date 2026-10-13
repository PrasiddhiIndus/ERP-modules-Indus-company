import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CheckCircle2, Inbox, Loader2, RefreshCw, Timer, Trophy, X } from 'lucide-react';
import { projectsErrorMsg, projectsTable } from '../../../services/projectsApi';
import { buildAssigneeKpis, getAssignedStartDate, getAssigneeName } from './enquiryKpiMetrics';
import { useAuth } from '../../../contexts/AuthContext';
import { getOpenableProjectsEnquiryTabs } from '../../../config/roles';

const ENQUIRY_DATABASE_PATH = '/app/projects/enquiry/enquiry-database';

const MONTH_OPTIONS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
].map((label, i) => ({ value: String(i), label }));

const EMPTY_FILTERS = { month: '', year: '', person: '' };

const selectCls =
  'w-full min-h-[38px] py-2 px-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

function formatDays(value) {
  if (value == null) return '—';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} day${rounded === 1 ? '' : 's'}`;
}

function formatPct(value) {
  return value == null ? '—' : `${Math.round(value * 100)}%`;
}

function Tile({ icon: Icon, label, value, sub, tone, onClick }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    sky: 'bg-sky-50 text-sky-700 border-sky-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
  };
  const clickable = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`w-full text-left rounded-xl border p-4 transition disabled:cursor-default ${
        clickable ? 'hover:shadow-md hover:-translate-y-0.5' : ''
      } ${tones[tone] || tones.blue}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide opacity-80 leading-tight">{label}</p>
          <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
          {sub && <p className="text-xs mt-1 opacity-75">{sub}</p>}
        </div>
        <div className="p-2 rounded-lg bg-white/70 shrink-0">
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </button>
  );
}

function CountCell({ count, onOpen, tone = 'text-gray-900' }) {
  if (!count) return <span className="text-gray-400">0</span>;
  if (!onOpen) return <span className={`font-semibold tabular-nums ${tone}`}>{count}</span>;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`font-semibold tabular-nums underline-offset-2 hover:underline ${tone}`}
      title="Open these enquiries in the Enquiry Database"
    >
      {count}
    </button>
  );
}

export default function EnquiryKpi() {
  const navigate = useNavigate();
  const { userProfile, accessibleModules, subModulePaths } = useAuth();
  const canOpenDatabase = getOpenableProjectsEnquiryTabs(userProfile, accessibleModules, subModulePaths).includes(
    'enquiry-database'
  );
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: e } = await projectsTable('enquiries')
        .select('id, serial_number, data, created_at, updated_at')
        .order('serial_number', { ascending: false });
      if (e) throw e;
      setRows(data || []);
    } catch (err) {
      setError(projectsErrorMsg(err, 'Load enquiries'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const yearOptions = useMemo(() => {
    const years = new Set([String(new Date().getFullYear())]);
    for (const row of rows) {
      const d = getAssignedStartDate(row);
      if (d) years.add(String(d.getFullYear()));
    }
    return [...years].sort((a, b) => b.localeCompare(a));
  }, [rows]);

  const personOptions = useMemo(
    () => [...new Set(rows.map(getAssigneeName))].sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (filters.person && getAssigneeName(row) !== filters.person) return false;
        if (filters.month || filters.year) {
          const d = getAssignedStartDate(row);
          if (!d) return false;
          if (filters.year && String(d.getFullYear()) !== filters.year) return false;
          if (filters.month && String(d.getMonth()) !== filters.month) return false;
        }
        return true;
      }),
    [rows, filters]
  );

  const { people, total } = useMemo(() => buildAssigneeKpis(filteredRows), [filteredRows]);

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const hasFilters = Object.values(filters).some(Boolean);

  const openInDatabase = (ids, label) => {
    if (!ids?.length) return;
    navigate(ENQUIRY_DATABASE_PATH, { state: { dashboardView: { label, ids } } });
  };

  const opener = (ids, label) => (canOpenDatabase && ids?.length ? () => openInDatabase(ids, label) : undefined);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading KPI…
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-blue-600" />
            Enquiry KPI by Person
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Enquiries received, time taken to complete, and overdue work for each assigned person.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchRows}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-end">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 mb-1 block">Assigned month</span>
            <select value={filters.month} onChange={(e) => setFilter('month', e.target.value)} className={selectCls}>
              <option value="">All months</option>
              {MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 mb-1 block">Year</span>
            <select value={filters.year} onChange={(e) => setFilter('year', e.target.value)} className={selectCls}>
              <option value="">All years</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 mb-1 block">Assigned to</span>
            <select value={filters.person} onChange={(e) => setFilter('person', e.target.value)} className={selectCls}>
              <option value="">All people</option>
              {personOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2 text-xs text-gray-600 lg:justify-end">
            <span>
              <strong className="text-gray-900">{filteredRows.length}</strong> of{' '}
              <strong className="text-gray-900">{rows.length}</strong> enquiries
            </span>
            {hasFilters && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100 font-medium"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Tile icon={Inbox} label="Received" value={total.received} tone="blue"
          onClick={opener(total.ids.received, 'Received')} />
        <Tile icon={CheckCircle2} label="Completed" value={total.completed} tone="green"
          onClick={opener(total.ids.completed, 'Completed')} />
        <Tile icon={Timer} label="Avg days to complete" value={formatDays(total.avgDaysToComplete)}
          sub="Assigned on → completed" tone="sky" />
        <Tile icon={AlertTriangle} label="Overdue" value={total.overdue} sub="Open, past target date" tone="red"
          onClick={opener(total.ids.overdue, 'Overdue')} />
        <Tile icon={CalendarClock} label="Overdue but completed" value={total.completedLate}
          sub="Completed after target date" tone="slate"
          onClick={opener(total.ids.completedLate, 'Overdue but completed')} />
        <Tile icon={Trophy} label="On-time completion" value={formatPct(total.onTimeRate)}
          sub="Completed by target date" tone="green" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">By assigned person</h3>
          {canOpenDatabase && (
            <p className="text-xs text-gray-500 mt-0.5">Click a number to open those enquiries.</p>
          )}
        </div>
        {people.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-500">No enquiries match the current filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-info-soft">
                <tr className="text-xs uppercase tracking-wide text-gray-700">
                  <th className="px-4 py-2.5 text-left font-semibold">Assigned to</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Received</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Completed</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Avg days to complete</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Overdue</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Overdue but completed</th>
                  <th className="px-4 py-2.5 text-right font-semibold">On-time %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {people.map((p) => (
                  <tr key={p.name} className="hover:bg-gray-50">
                    <td className={`px-4 py-2.5 font-medium ${p.name === 'Unassigned' ? 'text-gray-500 italic' : 'text-gray-900'}`}>
                      {p.name}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <CountCell count={p.received} onOpen={opener(p.ids.received, `${p.name} — received`)} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <CountCell count={p.completed} tone="text-emerald-700"
                        onOpen={opener(p.ids.completed, `${p.name} — completed`)} />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-800">{formatDays(p.avgDaysToComplete)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <CountCell count={p.overdue} tone="text-red-700"
                        onOpen={opener(p.ids.overdue, `${p.name} — overdue`)} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <CountCell count={p.completedLate} tone="text-amber-700"
                        onOpen={opener(p.ids.completedLate, `${p.name} — overdue but completed`)} />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <span
                        className={
                          p.onTimeRate == null
                            ? 'text-gray-400'
                            : p.onTimeRate >= 0.8
                              ? 'text-emerald-700 font-semibold'
                              : p.onTimeRate >= 0.5
                                ? 'text-amber-700 font-semibold'
                                : 'text-red-700 font-semibold'
                        }
                      >
                        {formatPct(p.onTimeRate)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200 font-semibold">
                <tr>
                  <td className="px-4 py-2.5 text-gray-900">Total</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{total.received}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{total.completed}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatDays(total.avgDaysToComplete)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{total.overdue}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{total.completedLate}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatPct(total.onTimeRate)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Days to complete are counted from the assigned on date (or the receipt date if it is blank) to the completed date.
        Enquiries without a completed date are left out of the average.
      </p>
    </div>
  );
}
