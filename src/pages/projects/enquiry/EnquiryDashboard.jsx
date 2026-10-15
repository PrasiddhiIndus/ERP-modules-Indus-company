import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Filter,
  Loader2,
  RefreshCw,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { DateInput } from '../../../components/DateInput';
import { flattenEnquiryRow, getEnquiryFieldValue, projectsErrorMsg, projectsTable } from '../../../services/projectsApi';
import { normalizeToIsoDate } from '../../../utils/dateDisplay';
import { getRowStatusValue, STATUS_LEGEND } from './enquiryStatusStyles';
import { DUE_SOON_DAYS, dashboardBucket, startOfToday, toLocalDate } from './enquiryDeadlines';
import { useAuth } from '../../../contexts/AuthContext';
import { getOpenableProjectsEnquiryTabs } from '../../../config/roles';
import { useProjectsEnquiryDropdowns } from './useProjectsEnquiryDropdowns';
import { TOKENS } from '../../../theme/tokens';
import './enquiryDashboard.css';

const STATUS_CHART_COLORS = {
  'Not Started': TOKENS.warning,
  'Work in Progress': TOKENS.info,
  Completed: TOKENS.success,
  Regret: TOKENS.critical,
};
const OTHER_STATUS_COLOR = TOKENS.borderStrong;

const EMPTY_FILTERS = {
  search: '',
  status: '',
  assignee: '',
  priority: '',
  enquiryFrom: '',
  dateFrom: '',
  dateTo: '',
  month: '',
  year: '',
};

const ENQUIRY_DATABASE_PATH = '/app/projects/enquiry/enquiry-database';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_OPTIONS = MONTH_NAMES.map((label, i) => ({ value: String(i + 1).padStart(2, '0'), label }));

/** Longest month range the trend chart will draw before trimming to the most recent months. */
const MAX_TREND_MONTHS = 36;

const selectCls =
  'w-full min-h-[38px] py-2 px-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

const labelStyle = { fontSize: 11, fontWeight: 600, fill: 'var(--text-strong)' };

const CHART_ANIM = {
  isAnimationActive: true,
  animationDuration: 900,
  animationEasing: 'ease-out',
};

/** Maps free-typed statuses (case, spacing, "WIP") onto the standard status names. */
function canonicalStatus(value) {
  const raw = String(value ?? '').trim().replace(/\s+/g, ' ');
  const key = raw.toLowerCase();
  if (!key || key === 'not started') return 'Not Started';
  if (key === 'wip' || key === 'work in progress' || key === 'in progress') return 'Work in Progress';
  if (key === 'completed') return 'Completed';
  if (key === 'regret') return 'Regret';
  return raw;
}

function rowStatus(row) {
  return canonicalStatus(getRowStatusValue(row));
}

function receiptMonthKey(dateStr) {
  const iso = normalizeToIsoDate(dateStr);
  return iso ? iso.slice(0, 7) : null;
}

function rowMonthKey(row) {
  return receiptMonthKey(getEnquiryFieldValue(row, 'enquiry_receipt_date'));
}

function monthKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonthKey(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKeyOf(new Date(y, m - 1 + delta, 1));
}

function formatMonthKey(key, { long = false } = {}) {
  const [y, m] = key.split('-').map(Number);
  const name = MONTH_NAMES[m - 1] || '';
  return long ? `${name} ${y}` : `${name.slice(0, 3)} ${String(y).slice(2)}`;
}

function countByStatus(rows) {
  const map = new Map();
  for (const row of rows) {
    const status = rowStatus(row);
    if (!map.has(status)) map.set(status, []);
    map.get(status).push(row.id);
  }
  const ordered = STATUS_LEGEND.map(({ status }) => ({
    name: status,
    ids: map.get(status) || [],
    fill: STATUS_CHART_COLORS[status],
  }));
  for (const [name, ids] of map.entries()) {
    if (!STATUS_CHART_COLORS[name]) ordered.push({ name, ids, fill: OTHER_STATUS_COLOR });
  }
  return ordered.map((d) => ({ ...d, value: d.ids.length }));
}

/**
 * Month range for the trend chart: follows the date-range / year filter when set,
 * otherwise the last 12 calendar months. Months with no enquiries show as zero.
 */
