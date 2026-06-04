import React, { useEffect, useState } from 'react';
import { SectionCard } from '../../../adminOperations/components/AdminUi';
import { supabase } from '../../../../lib/supabase';
import { PAYROLL_TABLES } from '../../../../modules/payroll/integrations';

export default function PayrollOutputs() {
  const [payslips, setPayslips] = useState([]);

  useEffect(() => {
    supabase
      .from(PAYROLL_TABLES.payslips)
      .select('*')
      .order('generated_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setPayslips(data || []));
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Payslips</h2>
      <SectionCard title="Generated payslips">
        <p className="text-xs text-gray-600 mb-3">PDF export and bank file generation are phase-2; payload structure is stored per employee per run.</p>
        <ul className="text-xs space-y-2">
          {payslips.map((p) => (
            <li key={p.id} className="border border-gray-100 rounded px-2 py-2">
              Employee {p.employee_master_id} · {p.payslip_number || 'Draft'} · {new Date(p.generated_at).toLocaleString('en-IN')}
            </li>
          ))}
        </ul>
        {!payslips.length ? <p className="text-xs text-gray-500">Finalize a run to generate payslip payloads.</p> : null}
      </SectionCard>
    </div>
  );
}
