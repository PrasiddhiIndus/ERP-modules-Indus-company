import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ExternalLink, UserPlus } from "lucide-react";
import { conversionStatusMeta } from "./recruitmentConfig";
import { listCandidates } from "./recruitmentService";
import { AsyncBoundary, Avatar, DataTable, SearchBox, StatTile, StatusPill, Tabs, btn, fmtDate, useCapabilities, useRecruitmentData } from "./RecruitmentUi";
import { ConvertModal } from "./RecruitmentForms";

function employeeMasterPath(c) {
  return c.employeeMasterId ? `/app/admin/employee/master/${c.employeeMasterId}` : "/app/admin/employee/master";
}

export default function ConversionPage() {
  const navigate = useNavigate();
  const caps = useCapabilities();
  const { data, loading, error, reload } = useRecruitmentData(listCandidates);
  const [tab, setTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [convertFor, setConvertFor] = useState(null);

  const pending = useMemo(() => (data || []).filter((c) => !c.outcome && c.stage === "joined"), [data]);
  const converted = useMemo(() => (data || []).filter((c) => c.stage === "employee_created"), [data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = tab === "pending" ? pending : tab === "converted" ? converted : [...pending, ...converted];
    return base.filter((c) => !q || [c.name, c.employeeCode, c.designation, c.site].join(" ").toLowerCase().includes(q));
  }, [tab, search, pending, converted]);

  const columns = [
    {
      key: "name",
      label: "Candidate",
      render: (c) => (
        <span className="flex items-center gap-2">
          <Avatar name={c.name} size="sm" />
          <span className="font-medium">{c.name}</span>
        </span>
      ),
    },
    { key: "employeeCode", label: "Employee code", render: (c) => <span className="font-mono text-[11px]">{c.employeeCode || "—"}</span> },
    { key: "designation", label: "Designation" },
    { key: "site", label: "Site" },
    { key: "actualJoining", label: "Joining date", render: (c) => fmtDate(c.actualJoining) },
    { key: "convertedAt", label: "Converted", render: (c) => (c.convertedAt ? `${fmtDate(c.convertedAt)}${c.convertedBy ? ` · ${c.convertedBy}` : ""}` : "—") },
    { key: "conversionStatus", label: "Status", render: (c) => <StatusPill meta={conversionStatusMeta(c.conversionStatus)} /> },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (c) =>
        c.conversionStatus === "converted" ? (
          <Link to={employeeMasterPath(c)} onClick={(e) => e.stopPropagation()} className={btn.secondary}>
            <ExternalLink className="h-3.5 w-3.5" /> Open employee
          </Link>
        ) : caps.conversion ? (
          <button
            type="button"
            className={btn.primary}
            onClick={(e) => {
              e.stopPropagation();
              setConvertFor(c);
            }}
          >
            <UserPlus className="h-3.5 w-3.5" /> Create employee
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Ready to convert" value={pending.length} tone="warning" onClick={() => setTab("pending")} />
        <StatTile label="Converted" value={converted.length} tone="success" onClick={() => setTab("converted")} />
        <StatTile label="Joined (total)" value={pending.length + converted.length} onClick={() => setTab("all")} />
      </div>

      <div className="rounded-card border border-border bg-surface shadow-card">
        <div className="px-4 pt-1">
          <Tabs
            ariaLabel="Conversion status"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "pending", label: "Ready to convert", count: pending.length },
              { key: "converted", label: "Converted", count: converted.length },
              { key: "all", label: "All joined", count: pending.length + converted.length },
            ]}
          />
        </div>
        <div className="px-4 py-3">
          <SearchBox value={search} onChange={setSearch} placeholder="Search name, employee code, site…" className="w-full sm:w-72" />
        </div>
        <div className="px-4 pb-4">
          <AsyncBoundary loading={loading} error={error} onRetry={reload}>
            <DataTable
              columns={columns}
              rows={rows}
              onRowClick={(c) => navigate(`../candidates/${c.id}`)}
              initialSort={{ key: "actualJoining", dir: "desc" }}
              emptyTitle={tab === "pending" ? "Everyone is converted" : "No candidates"}
              emptyMessage="Candidates appear here once they are marked as joined."
            />
          </AsyncBoundary>
        </div>
      </div>

      <ConvertModal open={Boolean(convertFor)} candidate={convertFor} onClose={() => setConvertFor(null)} />
    </div>
  );
}
