import React from "react";
import { RefreshCw, Search } from "lucide-react";
import { FilterBar, TinyInput, TinySelect } from "../adminOperations/components/AdminUi";

const DATE_PRESETS = [
  { id: "all", label: "All dates" },
  { id: "month", label: "This month" },
  { id: "year", label: "This year" },
];

export default function SiteAssignmentsFilters({
  siteId,
  sites,
  assignmentStatus,
  employeeActiveOnly,
  startDate,
  endDate,
  search,
  onSiteChange,
  onAssignmentStatusChange,
  onEmployeeActiveOnlyChange,
  onStartDateChange,
  onEndDateChange,
  onDatePreset,
  onSearchChange,
  onApplySearch,
  onReset,
  onRefresh,
  loading,
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {DATE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onDatePreset(p.id)}
            className="h-8 px-2.5 rounded-md text-[11px] font-medium border border-gray-200 bg-white hover:bg-slate-50 shadow-sm"
          >
            {p.label}
          </button>
        ))}
      </div>

      <FilterBar>
        <label className="flex flex-col gap-0.5 min-w-[160px]">
          <span className="text-[10px] font-medium text-gray-500 uppercase">Site</span>
          <TinySelect value={siteId} onChange={(e) => onSiteChange(e.target.value)}>
            <option value="ALL">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.site_name || `Site ${s.id}`}
              </option>
            ))}
          </TinySelect>
        </label>
        <label className="flex flex-col gap-0.5 min-w-[140px]">
          <span className="text-[10px] font-medium text-gray-500 uppercase">Assignment</span>
          <TinySelect value={assignmentStatus} onChange={(e) => onAssignmentStatusChange(e.target.value)}>
            <option value="ALL">All</option>
            <option value="ACTIVE">Active</option>
            <option value="ENDED">Ended</option>
          </TinySelect>
        </label>
        <label className="flex flex-col gap-0.5 min-w-[140px]">
          <span className="text-[10px] font-medium text-gray-500 uppercase">Employee</span>
          <TinySelect
            value={employeeActiveOnly ? "active" : "all"}
            onChange={(e) => onEmployeeActiveOnlyChange(e.target.value === "active")}
          >
            <option value="active">Active only</option>
            <option value="all">All employees</option>
          </TinySelect>
        </label>
        <label className="flex flex-col gap-0.5 min-w-[128px]">
          <span className="text-[10px] font-medium text-gray-500 uppercase">From date</span>
          <TinyInput type="date" value={startDate} onChange={(e) => onStartDateChange(e.target.value)} />
        </label>
        <label className="flex flex-col gap-0.5 min-w-[128px]">
          <span className="text-[10px] font-medium text-gray-500 uppercase">To date</span>
          <TinyInput type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} />
        </label>
        <label className="flex flex-col gap-0.5 min-w-[220px] flex-1">
          <span className="text-[10px] font-medium text-gray-500 uppercase">Search</span>
          <div className="flex gap-1">
            <TinyInput
              type="search"
              value={search}
              placeholder="Name or employee code"
              className="flex-1 min-w-0"
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onApplySearch();
              }}
            />
            <button
              type="button"
              onClick={onApplySearch}
              className="h-8 px-3 rounded text-xs font-medium bg-[#1F3A8A] text-white hover:bg-[#1a3275] inline-flex items-center gap-1 shrink-0"
            >
              <Search className="h-3.5 w-3.5" />
              Search
            </button>
          </div>
        </label>
      </FilterBar>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={onReset} className="text-[11px] font-medium text-gray-600 hover:underline">
          Reset filters
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
    </div>
  );
}
