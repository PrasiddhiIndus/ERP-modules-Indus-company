import React from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { canOpenIevConfigPage } from "../../../lib/ievConfigAccess";
import { FIRE_TENDER_DASHBOARD_PATH } from "../fireTenderRoutes";

/** Shows an IEV configuration page only when User Management allows it for this user. */
export default function IevConfigGuard({ slug, children }) {
  const { userProfile } = useAuth();
  if (canOpenIevConfigPage(userProfile, slug)) return children;
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <Lock className="mx-auto h-8 w-8 text-slate-400" />
        <h2 className="mt-3 text-base font-semibold text-slate-900">You don't have access to this configuration page</h2>
        <p className="mt-1 text-sm text-slate-500">Ask an administrator to give you access in User Management.</p>
        <Link to={FIRE_TENDER_DASHBOARD_PATH} className="mt-4 inline-block text-sm font-medium text-red-700 hover:underline">
          Back to IEV
        </Link>
      </div>
    </div>
  );
}
