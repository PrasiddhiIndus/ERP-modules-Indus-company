import React, { createContext, useContext, useMemo } from "react";

const HrPayrollScopeContext = createContext(null);

const HR_PAYROLL_SCOPE = {
  base: "/app/hr/payroll",
  employeeMasterPath: "/app/hr",
  workflowBadge: "HR",
  formulaNavHint: "HR → HR Payroll & attendance sheets → Formula reference",
};

export function HrPayrollScopeProvider({ children }) {
  const value = useMemo(() => HR_PAYROLL_SCOPE, []);
  return <HrPayrollScopeContext.Provider value={value}>{children}</HrPayrollScopeContext.Provider>;
}

export function useHrPayrollScope() {
  const ctx = useContext(HrPayrollScopeContext);
  if (!ctx) {
    throw new Error("useHrPayrollScope must be used within HrPayrollScopeProvider");
  }
  return ctx;
}
