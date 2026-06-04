import React, { useState } from 'react';
import { SectionCard, DenseTable, Badge } from '../../../adminOperations/components/AdminUi';

const DEMO_FNF = [
  { id: 'f1', employee: 'Sunita Patel', code: '0031', settlementDate: '20/05/2026', amount: '₹1,85,400', status: 'Settled' },
  { id: 'f2', employee: 'Rajesh Kumar', code: '0042', settlementDate: '—', amount: '₹—', status: 'Pending' },
];

export default function FullFinalSettlement() {
  const [rows] = useState(DEMO_FNF);

  const columns = [
    { key: 'code', label: 'Code' },
    { key: 'employee', label: 'Employee' },
    { key: 'settlementDate', label: 'Settlement date' },
    { key: 'amount', label: 'Net settlement' },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className={row.status === 'Settled' ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>{row.status}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Full & final settlement</h2>
        <p className="text-xs text-gray-500 mt-0.5">Gratuity, leave encashment, and final dues clearance.</p>
      </div>

      <SectionCard title="Settlement register" right={<Badge>FnF</Badge>}>
        <DenseTable columns={columns} rows={rows} rowKey="id" />
      </SectionCard>
    </div>
  );
}
