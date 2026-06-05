import React, { useEffect, useState } from 'react';
import { SectionCard } from '../../../adminOperations/components/AdminUi';
import { supabase } from '../../../../lib/supabase';
import { PAYROLL_TABLES } from '../../../../modules/payroll/integrations';

export default function LoansRecoveries() {
  const [loans, setLoans] = useState([]);

  useEffect(() => {
    supabase
      .from(PAYROLL_TABLES.loans)
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setLoans(data || []));
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Loans & recoveries</h2>
      <SectionCard title="Active loans">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-2 text-center w-11">S.No</th>
              <th className="px-2 py-2 text-left">Employee</th>
              <th className="px-2 py-2 text-left">Type</th>
              <th className="px-2 py-2 text-right">Principal</th>
              <th className="px-2 py-2 text-right">Balance</th>
              <th className="px-2 py-2 text-right">Installment</th>
              <th className="px-2 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {loans.map((l, idx) => (
              <tr key={l.id} className="border-t">
                <td className="px-2 py-2 text-center tabular-nums text-gray-600">{idx + 1}</td>
                <td className="px-2 py-2">{l.employee_master_id}</td>
                <td className="px-2 py-2">{l.loan_type}</td>
                <td className="px-2 py-2 text-right">₹{Number(l.principal).toLocaleString('en-IN')}</td>
                <td className="px-2 py-2 text-right">₹{Number(l.balance_outstanding).toLocaleString('en-IN')}</td>
                <td className="px-2 py-2 text-right">₹{Number(l.installment_amount).toLocaleString('en-IN')}</td>
                <td className="px-2 py-2">{l.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loans.length ? <p className="text-xs text-gray-500 py-4">No loans recorded.</p> : null}
      </SectionCard>
    </div>
  );
}
