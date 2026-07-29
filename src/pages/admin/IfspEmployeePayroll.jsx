import React from "react";
import { Navigate } from "react-router-dom";

/** Legacy route — Admin payroll & attendance sheets removed; land on Admin dashboard. */
const IfspEmployeePayroll = () => <Navigate to="/app/admin/dashboard" replace />;

export default IfspEmployeePayroll;
