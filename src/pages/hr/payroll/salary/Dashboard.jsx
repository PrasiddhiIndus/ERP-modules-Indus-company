import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  FileSpreadsheet,
  RefreshCw,
  Shield,
  Wallet,
} from 'lucide-react';
import { Badge } from '../../../adminOperations/components/AdminUi';
import { getDashboardStats, ensurePayrollProfilesForActiveEmployees } from '../../../../services/payrollApi';
import { SALARY_DASHBOARD_MODULES, salaryAppPath } from './salaryNav';
import ActiveEmployeesModal from './components/ActiveEmployeesModal';
import { formatMonthYearLabel } from "../../../../utils/dateDisplay";
import {
  SparkKpi,
  ChartPanel,
  DonutChart,
  BarCompareChart,
  RadialScoreChart,
  sparkFromValue,
  CHART_SERIES,
} from '../../../../components/charts/DashboardCharts';

function monthInputDefault() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthValue) {
  const [year, month] = monthValue.split('-').map(Number);
  if (!year || !month) return monthValue;
  return formatMonthYearLabel(year, month);
}

function runStatusTone(status) {
  if (!status || status === '—') return 'bg-slate-100 text-slate-700';
  const s = String(status).toLowerCase();
  if (s.includes('final') || s.includes('complete') || s.includes('approved')) return 'bg-emerald-50 text-emerald-800';
  if (s.includes('draft') || s.includes('pending')) return 'bg-amber-50 text-amber-800';
  return 'bg-blue-50 text-blue-800';
}

function ModuleLink({ item }) {
  const className =
    'group flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-accent/25 hover:bg-slate-50/80';

  return (
    <Link to={salaryAppPath(item.to)} className={className}>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-900">{item.label}</p>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-500">{item.hint}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-300 transition group-hover:text-accent" />
    </Link>
  );
}

