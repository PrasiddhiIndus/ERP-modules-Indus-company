import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../../../contexts/AuthContext';
import { fetchMyMisAccess } from './misDb';
import PayrollMisPage from './PayrollMisPage';

/**
 * Payroll MIS entry. Inside Salary Admin (full access) or standalone for vertical heads
 * who were given report access in MIS Setup.
 */
export default function PayrollMisRoute({ standalone = false }) {
  const { user } = useAuth();
  const [access, setAccess] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyMisAccess().then((a) => { if (!cancelled) setAccess(a); });
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!access) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent" />
      </div>
    );
  }

  if (standalone && access.full) return <Navigate to="/app/admin/salary-admin/mis" replace />;

  if (!access.full && !access.scopes.length) {
    return (
      <div className="max-w-lg mx-auto mt-16 rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-center space-y-3">
        <h1 className="text-lg font-semibold text-amber-950">Access restricted</h1>
        <p className="text-sm text-amber-900 leading-relaxed">
          Payroll reports are limited to authorised users. Ask the payroll team to give you access to your vertical.
        </p>
        <Link to="/app/admin/dashboard" className="inline-flex h-9 items-center px-3.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-deep">
          Back to Admin dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className={standalone ? 'max-w-[1600px] w-full mx-auto' : ''}>
      <PayrollMisPage access={access} />
    </div>
  );
}
