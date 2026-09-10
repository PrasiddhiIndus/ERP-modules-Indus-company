import React, { useEffect, useMemo, useState } from "react";
import { toast } from "../../../lib/toast";
import * as XLSX from "xlsx";
import { FilterBar, KpiTile, Modal, PageTaskHeader, SectionCard, StatusChip, TinyInput, TinySelect } from "../../adminOperations/components/AdminUi";
import { formatSalaryRangeLabel, isCalendarMonth } from "../../../lib/siteAttendance/salaryCycle";
import { filterSitesByType } from "../../../lib/siteAttendance/siteTypes";
import { useSiteAttendanceAccess, useSiteAttendanceType } from "./SiteAttendanceLayout";
import { useAttendanceGrid } from "./useAttendanceGrid";
import { siteIdsForQuery } from "../../../lib/siteAttendance/siteAttendanceAccess";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function codeClass(code) {
  const c = String(code || "").toUpperCase();
  if (["P", "A", "B", "C", "G"].includes(c)) return "bg-emerald-50 text-emerald-800";
  if (c === "HD") return "bg-amber-50 text-amber-900";
  if (c === "L") return "bg-orange-50 text-orange-900";
  if (c === "WO") return "bg-sky-50 text-sky-800";
  if (c === "NH-PH") return "bg-violet-50 text-violet-800";
  if (c === "CO") return "bg-teal-50 text-teal-800";
  return "";
}

const PICKER_MODES = {
  L: { title: "Bulk leave", hint: "Move people to Selected, then submit. Marks leave on the chosen date(s)." },
  WO: { title: "Bulk week-off", hint: "Move people to Selected, then submit. Marks week-off on the chosen date(s)." },
  HD: { title: "Bulk half day", hint: "Move people to Selected, then submit. Marks half day on the chosen date(s)." },
};

