import React, { useState } from 'react';
import { SectionCard, Badge } from '../../../adminOperations/components/AdminUi';
import { runPayrollPreview, finalizePayrollRun } from '../../../../services/payrollApi';

const STEPS = [
  'Select month',
  'Fetch employees',
  'Pull present days',
  'Apply site formulas',
  'Manual inputs',
  'Statutory',
  'Review exceptions',
  'Finalize',
];

export default function PayrollRun() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  const runPreview = async (persist = false) => {
    setBusy(true);
    setError('');
    try {
      const result = await runPayrollPreview(`${month}-01`, { persist, runLabel: `Payroll ${month}` });
      setPreview(result);
      setStep(6);
    } catch (e) {
      setError(e.message || 'Payroll run failed');
    } finally {
      setBusy(false);
    }
  };

  const finalize = async () => {
    if (!preview?.run?.id) {
      await runPreview(true);
      return;
    }
    setBusy(true);
    try {
      await finalizePayrollRun(preview.run.id);
      setError('');
      alert('Payroll finalized.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Payroll processing</h2>
      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i)}
            className={`px-2 py-1 rounded text-[10px] font-medium border ${
              step === i ? 'bg-[#1F3A8A] text-white border-[#1F3A8A]' : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>
      <SectionCard title="Run configuration" right={<Badge tone="bg-violet-50 text-violet-900">Monthly</Badge>}>
        <label className="text-xs text-gray-600 flex items-center gap-2 mb-3">
          Payroll month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 border rounded-lg px-2" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => runPreview(false)} className="h-9 px-4 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium disabled:opacity-50">
            Preview payroll
          </button>
          <button type="button" disabled={busy} onClick={() => runPreview(true)} className="h-9 px-4 rounded-lg border border-gray-300 text-xs font-medium disabled:opacity-50">
            Save preview run
          </button>
          <button type="button" disabled={busy || !preview} onClick={finalize} className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-xs font-medium disabled:opacity-50">
            Finalize
          </button>
        </div>
        {error ? <p className="text-sm text-red-600 mt-2">{error}</p> : null}
      </SectionCard>
      {preview ? (
        <SectionCard
          title="Run summary"
          right={<Badge>{preview.exceptions?.length || 0} exceptions</Badge>}
        >
          <p className="text-xs text-gray-600 mb-2">
            {preview.results?.length} employees · Net total ₹
            {preview.results.reduce((s, r) => s + (r.computed?.summary?.netPay || 0), 0).toLocaleString('en-IN')}
          </p>
          {preview.exceptions?.length > 0 ? (
            <ul className="text-xs text-amber-800 space-y-1 max-h-40 overflow-auto">
              {preview.exceptions.slice(0, 20).map((ex, i) => (
                <li key={i}>
                  {ex.employee?.full_name}: {ex.messages?.join(', ')}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-emerald-700">No exceptions.</p>
          )}
        </SectionCard>
      ) : null}
    </div>
  );
}
