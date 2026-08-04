import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import { canAccessSalaryAdmin } from "./salaryAccess";

/**
 * Route wrapper: only allowlisted emails may open Salary Admin screens.
 */
export default function SalaryAdminGuard({ children }) {
  const { user, userProfile, permissionsReady, profileLoading } = useAuth();

  if (profileLoading || !permissionsReady) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent" />
      </div>
    );
  }

  if (!canAccessSalaryAdmin(userProfile, user)) {
    return (
      <div className="max-w-lg mx-auto mt-16 rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-center space-y-3">
        <h1 className="text-lg font-semibold text-amber-950">Access restricted</h1>
        <p className="text-sm text-amber-900 leading-relaxed">
          Salary Admin is limited to authorised payroll users. Your account does not have access to this module.
        </p>
        <Link
          to="/app/admin/dashboard"
          className="inline-flex h-9 items-center px-3.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-deep"
        >
          Back to Admin dashboard
        </Link>
      </div>
    );
  }

  return children;
}
