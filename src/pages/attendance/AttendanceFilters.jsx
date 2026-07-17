import React from "react";
import { RefreshCw, Search } from "lucide-react";
import { FilterBar, TinyInput, TinySelect } from "../adminOperations/components/AdminUi";
import { PERIOD_PRESETS, yearOptions } from "./attendanceTableHelpers.jsx";

const ATT_CODE_OPTIONS = [
  { value: "ALL", label: "All marks" },
  { value: "P", label: "P — Present" },
  { value: "HD", label: "HD — Half day" },
  { value: "WO", label: "WO — Week off" },
  { value: "L", label: "L — Leave" },
  { value: "A", label: "A — Shift A" },
  { value: "B", label: "B — Shift B" },
  { value: "C", label: "C — Shift C" },
  { value: "G", label: "G — Shift G" },
];

export default function AttendanceFilters({
  startDate,
  endDate,
  siteId,
  sites,
  month,
  year,
  attCode,
  search,
  groupBy,
  onStartDateChange,
  onEndDateChange,
  onSiteChange,
  onMonthChange,
  onYearChange,
  onAttCodeChange,
  onSearchChange,
  onGroupByChange,
  onPeriodPreset,
  onApplySearch,
  onReset,
  onRefresh,
  loading,
  sitesError,
  showGrouping = true,
  compact = false,
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {PERIOD_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPeriodPreset(p.id)}
            className="h-8 px-2.5 rounded-md text-[11px] font-medium border border-gray-200 bg-white hover:bg-slate-50 shadow-sm"
          >
            {p.label}
          </button>
        ))}
      </div>

      <FilterBar>
        <label className="flex flex-col gap-0.5 min-w-[128px]">
          <span className="text-[10px] font-medium text-gray-500 uppercase">From</span>
          <TinyInput type="date" value={startDate} onChange={(e) => onStartDateChange(e.target.value)} />
        </label>
        <label className="flex flex-col gap-0.5 min-w-[128px]">
          <span className="text-[10px] font-medium text-gray-500 uppercase">To</span>
          <TinyInput type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} />
        </label>
        <label className="flex flex-col gap-0.5 min-w-[150px]">
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
        <label className="flex flex-col gap-0.5 min-w-[88px]">
          <span className="text-[10px] font-medium text-gray-500 uppercase">Month</span>
          <TinySelect value={month} onChange={(e) => onMonthChange(e.target.value)}>
            <option value="ALL">All</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </TinySelect>
        </label>
        <label className="flex flex-col gap-0.5 min-w-[88px]">
          <span className="text-[10px] font-medium text-gray-500 uppercase">Year</span>
          <TinySelect value={year} onChange={(e) => onYearChange(e.target.value)}>
            <option value="ALL">All</option>
            {yearOptions().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </TinySelect>
        </label>
        <label className="flex flex-col gap-0.5 min-w-[130px]">
          <span className="text-[10px] font-medium text-gray-500 uppercase">Mark</span>
          <TinySelect value={attCode} onChange={(e) => onAttCodeChange(e.target.value)}>
            {ATT_CODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </TinySelect>
        </label>
        {showGrouping ? (
          <label className="flex flex-col gap-0.5 min-w-[130px]">
            <span className="text-[10px] font-medium text-gray-500 uppercase">Group by</span>
            <TinySelect value={groupBy} onChange={(e) => onGroupByChange(e.target.value)}>
              <option value="none">Flat list</option>
              <option value="employee">Employee</option>
              <option value="site">Site</option>
              <option value="date">Date</option>
            </TinySelect>
          </label>
        ) : null}
        <label className="flex flex-col gap-0.5 min-w-[200px] flex-1">
          <span className="text-[10px] font-medium text-gray-500 uppercase">Employee search</span>
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
              {!compact && "Search"}
            </button>
          </div>
        </label>
      </FilterBar>

      {sitesError ? (
        <p className="text-[11px] text-amber-700">Sites list unavailable: {sitesError}</p>
      ) : null}

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