export default function SalaryDashboard() {
  const [month, setMonth] = useState(monthInputDefault());
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeEmployeesOpen, setActiveEmployeesOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const s = await getDashboardStats(`${month}-01`);
        if (!cancelled) setStats(s);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [month]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await ensurePayrollProfilesForActiveEmployees();
      alert(`Synced ${r.createdProfiles} profiles, ${r.createdSites} new sites.`);
      window.location.reload();
    } catch (e) {
      alert(e.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="bg-accent px-5 py-4 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">Salary Management</h1>
                <p className="mt-0.5 max-w-xl text-xs text-blue-100">
                  Site-driven payroll · People Master linkage · Present days from attendance only
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-white backdrop-blur-sm">
                <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-90" />
                <span className="font-medium">Payroll month</span>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="rounded border-0 bg-white/95 px-2 py-0.5 text-xs text-gray-900 outline-none"
                />
              </label>
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-white/20 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                Sync People Master
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 bg-slate-50/80 px-5 py-2.5">
          <p className="text-[11px] text-gray-600">
            Period: <span className="font-semibold text-gray-800">{formatMonthLabel(month)}</span>
          </p>
          {stats?.lastRun ? (
            <Badge tone={runStatusTone(stats.lastRun.status)}>
              Last run: {stats.lastRun.status || '—'}
              {stats.lastRun.label ? ` · ${stats.lastRun.label}` : ''}
            </Badge>
          ) : (
            <Badge tone="bg-slate-100 text-slate-600">No payroll run this month</Badge>
          )}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-gray-100 bg-gray-100/80" />
          ))}
        </div>
      ) : null}

      {stats ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SparkKpi
              label="Active Employees"
              value={stats.activeEmployees}
              sub="Click to view employee list"
              series={sparkFromValue(stats.activeEmployees)}
              color={CHART_SERIES[0]}
              onClick={() => setActiveEmployeesOpen(true)}
            />
            <SparkKpi
              label="Payroll Profiles"
              value={stats.payrollProfiles}
              sub="Linked to People Master"
              series={sparkFromValue(stats.payrollProfiles)}
              color={CHART_SERIES[5]}
            />
            <SparkKpi
              label="With Present Days"
              value={stats.withPresentDays}
              sub="Attendance integrated"
              series={sparkFromValue(stats.withPresentDays)}
              color={CHART_SERIES[1]}
            />
            <SparkKpi
              label="Pending inputs"
              value={stats.pendingManualInputs}
              sub={stats.lastRun?.status || 'No run this month'}
              series={sparkFromValue(stats.pendingManualInputs)}
              color={CHART_SERIES[2]}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ChartPanel title="Statutory coverage" height={220}>
              <DonutChart
                data={[
                  { name: 'PF', value: Number(stats.pfCount) || 0 },
                  { name: 'ESIC', value: Number(stats.esicCount) || 0 },
                  { name: 'PT', value: Number(stats.ptCount) || 0 },
                ].filter((x) => x.value > 0)}
                centerLabel="Covered"
                height={200}
              />
            </ChartPanel>
            <ChartPanel title="Attendance readiness" height={220}>
              <BarCompareChart
                data={[
                  { name: 'Active', value: Number(stats.activeEmployees) || 0 },
                  { name: 'Profiles', value: Number(stats.payrollProfiles) || 0 },
                  { name: 'Present', value: Number(stats.withPresentDays) || 0 },
                  { name: 'Pending', value: Number(stats.pendingManualInputs) || 0 },
                ]}
                series={[{ key: 'value', name: 'Count', color: CHART_SERIES[0] }]}
                height={200}
              />
            </ChartPanel>
            <ChartPanel title="Present-day coverage" height={220}>
              <RadialScoreChart
                value={
                  Number(stats.activeEmployees) > 0
                    ? Math.round((Number(stats.withPresentDays) / Number(stats.activeEmployees)) * 100)
                    : 0
                }
                label="Present %"
                color={CHART_SERIES[5]}
                height={200}
              />
            </ChartPanel>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {[
              { label: 'PF applicable', value: stats.pfCount },
              { label: 'ESIC applicable', value: stats.esicCount },
              { label: 'PT applicable', value: stats.ptCount },
              { label: 'Pending inputs', value: stats.pendingManualInputs, warn: true },
              { label: 'Payroll profiles', value: stats.payrollProfiles },
            ].map((item) => (
              <div
                key={item.label}
                className={`rounded-lg border px-3 py-2.5 ${
                  item.warn ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200 bg-white'
                }`}
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{item.label}</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              {SALARY_DASHBOARD_MODULES.map((group) => (
                <section
                  key={group.title}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-accent" />
                    <h2 className="text-sm font-semibold text-gray-900">{group.title}</h2>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {group.items.map((item) => (
                      <ModuleLink key={item.id} item={item} />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900">Quick start</h3>
                <p className="mt-1 text-[11px] text-gray-500">
                  Run payroll end-to-end for the selected month.
                </p>
                <div className="mt-3 space-y-2">
                  <Link
                    to={salaryAppPath('payroll-processing')}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-accent-deep"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Start payroll processing
                  </Link>
                  <Link
                    to={salaryAppPath('people-master')}
                    className="flex w-full items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    Open People Master
                  </Link>
                  <Link
                    to={salaryAppPath('formula-library')}
                    className="flex w-full items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    Open Formula Library
                  </Link>
                </div>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                <div className="flex items-start gap-2">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <div>
                    <h3 className="text-xs font-semibold text-gray-900">Attendance linkage</h3>
                    <p className="mt-1 text-[11px] leading-relaxed text-gray-600">
                      Salary uses <strong>Present Days</strong> from the attendance register only. Month days drive
                      proration in site formulas.
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </>
      ) : null}

      <ActiveEmployeesModal
        open={activeEmployeesOpen}
        onClose={() => setActiveEmployeesOpen(false)}
        totalCount={stats?.activeEmployees}
      />
    </div>
  );
}
