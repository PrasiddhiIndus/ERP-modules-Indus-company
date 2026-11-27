import React, { useEffect, useMemo, useState } from "react";
import { formatPunchTime } from "../../../lib/siteAttendance/selfiePunchesApi";
import { toast } from "../../../lib/toast";
import * as XLSX from "xlsx";
import { FilterBar, KpiTile, Modal, PageTaskHeader, SectionCard, StatusChip, TinyInput, TinySelect } from "../../../components/erpUi";
import {
  CUSTOM_DUTY_OPTION,
  formatCustomDutyValue,
  parseCustomDutyValue,
} from "../../../lib/siteAttendance/attendanceRules";
import { formatSalaryRangeLabel, isCalendarMonth } from "../../../lib/siteAttendance/salaryCycle";
import { filterSitesByType } from "../../../lib/siteAttendance/siteTypes";
import { useSiteAttendanceAccess, useSiteAttendanceType } from "./SiteAttendanceLayout";
import { useAttendanceGrid } from "./useAttendanceGrid";
import { scopeSites, siteIdsForQuery } from "../../../lib/siteAttendance/siteAttendanceAccess";
import { canUseSiteAttendanceImport } from "../../../lib/siteAttendance/siteAttendancePageAccess";
import { useAuth } from "../../../contexts/AuthContext";
import AttendanceImportModal from "./import/AttendanceImportModal";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/** Sticky freeze classes — beat shell `.sticky.top-0 { z-index: 25 }` + transparent thead th. */
const FREEZE_HEAD =
  "att-daily-freeze att-daily-freeze-head sticky top-0 border-b border-r border-divider box-border";
const FREEZE_BODY = "att-daily-freeze att-daily-freeze-body sticky border-b border-r border-divider box-border";
const COL_NUM = "att-col-num left-0 w-9 min-w-[2.25rem] max-w-[2.25rem]";
const COL_NAME = "att-col-name left-9 w-48 min-w-[12rem] max-w-[12rem]";
const COL_DESIG = "att-col-desig left-[14.25rem] w-32 min-w-[8rem] max-w-[8rem] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.18)]";

/** Attendance mark cell tones — Present green, Leave/Absent red, Week-off yellow. */
function codeClass(code) {
  if (parseCustomDutyValue(code) != null) return "att-mark att-mark-present";
  const c = String(code || "").toUpperCase();
  if (c === "P" || ["A", "B", "C", "G"].includes(c)) return "att-mark att-mark-present";
  if (c === "L") return "att-mark att-mark-absent";
  if (c === "WO") return "att-mark att-mark-wo";
  if (c === "HD") return "att-mark att-mark-hd";
  if (c === "NH-PH") return "att-mark att-mark-nh";
  if (c === "CO") return "att-mark att-mark-co";
  return "";
}

function AttendanceMarkControl({ codes, value, disabled, customizedDuty, onChange }) {
  const customValue = parseCustomDutyValue(value);
  const [mode, setMode] = useState(() => (customValue != null ? "custom" : "select"));
  const [draft, setDraft] = useState(() => (customValue != null ? formatCustomDutyValue(customValue) : ""));

  useEffect(() => {
    const next = parseCustomDutyValue(value);
    if (next != null) {
      setMode("custom");
      setDraft(formatCustomDutyValue(next));
    } else {
      setMode("select");
      setDraft("");
    }
  }, [value]);

  if (!customizedDuty) {
    return (
      <select
        className="att-daily-mark-select w-full h-8 bg-transparent text-[12px] font-semibold text-center"
        disabled={disabled}
        value={value || ""}
        onChange={(e) => onChange(e.target.value, e.target.value === "")}
      >
        {codes.map((c) => (
          <option key={c || "empty"} value={c}>{c || "—"}</option>
        ))}
      </select>
    );
  }

  if (mode === "custom") {
    return (
      <input
        type="number"
        min="0"
        max="24"
        step="0.25"
        disabled={disabled}
        className="att-daily-mark-select w-full h-8 bg-transparent text-[12px] font-semibold text-center tabular-nums"
        value={draft}
        placeholder="e.g. 0.75"
        title="Custom duty — Enter to save, Esc for mark list"
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const trimmed = String(draft || "").trim();
          if (!trimmed) {
            onChange("", true);
            setMode("select");
            return;
          }
          const formatted = formatCustomDutyValue(trimmed);
          if (!formatted) {
            setDraft(customValue != null ? formatCustomDutyValue(customValue) : "");
            return;
          }
          onChange(formatted, false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setMode("select");
            setDraft(customValue != null ? formatCustomDutyValue(customValue) : "");
          }
        }}
      />
    );
  }

  return (
    <select
      className="att-daily-mark-select w-full h-8 bg-transparent text-[12px] font-semibold text-center"
      disabled={disabled}
      value={value || ""}
      onChange={(e) => {
        const next = e.target.value;
        if (next === CUSTOM_DUTY_OPTION) {
          setMode("custom");
          setDraft(customValue != null ? formatCustomDutyValue(customValue) : "");
          return;
        }
        onChange(next, next === "");
      }}
    >
      {codes.map((c) => (
        <option key={c || "empty"} value={c}>{c || "—"}</option>
      ))}
      <option value={CUSTOM_DUTY_OPTION}>Custom duty</option>
    </select>
  );
}

