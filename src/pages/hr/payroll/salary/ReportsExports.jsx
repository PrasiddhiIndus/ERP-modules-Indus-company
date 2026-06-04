import React from 'react';
import { Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SectionCard, Badge } from '../../../adminOperations/components/AdminUi';
import { salaryAppPath } from './salaryNav';
import PayrollRegister from './Register';

export default function ReportsExports() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Reports & exports</h2>
          <p className="text-xs text-gray-500 mt-0.5">Payroll register, bank files, and statutory exports.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50">
            <Download className="h-3.5 w-3.5" />
            Export register
          </button>
          <button type="button" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50">
            <Download className="h-3.5 w-3.5" />
            Bank file
          </button>
        </div>
      </div>

      <SectionCard title="Quick links" right={<Badge>Reports</Badge>}>
        <div className="flex flex-wrap gap-2">
          <Link to={salaryAppPath('payroll-processing')} className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50">
            Payroll processing
          </Link>
          <Link to={salaryAppPath('payslips')} className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50">
            Payslips
          </Link>
          <Link to={salaryAppPath('compliance-management')} className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50">
            Compliance
          </Link>
        </div>
      </SectionCard>

      <PayrollRegister hideTitle />
    </div>
  );
}