export default function AttendanceEntryPage({ readOnly = false }) {
  const { siteType } = useSiteAttendanceType();
  const access = useSiteAttendanceAccess();
  const g = useAttendanceGrid({ readOnly, siteIds: siteIdsForQuery(access) });
  const [bulkDate, setBulkDate] = useState("");
  const [bulkMulti, setBulkMulti] = useState(false);
  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState("L");
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerSelected, setPickerSelected] = useState(() => new Set());
  const typedSites = useMemo(() => filterSitesByType(g.sites, siteType), [g.sites, siteType]);

  useEffect(() => {
    g.loadSites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const header = ["Code", "Name", "Designation", ...g.days.map((d) => {
      const wd = d.date.toLocaleDateString("en-GB", { weekday: "short" });
      const showMonth = g.range && !isCalendarMonth(g.range.startDay, g.range.endDay);
      return `${d.day}${showMonth ? ` ${d.monthShort}` : ""} (${wd})${g.isNhPh(d.dateString) ? " NH/PH" : ""}`;
    }), "Present", "Leave", "WO", "Applied WO", "NH/PH", "OT"];
    const rows = g.gridRows.map((row, idx) => {
      const tot = g.totals[idx] || {};
      const dayVals = g.days.map((d) => {
        const rec = g.getRecord(row.person_id || row.id, d.dateString, row.grid_designation || row.designation);
        return rec?.att_code || "";
      });
      return [row.unique_code, row.full_name, row.grid_designation || row.designation, ...dayVals, tot.totalPresent, tot.totalLeave, tot.totalWeekoff, tot.appliedWeekoff, tot.totalNH_PH, tot.totalOT];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `Attendance_${g.site.site_name}_${g.month}_${g.year}.xlsx`);
  };

  const importExcel = async (file) => {
    if (!file || readOnly) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (!data.length) return;
    const header = data[0].map((h) => String(h || ""));
    const codeIdx = header.findIndex((h) => /code/i.test(h));
    if (codeIdx < 0) {
      toast.error("Could not find a Code column.");
      return;
    }
    let saved = 0;
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const code = String(row[codeIdx] || "").trim();
      const employee = g.employees.find((e) => String(e.unique_code).trim() === code);
      if (!employee) continue;
      for (const [di, day] of g.days.entries()) {
        const col = 3 + di;
        const attCode = String(row[col] || "").trim().toUpperCase();
        if (!attCode) continue;
        const gridRow = g.gridRows.find((r) => (r.person_id || r.id) === employee.id);
        const ok = await g.persistCell({
          personId: employee.id,
          dateString: day.dateString,
          gridDesignation: gridRow?.grid_designation || employee.designation,
          attCode,
          silent: true,
        });
        if (ok) saved++;
      }
    }
    toast.success(`Imported marks for ${saved} cells.`);
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
    <div className="flex flex-col gap-4">
      <PageTaskHeader
        title={readOnly ? "Admin attendance view" : "Attendance entry"}
        subtitle={readOnly ? "Full-cycle grid, read only." : "Mark daily attendance. Changes save as you go."}
      >
        {g.locked ? <StatusChip label="Locked" severity="warning" /> : null}
      </PageTaskHeader>

      <FilterBar>
        <label className="flex flex-col gap-1">
          <span className="text-[11px]">Site</span>
          <TinySelect value={g.siteId} onChange={(e) => g.setSiteId(e.target.value)}>
            <option value="">Select site</option>
            {typedSites.map((s) => <option key={s.id} value={s.id}>{s.site_name}</option>)}
          </TinySelect>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px]">Month (cycle end)</span>
          <TinySelect value={g.month} onChange={(e) => g.setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </TinySelect>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px]">Year</span>
          <TinySelect value={g.year} onChange={(e) => g.setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </TinySelect>
        </label>
        <button type="button" className="erp-btn-primary rounded-control px-3.5 py-2 text-xs" onClick={g.loadGrid} disabled={g.loading}>
          {g.loading ? "Loading…" : "Load grid"}
        </button>
        {g.site && !readOnly && !g.locked ? (
          <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs" onClick={g.lockMonth}>Lock month</button>
        ) : null}
        {g.site ? (
          <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs" onClick={exportExcel}>Export Excel</button>
        ) : null}
        {g.site && !readOnly && !g.locked ? (
          <label className="text-xs erp-btn-secondary rounded-control px-3 py-1.5 cursor-pointer">
            Import Excel
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => importExcel(e.target.files?.[0])} />
          </label>
        ) : null}
      </FilterBar>

      {g.site ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <KpiTile label="Roster" value={g.gridRows.length} sub={g.range ? formatSalaryRangeLabel(g.range) : ""} />
          <KpiTile label="Duty hours" value={g.site.duty_hours || 8} />
          <KpiTile label="Shift" value={g.site.shift_type === "ABCG" ? "ABCG" : "P-days"} />
          <KpiTile label="Sandwich" value={g.site.sandwich_rule ? "On" : "Off"} />
        </div>
      ) : null}

      {g.site && !readOnly && !g.locked ? (
        <SectionCard title="Bulk mark">
          <p className="type-meta mb-3">
            Present fills blank cells only. Leave, week-off, and half day use the person picker. Clear removes codes already marked (overtime is left as-is).
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 text-xs h-8">
              <input type="checkbox" checked={bulkMulti} onChange={(e) => setBulkMulti(e.target.checked)} />
              Multiple dates
            </label>
            {bulkMulti ? (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px]">From</span>
                  <TinyInput type="date" value={bulkFrom} onChange={(e) => setBulkFrom(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px]">To</span>
                  <TinyInput type="date" value={bulkTo} onChange={(e) => setBulkTo(e.target.value)} />
                </label>
              </>
            ) : (
              <label className="flex flex-col gap-1">
                <span className="text-[11px]">Date</span>
                <TinyInput type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
              </label>
            )}
            <TinyInput placeholder="Search name / code" value={g.search} onChange={(e) => g.setSearch(e.target.value)} />
            <button type="button" className="erp-btn-primary rounded-control px-3 py-1.5 text-xs" onClick={runBulkPresent}>Bulk present</button>
            <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs" onClick={() => openPicker("WO")}>Bulk week-off</button>
            <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs" onClick={() => openPicker("HD")}>Bulk half day</button>
            <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs" onClick={() => openPicker("L")}>Bulk leave</button>
            <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs" onClick={runBulkClear}>Clear marked</button>
            <label className="flex items-center gap-2 text-xs h-8">
              <input
                type="checkbox"
                checked={g.site.coff_worked_weekoff_eligible === true}
                onChange={(e) => g.persistCoff(e.target.checked)}
              />
              C-off for worked week-off
            </label>
          </div>
        </SectionCard>
      ) : g.site && !readOnly ? (
        <FilterBar>
          <TinyInput placeholder="Search name / code" value={g.search} onChange={(e) => g.setSearch(e.target.value)} />
        </FilterBar>
      ) : null}

      {g.site && g.days.length > 0 ? (
        <SectionCard title="Daily grid">
          <div className="overflow-auto max-h-[70vh] border border-border rounded-lg">
            <table className="text-[11px] border-collapse min-w-max">
              <thead className="sticky top-0 z-20 bg-surface-raised">
                <tr>
                  <th className="sticky left-0 z-30 bg-surface-raised border border-divider px-2 py-1.5">#</th>
                  <th className="sticky left-[36px] z-30 bg-surface-raised border border-divider px-2 py-1.5 min-w-[140px]">Name</th>
                  <th className="border border-divider px-2 py-1.5">Desig.</th>
                  {g.days.map((d) => (
                    <th key={d.dateString} className={`border border-divider px-1 py-1 text-center min-w-[52px] ${g.isNhPh(d.dateString) ? "bg-amber-50" : ""}`}>
                      <div>{d.day}{g.range && !isCalendarMonth(g.range.startDay, g.range.endDay) ? ` ${d.monthShort}` : ""}</div>
                      <div className="text-[10px] text-ink-muted">{d.date.toLocaleDateString("en-GB", { weekday: "short" })}</div>
                    </th>
                  ))}
                  <th className="border border-divider px-1">P</th>
                  <th className="border border-divider px-1">L</th>
                  <th className="border border-divider px-1">WO</th>
                  <th className="border border-divider px-1">OT</th>
                </tr>
              </thead>
              <tbody>
                {g.gridRows.map((row, idx) => {
                  const tot = g.totals[idx] || {};
                  const personId = row.person_id || row.id;
                  const desig = row.grid_designation || row.designation;
                  return (
                    <React.Fragment key={`${personId}-${desig}-${idx}`}>
                      <tr className={row.isDuplicate ? "bg-slate-50" : ""}>
                        <td className="sticky left-0 z-10 bg-white border border-divider px-2 text-center">{idx + 1}</td>
                        <td className="sticky left-[36px] z-10 bg-white border border-divider px-2 whitespace-nowrap">
                          {row.full_name}{row.isDefaultDesignationRow ? " *" : ""}
                          {g.multi && !readOnly ? (
                            <select
                              className="ml-1 h-6 text-[10px] border rounded"
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
                        <td className="border border-divider px-2 whitespace-nowrap">{desig}</td>
                        {g.days.map((d) => {
                          const rec = g.getRecord(personId, d.dateString, desig);
                          const disabled = g.isCellDisabled(row, d.dateString);
                          return (
                            <td key={d.dateString} className={`border border-divider p-0 ${g.isNhPh(d.dateString) ? "bg-amber-50" : ""} ${codeClass(rec?.att_code)}`}>
                              <select
                                className="w-full h-7 bg-transparent text-[11px] text-center"
                                disabled={disabled}
                                value={rec?.att_code || ""}
                                onChange={(e) => g.persistCell({ personId, dateString: d.dateString, gridDesignation: desig, attCode: e.target.value, clear: e.target.value === "" })}
                              >
                                {g.codes.map((c) => (
                                  <option key={c || "empty"} value={c}>{c || "—"}</option>
                                ))}
                              </select>
                            </td>
                          );
                        })}
                        <td className="border border-divider px-1 text-center tabular-nums">{tot.totalPresent ?? 0}</td>
                        <td className="border border-divider px-1 text-center tabular-nums">{tot.totalLeave ?? 0}</td>
                        <td className="border border-divider px-1 text-center tabular-nums">{tot.appliedWeekoff ?? 0}</td>
                        <td className="border border-divider px-1 text-center tabular-nums">{tot.totalOT ?? 0}</td>
                      </tr>
                      <tr>
                        <td className="sticky left-0 bg-white border border-divider" />
                        <td className="sticky left-[36px] bg-white border border-divider text-[10px] text-ink-muted px-2">OT</td>
                        <td className="border border-divider" />
                        {g.days.map((d) => {
                          const rec = g.getRecord(personId, d.dateString, desig);
                          const disabled = g.isCellDisabled(row, d.dateString);
                          return (
                            <td key={`ot-${d.dateString}`} className="border border-divider p-0">
                              <input
                                type="number"
                                min="0"
                                max="16"
                                disabled={disabled}
                                className="w-full h-6 text-center text-[11px] bg-transparent"
                                key={`${personId}-${d.dateString}-${desig}-${rec?.ot_hours || 0}`}
                                defaultValue={rec?.ot_hours || ""}
                                onBlur={(e) => g.persistOt({ personId, dateString: d.dateString, gridDesignation: desig, otHours: e.target.value })}
                              />
                            </td>
                          );
                        })}
                        <td colSpan={4} className="border border-divider" />
                      </tr>
                    </React.Fragment>
                  );
                })}
                <tr className="bg-surface-sunken font-semibold">
                  <td className="sticky left-0 bg-surface-sunken border border-divider" />
                  <td className="sticky left-[36px] bg-surface-sunken border border-divider px-2" colSpan={2}>Duty total</td>
                  {g.dayDuty.map((n, i) => (
                    <td key={g.days[i]?.dateString || i} className="border border-divider text-center tabular-nums">{n}</td>
                  ))}
                  <td colSpan={4} className="border border-divider" />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="type-meta mt-2">Primary designation rows show an asterisk. OT is the second row per person. NH/PH days are highlighted.</p>
        </SectionCard>
      ) : (
        <p className="type-meta">Select a site type, then a site, month, and year, and load the grid.</p>
      )}

      <Modal
        open={pickerOpen}
        title={PICKER_MODES[pickerMode]?.title || "Select people"}
        onClose={() => setPickerOpen(false)}
        widthClass="max-w-2xl"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="erp-btn-secondary rounded-control px-3.5 py-2 text-xs" onClick={() => setPickerOpen(false)}>Cancel</button>
            <button type="button" className="erp-btn-primary rounded-control px-3.5 py-2 text-xs" onClick={submitPicker}>Submit</button>
          </div>
        }
      >
        <p className="type-meta mb-3">{PICKER_MODES[pickerMode]?.hint}</p>
        <TinyInput className="mb-3 w-full" placeholder="Search employees…" value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] font-semibold mb-1">Available</p>
            <div className="max-h-64 overflow-auto border border-border rounded-lg">
              {pickerPeople.filter((row) => !pickerSelected.has(row.person_id || row.id)).map((row) => {
                const id = row.person_id || row.id;
                return (
                  <button key={id} type="button" className="block w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50 border-b border-divider" onClick={() => togglePicker(id, true)}>
                    <span className="font-medium">{row.unique_code}</span> {row.full_name}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold mb-1">Selected ({pickerSelected.size})</p>
            <div className="max-h-64 overflow-auto border border-border rounded-lg">
              {pickerPeople.filter((row) => pickerSelected.has(row.person_id || row.id)).map((row) => {
                const id = row.person_id || row.id;
                return (
                  <button key={id} type="button" className="block w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50 border-b border-divider" onClick={() => togglePicker(id, false)}>
                    <span className="font-medium">{row.unique_code}</span> {row.full_name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
