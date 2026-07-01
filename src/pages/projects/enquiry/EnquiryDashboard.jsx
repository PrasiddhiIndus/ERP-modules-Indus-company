import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
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
  CheckCircle2,
  ClipboardList,
  Filter,
  Loader2,
  RefreshCw,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { DateInput } from '../../../components/DateInput';
import { flattenEnquiryRow, getEnquiryFieldValue, projectsTable } from '../../../services/projectsApi';
import { formatDateDdMmYyyy, normalizeToIsoDate } from '../../../utils/dateDisplay';
import { getRowStatusValue, STATUS_LEGEND } from './enquiryStatusStyles';
import { useProjectsEnquiryDropdowns } from './useProjectsEnquiryDropdowns';
import './enquiryDashboard.css';

const STATUS_CHART_COLORS = {
  'Not Started': '#fbbf24',
  'Work in Progress': '#38bdf8',
  Completed: '#34d399',
  Regret: '#f87171',
  Unassigned: '#94a3b8',
  Unknown: '#cbd5e1',
};

const PRIORITY_COLORS = {
  'High (>80%)': '#ef4444',
  'Medium (>50%)': '#f59e0b',
  'Low (<50%)': '#22c55e',
  Unknown: '#94a3b8',
};

const CHART_PALETTE = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#6366f1', '#eab308'];

const EMPTY_FILTERS = {
  search: '',
  status: '',
  assignee: '',
  priority: '',
  enquiryFrom: '',
  dateFrom: '',
  dateTo: '',
};

const selectCls =
  'w-full min-h-[38px] py-2 px-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

const labelStyle = { fontSize: 11, fontWeight: 600, fill: '#374151' };

const CHART_ANIM = {
  isAnimationActive: true,
  animationDuration: 1400,
  animationEasing: 'ease-out',
};

function ChartDefs() {
  return (
    <defs>
      <linearGradient id="enqBarGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#60a5fa" />
        <stop offset="100%" stopColor="#1d4ed8" />
      </linearGradient>
      <linearGradient id="enqLineGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.45} />
        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
      </linearGradient>
      <filter id="enqPieGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#3b82f6" floodOpacity="0.35" />
      </filter>
      <filter id="enqBarShadow" x="-10%" y="-10%" width="130%" height="140%">
        <feDropShadow dx="2" dy="5" stdDeviation="4" floodColor="#1e40af" floodOpacity="0.28" />
      </filter>
    </defs>
  );
}

function receiptMonthKey(dateStr) {
  const iso = normalizeToIsoDate(dateStr);
  if (iso) return iso.slice(0, 7);
  return null;
}

function countBy(rows, fieldKey, emptyLabel = 'Unassigned') {
  const map = new Map();
  for (const row of rows) {
    const raw = getEnquiryFieldValue(row, fieldKey);
    const label = raw == null || String(raw).trim() === '' ? emptyLabel : String(raw).trim();
    map.set(label, (map.get(label) || 0) + 1);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function countByStatus(rows) {
  const map = new Map();
  for (const row of rows) {
    const status = String(getRowStatusValue(row) || 'Not Started').trim() || 'Not Started';
    map.set(status, (map.get(status) || 0) + 1);
  }
  const ordered = STATUS_LEGEND.map(({ status }) => ({
    name: status,
    value: map.get(status) || 0,
    fill: STATUS_CHART_COLORS[status] || STATUS_CHART_COLORS.Unknown,
  }));
  for (const [name, value] of map.entries()) {
    if (!STATUS_LEGEND.some((s) => s.status === name)) {
      ordered.push({ name, value, fill: STATUS_CHART_COLORS.Unknown });
    }
  }
  return ordered.filter((d) => d.value > 0);
}

function countByMonth(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = receiptMonthKey(getEnquiryFieldValue(row, 'enquiry_receipt_date'));
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([key, count]) => ({
      name: formatDateDdMmYyyy(`${key}-01`),
      count,
      key,
    }));
}

function toLocalDate(value) {
  const iso = normalizeToIsoDate(value);
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d));
}

function isClosedStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === 'completed' || s === 'regret';
}

function matchesFilters(row, filters) {
  const q = filters.search.trim().toLowerCase();
  if (q) {
    const flat = flattenEnquiryRow(row);
    const hit = Object.values(flat).some((v) => v != null && String(v).toLowerCase().includes(q));
    if (!hit) return false;
  }

  if (filters.status) {
    const status = String(getRowStatusValue(row) || 'Not Started').trim() || 'Not Started';
    if (status.toLowerCase() !== filters.status.toLowerCase()) return false;
  }

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

  return true;
}

function activeFilterCount(filters) {
  return Object.entries(filters).filter(([, v]) => String(v || '').trim() !== '').length;
}

function renderPieLabel({ value, percent }) {
  if (!value) return null;
  return `${value} (${Math.round(percent * 100)}%)`;
}

function renderActivePieShape(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g filter="url(#enqPieGlow)">
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={outerRadius + 12}
        outerRadius={outerRadius + 14}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.35}
      />
    </g>
  );
}

function ChartCard({ title, subtitle, children, className = '' }) {
  return (
    <div className={`enquiry-chart-card bg-white rounded-xl border border-gray-200 ${className}`}>
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-4 enquiry-chart-stage">
        <div className="enquiry-chart-3d">{children}</div>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, tone = 'blue' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    sky: 'bg-sky-50 text-sky-700 border-sky-100',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-100',
  };
  return (
    <div className={`enquiry-kpi-3d rounded-xl border p-4 ${tones[tone] || tones.blue}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</p>
          <p className="text-2xl font-bold tabular-nums mt-1 enquiry-kpi-value-pop">{value}</p>
          {sub && <p className="text-xs mt-1 opacity-75">{sub}</p>}
        </div>
        <div className="p-2 rounded-lg bg-white/70">
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, labelKey = 'name', valueKey = 'value', total }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  const val = payload[0]?.value ?? row[valueKey];
  const pct = total && val ? Math.round((val / total) * 100) : null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-gray-900">{row[labelKey] ?? payload[0]?.name}</p>
      <p className="text-gray-600 mt-0.5">
        {val} enquiries{pct != null ? ` · ${pct}%` : ''}
      </p>
    </div>
  );
}

export default function EnquiryDashboard() {
  const { valuesForKindKey } = useProjectsEnquiryDropdowns();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [activeStatusPie, setActiveStatusPie] = useState(null);
  const [activePriorityPie, setActivePriorityPie] = useState(null);

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
      setError(err?.message || 'Failed to load enquiry data.');
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

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let notStarted = 0;
    let wip = 0;
    let completed = 0;
    let regret = 0;
    let unassigned = 0;
    let overdue = 0;
    let dueSoon = 0;

    for (const row of filteredRows) {
      const status = String(getRowStatusValue(row) || 'Not Started').trim() || 'Not Started';
      const statusKey = status.toLowerCase();
      if (statusKey === 'not started') notStarted += 1;
      else if (statusKey === 'work in progress') wip += 1;
      else if (statusKey === 'completed') completed += 1;
      else if (statusKey === 'regret') regret += 1;

      const assignee = getEnquiryFieldValue(row, 'assigned_to_person');
      if (assignee == null || String(assignee).trim() === '') unassigned += 1;

      if (!isClosedStatus(status)) {
        const target = toLocalDate(getEnquiryFieldValue(row, 'target_date'));
        if (target) {
          if (target < today) overdue += 1;
          else {
            const diffDays = Math.ceil((target - today) / (24 * 60 * 60 * 1000));
            if (diffDays <= 7) dueSoon += 1;
          }
        }
      }
    }

    return {
      total: filteredRows.length,
      notStarted,
      wip,
      completed,
      regret,
      unassigned,
      overdue,
      dueSoon,
    };
  }, [filteredRows]);

  const statusData = useMemo(() => countByStatus(filteredRows), [filteredRows]);
  const assigneeData = useMemo(() => countBy(filteredRows, 'assigned_to_person'), [filteredRows]);
  const priorityData = useMemo(() => {
    return countBy(filteredRows, 'priority', 'Not set').map((d) => ({
      ...d,
      fill: PRIORITY_COLORS[d.name] || PRIORITY_COLORS.Unknown,
    }));
  }, [filteredRows]);
  const sourceData = useMemo(() => countBy(filteredRows, 'enquiry_from', 'Not specified'), [filteredRows]);
  const trendData = useMemo(() => countByMonth(filteredRows), [filteredRows]);

  const statusTotal = useMemo(() => statusData.reduce((s, d) => s + d.value, 0), [statusData]);
  const priorityTotal = useMemo(() => priorityData.reduce((s, d) => s + d.value, 0), [priorityData]);

  const attentionRows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return filteredRows
      .filter((row) => {
        const status = getRowStatusValue(row);
        if (isClosedStatus(status)) return false;
        const target = toLocalDate(getEnquiryFieldValue(row, 'target_date'));
        return target && target <= today;
      })
      .slice(0, 8)
      .map((row) => ({
        id: row.id,
        serial: row.serial_number,
        client: getEnquiryFieldValue(row, 'client_name') || '—',
        assignee: getEnquiryFieldValue(row, 'assigned_to_person') || 'Unassigned',
        target: getEnquiryFieldValue(row, 'target_date'),
        status: getRowStatusValue(row) || 'Not Started',
      }));
  }, [filteredRows]);

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
            Charts and summaries from the enquiry register — status, assignment, priority, and sources.
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
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
              <option value="">All statuses</option>
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

      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        <KpiCard icon={ClipboardList} label="Total" value={stats.total} tone="blue" />
        <KpiCard icon={Users} label="Not Started" value={stats.notStarted} tone="amber" />
        <KpiCard icon={UserCheck} label="In Progress" value={stats.wip} tone="sky" />
        <KpiCard icon={CheckCircle2} label="Completed" value={stats.completed} tone="green" />
        <KpiCard icon={AlertTriangle} label="Regret" value={stats.regret} tone="red" />
        <KpiCard icon={Users} label="Unassigned" value={stats.unassigned} sub="No assignee set" tone="slate" />
        <KpiCard icon={AlertTriangle} label="Overdue" value={stats.overdue} sub="Past target date" tone="red" />
        <KpiCard icon={AlertTriangle} label="Due in 7 days" value={stats.dueSoon} sub="Open enquiries" tone="amber" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="Current Status" subtitle="Count and share of filtered enquiries by status">
          {statusData.length ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <ChartDefs />
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={90}
                  paddingAngle={3}
                  label={renderPieLabel}
                  labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                  activeIndex={activeStatusPie}
                  activeShape={renderActivePieShape}
                  onMouseEnter={(_, i) => setActiveStatusPie(i)}
                  onMouseLeave={() => setActiveStatusPie(null)}
                  {...CHART_ANIM}
                >
                  {statusData.map((entry, i) => (
                    <Cell
                      key={entry.name}
                      fill={entry.fill}
                      stroke="#fff"
                      strokeWidth={2}
                      style={{ filter: 'url(#enqBarShadow)', animationDelay: `${i * 80}ms` }}
                    />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip total={statusTotal} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-500 py-16 text-center">No enquiries match the current filters.</p>
          )}
        </ChartCard>

        <ChartCard title="Assigned to Person" subtitle="Workload by team member (filtered)">
          {assigneeData.length ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={assigneeData} layout="vertical" margin={{ left: 8, right: 28 }}>
                <ChartDefs />
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTooltip valueKey="value" total={stats.total} />} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} {...CHART_ANIM}>
                  {assigneeData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={CHART_PALETTE[i % CHART_PALETTE.length]}
                      style={{ filter: 'url(#enqBarShadow)' }}
                    />
                  ))}
                  <LabelList dataKey="value" position="right" style={labelStyle} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-500 py-16 text-center">No assignment data for current filters.</p>
          )}
        </ChartCard>

        <ChartCard title="Priority" subtitle="High / medium / low split with counts">
          {priorityData.length ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <ChartDefs />
                <Pie
                  data={priorityData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={92}
                  paddingAngle={3}
                  label={renderPieLabel}
                  labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                  activeIndex={activePriorityPie}
                  activeShape={renderActivePieShape}
                  onMouseEnter={(_, i) => setActivePriorityPie(i)}
                  onMouseLeave={() => setActivePriorityPie(null)}
                  {...CHART_ANIM}
                >
                  {priorityData.map((entry, i) => (
                    <Cell
                      key={entry.name}
                      fill={entry.fill}
                      stroke="#fff"
                      strokeWidth={2}
                      style={{ filter: 'url(#enqBarShadow)', animationDelay: `${i * 90}ms` }}
                    />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip total={priorityTotal} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-500 py-16 text-center">No priority data for current filters.</p>
          )}
        </ChartCard>

        <ChartCard title="Enquiry From" subtitle="Source of enquiries (top 10)">
          {sourceData.length ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sourceData.slice(0, 10)} margin={{ bottom: 48, top: 16 }}>
                <ChartDefs />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  angle={-30}
                  textAnchor="end"
                  interval={0}
                  height={70}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTooltip valueKey="value" total={stats.total} />} />
                <Bar dataKey="value" fill="url(#enqBarGrad)" radius={[6, 6, 0, 0]} style={{ filter: 'url(#enqBarShadow)' }} {...CHART_ANIM}>
                  <LabelList dataKey="value" position="top" style={labelStyle} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-500 py-16 text-center">No source data for current filters.</p>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_.9fr] gap-4">
        <ChartCard title="Enquiries Over Time" subtitle="Monthly count by enquiry receipt date (filtered, last 12 months)">
          {trendData.length ? (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={trendData} margin={{ top: 20, right: 12 }}>
                <ChartDefs />
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs">
                        <p className="font-semibold text-gray-900">{payload[0].payload.name}</p>
                        <p className="text-gray-600 mt-0.5">{payload[0].value} enquiries</p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  fill="url(#enqLineGrad)"
                  stroke="none"
                  {...CHART_ANIM}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#2563eb"
                  strokeWidth={3}
                  dot={{ r: 5, strokeWidth: 2, fill: '#fff' }}
                  activeDot={{ r: 8, strokeWidth: 0, fill: '#1d4ed8' }}
                  {...CHART_ANIM}
                >
                  <LabelList dataKey="count" position="top" offset={8} style={labelStyle} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-500 py-16 text-center">No receipt dates in the filtered set.</p>
          )}
        </ChartCard>

        <ChartCard title="Status Legend" subtitle="Counts for the filtered selection">
          <div className="space-y-2">
            {STATUS_LEGEND.map(({ status, bg, label }) => (
              <div key={status} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-4 h-4 rounded border border-gray-200 shrink-0"
                    style={{ backgroundColor: bg }}
                  />
                  <span className="text-gray-800 truncate">{label}</span>
                </div>
                <span className="font-semibold text-gray-900 tabular-nums">
                  {statusData.find((d) => d.name === status)?.value ?? 0}
                </span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {attentionRows.length > 0 && (
        <ChartCard title="Overdue & Due Today" subtitle="Open filtered enquiries at or past target date">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                  <th className="py-2 pr-4 font-semibold">Sr.</th>
                  <th className="py-2 pr-4 font-semibold">Client</th>
                  <th className="py-2 pr-4 font-semibold">Assigned To</th>
                  <th className="py-2 pr-4 font-semibold">Target Date</th>
                  <th className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {attentionRows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-gray-900">{row.serial}</td>
                    <td className="py-2.5 pr-4 text-gray-800">{row.client}</td>
                    <td className="py-2.5 pr-4 text-gray-700">{row.assignee}</td>
                    <td className="py-2.5 pr-4 text-red-700 font-medium">{formatDateDdMmYyyy(row.target)}</td>
                    <td className="py-2.5 text-gray-700">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}
    </div>
  );
}
