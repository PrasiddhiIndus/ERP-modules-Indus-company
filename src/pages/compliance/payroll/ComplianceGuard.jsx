import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import { canAccessCompliance } from "./complianceAccess";

export default function ComplianceGuard({ children }) {
  const { userProfile, user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-sm text-ink-muted">
        Checking access…
      </div>
    );
  }
  if (!canAccessCompliance(userProfile, user)) {
    return <Navigate to="/app/ifsp-employee-compliance" replace />;
  }
  return children;
}