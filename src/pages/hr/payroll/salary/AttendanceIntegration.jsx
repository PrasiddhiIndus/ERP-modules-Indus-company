import React, { useState } from 'react';
import { CheckCircle2, ClipboardList, Lock, RefreshCw } from 'lucide-react';
import { KpiTile } from '../../../adminOperations/components/AdminUi';

const ATTENDANCE_ROWS = [
  { id: 'e1', employee: 'Amit Shah', site: 'Delhi NCR', present: 22, absent: 0, halfDays: 0, lop: 0, status: 'ok' },
  { id: 'e2', employee: 'Priya Nair', site: 'Chennai', present: 20, absent: 2, halfDays: 1, lop: 2, status: 'lop' },
  { id: 'e3', employee: 'Rahul Iyer', site: 'Mumbai HQ', present: 21, absent: 1, halfDays: 0, lop: 1, status: 'lop' },
  { id: 'e4', employee: 'Sneha Joshi', site: 'Surat plant', present: 10, absent: 12, halfDays: 0, lop: 12, status: 'leave' },
];

const STATUS_STYLES = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  lop: 'bg-amber-50 text-amber-800 border-amber-200',
  leave: 'bg-red-50 text-red-700 border-red-200',
};

const STATUS_LABELS = {
  ok: 'OK',
  lop: 'LOP',
  leave: 'On leave',
};

function currentMonthLabel() {
  return new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function AttendanceStatusBadge({ status }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-semibold ${STATUS_STYLES[status] || STATUS_STYLES.ok}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export default function AttendanceIntegration() {
  const [syncStatus, setSyncStatus] = useState('Done');
  const [lastSynced, setLastSynced] = useState('today 9:42 AM');
  const [locked, setLocked] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const workingDays = 25;
  const monthLabel = currentMonthLabel();

  const handleSync = () => {
    setSyncing(true);
    setSyncStatus('Syncing…');
    window.setTimeout(() => {
      setSyncing(false);
      setSyncStatus('Done');
      const now = new Date();
      setLastSynced(
        `today ${now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`
      );
    }, 800);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0">
          <ClipboardList className="h-5 w-5 text-sky-700" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Attendance sync</h2>
          <p className="text-xs text-gray-500 mt-0.5">Sync from biometric / HRMS</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <KpiTile label="Month" value={monthLabel} />
        <KpiTile label="Working days" value={workingDays} />
        <KpiTile label="Sync status" value={syncStatus} tone="border-emerald-100" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={syncing || locked}
              onClick={handleSync}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium hover:bg-[#1a3278] disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              Sync attendance
            </button>
            <button
              type="button"
              onClick={() => setLocked((v) => !v)}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-[#1F3A8A] text-[#1F3A8A] bg-white text-xs font-medium hover:bg-blue-50"
            >
              <Lock className="h-3.5 w-3.5" />
              {locked ? 'Unlock attendance' : 'Lock attendance'}
            </button>
          </div>
          <p className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Last synced: {lastSynced}
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-2.5">Employee</th>
                <th className="text-left px-4 py-2.5">Site</th>
                <th className="text-right px-4 py-2.5">Days present</th>
                <th className="text-right px-4 py-2.5">Absent</th>
                <th className="text-right px-4 py-2.5">Half days</th>
                <th className="text-right px-4 py-2.5">LOP</th>
                <th className="text-left px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {ATTENDANCE_ROWS.map((row, idx) => (
                <tr
                  key={row.id}
                  className={`border-t border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{row.employee}</td>
                  <td className="px-4 py-3 text-gray-700">{row.site}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.present}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.absent}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.halfDays}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.lop}</td>
                  <td className="px-4 py-3">
                    <AttendanceStatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {locked ? (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Attendance is locked for {monthLabel}. Unlock to sync again.
          </p>
        ) : null}
      </div>
    </div>
  );
}
