import React from "react";
import { NavLink } from "react-router-dom";
import { FileText, UserCheck } from "lucide-react";

export const MAINTENANCE_PO_AT_GLANCE_PATH = "/app/maintenance/po-at-glance";
export const MAINTENANCE_PO_SIGNATURE_CONFIG_PATH = "/app/maintenance/po-at-glance/signature-config";

const tabCls = ({ isActive }) =>
  `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
    isActive ? "bg-red-50 font-semibold text-red-800 ring-1 ring-red-100" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
  }`;

/** Page frame shared by Maintenance → PO At Glance and its Sign-off Assignment page. */
export default function PoAtGlanceShell({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white shadow-sm">
        <div className="px-4 py-4 sm:px-6">
          <h1 className="text-2xl font-bold text-gray-900">PO At Glance</h1>
          <p className="mt-1 text-sm text-gray-600">Maintenance (M&amp;M) order confirmation, sign-off and Word export.</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-3 sm:px-6">
          <NavLink end to={MAINTENANCE_PO_AT_GLANCE_PATH} className={tabCls}>
            <FileText className="h-4 w-4" /> PO At Glance
          </NavLink>
          <NavLink to={MAINTENANCE_PO_SIGNATURE_CONFIG_PATH} className={tabCls}>
            <UserCheck className="h-4 w-4" /> Sign-off Assignment
          </NavLink>
        </nav>
      </div>
      <div className="space-y-4 p-4 sm:p-6">{children}</div>
    </div>
  );
}
