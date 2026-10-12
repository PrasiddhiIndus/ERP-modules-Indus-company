import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import { canOpenCompliancePath } from "./complianceAccess";

export default function ComplianceGuard({ children }) {
  const { userProfile, user, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-sm text-ink-muted">
        Checking access…
      </div>
    );
  }
  if (!canOpenCompliancePath(userProfile, user, pathname)) {
    return <Navigate to="/app/dashboard" replace />;
  }
  return children;
}
