import React from 'react';
import { Link } from 'react-router-dom';
import { SectionCard, Badge } from '../../../adminOperations/components/AdminUi';
import { salaryAppPath } from './salaryNav';

const COMPLIANCE_ITEMS = [
  { to: 'compliance/pf', label: 'Provident Fund (PF)', desc: 'PF wages, contributions, and challan prep.' },
  { to: 'compliance/esic', label: 'ESIC', desc: 'Employee State Insurance calculations and returns.' },
  { to: 'compliance/pt', label: 'Professional Tax (PT)', desc: 'State-wise PT slabs and deductions.' },
  { to: 'compliance/tds', label: 'Income Tax (TDS)', desc: 'Tax deduction rules and declarations.' },
  { to: 'compliance/loans', label: 'Loans & recoveries', desc: 'Salary advances and recovery schedules.' },
];

export default function ComplianceManagement() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Compliance management</h2>
        <p className="text-xs text-gray-500 mt-0.5">Statutory modules — PF, ESIC, PT, TDS, and recoveries.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {COMPLIANCE_ITEMS.map((item) => (
          <SectionCard key={item.to} title={item.label} right={<Badge>Statutory</Badge>}>
            <p className="text-xs text-gray-600 mb-3">{item.desc}</p>
            <Link
              to={salaryAppPath(item.to)}
              className="inline-flex h-8 px-3 items-center rounded-lg bg-[#1F3A8A] text-white text-xs font-medium hover:bg-[#1a3278]"
            >
              Open
            </Link>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
