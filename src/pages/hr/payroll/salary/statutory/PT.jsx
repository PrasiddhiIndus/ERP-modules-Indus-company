import React, { useEffect, useState } from 'react';
import { SectionCard } from '../../../../adminOperations/components/AdminUi';
import { listPtRules } from '../../../../../services/payrollApi';

export default function StatutoryPT() {
  const [rules, setRules] = useState([]);

  useEffect(() => {
    listPtRules().then(setRules);
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Professional tax (state-wise)</h2>
      <p className="text-xs text-gray-600">Dynamic slab rules per state — not hardcoded on employee pages.</p>
      {rules.map((r) => (
        <SectionCard key={r.id} title={`${r.state_name} (${r.state_code})`}>
          <pre className="text-[10px] bg-gray-50 p-2 rounded overflow-auto">{JSON.stringify(r.slabs_json, null, 2)}</pre>
        </SectionCard>
      ))}
      {!rules.length ? <p className="text-sm text-gray-500">No PT rules configured.</p> : null}
    </div>
  );
}
