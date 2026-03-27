import React, { useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Bell, Building2, CalendarDays, ChevronDown, LayoutDashboard, Search } from "lucide-react";
import { ADMIN_OPS_NAV } from "./navConfig";
import { FilterBar, TinyInput, TinySelect } from "./components/AdminUi";
import { mockAlerts } from "./data/mockAdminData";

const base = "/app/admin-operations";

export default function AdminOperationsLayout() {
  const location = useLocation();
  const [q, setQ] = useState("");
  const [company, setCompany] = useState("All");
  const [site, setSite] = useState("All");
  const alertCount = useMemo(() => mockAlerts.filter((a) => a.severity === "critical" || a.severity === "high").length, []);

  const openGroups = useMemo(() => {
    const rel = location.pathname.replace(base, "").replace(/^\//, "");
    const matched = new Set();
    ADMIN_OPS_NAV.forEach((g) => {
      if (g.title === "Admin Operations") return;
      if (g.items.some((it) => rel === it.path || rel.startsWith(it.path + "/"))) matched.add(g.title);
    });
    return matched;
  }, [location.pathname]);

  const [collapsed, setCollapsed] = useState(() => {
    const o = {};
    ADMIN_OPS_NAV.forEach((g) => {
      o[g.title] = g.title !== "Admin Operations";
    });
    return o;
  });

  const toggleGroup = (title) => {
    setCollapsed((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  React.useEffect(() => {
    setCollapsed((prev) => {
      const next = { ...prev };
      openGroups.forEach((t) => {
        next[t] = false;
      });
      return next;
    });
  }, [location.pathname, openGroups]);

  return (
    <div className="max-w-[1800px] mx-auto space-y-4">
      {/* Module header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-[#1F3A8A]/10 flex items-center justify-center shrink-0">
            <LayoutDashboard className="w-5 h-5 text-[#1F3A8A]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate">Admin Operations</h1>
            <p className="text-xs text-gray-600">
              Command center for IFSPL / IEVPL in-house workforce, PPE & store control, gate movement, and admin coordination.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NavLink
            to={`${base}/alerts`}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs font-medium hover:bg-amber-100"
          >
            <Bell className="w-3.5 h-3.5" />
            Alerts
            {alertCount > 0 && (
              <span className="ml-0.5 inline-flex min-w-[1.25rem] justify-center rounded-full bg-amber-600 text-white text-[10px] px-1">
                {alertCount}
              </span>
            )}
          </NavLink>
          <button
            type="button"
            className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs text-gray-700 hover:bg-gray-50"
          >
            Quick actions
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs text-gray-700 hover:bg-gray-50"
          >
            Role: Admin Ops
          </button>
        </div>
      </div>

      <FilterBar>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">Company</label>
          <TinySelect value={company} onChange={(e) => setCompany(e.target.value)} className="min-w-[120px]">
            <option>All</option>
            <option>IFSPL</option>
            <option>IEVPL</option>
          </TinySelect>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">Site</label>
          <TinySelect value={site} onChange={(e) => setSite(e.target.value)} className="min-w-[140px]">
            <option>All</option>
            <option>HO</option>
            <option>Plant Alpha</option>
            <option>Depot Bravo</option>
          </TinySelect>
        </div>
        <div className="flex flex-col gap-0.5 flex-1 min-w-[200px]">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">Date context</label>
          <div className="flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <TinyInput type="date" className="flex-1 min-w-0" defaultValue="2025-03-25" />
          </div>
        </div>
        <div className="flex flex-col gap-0.5 flex-1 min-w-[220px]">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">Search</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <TinyInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Employee, pass, transfer…" className="pl-7 w-full" />
          </div>
        </div>
        <div className="flex items-end">
          <span className="text-[11px] text-gray-500 flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" />
            Filters apply to operational views (saved views coming)
          </span>
        </div>
      </FilterBar>

      <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr] gap-4 items-start">
        <aside className="bg-white rounded-xl shadow-sm border border-gray-100 p-2 h-fit xl:sticky xl:top-4">
          <p className="px-2 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Navigation</p>
          <nav className="space-y-1 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
            {ADMIN_OPS_NAV.map((group) => (
              <div key={group.title} className="mb-1">
                {group.title === "Admin Operations" ? (
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.path}
                        to={`${base}/${item.path}`}
                        className={({ isActive }) =>
                          `flex items-center w-full text-left px-2.5 py-2 rounded-md text-xs border transition ${
                            isActive
                              ? "bg-[#1F3A8A] text-white border-[#1F3A8A]"
                              : "bg-white text-gray-700 border-transparent hover:bg-gray-100"
                          }`
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.title)}
                      className="flex items-center justify-between w-full px-2 py-1.5 rounded-md text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      <span className="truncate text-left">{group.title}</span>
                      <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition ${collapsed[group.title] ? "" : "rotate-180"}`} />
                    </button>
                    {!collapsed[group.title] && (
                      <div className="ml-1.5 pl-1.5 border-l border-gray-200 space-y-0.5 mt-0.5">
                        {group.items.map((item) => (
                          <NavLink
                            key={item.path}
                            to={`${base}/${item.path}`}
                            className={({ isActive }) =>
                              `block w-full text-left px-2 py-1.5 rounded text-[11px] border ${
                                isActive
                                  ? "bg-blue-50 text-blue-800 border-blue-200"
                                  : "text-gray-700 border-transparent hover:bg-gray-50"
                              }`
                            }
                          >
                            {item.label}
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-4">
          <Outlet context={{ globalFilters: { company, site, q } }} />
        </div>
      </div>
    </div>
  );
}