function trendMonthRange(filters, monthKeys) {
  const fromKey = receiptMonthKey(filters.dateFrom);
  const toKey = receiptMonthKey(filters.dateTo);
  const sorted = [...monthKeys].sort();
  const currentKey = monthKeyOf(new Date());

  let start;
  let end;
  if (fromKey || toKey) {
    start = fromKey || sorted[0] || toKey;
    end = toKey || (sorted.length ? sorted[sorted.length - 1] : fromKey);
    if (!toKey && end < currentKey && start <= currentKey) end = currentKey;
  } else if (filters.year) {
    start = `${filters.year}-01`;
    end = `${filters.year}-12`;
  } else {
    end = sorted.length && sorted[sorted.length - 1] > currentKey ? sorted[sorted.length - 1] : currentKey;
    start = shiftMonthKey(end, -11);
  }
  if (start > end) [start, end] = [end, start];

  const keys = [];
  for (let k = start; k <= end; k = shiftMonthKey(k, 1)) keys.push(k);
  return keys.slice(-MAX_TREND_MONTHS);
}

function buildTrend(rows, filters) {
  const byMonth = new Map();
  let undated = 0;
  for (const row of rows) {
    const key = rowMonthKey(row);
    if (!key) {
      undated += 1;
      continue;
    }
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(row.id);
  }
  const keys = trendMonthRange(filters, byMonth.keys());
  const data = keys.map((key) => {
    const ids = byMonth.get(key) || [];
    return { key, name: formatMonthKey(key), fullName: formatMonthKey(key, { long: true }), count: ids.length, ids };
  });
  const inRange = data.reduce((s, d) => s + d.count, 0);
  const outsideRange = rows.length - undated - inRange;
  const peak = data.reduce((best, d) => (d.count > (best?.count ?? 0) ? d : best), null);
  return { data, undated, outsideRange, inRange, peak };
}

function matchesFilters(row, filters) {
  const q = filters.search.trim().toLowerCase();
  if (q) {
    const flat = flattenEnquiryRow(row);
    const hit = Object.values(flat).some((v) => v != null && String(v).toLowerCase().includes(q));
    if (!hit) return false;
  }

  if (filters.status && rowStatus(row) !== canonicalStatus(filters.status)) return false;

  if (filters.assignee) {
    const assignee = String(getEnquiryFieldValue(row, 'assigned_to_person') || '').trim();
    if (filters.assignee === '__unassigned__') {
      if (assignee) return false;
    } else if (assignee.toLowerCase() !== filters.assignee.toLowerCase()) {
      return false;
    }
  }

  if (filters.priority) {
    const priority = String(getEnquiryFieldValue(row, 'priority') || '').trim();
    if (filters.priority === '__unset__') {
      if (priority) return false;
    } else if (priority.toLowerCase() !== filters.priority.toLowerCase()) {
      return false;
    }
  }

  if (filters.enquiryFrom) {
    const source = String(getEnquiryFieldValue(row, 'enquiry_from') || '').trim();
    if (filters.enquiryFrom === '__unset__') {
      if (source) return false;
    } else if (source.toLowerCase() !== filters.enquiryFrom.toLowerCase()) {
      return false;
    }
  }

  const receipt = toLocalDate(getEnquiryFieldValue(row, 'enquiry_receipt_date'));
  if (filters.dateFrom) {
    const from = toLocalDate(filters.dateFrom);
    if (!receipt || !from || receipt < from) return false;
  }
  if (filters.dateTo) {
    const to = toLocalDate(filters.dateTo);
    if (!receipt || !to || receipt > to) return false;
  }

  if (filters.month || filters.year) {
    const key = rowMonthKey(row);
    if (!key) return false;
    if (filters.year && key.slice(0, 4) !== filters.year) return false;
    if (filters.month && key.slice(5, 7) !== filters.month) return false;
  }

  return true;
}

function activeFilterCount(filters) {
  return Object.entries(filters).filter(([, v]) => String(v || '').trim() !== '').length;
}

function pct(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

function renderActivePieShape(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={outerRadius + 8}
        outerRadius={outerRadius + 11}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.35}
      />
    </g>
  );
}

