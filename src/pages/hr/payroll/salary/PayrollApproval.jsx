import React, { useState } from 'react';
import { SectionCard, DenseTable, Badge } from '../../../adminOperations/components/AdminUi';

const DEMO_RUNS = [
  { id: 'r1', month: 'Jun 2026', employees: 48, netPay: '₹12,45,000', status: 'Pending approval', submittedBy: 'Payroll Admin' },
  { id: 'r2', month: 'May 2026', employees: 47, netPay: '₹12,10,500', status: 'Approved', submittedBy: 'Payroll Admin' },
];

export default function PayrollApproval() {
  const [runs] = useState(DEMO_RUNS);

  const columns = [
    { key: 'month', label: 'Payroll month' },
    { key: 'employees', label: 'Employees' },
    { key: 'netPay', label: 'Net pay' },
    { key: 'submittedBy', label: 'Submitted by' },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className={row.status === 'Approved' ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>{row.status}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Payroll approval</h2>
        <p className="text-xs text-gray-500 mt-0.5">Review and approve processed payroll runs before payslip release.</p>
      </div>

      <SectionCard title="Approval queue" right={<Badge tone="bg-amber-100 text-amber-800">1 pending</Badge>}>
        <DenseTable columns={columns} rows={runs} rowKey="id" />
      </SectionCard>
    </div>
  );
}
