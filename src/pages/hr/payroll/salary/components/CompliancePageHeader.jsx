import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { salaryAppPath } from '../salaryNav';

/** Back link for compliance sub-pages opened from Compliance Management. */
export default function CompliancePageHeader({ title, subtitle }) {
  return (
    <div className="space-y-3">
      <Link
        to={salaryAppPath('compliance-management')}
        className="inline-flex items-center gap-1.5 text-xs text-[#1F3A8A] hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Compliance Management
      </Link>
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {subtitle ? <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p> : null}
      </div>
    </div>
  );
}
