import React, { useEffect, useState } from 'react';
import { SectionCard } from '../../../../adminOperations/components/AdminUi';
import { listPayrollRuns } from '../../../../../services/payrollApi';
import { supabase } from '../../../../../lib/supabase';
import { PAYROLL_TABLES } from '../../../../../modules/payroll/integrations';

export default function StatutoryESIC() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    (async () => {
      const runs = await listPayrollRuns();
      const latest = runs[0];
      if (!latest) return;
      const { data } = await supabase.from(PAYROLL_TABLES.esicDetails).select('*').eq('payroll_run_id', latest.id);
      setRows(data || []);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">ESIC</h2>
      <SectionCard title="ESIC contributions">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-2 text-left">Employee</th>
              <th className="px-2 py-2 text-right">Wages</th>
              <th className="px-2 py-2 text-right">EE</th>
              <th className="px-2 py-2 text-right">ER</th>
              <th className="px-2 py-2 text-center">Eligible</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-2 py-2">{r.employee_master_id}</td>
                <td className="px-2 py-2 text-right">₹{Number(r.esic_wages).toLocaleString('en-IN')}</td>
                <td className="px-2 py-2 text-right">₹{Number(r.employee_contribution).toLocaleString('en-IN')}</td>
                <td className="px-2 py-2 text-right">₹{Number(r.employer_contribution).toLocaleString('en-IN')}</td>
                <td className="px-2 py-2 text-center">{r.is_eligible ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="text-xs text-gray-500 py-4">No ESIC rows yet.</p> : null}
      </SectionCard>
    </div>
  );
}
