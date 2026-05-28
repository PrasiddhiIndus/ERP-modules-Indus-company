import React, { useEffect, useState } from 'react';
import { SectionCard } from '../../../../adminOperations/components/AdminUi';
import { listPayrollRuns } from '../../../../../services/payrollApi';
import { supabase } from '../../../../../lib/supabase';
import { PAYROLL_TABLES } from '../../../../../modules/payroll/integrations';

export default function StatutoryPF() {
  const [rows, setRows] = useState([]);
  const [runId, setRunId] = useState('');

  useEffect(() => {
    (async () => {
      const runs = await listPayrollRuns();
      const latest = runs[0];
      if (!latest) return;
      setRunId(latest.id);
      const { data } = await supabase.from(PAYROLL_TABLES.pfDetails).select('*').eq('payroll_run_id', latest.id);
      setRows(data || []);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">PF</h2>
      <SectionCard title="PF contributions (latest run)">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left">Employee</th>
                <th className="px-2 py-2 text-right">PF wages</th>
                <th className="px-2 py-2 text-right">EE</th>
                <th className="px-2 py-2 text-right">ER</th>
                <th className="px-2 py-2 text-center">Capped</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-2 py-2">{r.employee_master_id}</td>
                  <td className="px-2 py-2 text-right tabular-nums">₹{Number(r.pf_wages).toLocaleString('en-IN')}</td>
                  <td className="px-2 py-2 text-right tabular-nums">₹{Number(r.employee_contribution).toLocaleString('en-IN')}</td>
                  <td className="px-2 py-2 text-right tabular-nums">₹{Number(r.employer_contribution).toLocaleString('en-IN')}</td>
                  <td className="px-2 py-2 text-center">{r.is_capped ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? <p className="text-xs text-gray-500 py-4">Run payroll with persist to populate PF details.</p> : null}
        </div>
      </SectionCard>
    </div>
  );
}
