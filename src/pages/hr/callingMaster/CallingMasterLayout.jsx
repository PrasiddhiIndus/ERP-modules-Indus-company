import React, { Suspense } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  ListChecks,
  Mail,
  PhoneCall,
  UserCheck,
  UserPlus,
} from "lucide-react";
import PageLoader from "../../../components/PageLoader";

const TABS = [
  { to: ".", end: true, label: "Dashboard", icon: LayoutDashboard },
  { to: "candidates", label: "Candidates", icon: PhoneCall },
  { to: "offer-generation", label: "Offer Generation", icon: FileText },
  { to: "offer-response", label: "Offer Response", icon: ClipboardCheck },
  { to: "joining", label: "Joining", icon: UserPlus },
  { to: "iom", label: "IOM", icon: Mail },
  { to: "conversion", label: "Conversion", icon: UserCheck },
  { to: "dropdown-master", label: "Dropdown Master", icon: ListChecks },
];

const tabClass = ({ isActive }) =>
  `inline-flex h-9 items-center gap-2 px-3.5 rounded-md text-sm font-medium border transition-colors ${
    isActive
      ? "bg-accent text-white border-accent"
      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-300"
  }`;

export default function CallingMasterLayout() {
  return (
    <div className="mx-auto flex w-full min-h-0 max-w-[1600px] flex-col gap-4 p-4 md:p-6">
      <div className="shrink-0">
        <h1 className="type-page-title text-ink">Calling Database</h1>
        <p className="type-meta mt-1.5 max-w-3xl text-ink-secondary">
          Maintain candidate calling records through offer, joining, IOM, and Employee Master conversion.
        </p>
      </div>

      <div className="shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <nav className="flex flex-wrap gap-2 px-3 py-3 sm:px-4" aria-label="Calling database tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink key={tab.to} to={tab.to} end={tab.end} className={tabClass}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">{tab.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="min-h-0 min-w-0 flex-1">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
