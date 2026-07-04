import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, RefreshCw, Search } from 'lucide-react';
import { KpiTile, SectionCard } from '../../../adminOperations/components/AdminUi';
import { finalizePayrollRun, listPayrollRuns, listRegisterForRun } from '../../../../services/payrollApi';

function formatInr(amount) {
  return `₹ ${Number(amount || 0).toLocaleString('en-IN')}`;
}

function formatMonth(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function RunStatus({ status }) {
  const tone =
    status === 'finalized'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'preview'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : 'bg-gray-50 text-gray-700 border-gray-200';
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${tone}`}>
      {String(status || 'unknown').replace(/_/g, ' ')}
    </span>
  );
}

export default function PayrollApproval() {
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [registerRows, setRegisterRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listPayrollRuns();
      const pending = (data || []).filter((r) => r.status === 'preview' || r.status === 'draft');
      setRuns(pending);
      if (!selectedRunId && pending.length) setSelectedRunId(pending[0].id);
    } catch (err) {
      setError(err?.message || 'Failed to load payroll runs.');
    } finally {
      setLoading(false);
    }
  }, [selectedRunId]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (!selectedRunId) {
      setRegisterRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await listRegisterForRun(selectedRunId);
        if (!cancelled) setRegisterRows(rows || []);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load payroll register.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRunId]);

  const totals = useMemo(() => {
    const gross = registerRows.reduce((s, r) => s + Number(r.gross || 0), 0);
    const deductions = registerRows.reduce((s, r) => s + Number(r.total_deductions || 0), 0);
    const net = registerRows.reduce((s, r) => s + Number(r.net_pay || 0), 0);
    return { employees: registerRows.length, gross, deductions, net };
  }, [registerRows]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return registerRows;
    const q = search.toLowerCase();
    return registerRows.filter((r) => {
      const payload = r.payload_json?.employee || {};
      const name = String(payload.full_name || payload.employee_name || '').toLowerCase();
      const code = String(payload.employee_code || r.employee_master_id || '').toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [registerRows, search]);

  const handleFinalize = async () => {
    const selectedRun = runs.find((r) => r.id === selectedRunId);
    if (!selectedRun || selectedRun.status === 'finalized') return;
    setFinalizing(true);
    setError('');
    try {
      await finalizePayrollRun(selectedRun.id);
      await loadRuns();
      setSelectedRunId('');
      setRegisterRows([]);
    } catch (err) {
      setError(err?.message || 'Finalize failed.');
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Payroll approval</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Review preview payroll runs from Payroll Processing, then finalize to release payslips.
          </p>
        </div>
        <button
          type="button"
          onClick={loadRuns}
          disabled={loading}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <KpiTile label="Employees" value={totals.employees} />
        <KpiTile label="Net payable" value={formatInr(totals.net)} tone="border-emerald-100" />
        <KpiTile label="Deductions" value={formatInr(totals.deductions)} tone="border-amber-100" />
      </div>

      <SectionCard title="Pending payroll runs" className="!shadow-sm">
        {loading ? (
          <p className="text-xs text-gray-500">Loading runs…</p>
        ) : runs.length === 0 ? (
          <p className="text-xs text-gray-500">
            No preview runs pending approval. Run payroll from Payroll Processing first.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <button
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  className={`text-left text-xs ${selectedRunId === run.id ? 'font-semibold text-[#1F3A8A]' : 'text-gray-900'}`}
                >
                  {run.label || `Payroll ${formatMonth(run.payroll_month)}`}
                  <span className="block font-normal text-gray-500">{formatMonth(run.payroll_month)}</span>
                </button>
                <div className="flex items-center gap-2">
                  <RunStatus status={run.status} />
                  {selectedRunId === run.id && run.status !== 'finalized' ? (
                    <button
                      type="button"
                      onClick={handleFinalize}
                      disabled={finalizing}
                      className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-[#1F3A8A] text-white text-[11px] font-medium hover:bg-[#1a3278] disabled:opacity-60"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {finalizing ? 'Finalizing…' : 'Finalize run'}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {selectedRunId ? (
        <SectionCard title="Payroll register preview" className="!shadow-sm">
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employee…"
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-gray-200 text-sm bg-gray-50/80 focus:bg-white focus:ring-2 focus:ring-[#1F3A8A]/20"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="py-2 pr-3 font-medium">Employee</th>
                  <th className="py-2 pr-3 font-medium">Gross</th>
                  <th className="py-2 pr-3 font-medium">Deductions</th>
                  <th className="py-2 font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const payload = row.payload_json?.employee || {};
                  return (
                    <tr key={row.id} className="border-b border-gray-50">
                      <td className="py-2 pr-3 text-gray-900">
                        {payload.full_name || payload.employee_name || row.employee_master_id}
                      </td>
                      <td className="py-2 pr-3">{formatInr(row.gross)}</td>
                      <td className="py-2 pr-3">{formatInr(row.total_deductions)}</td>
                      <td className="py-2 font-medium">{formatInr(row.net_pay)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
