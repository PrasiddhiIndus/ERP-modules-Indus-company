import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, RefreshCw, Search } from "lucide-react";
import {
  DenseTable,
  FilterBar,
  KpiTile,
  PageTaskHeader,
  SectionCard,
  StatusChip,
  TinySelect,
} from "../adminOperations/components/AdminUi";
import { supabase } from "../../lib/supabase";
import {
  fetchCanManageSiteLogins,
  formatSiteLoginError,
  listSiteEmployeeLogins,
} from "../../lib/siteEmployeeLoginsApi";
import CreateSiteLoginModal from "../peopleManagement/CreateSiteLoginModal";

const PAGE_SIZE = 25;

function leadLabel(code, name) {
  if (!code) return <span className="text-amber-700">Not assigned</span>;
  return name || code;
}

export default function SiteEmployeeLoginsPanel() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [canManage, setCanManage] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    fetchCanManageSiteLogins(supabase)
      .then(setCanManage)
      .catch(() => setCanManage(false));
  }, []);

  const load = useCallback(async () => {
    setError("");
    setRows(null);
    try {
      setRows(await listSiteEmployeeLogins(supabase));
    } catch (err) {
      console.error("Site employee logins load failed", err);
      setRows([]);
      setError(formatSiteLoginError(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const all = useMemo(() => rows || [], [rows]);
  const linkedPersonIds = useMemo(() => new Set(all.map((r) => r.person_id)), [all]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (status === "enabled" && r.is_active === false) return false;
      if (status === "disabled" && r.is_active !== false) return false;
      if (status === "no-l1" && r.l1_employee_code) return false;
      if (!q) return true;
      return [r.full_name, r.employee_code, r.email, r.username, r.current_site_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [all, search, status]);

  useEffect(() => {
    setPage(1);
  }, [search, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(
    () => ({
      total: all.length,
      enabled: all.filter((r) => r.is_active !== false).length,
      noL1: all.filter((r) => !r.l1_employee_code).length,
    }),
    [all]
  );

  const columns = useMemo(
    () => [
      {
        key: "full_name",
        label: "Employee",
        render: (r) => (
          <div className="min-w-0">
            <p className="font-medium text-gray-900 truncate">{r.full_name || "—"}</p>
            <p className="font-mono text-[11px] text-gray-500">{r.employee_code}</p>
          </div>
        ),
      },
      { key: "email", label: "Login", render: (r) => <span className="break-all">{r.email || r.username || "—"}</span> },
      { key: "site", label: "Site", render: (r) => r.current_site_name || "—" },
      { key: "l1", label: "L1 lead", render: (r) => leadLabel(r.l1_employee_code, r.l1_employee_name) },
      { key: "l2", label: "L2 lead", render: (r) => leadLabel(r.l2_employee_code, r.l2_employee_name) },
      {
        key: "status",
        label: "Login",
        render: (r) => (
          <StatusChip
            label={r.is_active !== false ? "Enabled" : "Disabled"}
            severity={r.is_active !== false ? "info" : "critical"}
          />
        ),
      },
    ],
    []
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageTaskHeader
        title="Site Employees"
        subtitle="Indus One logins for site employees (matched by employee code). Leave and tour approvals go to the L1 / L2 HR leads set in People Management — open a row to manage the login."
      >
        {canManage ? (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Create login
          </button>
        ) : null}
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-gray-300 bg-white hover:bg-gray-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </PageTaskHeader>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiTile label="Site logins" value={stats.total.toLocaleString()} onClick={() => setStatus("all")} />
        <KpiTile label="Login enabled" value={stats.enabled.toLocaleString()} onClick={() => setStatus("enabled")} />
        <KpiTile
          label="Without L1 lead"
          value={stats.noL1.toLocaleString()}
          onClick={() => setStatus("no-l1")}
          tone={stats.noL1 ? "border-amber-300" : "border-border"}
        />
      </div>

      <FilterBar>
        <label className="relative flex-1 min-w-[14rem]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, code, login or site…"
            className="w-full h-8 pl-7 pr-2 border border-gray-300 rounded text-xs bg-white"
          />
        </label>
        <TinySelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter">
          <option value="all">All site logins</option>
          <option value="enabled">Login enabled</option>
          <option value="disabled">Login disabled</option>
          <option value="no-l1">Without L1 lead</option>
        </TinySelect>
      </FilterBar>

      <SectionCard title={`${filtered.length.toLocaleString()} site login${filtered.length === 1 ? "" : "s"}`}>
        {error ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
        ) : null}
        {rows == null ? (
          <p className="text-xs text-gray-500">Loading…</p>
        ) : !filtered.length ? (
          <p className="text-xs text-gray-500">
            {all.length
              ? "No site logins match these filters."
              : "No logins are linked to site employees yet. A login links automatically when its employee code matches a site employee's code."}
          </p>
        ) : (
          <>
            <DenseTable
              columns={columns}
              rows={pageRows}
              rowKey="profile_id"
              serialOffset={(page - 1) * PAGE_SIZE}
              onRowClick={(r) => navigate(`/app/people-management/${r.person_id}?tab=login`)}
            />
            {pageCount > 1 ? (
              <div className="mt-3 flex items-center justify-end gap-2 text-xs text-gray-600">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-7 px-2 rounded border border-gray-300 bg-white disabled:opacity-40"
                >
                  Previous
                </button>
                <span>
                  Page {page} of {pageCount}
                </span>
                <button
                  type="button"
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-7 px-2 rounded border border-gray-300 bg-white disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        )}
      </SectionCard>

      <CreateSiteLoginModal
        open={createOpen}
        linkedPersonIds={linkedPersonIds}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          load();
        }}
      />
    </div>
  );
}
