import React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Calculator, LayoutDashboard, Layers } from "lucide-react";

const BASE = "/app/admin/salary-admin";

const MODULES = [
  {
    id: "dashboard",
    label: "Salary Dashboard",
    path: `${BASE}/dashboard`,
    icon: LayoutDashboard,
    match: (p) =>
      p === `${BASE}/dashboard` || p === BASE || p === `${BASE}/` || /\/salary-admin\/?$/.test(p),
  },
  {
    id: "components",
    label: "Salary Components",
    path: `${BASE}/salary-components`,
    icon: Layers,
    match: (p) => p.startsWith(`${BASE}/salary-components`),
  },
  {
    id: "processing",
    label: "Salary Processing",
    path: `${BASE}/salary-processing`,
    icon: Calculator,
    match: (p) => p.startsWith(`${BASE}/salary-processing`),
  },
];

/**
 * Salary Admin shell — ERP accent tabs for in-page module switch (not sidebar).
 */
export default function SalaryAdminLayout() {
  const { pathname } = useLocation();

  return (
    <div className="space-y-3 max-w-[1600px] w-full mx-auto">
      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        <div className="erp-card-header border-b border-divider flex flex-wrap items-center justify-between gap-2 min-h-[48px] bg-surface-raised px-3 sm:px-4">
          <div className="min-w-0">
            <p className="type-mono-caption text-ink-muted">Admin</p>
            <h2 className="type-card-title text-ink mt-0.5">Salary Admin</h2>
          </div>
          <p className="type-meta text-ink-secondary hidden sm:block max-w-md text-right">
            Switch modules here — dashboard, components, and month processing.
          </p>
        </div>

        <nav
          role="tablist"
          aria-label="Salary Admin modules"
          className="flex flex-wrap gap-0 border-b border-divider px-1 sm:px-2 bg-surface"
        >
          {MODULES.map((mod) => {
            const Icon = mod.icon;
            const isActive = mod.match(pathname);
            return (
              <NavLink
                key={mod.id}
                to={mod.path}
                role="tab"
                aria-selected={isActive}
                className={`relative inline-flex items-center gap-2 h-10 px-3 text-[12px] font-medium transition-colors border-b-2 -mb-px ${
                  isActive
                    ? "border-accent text-accent bg-accent-soft/40"
                    : "border-transparent text-ink-secondary hover:text-ink hover:bg-surface-sunken/60"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-accent" : "text-ink-muted"}`} />
                <span>{mod.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
