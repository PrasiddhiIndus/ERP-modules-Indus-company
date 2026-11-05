import React from "react";
import { Link } from "react-router-dom";
import { useProbationReviewsAccess } from "./probationAccess";

/**
 * Route wrapper for Corporate HR/Admin → Probation Reviews.
 * Opens only for L1 managers with at least one active reportee, or HR (employee 10935).
 * Granting this never grants any other Corporate HR/Admin page.
 */
export default function ProbationReviewsGuard({ children }) {
  const { canAccess, loading } = useProbationReviewsAccess();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="max-w-lg mx-auto mt-16 rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-center space-y-3">
        <h1 className="text-lg font-semibold text-amber-950">Access restricted</h1>
        <p className="text-sm text-amber-900 leading-relaxed">
          Probation Reviews are available to reporting (L1) managers who have reportees, and to the HR
          probation approver.
        </p>
        <Link
          to="/app/settings"
          className="inline-flex h-9 items-center px-3.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-deep"
        >
          Back
        </Link>
      </div>
    );
  }

  return children;
}