const PICKER_MODES = {
  L: { title: "Bulk leave", hint: "Move people to Selected, then submit. Marks leave on the chosen date(s)." },
  WO: { title: "Bulk week-off", hint: "Move people to Selected, then submit. Marks week-off on the chosen date(s)." },
};

export default function AttendanceEntryPage({ readOnly = false }) {
  const { siteType } = useSiteAttendanceType();
  const access = useSiteAttendanceAccess();
  const isSiteSupervisor =
    Boolean(access?.isSiteSupervisor) || (!access?.seesAllSites && Array.isArray(access?.allowedSiteIds));
  const scopedSiteIds = siteIdsForQuery(access);
  const g = useAttendanceGrid({ readOnly, siteIds: scopedSiteIds });
  const [bulkDate, setBulkDate] = useState("");
  const [bulkMulti, setBulkMulti] = useState(false);
  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState("L");
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerSelected, setPickerSelected] = useState(() => new Set());
  const [smartImportOpen, setSmartImportOpen] = useState(false);
  const { userProfile } = useAuth();
  const canSmartImport = !readOnly && canUseSiteAttendanceImport(userProfile);
  const sitesForDropdown = useMemo(() => {
    const scoped = scopeSites(g.sites, access);
    // Supervisors only ever see assigned sites — ignore the global site-type filter.
    if (isSiteSupervisor) return scoped;
    return filterSitesByType(scoped, siteType);
  }, [g.sites, access, siteType, isSiteSupervisor]);
  const siteSelectLocked = isSiteSupervisor && sitesForDropdown.length === 1;

  useEffect(() => {
    g.loadSites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.seesAllSites, access.allowedSiteIds]);

  // Auto-select the supervisor's assigned site only — grid loads on Load Grid click.
  useEffect(() => {
    if (!sitesForDropdown.length) return;
    const allowed = new Set(sitesForDropdown.map((s) => String(s.id)));
    if (g.siteId && allowed.has(String(g.siteId))) return;
    if (isSiteSupervisor) {
      g.setSiteId(String(sitesForDropdown[0].id));
      return;
    }
    if (g.siteId && !allowed.has(String(g.siteId))) {
      g.setSiteId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitesForDropdown, isSiteSupervisor, g.siteId]);

  const presentCode = g.site?.shift_type === "ABCG" ? "A" : "P";
  const uniquePeople = useMemo(() => {
    const seen = new Set();
    return g.gridRows.filter((row) => {
      const id = row.person_id || row.id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [g.gridRows]);
  const pickerPeople = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return uniquePeople.filter((row) => {
      if (!q) return true;
      return `${row.full_name} ${row.unique_code}`.toLowerCase().includes(q);
    });
  }, [uniquePeople, pickerQuery]);
  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 11 }, (_, i) => y - 5 + i);
  }, []);

  const exportExcel = () => {
    if (!g.site || !g.days.length) return;
    const dayHeaders = g.days.map((d) => {
      const wd = d.date.toLocaleDateString("en-GB", { weekday: "short" });
      const showMonth = g.range && !isCalendarMonth(g.range.startDay, g.range.endDay);
      return `${d.day}${showMonth ? ` ${d.monthShort}` : ""} (${wd})${g.isNhPh(d.dateString) ? " NH/PH" : ""}`;
    });
    const customOt = g.decimalOt;
    const header = customOt
      ? ["Code", "Name", "Designation", ...dayHeaders, "Present", "Leave", "WO", "Applied WO", "NH/PH", "OT Hours", "Total OT"]
      : ["Code", "Name", "Designation", ...dayHeaders, "Present", "Leave", "WO", "Applied WO", "NH/PH", "OT"];
    const rows = [];
    g.gridRows.forEach((row, idx) => {
      const tot = g.totals[idx] || {};
      const dayVals = g.days.map((d) => {
        const rec = g.getRecord(row.person_id || row.id, d.dateString, row.grid_designation || row.designation);
        return rec?.att_code || "";
      });
      const base = [row.unique_code, row.full_name, row.grid_designation || row.designation, ...dayVals, tot.totalPresent, tot.totalLeave, tot.totalWeekoff, tot.appliedWeekoff, tot.totalNH_PH];
      if (customOt) {
        rows.push([...base, tot.totalOtHours ?? 0, tot.totalOT ?? 0]);
        const otVals = g.days.map((d) => {
          const rec = g.getRecord(row.person_id || row.id, d.dateString, row.grid_designation || row.designation);
          const h = Number(rec?.ot_hours) || 0;
          return h > 0 ? h : "";
        });
        rows.push(["", "OT Hours", row.grid_designation || row.designation, ...otVals, "", "", "", "", "", tot.totalOtHours ?? 0, tot.totalOT ?? 0]);
      } else {
        rows.push([...base, tot.totalOT]);
      }
    });
    if (customOt && g.dayOt?.length) {
      rows.push(["", "OT total (hrs÷8)", "", ...g.dayOt, "", "", "", "", "", "", ""]);
    }
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `Attendance_${g.site.site_name}_${g.month}_${g.year}.xlsx`);
  };

  const bulkDates = () => {
    if (bulkMulti) {
      if (!bulkFrom || !bulkTo) {
        toast.error("Set from and to dates for the range.");
        return [];
      }
      const from = bulkFrom < bulkTo ? bulkFrom : bulkTo;
      const to = bulkFrom < bulkTo ? bulkTo : bulkFrom;
      return g.days.filter((d) => d.dateString >= from && d.dateString <= to).map((d) => d.dateString);
    }
    if (!bulkDate) {
      toast.error("Pick a date to bulk-mark.");
      return [];
    }
    return [bulkDate];
  };

  const runBulkPresent = () => {
    const dates = bulkDates();
    if (!dates.length) return;
    g.bulkMark(presentCode, dates, { blankOnly: true });
  };

  const runBulkClear = () => {
    const dates = bulkDates();
    if (!dates.length) return;
    g.bulkMark("", dates, { markedOnly: true });
  };

  const openPicker = (mode) => {
    const dates = bulkDates();
    if (!dates.length) return;
    setPickerMode(mode);
    setPickerQuery("");
    setPickerSelected(new Set());
    setPickerOpen(true);
  };

  const submitPicker = () => {
    const dates = bulkDates();
    if (!dates.length) return;
    if (!pickerSelected.size) {
      toast.error("Select at least one person.");
      return;
    }
    g.bulkMark(pickerMode, dates, { personIds: [...pickerSelected] });
    setPickerOpen(false);
  };

  const togglePicker = (id, selected) => {
    setPickerSelected((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <div className="att-entry-page flex flex-col gap-3 sm:gap-4">
      <PageTaskHeader
        title={readOnly ? "Admin attendance view" : "Attendance entry"}
        subtitle={
          readOnly
            ? "Full-cycle grid, read only."
            : isSiteSupervisor
              ? "Mark daily attendance for your site. Changes save as you go."
              : "Mark daily attendance. Changes save as you go."
        }
      >
        {g.locked ? <StatusChip label="Locked" severity="warning" /> : null}
      </PageTaskHeader>

      <FilterBar>
        <label className="att-filter-field flex flex-col gap-1 min-w-0 flex-[1_1_11rem]">
          <span className="text-[11px]">Site</span>
          <TinySelect
            className="w-full min-w-0"
            value={g.siteId}
            disabled={siteSelectLocked}
            title={siteSelectLocked ? "Your assigned site" : undefined}
            onChange={(e) => g.setSiteId(e.target.value)}
          >
            {!siteSelectLocked ? <option value="">Select site</option> : null}
            {sitesForDropdown.map((s) => (
              <option key={s.id} value={s.id}>{s.site_name}</option>
            ))}
          </TinySelect>
        </label>
        <label className="att-filter-field flex flex-col gap-1 min-w-0 flex-[1_1_8rem]">
          <span className="text-[11px]">Month (cycle end)</span>
          <TinySelect className="w-full min-w-0" value={g.month} onChange={(e) => g.setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </TinySelect>
        </label>
        <label className="att-filter-field flex flex-col gap-1 min-w-0 flex-[1_1_6rem]">
          <span className="text-[11px]">Year</span>
          <TinySelect className="w-full min-w-0" value={g.year} onChange={(e) => g.setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </TinySelect>
        </label>
        <div className="att-filter-actions flex flex-wrap items-end gap-2 flex-[1_1_100%] sm:flex-[0_1_auto]">
          <button type="button" className="erp-btn-primary rounded-control px-3.5 py-2 text-xs min-h-9" onClick={g.loadGrid} disabled={g.loading}>
            {g.loading ? "Loading…" : "Load grid"}
          </button>
          {g.site && !readOnly && !g.locked ? (
            <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs min-h-9" onClick={g.lockMonth}>Lock month</button>
          ) : null}
          {g.site ? (
            <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs min-h-9" onClick={exportExcel}>Export Excel</button>
          ) : null}
          {g.site && canSmartImport && !g.locked && g.days.length > 0 ? (
            <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs min-h-9" onClick={() => setSmartImportOpen(true)}>
              Import Excel
            </button>
          ) : null}
        </div>
      </FilterBar>

      {g.site ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <KpiTile label="Roster" value={g.gridRows.length} sub={g.range ? formatSalaryRangeLabel(g.range) : ""} />
          <KpiTile label="Duty hours" value={g.site.duty_hours || 8} />
          <KpiTile label="Shift" value={g.site.shift_type === "ABCG" ? "ABCG" : "P-days"} />
          <KpiTile label="Sandwich" value={g.site.sandwich_rule ? "On" : "Off"} />
        </div>
      ) : null}

      {g.site && !readOnly && !g.locked ? (
        <SectionCard title="Bulk mark">
          <p className="type-meta mb-3">
            Present fills blank cells only. Leave and week-off use the person picker. Clear removes codes already marked (overtime is left as-is).
          </p>
          <div className="att-bulk-controls flex flex-wrap items-end gap-2 sm:gap-3">
            <label className="flex items-center gap-2 text-xs min-h-9">
              <input type="checkbox" checked={bulkMulti} onChange={(e) => setBulkMulti(e.target.checked)} />
              Multiple dates
            </label>
            {bulkMulti ? (
              <>
                <label className="att-filter-field flex flex-col gap-1 min-w-0 flex-[1_1_9rem]">
                  <span className="text-[11px]">From</span>
                  <TinyInput className="w-full" type="date" value={bulkFrom} onChange={(e) => setBulkFrom(e.target.value)} />
                </label>
                <label className="att-filter-field flex flex-col gap-1 min-w-0 flex-[1_1_9rem]">
                  <span className="text-[11px]">To</span>
                  <TinyInput className="w-full" type="date" value={bulkTo} onChange={(e) => setBulkTo(e.target.value)} />
                </label>
              </>
            ) : (
              <label className="att-filter-field flex flex-col gap-1 min-w-0 flex-[1_1_9rem]">
                <span className="text-[11px]">Date</span>
                <TinyInput className="w-full" type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
              </label>
            )}
            <TinyInput
              className="att-bulk-search-desktop min-w-0 flex-[1_1_12rem] w-full sm:w-auto"
              placeholder="Search name / code"
              value={g.search}
              onChange={(e) => g.setSearch(e.target.value)}
            />
            <div className="att-bulk-actions flex flex-wrap gap-2 flex-[1_1_100%] sm:flex-[1_1_auto]">
              <button type="button" className="erp-btn-primary rounded-control px-3 py-1.5 text-xs min-h-9" onClick={runBulkPresent}>Bulk present</button>
              <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs min-h-9" onClick={() => openPicker("WO")}>Bulk week-off</button>
              <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs min-h-9" onClick={() => openPicker("L")}>Bulk leave</button>
              <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs min-h-9" onClick={runBulkClear}>Clear marked</button>
            </div>
          </div>
        </SectionCard>
      ) : g.site && !readOnly ? (
        <div className="att-locked-search-desktop">
          <FilterBar>
            <TinyInput className="w-full min-w-0 flex-1" placeholder="Search name / code" value={g.search} onChange={(e) => g.setSearch(e.target.value)} />
          </FilterBar>
        </div>
      ) : null}

      {g.site && g.days.length > 0 ? (
        <SectionCard title="Daily grid" className="att-daily-card min-w-0">
          <div className="att-grid-search-mobile mb-3">
            <label className="flex flex-col gap-1.5">
              <span className="att-mobile-label">Find employee</span>
              <TinyInput
                className="att-mobile-search-input w-full"
                placeholder="Search by name or code…"
                value={g.search}
                onChange={(e) => g.setSearch(e.target.value)}
                autoComplete="off"
              />
            </label>
            {g.search.trim() ? (
              <p className="att-mobile-search-hint mt-1.5">
                Showing matches for “{g.search.trim()}”
                <button type="button" className="att-mobile-clear-search ml-2" onClick={() => g.setSearch("")}>
                  Clear
                </button>
              </p>
            ) : (
              <p className="att-mobile-search-hint mt-1.5">Scroll sideways for dates. Tap a cell to mark attendance.</p>
            )}
          </div>
          <div className="att-daily-grid-scroll overflow-auto max-h-[70vh] border border-border rounded-lg -mx-1 sm:mx-0">
            {/*
              erp-table-exempt: shell CSS forces border-collapse + transparent thead th,
              which makes sticky Name/Desig collide with scrolling date headers.
              Freeze cells use .att-daily-freeze-* (opaque bg + z-index above shell sticky rule).
            */}
            <table className="erp-table-exempt att-daily-grid text-xs border-separate border-spacing-0 min-w-max">
              <thead>
                <tr>
                  <th className={`${FREEZE_HEAD} ${COL_NUM} px-1.5 py-2 text-center text-[11px] font-semibold tracking-wide`}>#</th>
                  <th className={`${FREEZE_HEAD} ${COL_NAME} px-2.5 py-2 text-left text-[11px] font-semibold tracking-wide`}>Name</th>
                  <th className={`${FREEZE_HEAD} ${COL_DESIG} px-2.5 py-2 text-left text-[11px] font-semibold tracking-wide`}>Desig.</th>
                  {g.days.map((d) => (
                    <th
                      key={d.dateString}
                      className={`att-daily-date-head sticky top-0 border-b border-r border-divider px-1.5 py-1.5 text-center min-w-[3.25rem] ${g.isNhPh(d.dateString) ? "att-daily-date-head--nh" : ""}`}
                    >
                      <div className="text-[12px] font-semibold tabular-nums leading-tight">{d.day}{g.range && !isCalendarMonth(g.range.startDay, g.range.endDay) ? ` ${d.monthShort}` : ""}</div>
                      <div className="text-[10px] text-ink-muted font-medium leading-tight mt-0.5">{d.date.toLocaleDateString("en-GB", { weekday: "short" })}</div>
                    </th>
                  ))}
                  <th className="att-daily-date-head sticky top-0 border-b border-r border-divider px-1.5 py-1.5 text-[11px] font-semibold min-w-[2.25rem]">P</th>
                  <th className="att-daily-date-head sticky top-0 border-b border-r border-divider px-1.5 py-1.5 text-[11px] font-semibold min-w-[2.25rem]">L</th>
                  <th className="att-daily-date-head sticky top-0 border-b border-r border-divider px-1.5 py-1.5 text-[11px] font-semibold min-w-[2.25rem]">WO</th>
                  {g.decimalOt ? (
                    <>
                      <th className="att-daily-date-head sticky top-0 border-b border-r border-divider px-1.5 py-1.5 text-[11px] font-semibold min-w-[2.75rem]" title="Sum of daily OT hours">OT Hrs</th>
                      <th className="att-daily-date-head sticky top-0 border-b border-r border-divider px-1.5 py-1.5 text-[11px] font-semibold min-w-[2.75rem]" title={`OT Hours ÷ ${g.customOtDayHours || 8}`}>Total OT</th>
                    </>
                  ) : (
                    <th className="att-daily-date-head sticky top-0 border-b border-r border-divider px-1.5 py-1.5 text-[11px] font-semibold min-w-[2.25rem]">OT</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {g.gridRows.map((row, idx) => {
                  const tot = g.totals[idx] || {};
                  const personId = row.person_id || row.id;
                  const desig = row.grid_designation || row.designation;
                  const freezeTone = row.isDuplicate ? "att-daily-freeze-body--alt" : "";
                  return (
                    <React.Fragment key={`${personId}-${desig}-${idx}`}>
                      <tr>
                        <td className={`${FREEZE_BODY} ${COL_NUM} ${freezeTone} px-1.5 py-0.5 text-center tabular-nums text-ink-muted`}>{idx + 1}</td>
                        <td className={`${FREEZE_BODY} ${COL_NAME} ${freezeTone} att-emp-cell px-2.5 py-0.5 whitespace-nowrap overflow-hidden text-ellipsis text-left`}>
                          <span className="att-emp-name align-middle font-medium text-[12px] text-ink" title={row.full_name}>
                            {row.full_name}{row.isDefaultDesignationRow ? " *" : ""}
                          </span>
                          {row.unique_code ? (
                            <span className="att-emp-code block text-[10px] text-ink-muted font-medium tabular-nums leading-tight">
                              {row.unique_code}
                            </span>
                          ) : null}
                          {g.multi && !readOnly ? (
                            <select
                              className="att-copy-desig ml-1 h-6 max-w-[4.5rem] text-[10px] border border-border rounded align-middle bg-surface"
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) g.copyToDesignation(personId, e.target.value);
                                e.target.value = "";
                              }}
                            >
                              <option value="">Copy to…</option>
                              {[...new Set(g.gridRows.map((r) => r.grid_designation || r.designation))].map((name) => (
                                <option key={name} value={name}>{name}</option>
                              ))}
                            </select>
                          ) : null}
                        </td>
                        <td className={`${FREEZE_BODY} ${COL_DESIG} ${freezeTone} px-2.5 py-0.5 whitespace-nowrap overflow-hidden text-ellipsis text-left text-[11px] text-ink-muted`} title={desig}>{desig}</td>
                        {g.days.map((d) => {
                          const closed = g.isInactiveCellClosed(row, d.dateString);
                          const rec = closed ? null : g.getRecord(personId, d.dateString, desig);
                          const disabled = closed || g.isCellDisabled(row, d.dateString);
                          return (
                            <td
                              key={d.dateString}
                              className={`att-daily-mark-cell border-b border-r border-divider p-0 ${closed ? "att-daily-mark-cell--closed" : ""} ${!closed && g.isNhPh(d.dateString) && !rec?.att_code ? "bg-amber-50" : ""} ${!closed ? codeClass(rec?.att_code) : ""} ${!closed && rec?._selfie ? "ring-1 ring-inset ring-sky-400" : ""}`}
                              title={closed ? "Outside employment dates — not editable" : rec?._selfie ? `Selfie punch — In ${formatPunchTime(rec._selfie.in)} · Out ${formatPunchTime(rec._selfie.out)}${rec._selfie.address ? `
${rec._selfie.address}` : ""}
Change to override.` : undefined}
                            >
                              <AttendanceMarkControl
                                codes={g.codes}
                                value={closed ? "" : rec?.att_code || ""}
                                disabled={disabled}
                                customizedDuty={g.customizedDuty}
                                onChange={(attCode, clear) =>
                                  g.persistCell({
                                    personId,
                                    dateString: d.dateString,
                                    gridDesignation: desig,
                                    attCode,
                                    clear,
                                  })
                                }
                              />
                            </td>
                          );
                        })}
                        <td className="border-b border-r border-divider px-1.5 text-center tabular-nums text-[12px] font-medium bg-surface">{tot.totalPresent ?? 0}</td>
                        <td className="border-b border-r border-divider px-1.5 text-center tabular-nums text-[12px] font-medium bg-surface">{tot.totalLeave ?? 0}</td>
                        <td className="border-b border-r border-divider px-1.5 text-center tabular-nums text-[12px] font-medium bg-surface">{tot.appliedWeekoff ?? 0}</td>
                        {g.decimalOt ? (
                          <>
                            <td className="border-b border-r border-divider px-1.5 text-center tabular-nums text-[12px] font-medium bg-surface">{tot.totalOtHours ?? 0}</td>
                            <td className="border-b border-r border-divider px-1.5 text-center tabular-nums text-[12px] font-medium bg-surface">{tot.totalOT ?? 0}</td>
                          </>
                        ) : (
                          <td className="border-b border-r border-divider px-1.5 text-center tabular-nums text-[12px] font-medium bg-surface">{tot.totalOT ?? 0}</td>
                        )}
                      </tr>
                      <tr>
                        <td className={`${FREEZE_BODY} ${COL_NUM} ${freezeTone}`} />
                        <td className={`${FREEZE_BODY} ${COL_NAME} ${freezeTone} text-[10px] font-medium uppercase tracking-wide text-ink-muted px-2.5 text-left`}>OT</td>
                        <td className={`${FREEZE_BODY} ${COL_DESIG} ${freezeTone}`} />
                        {g.days.map((d) => {
                          const closed = g.isInactiveCellClosed(row, d.dateString);
                          const rec = closed ? null : g.getRecord(personId, d.dateString, desig);
                          const disabled = closed || g.isCellDisabled(row, d.dateString);
                          return (
                            <td
                              key={`ot-${d.dateString}`}
                              className={`border-b border-r border-divider p-0 ${closed ? "att-daily-mark-cell--closed" : "bg-surface"}`}
                            >
                              <input
                                type="number"
                                min="0"
                                max="16"
                                step={g.decimalOt ? "0.01" : "1"}
                                disabled={disabled}
                                className="w-full h-7 text-center text-[11px] tabular-nums bg-transparent"
                                key={`${personId}-${d.dateString}-${desig}-${closed ? "closed" : rec?.ot_hours || 0}`}
                                defaultValue={closed ? "" : rec?.ot_hours || ""}
                                title={g.decimalOt ? "OT hours (decimals allowed, max 16)" : "OT hours (whole hours, max 16)"}
                                onBlur={(e) => g.persistOt({ personId, dateString: d.dateString, gridDesignation: desig, otHours: e.target.value })}
                              />
                            </td>
                          );
                        })}
                        <td colSpan={g.decimalOt ? 5 : 4} className="border-b border-r border-divider bg-surface" />
                      </tr>
                    </React.Fragment>
                  );
                })}
                <tr className="font-semibold">
                  <td className={`${FREEZE_BODY} att-daily-freeze-body--total ${COL_NUM}`} />
                  <td className={`${FREEZE_BODY} att-daily-freeze-body--total ${COL_NAME} px-2 text-left`}>Duty total</td>
                  <td className={`${FREEZE_BODY} att-daily-freeze-body--total ${COL_DESIG}`} />
                  {g.dayDuty.map((n, i) => (
                    <td key={g.days[i]?.dateString || i} className="border-b border-r border-divider text-center tabular-nums bg-surface-sunken">{n}</td>
                  ))}
                  <td colSpan={g.decimalOt ? 5 : 4} className="border-b border-r border-divider bg-surface-sunken" />
                </tr>
                {g.decimalOt ? (
                  <tr className="font-semibold">
                    <td className={`${FREEZE_BODY} att-daily-freeze-body--total ${COL_NUM}`} />
                    <td className={`${FREEZE_BODY} att-daily-freeze-body--total ${COL_NAME} px-2 text-left`} title={`Sum of OT hours ÷ ${g.customOtDayHours || 8}`}>
                      OT total
                    </td>
                    <td className={`${FREEZE_BODY} att-daily-freeze-body--total ${COL_DESIG}`} />
                    {(g.dayOt || []).map((n, i) => (
                      <td key={`ot-day-${g.days[i]?.dateString || i}`} className="border-b border-r border-divider text-center tabular-nums bg-surface-sunken">{n}</td>
                    ))}
                    <td colSpan={5} className="border-b border-r border-divider bg-surface-sunken" />
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="type-meta mt-2">
            Primary designation rows show an asterisk. OT is the second row per person.
            {g.decimalOt
              ? ` Custom OT: daily OT keeps exact hours (max 16). OT Hrs = sum of daily hours; Total OT = OT Hrs ÷ ${g.customOtDayHours || 8}; daily OT total uses the same ÷ ${g.customOtDayHours || 8} rule. Duty total is attendance marks only.`
              : " OT is included in Duty total (hours ÷ site duty hours, or 1 per day when Regular OT is on)."}
            {" "}NH/PH days are highlighted.
            {g.customizedDuty
              ? " This site allows Customized Duty Hours — choose Custom duty to type a value (e.g. 0.5, 0.75, 4, 8); totals use the entered duty."
              : null}
          </p>
        </SectionCard>
      ) : (
        <p className="type-meta">
          {isSiteSupervisor
            ? "Choose month and year, then load the grid."
            : "Select a site type, then a site, month, and year, and load the grid."}
        </p>
      )}

      <Modal
        open={pickerOpen}
        title={PICKER_MODES[pickerMode]?.title || "Select people"}
        onClose={() => setPickerOpen(false)}
        widthClass="max-w-2xl w-[calc(100vw-1.5rem)]"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="erp-btn-secondary rounded-control px-3.5 py-2 text-xs min-h-9" onClick={() => setPickerOpen(false)}>Cancel</button>
            <button type="button" className="erp-btn-primary rounded-control px-3.5 py-2 text-xs min-h-9" onClick={submitPicker}>Submit</button>
          </div>
        }
      >
        <p className="type-meta mb-3">{PICKER_MODES[pickerMode]?.hint}</p>
        <TinyInput className="mb-3 w-full" placeholder="Search employees…" value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold mb-1">Available</p>
            <div className="max-h-48 sm:max-h-64 overflow-auto border border-border rounded-lg">
              {pickerPeople.filter((row) => !pickerSelected.has(row.person_id || row.id)).map((row) => {
                const id = row.person_id || row.id;
                return (
                  <button key={id} type="button" className="block w-full text-left px-2 py-2 sm:py-1.5 text-xs hover:bg-slate-50 border-b border-divider" onClick={() => togglePicker(id, true)}>
                    <span className="font-medium">{row.unique_code}</span> {row.full_name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold mb-1">Selected ({pickerSelected.size})</p>
            <div className="max-h-48 sm:max-h-64 overflow-auto border border-border rounded-lg">
              {pickerPeople.filter((row) => pickerSelected.has(row.person_id || row.id)).map((row) => {
                const id = row.person_id || row.id;
                return (
                  <button key={id} type="button" className="block w-full text-left px-2 py-2 sm:py-1.5 text-xs hover:bg-slate-50 border-b border-divider" onClick={() => togglePicker(id, false)}>
                    <span className="font-medium">{row.unique_code}</span> {row.full_name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      {canSmartImport && g.site ? (
        <AttendanceImportModal open={smartImportOpen} onClose={() => setSmartImportOpen(false)} onSaved={g.loadGrid} grid={g} />
      ) : null}
    </div>
  );
}
