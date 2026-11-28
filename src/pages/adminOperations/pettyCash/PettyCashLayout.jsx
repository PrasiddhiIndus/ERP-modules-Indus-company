import React from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, Layers, Receipt } from "lucide-react";
import { PageTaskHeader } from "../../../components/erpUi";
import { PETTY_CASH_APP_PATH } from "../../../config/roles";
import { usePettyCashAccess } from "./pettyCashAccess";

const TABS = [
  {
    to: `${PETTY_CASH_APP_PATH}/dashboard`,
    label: "Dashboard",
    icon: LayoutDashboard,
    title: "Petty Cash Dashboard",
    subtitle: "Spend, trends and recent petty cash transactions at a glance.",
  },
  {
    to: `${PETTY_CASH_APP_PATH}/daily-entry`,
    label: "Daily Expense Entry",
    icon: Receipt,
    title: "Daily Expense Entry",
    subtitle: "Record petty cash expenses against an overhead, with free-text category and optional receipts.",
  },
  {
    to: `${PETTY_CASH_APP_PATH}/masters`,
    label: "Overhead & Expense Master",
    icon: Layers,
    title: "Overhead & Expense Master",
    subtitle: "Manage overhead categories used when recording daily petty cash expenses.",
  },
];

export default function PettyCashLayout() {
  const { canView } = usePettyCashAccess();
  const { pathname } = useLocation();

  if (!canView) {
    return (
      <div className="mx-auto mt-16 max-w-lg space-y-3 rounded-xl border border-warning-border bg-warning-soft px-5 py-6 text-center">
        <h1 className="text-lg font-semibold text-warning">Access restricted</h1>
        <p className="text-sm leading-relaxed text-warning">
          Petty Cash is available to Super Admins and to people given Petty Cash in User Management.
        </p>
        <Link
          to="/app/settings"
          className="erp-btn-primary inline-flex h-9 items-center rounded-control px-3.5 text-xs font-semibold"
        >
          Back
        </Link>
      </div>
    );
  }

  const active = TABS.find((t) => pathname.startsWith(t.to)) || TABS[0];

  return (
    <div className="space-y-5">
      <PageTaskHeader title={active.title} subtitle={active.subtitle} />
      <nav
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1 [scrollbar-width:none]"
        aria-label="Petty Cash pages"
      >
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13.5px] font-medium transition-colors ${
                isActive
                  ? "border-accent text-accent"
                  : "border-transparent text-ink-secondary hover:border-border hover:text-ink"
              }`
            }
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
