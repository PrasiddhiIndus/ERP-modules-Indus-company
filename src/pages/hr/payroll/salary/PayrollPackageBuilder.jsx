import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { SectionCard, DenseTable, Badge } from '../../../adminOperations/components/AdminUi';

const DEMO_PACKAGES = [
  { id: 'p1', name: 'North region', sites: 4, components: 12, status: 'Active' },
  { id: 'p2', name: 'Manufacturing', sites: 3, components: 15, status: 'Active' },
  { id: 'p3', name: 'Corporate HQ', sites: 1, components: 8, status: 'Draft' },
];

export default function PayrollPackageBuilder() {
  const [packages] = useState(DEMO_PACKAGES);

  const columns = [
    { key: 'name', label: 'Package name' },
    { key: 'sites', label: 'Sites linked' },
    { key: 'components', label: 'Components' },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className={row.status === 'Active' ? 'text-emerald-600 font-medium' : 'text-amber-600'}>{row.status}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Payroll package builder</h2>
          <p className="text-xs text-gray-500 mt-0.5">Bundle site formulas, components, and statutory rules.</p>
        </div>
        <button type="button" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium hover:bg-[#1a3278]">
          <Plus className="h-3.5 w-3.5" />
          New package
        </button>
      </div>

      <SectionCard title={`Packages (${packages.length})`} right={<Badge tone="bg-slate-100 text-slate-700">Setup</Badge>}>
        <DenseTable columns={columns} rows={packages} rowKey="id" />
      </SectionCard>
    </div>
  );
}