function ChartCard({ title, subtitle, action, children, className = '' }) {
  return (
    <div className={`enquiry-chart-card bg-white rounded-xl border border-gray-200 flex flex-col ${className}`}>
      <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-4 flex-1">{children}</div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, tone = 'blue', onClick }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    sky: 'bg-sky-50 text-sky-700 border-sky-100',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-100',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!value || !onClick}
      title={value && onClick ? `Open these ${value} enquiries in the Enquiry Database` : undefined}
      className={`enquiry-kpi-3d w-full h-full flex flex-col text-left rounded-xl border p-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-default ${
        value && onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''
      } ${tones[tone] || tones.blue}`}
    >
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/70 shrink-0">
        <Icon className="w-4 h-4" />
      </span>
      <p className="mt-2 min-h-[2rem] text-[11px] font-semibold uppercase tracking-wide opacity-80 leading-4 line-clamp-2">
        {label}
      </p>
      <p className="text-2xl font-bold tabular-nums leading-tight enquiry-kpi-value-pop">{value}</p>
      <p className="mt-1 min-h-[2rem] text-[11px] leading-4 opacity-75 line-clamp-2">{sub || '\u00a0'}</p>
    </button>
  );
}

function StatusTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-gray-900">{row.name}</p>
      <p className="text-gray-600 mt-0.5">
        {row.value} enquiries · {pct(row.value, total)}%
      </p>
    </div>
  );
}

function TrendTooltip({ active, payload, clickable }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-gray-900">{row.fullName}</p>
      <p className="text-gray-600 mt-0.5">
        {row.count} {row.count === 1 ? 'enquiry' : 'enquiries'} received
      </p>
      {clickable && row.count > 0 && <p className="text-blue-600 mt-1">Click to open in Enquiry Database</p>}
    </div>
  );
}

