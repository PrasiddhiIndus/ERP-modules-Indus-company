import React, { createContext, useContext, useMemo } from "react";

const PayrollScopeContext = createContext(null);

const SCOPES = {
  admin: {
    base: "/app/admin/payroll",
    employeeMasterPath: "/app/admin/employee/master",
    workflowBadge: "Admin Operations",
    formulaNavHint: "Admin → Payroll & attendance sheets → Formula reference",
  },
};

export function PayrollScopeProvider({ scopeKey = "admin", children }) {
  const value = useMemo(() => SCOPES[scopeKey] || SCOPES.admin, [scopeKey]);
  return <PayrollScopeContext.Provider value={value}>{children}</PayrollScopeContext.Provider>;
}

export function usePayrollScope() {
  const ctx = useContext(PayrollScopeContext);
  if (!ctx) {
    throw new Error("usePayrollScope must be used within PayrollScopeProvider");
  }
  return ctx;
}
