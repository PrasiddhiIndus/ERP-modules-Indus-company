import React from 'react';
import { Link } from 'react-router-dom';
import { SectionCard, KpiTile, Badge } from '../../../adminOperations/components/AdminUi';

export default function AttendanceIntegration() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Attendance integration</h2>
        <p className="text-xs text-gray-500 mt-0.5">Present days from attendance register feed payroll processing.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <KpiTile label="Linked employees" value="—" sub="From People Master" />
        <KpiTile label="This month present" value="—" tone="border-emerald-100" />
        <KpiTile label="Last sync" value="—" />
      </div>

      <SectionCard title="Integration status" right={<Badge tone="bg-amber-100 text-amber-800">Pending setup</Badge>}>
        <p className="text-xs text-gray-600 mb-3">
          Payroll uses <strong>Present Days</strong> only from the attendance register (
          <code className="text-[10px]">summary.totalPresent</code>). Month days drive proration in site formulas.
        </p>
        <Link
          to="/app/attendance"
          className="inline-flex h-9 px-4 items-center rounded-lg border border-gray-200 text-xs font-medium text-[#1F3A8A] hover:bg-blue-50"
        >
          Open attendance module
        </Link>
      </SectionCard>
    </div>
  );
}
