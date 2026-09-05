import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Building2, MapPin, Search } from "lucide-react";
import { DenseTable, FilterBar, SectionCard } from "../../../adminOperations/components/AdminUi";
import {
  attendanceCycleLabel,
  daysUntil,
} from "../payrollOpsData";
import { payrollOpsAppPath } from "../payrollOpsNav";
import { usePayrollOps } from "../payrollOpsScope";
import { PayrollStatusChip } from "../PayrollOpsUi";

export default function PayrollOpsSitesPage() {
  const navigate = useNavigate();
  const { sites, employeesBySite, selectedSiteIds, setSelectedSiteIds, openProcess } = usePayrollOps();
  const [q, setQ] = useState("");

  const filtered = useMemo(
    () =>
      sites.filter(
        (s) =>
          s.name.toLowerCase().includes(q.toLowerCase()) ||
          s.client.toLowerCase().includes(q.toLowerCase())
      ),
    [sites, q]
  );

  const toggle = (id) =>
    setSelectedSiteIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const toggleAll = () =>
    setSelectedSiteIds(selectedSiteIds.length === filtered.length ? [] : filtered.map((s) => s.id));

  const columns = [
    {
      key: "pick",
      label: (
        <input
          type="checkbox"
          checked={selectedSiteIds.length === filtered.length && filtered.length > 0}
          onChange={toggleAll}
          aria-label="Select all sites"
        />
      ),
      widthClassName: "w-10",
      render: (s) => (
        <input
          type="checkbox"
          checked={selectedSiteIds.includes(s.id)}
          onChange={() => toggle(s.id)}
          aria-label={`Select ${s.name}`}
        />
      ),
    },
    {
      key: "name",
      label: "Site",
      render: (s) => (
        <div>
          <p className="font-semibold text-ink">{s.name}</p>
          <p className="text-[11px] text-ink-muted">OC No. {s.ocNo}</p>
        </div>
      ),
    },
    {
      key: "client",
      label: "Client / location",
      render: (s) => (
        <div>
          <p>{s.client}</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-ink-muted">
            <MapPin className="h-3 w-3" /> {s.location}
          </p>
        </div>
      ),
    },
    {
      key: "emps",
      label: "People",
      render: (s) => (employeesBySite[s.id] || []).length,
    },
    {
      key: "cycle",
      label: "Attendance cycle",
      render: (s) => attendanceCycleLabel(s),
    },
    {
      key: "due",
      label: "Expected disbursement",
      render: (s) => {
        const d = daysUntil(s.expectedDisbursement);
        const overdue = d < 0 && s.status !== "processed";
        const dueSoon = d >= 0 && d <= 3 && s.status !== "processed";
        return (
          <div>
            <p className="font-semibold tabular-nums">{s.expectedDisbursement}</p>
            {s.status !== "processed" ? (
              <p className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold ${overdue ? "text-critical" : dueSoon ? "text-warning" : "text-ink-muted"}`}>
                {(overdue || dueSoon) && <Bell className="h-3 w-3" />}
                {overdue ? `${Math.abs(d)}d overdue` : dueSoon ? `due in ${d}d` : `in ${d}d`}
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "sheets",
      label: "Extra sheets",
      render: (s) => `${s.sheets.length} extra${s.sheets.length === 1 ? "" : "s"}`,
    },
    {
      key: "status",
      label: "Status",
      render: (s) => <PayrollStatusChip status={s.status} />,
    },
    {
      key: "open",
      label: "",
      render: (s) => (
        <button
          type="button"
          className="text-[11px] font-semibold text-accent hover:underline"
          onClick={() => openProcess(s.id, [s.id])}
        >
          Open
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <FilterBar>
        <label className="flex h-8 min-w-[220px] flex-1 items-center gap-2 rounded-md border border-gray-300 bg-white px-2">
          <Search className="h-3.5 w-3.5 text-ink-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search site or client"
            className="w-full bg-transparent text-xs outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => navigate(payrollOpsAppPath("site-setup"))}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-semibold text-ink hover:bg-surface-sunken"
        >
          <Building2 className="h-3.5 w-3.5" /> New site
        </button>
        <button
          type="button"
          disabled={selectedSiteIds.length === 0}
          onClick={() => openProcess(selectedSiteIds[0], selectedSiteIds)}
          className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-xs font-semibold text-white disabled:opacity-50"
        >
          Process salary{selectedSiteIds.length ? ` (${selectedSiteIds.length})` : ""}
        </button>
      </FilterBar>

      <SectionCard title="Deployed sites">
        <DenseTable columns={columns} rows={filtered} rowKey="id" />
      </SectionCard>
    </div>
  );
}
