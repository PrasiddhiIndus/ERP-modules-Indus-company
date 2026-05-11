import React from "react";
import { Navigate } from "react-router-dom";

/** Legacy route — unified under Admin Operations payroll (Excel attendance handoff). */
const IfspEmployeePayroll = () => <Navigate to="/app/admin/payroll/dashboard" replace />;

export default IfspEmployeePayroll;