export default function EnquiryDashboard() {
  const navigate = useNavigate();
  const { userProfile, accessibleModules, subModulePaths } = useAuth();
  const canOpenDatabase = getOpenableProjectsEnquiryTabs(userProfile, accessibleModules, subModulePaths).includes(
    'enquiry-database'
  );
  const { valuesForKindKey } = useProjectsEnquiryDropdowns();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const statusOptions = valuesForKindKey('current_status');
  const assigneeOptions = valuesForKindKey('assigned_to_person');
  const priorityOptions = valuesForKindKey('priority');
  const sourceOptions = valuesForKindKey('enquiry_from');

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

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesFilters(row, filters)),
    [rows, filters]
  );

  const filterCount = activeFilterCount(filters);

  const yearOptions = useMemo(() => {
    const years = new Set([String(new Date().getFullYear())]);
    for (const row of rows) {
      const key = rowMonthKey(row);
      if (key) years.add(key.slice(0, 4));
    }
    return [...years].sort((a, b) => b.localeCompare(a));
  }, [rows]);

  const kpiIds = useMemo(() => {
    const today = startOfToday();
    const ids = {
      total: [],
      notStarted: [],
      wip: [],
      completed: [],
      regret: [],
      unassigned: [],
      overdue: [],
      dueSoon: [],
      completedLate: [],
    };

    for (const row of filteredRows) {
      ids.total.push(row.id);
      ids[dashboardBucket(row, today)].push(row.id);
    }

    return ids;
  }, [filteredRows]);

  const stats = useMemo(
    () => Object.fromEntries(Object.entries(kpiIds).map(([key, list]) => [key, list.length])),
    [kpiIds]
  );

  const openIds = (ids, label) => {
    if (!canOpenDatabase || !ids?.length) return;
    navigate(ENQUIRY_DATABASE_PATH, { state: { dashboardView: { label, ids } } });
  };

  const openHandler = (key, label) => (canOpenDatabase ? () => openIds(kpiIds[key], label) : undefined);

  const statusData = useMemo(() => countByStatus(filteredRows), [filteredRows]);
  const statusPieData = useMemo(() => statusData.filter((d) => d.value > 0), [statusData]);
  const statusTotal = filteredRows.length;
  const openCount = useMemo(
    () => statusData.filter((d) => d.name !== 'Completed' && d.name !== 'Regret').reduce((s, d) => s + d.value, 0),
    [statusData]
  );

  const trend = useMemo(() => buildTrend(filteredRows, filters), [filteredRows, filters]);

  const trendSubtitle = useMemo(() => {
    if (filters.dateFrom || filters.dateTo) return 'Monthly count by enquiry receipt date, for the selected date range';
    if (filters.year) return `Monthly count by enquiry receipt date, ${filters.year}`;
    return 'Monthly count by enquiry receipt date, last 12 months';
  }, [filters.dateFrom, filters.dateTo, filters.year]);

  const trendNotes = [
    trend.undated > 0 && `${trend.undated} without a receipt date`,
    trend.outsideRange > 0 && `${trend.outsideRange} received outside this period`,
  ].filter(Boolean);

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const clearFilters = () => setFilters(EMPTY_FILTERS);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading dashboard…
      </div>
    );
  }

  return (
    <div className="enquiry-analytics p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Enquiry Analytics
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Where enquiries stand today and how many arrive each month.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchRows}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">Filters</h3>
            {filterCount > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {filterCount} active
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <span>
              Showing <strong className="text-gray-900">{filteredRows.length}</strong> of{' '}
              <strong className="text-gray-900">{rows.length}</strong> enquiries
            </span>
            {filterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100 font-medium"
              >
                <X className="w-3 h-3" />
                Clear all
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          <label className="block xl:col-span-2">
            <span className="text-xs font-medium text-gray-600 mb-1 block">Search</span>
            <input
              type="search"
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
              placeholder="Client, location, scope…"
              className={selectCls}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 mb-1 block">Month</span>
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
            <span className="text-xs font-medium text-gray-600 mb-1 block">Receipt from</span>
            <DateInput
              value={filters.dateFrom}
              onChange={(v) => setFilter('dateFrom', v)}
              className={selectCls}
              placeholder="dd/mm/yyyy"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 mb-1 block">Receipt to</span>
            <DateInput
              value={filters.dateTo}
              onChange={(v) => setFilter('dateTo', v)}
              className={selectCls}
              placeholder="dd/mm/yyyy"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 mb-1 block">Current status</span>
            <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} className={selectCls}>
              <option value="">All status</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 mb-1 block">Assigned to</span>
            <select value={filters.assignee} onChange={(e) => setFilter('assignee', e.target.value)} className={selectCls}>
              <option value="">All assignees</option>
              <option value="__unassigned__">Unassigned</option>
              {assigneeOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 mb-1 block">Priority</span>
            <select value={filters.priority} onChange={(e) => setFilter('priority', e.target.value)} className={selectCls}>
              <option value="">All priorities</option>
              <option value="__unset__">Not set</option>
              {priorityOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 mb-1 block">Enquiry from</span>
            <select value={filters.enquiryFrom} onChange={(e) => setFilter('enquiryFrom', e.target.value)} className={selectCls}>
              <option value="">All sources</option>
              <option value="__unset__">Not specified</option>
              {sourceOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-3">
        <KpiCard icon={ClipboardList} label="Total" value={stats.total} sub="Sum of all boxes" tone="blue" onClick={openHandler('total', 'Total')} />
        <KpiCard icon={Users} label="Not Started" value={stats.notStarted} sub="Assigned, not yet due" tone="amber" onClick={openHandler('notStarted', 'Not Started')} />
        <KpiCard icon={UserCheck} label="In Progress" value={stats.wip} sub="Assigned, not yet due" tone="sky" onClick={openHandler('wip', 'In Progress')} />
        <KpiCard icon={CheckCircle2} label="Completed" value={stats.completed} sub="On or before target date" tone="green" onClick={openHandler('completed', 'Completed')} />
        <KpiCard icon={AlertTriangle} label="Regret" value={stats.regret} tone="red" onClick={openHandler('regret', 'Regret')} />
        <KpiCard icon={Users} label="Unassigned" value={stats.unassigned} sub="Open, no assignee, not yet due" tone="slate" onClick={openHandler('unassigned', 'Unassigned')} />
        <KpiCard icon={AlertTriangle} label="Overdue" value={stats.overdue} sub="Open, past target date" tone="red" onClick={openHandler('overdue', 'Overdue')} />
        <KpiCard
          icon={AlertTriangle}
          label={`Due in ${DUE_SOON_DAYS} days`}
          value={stats.dueSoon}
          sub="Open, close to target date"
          tone="amber"
          onClick={openHandler('dueSoon', `Due in ${DUE_SOON_DAYS} days`)}
        />
        <KpiCard
          icon={CalendarClock}
          label="Overdue & Completed"
          value={stats.completedLate}
          sub="Completed after target date"
          tone="slate"
          onClick={openHandler('completedLate', 'Overdue & Completed')}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-4">
        <ChartCard
          title="Current Status"
          subtitle={canOpenDatabase ? 'Share of filtered enquiries by status — click a status to open those enquiries' : 'Share of filtered enquiries by status'}
        >
          {statusTotal ? (
            <div className="flex flex-col sm:flex-row items-center gap-4 h-full">
              <div className="relative w-full sm:w-1/2 h-[260px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="58%"
                      outerRadius="82%"
                      paddingAngle={statusPieData.length > 1 ? 2 : 0}
                      stroke="var(--surface)"
                      strokeWidth={2}
                      activeShape={renderActivePieShape}
                      onClick={(entry) => openIds(entry?.payload?.ids ?? entry?.ids, entry?.name)}
                      style={{ cursor: canOpenDatabase ? 'pointer' : 'default' }}
                      {...CHART_ANIM}
                    >
                      {statusPieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<StatusTooltip total={statusTotal} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-gray-900 tabular-nums leading-none">{statusTotal}</span>
                  <span className="text-[11px] uppercase tracking-wide text-gray-500 mt-1">Enquiries</span>
                </div>
              </div>

              <ul className="w-full sm:w-1/2 space-y-1.5">
                {statusData.map((d) => {
                  const share = pct(d.value, statusTotal);
                  const clickable = canOpenDatabase && d.value > 0;
                  return (
                    <li key={d.name}>
                      <button
                        type="button"
                        disabled={!clickable}
                        onClick={() => openIds(d.ids, d.name)}
                        className={`w-full rounded-lg px-2.5 py-2 text-left transition-colors ${
                          clickable ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
                        } ${d.value ? '' : 'opacity-60'}`}
                      >
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
                            <span className="text-gray-800 truncate">{d.name}</span>
                          </span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            <span className="font-semibold text-gray-900 tabular-nums">{d.value}</span>
                            <span className="text-xs text-gray-500 tabular-nums w-9 text-right">{share}%</span>
                            {clickable && <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-[width] duration-700 ease-out"
                            style={{ width: `${share}%`, backgroundColor: d.fill }}
                          />
                        </div>
                      </button>
                    </li>
                  );
                })}
                <li className="pt-2 mt-1 border-t border-gray-100 flex items-center justify-between px-2.5 text-xs text-gray-500">
                  <span>Open (not completed or regret)</span>
                  <span className="font-semibold text-gray-700 tabular-nums">{openCount}</span>
                </li>
              </ul>
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-16 text-center">No enquiries match the current filters.</p>
          )}
        </ChartCard>

        <ChartCard
          title="Enquiries Over Time"
          subtitle={trendSubtitle}
          action={
            trend.inRange > 0 ? (
              <div className="text-right shrink-0">
                <p className="text-lg font-bold text-gray-900 tabular-nums leading-none">{trend.inRange}</p>
                <p className="text-[11px] text-gray-500 mt-1">
                  {trend.peak ? `Peak: ${trend.peak.fullName} (${trend.peak.count})` : 'in this period'}
                </p>
              </div>
            ) : null
          }
        >
          {trend.data.length && trend.inRange > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={trend.data} margin={{ top: 20, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="enqTrendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--info)" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="var(--info)" stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={TOKENS.chartGrid} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: TOKENS.chartAxis }}
                    tickLine={false}
                    axisLine={{ stroke: TOKENS.chartGrid }}
                    interval={trend.data.length > 18 ? 'preserveStartEnd' : 0}
                    minTickGap={4}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: TOKENS.chartAxis }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }} content={<TrendTooltip clickable={canOpenDatabase} />} />
                  <Bar
                    dataKey="count"
                    fill="url(#enqTrendGrad)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={44}
                    onClick={(entry) => {
                      const d = entry?.payload ?? entry;
                      openIds(d?.ids, `Received ${d?.fullName}`);
                    }}
                    style={{ cursor: canOpenDatabase ? 'pointer' : 'default' }}
                    {...CHART_ANIM}
                  >
                    <LabelList dataKey="count" position="top" style={labelStyle} formatter={(v) => (v ? v : '')} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {trendNotes.length > 0 && (
                <p className="text-xs text-gray-500 mt-2">Not shown: {trendNotes.join(' · ')}.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500 py-16 text-center">
              {trend.undated > 0
                ? `No receipt dates in this period (${trend.undated} enquiries have no receipt date).`
                : 'No enquiries received in this period.'}
            </p>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
