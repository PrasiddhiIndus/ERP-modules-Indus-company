import React, { useEffect, useState } from 'react';
import { SectionCard } from '../../../../adminOperations/components/AdminUi';
import { listTdsRules } from '../../../../../services/payrollApi';

export default function StatutoryTDS() {
  const [rules, setRules] = useState([]);

  useEffect(() => {
    listTdsRules().then(setRules);
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Income tax / TDS</h2>
      <p className="text-xs text-gray-600">Annual slab engine with monthly TDS projection per employee during payroll run.</p>
      {rules.map((r) => (
        <SectionCard key={r.id} title={`Regime: ${r.regime}`}>
          <p className="text-xs text-gray-600 mb-2">Standard deduction: ₹{Number(r.standard_deduction).toLocaleString('en-IN')} · Cess: {(Number(r.cess_rate) * 100).toFixed(2)}%</p>
          <pre className="text-[10px] bg-gray-50 p-2 rounded overflow-auto">{JSON.stringify(r.slabs_json, null, 2)}</pre>
        </SectionCard>
      ))}
    </div>
  );
}
