import React, { useMemo, useState } from 'react';
import { Check, Filter, Search } from 'lucide-react';
import { KpiTile, SectionCard } from '../../../adminOperations/components/AdminUi';

function formatInr(amount) {
  return `₹ ${Number(amount).toLocaleString('en-IN')}`;
}

const INITIAL_CHAIN = [
  { id: 'l1', level: 'L1', name: 'Kavita Rao', role: 'HR Manager', status: 'approved' },
  { id: 'l2', level: 'L2', name: 'Suresh Pillai', role: 'Finance Head', status: 'pending' },
  { id: 'l3', level: 'L3', name: 'Dinesh Shah', role: 'CFO', status: 'pending' },
];

const SITE_PAYROLL = [
  { id: 's1', site: 'Delhi NCR', employees: 78, gross: 3840000, deductions: 620000, net: 3220000 },
  { id: 's2', site: 'Mumbai HQ', employees: 120, gross: 6250000, deductions: 980000, net: 5270000 },
  { id: 's3', site: 'Surat plant', employees: 64, gross: 1820000, deductions: 310000, net: 1510000 },
];

const SUBMITTED_TOTAL = 462;

function ChainStatus({ status }) {
  if (status === 'approved') {
    return (
      <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        Approved
      </span>
    );
  }
  return (
    <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
      Pending
    </span>
  );
}

export default function PayrollApproval() {
  const [chain, setChain] = useState(INITIAL_CHAIN);
  const [search, setSearch] = useState('');

  const approvedLevels = chain.filter((s) => s.status === 'approved').length;
  const approvedCount =
    approvedLevels === chain.length
      ? SUBMITTED_TOTAL
      : Math.round((approvedLevels / chain.length) * SUBMITTED_TOTAL);
  const pendingCount = SUBMITTED_TOTAL - approvedCount;

  const approveLevel = (id) => {
    setChain((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0 || prev[idx].status === 'approved') return prev;
      const priorPending = prev.slice(0, idx).some((s) => s.status !== 'approved');
      if (priorPending) return prev;
      return prev.map((s) => (s.id === id ? { ...s, status: 'approved' } : s));
    });
  };

  const filteredSites = useMemo(() => {
    if (!search.trim()) return SITE_PAYROLL;
    const q = search.toLowerCase();
    return SITE_PAYROLL.filter((r) => r.site.toLowerCase().includes(q));
  }, [search]);

  const allLevelsApproved = chain.every((s) => s.status === 'approved');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Payroll approval</h2>
        <p className="text-xs text-gray-500 mt-0.5">Review site-wise totals and complete the approval chain before payslip release.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <KpiTile label="Submitted" value={SUBMITTED_TOTAL} />
        <KpiTile label="Approved" value={approvedCount} tone="border-emerald-100" />
        <KpiTile label="Pending" value={pendingCount} tone="border-amber-100" />
      </div>

      <SectionCard title="Approval chain" className="!shadow-sm">
        <ul className="divide-y divide-gray-100">
          {chain.map((step, idx) => {
            const priorPending = chain.slice(0, idx).some((s) => s.status !== 'approved');
            const canApprove = step.status === 'pending' && !priorPending;
            return (
              <li key={step.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <p className="text-xs font-semibold text-gray-900">
                  {step.level} — {step.name}
                  <span className="font-normal text-gray-500"> ({step.role})</span>
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <ChainStatus status={step.status} />
                  {canApprove ? (
                    <button
                      type="button"
                      onClick={() => approveLevel(step.id)}
                      className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-[#1F3A8A] text-white text-[11px] font-medium hover:bg-[#1a3278]"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {allLevelsApproved ? (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mt-3">
            All approval levels complete — payroll run is ready for payslip release.
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="Site-wise payroll" className="!shadow-sm">
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-gray-200 text-sm bg-gray-50/80 focus:bg-white focus:ring-2 focus:ring-[#1F3A8A]/20"
            />
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Filter className="h-3.5 w-3.5" />
            Filter
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                <th className="text-center px-4 py-2.5 w-11">S.No</th>
                <th className="text-left px-4 py-2.5">Site</th>
                <th className="text-right px-4 py-2.5">Employees</th>
                <th className="text-right px-4 py-2.5">Gross</th>
                <th className="text-right px-4 py-2.5">Deductions</th>
                <th className="text-right px-4 py-2.5">Net payable</th>
              </tr>
            </thead>
            <tbody>
              {filteredSites.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    No sites match your search.
                  </td>
                </tr>
              ) : (
                filteredSites.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={`border-t border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                  >
                    <td className="px-4 py-3 text-center tabular-nums text-gray-600">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.site}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.employees}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatInr(row.gross)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">{formatInr(row.deductions)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatInr(row.net)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
