import React, { useEffect, useState } from 'react';
import { SectionCard } from '../../../adminOperations/components/AdminUi';
import { listComponentsMaster } from '../../../../services/payrollApi';
import { FORMULA_VARIABLES } from '../../../../modules/payroll/formula/variables';

export default function SalarySettings() {
  const [components, setComponents] = useState([]);

  useEffect(() => {
    listComponentsMaster().then(setComponents);
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
      <SectionCard title="Component master">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-2 text-left">Code</th>
              <th className="px-2 py-2 text-left">Name</th>
              <th className="px-2 py-2 text-left">Type</th>
              <th className="px-2 py-2 text-center">PF wages</th>
              <th className="px-2 py-2 text-center">ESIC wages</th>
            </tr>
          </thead>
          <tbody>
            {components.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-2 py-2 font-mono">{c.component_code}</td>
                <td className="px-2 py-2">{c.component_name}</td>
                <td className="px-2 py-2">{c.component_type}</td>
                <td className="px-2 py-2 text-center">{c.include_in_pf_wages ? 'Y' : ''}</td>
                <td className="px-2 py-2 text-center">{c.include_in_esic_wages ? 'Y' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
      <SectionCard title="Formula variables (tokens)">
        <ul className="text-xs grid grid-cols-2 gap-1">
          {FORMULA_VARIABLES.map((v) => (
            <li key={v.key}>
              <code>{v.key}</code> — {v.label}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
