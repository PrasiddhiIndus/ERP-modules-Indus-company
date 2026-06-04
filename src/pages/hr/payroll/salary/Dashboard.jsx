import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SectionCard, KpiTile, Badge } from '../../../adminOperations/components/AdminUi';
import { getDashboardStats, ensurePayrollProfilesForActiveEmployees } from '../../../../services/payrollApi';
import { salaryAppPath } from './salaryNav';

function monthInputDefault() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function SalaryDashboard() {
  const [month, setMonth] = useState(monthInputDefault());
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Dashboard</h2>
          <p className="text-xs text-gray-600">Payroll command center · Site-driven formulas · Present days from attendance only</p>
        </div>
        <label className="text-xs text-gray-600 flex items-center gap-2">
          Payroll month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 border rounded-lg px-2 text-sm" />
        </label>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {stats ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <KpiTile label="Active payroll employees" value={stats.activeEmployees} />
            <KpiTile label="Payroll profiles" value={stats.payrollProfiles} sub="Linked to People Master" />
            <KpiTile label="With present days" value={stats.withPresentDays} tone="border-emerald-100" />
            <KpiTile label="PF applicable" value={stats.pfCount} />
            <KpiTile label="ESIC applicable" value={stats.esicCount} />
            <KpiTile label="PT applicable" value={stats.ptCount} />
            <KpiTile label="Pending manual inputs" value={stats.pendingManualInputs} tone="border-amber-100" />
            <KpiTile
              label="Last run status"
              value={stats.lastRun?.status || '—'}
              sub={stats.lastRun?.label || 'No run this month'}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Quick actions" right={<Badge tone="bg-slate-100 text-slate-700">Salary</Badge>}>
              <div className="flex flex-wrap gap-2">
                <Link to={salaryAppPath('payroll-processing')} className="px-3 py-2 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium">Start payroll processing</Link>
                <Link to={salaryAppPath('people-master')} className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium">People Master</Link>
                <Link to={salaryAppPath('attendance-integration')} className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium">Attendance</Link>
                <Link to={salaryAppPath('formula-library')} className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium">Formula library</Link>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const r = await ensurePayrollProfilesForActiveEmployees();
                      alert(`Synced ${r.createdProfiles} profiles, ${r.createdSites} new sites.`);
                      window.location.reload();
                    } catch (e) {
                      alert(e.message || 'Sync failed');
                    }
                  }}
                  className="px-3 py-2 rounded-lg border border-dashed border-gray-300 text-xs font-medium text-gray-700"
                >
                  Sync from People Master
                </button>
              </div>
            </SectionCard>
            <SectionCard title="Attendance linkage">
              <p className="text-xs text-gray-600">
                Salary uses <strong>Present Days</strong> only from the attendance register (
                <code className="text-[10px]">summary.totalPresent</code>). Month days drive proration in site formulas.
              </p>
            </SectionCard>
          </div>
        </>
      ) : null}
    </div>
  );
}
