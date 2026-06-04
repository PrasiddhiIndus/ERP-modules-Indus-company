import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { SectionCard, DenseTable, Badge } from '../../../adminOperations/components/AdminUi';

const DEMO_EXITS = [
  { id: 'e1', employee: 'Rajesh Kumar', code: '0042', lastWorkingDay: '30/06/2026', reason: 'Resignation', status: 'In progress' },
  { id: 'e2', employee: 'Sunita Patel', code: '0031', lastWorkingDay: '15/05/2026', reason: 'Retirement', status: 'Completed' },
];

export default function EmployeeExit() {
  const [exits] = useState(DEMO_EXITS);

  const columns = [
    { key: 'code', label: 'Code' },
    { key: 'employee', label: 'Employee' },
    { key: 'lastWorkingDay', label: 'Last working day' },
    { key: 'reason', label: 'Reason' },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className={row.status === 'Completed' ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>{row.status}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Employee exit</h2>
          <p className="text-xs text-gray-500 mt-0.5">Resignation, retirement, and separation workflow.</p>
        </div>
        <button type="button" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium hover:bg-[#1a3278]">
          <Plus className="h-3.5 w-3.5" />
          Initiate exit
        </button>
      </div>

      <SectionCard title="Exit cases" right={<Badge>{exits.length} records</Badge>}>
        <DenseTable columns={columns} rows={exits} rowKey="id" />
      </SectionCard>
    </div>
  );
}
