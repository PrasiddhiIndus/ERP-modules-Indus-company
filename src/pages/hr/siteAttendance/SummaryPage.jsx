import React, { useEffect, useMemo, useState } from "react";
import { toast } from "../../../lib/toast";
import * as XLSX from "xlsx";
import { FilterBar, PageTaskHeader, SectionCard, TinyInput, TinySelect } from "../../adminOperations/components/AdminUi";
import { parseDateOnlyLocal } from "../../../lib/siteAttendance/dateFormat";
import { filterSitesByType } from "../../../lib/siteAttendance/siteTypes";
import {
  buildAttendanceDataMap,
  getAttendanceForGridRow,
  getGridRowsInOrder,
  isMultiDesignationEnabled,
} from "../../../lib/siteAttendance/multiDesignation";
import {
  ensureGridPlacements,
  getSite,
  listAllSites,
  listAssignments,
  listAttendance,
  listPeopleByIds,
  listSummaryRemarks,
  upsertSummaryRemark,
  userFriendlyError,
} from "../../../lib/siteAttendance/siteAttendanceApi";
import { siteIdsForQuery } from "../../../lib/siteAttendance/siteAttendanceAccess";
import { useSiteAttendanceAccess, useSiteAttendanceType } from "./SiteAttendanceLayout";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function SummaryPage() {
  const { siteType } = useSiteAttendanceType();
  const access = useSiteAttendanceAccess();
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState("");
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState([]);
  const [siteName, setSiteName] = useState("");
  const [daysInMonth, setDaysInMonth] = useState(0);
  const [loading, setLoading] = useState(false);
  const typedSites = useMemo(() => filterSitesByType(sites, siteType), [sites, siteType]);

  useEffect(() => {
    listAllSites({ siteIds: siteIdsForQuery(access) }).then(setSites).catch((err) => toast.error(userFriendlyError(err)));
  }, [access.seesAllSites, access.allowedSiteIds]);

  const load = async () => {
    if (!siteId || !month || !year) {
      toast.error("Select site, month, and year.");
      return;
    }
    setLoading(true);
    try {
      const site = await getSite(Number(siteId));
      setSiteName(site.site_name);
      const dim = new Date(Number(year), Number(month), 0).getDate();
      setDaysInMonth(dim);
      const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(dim).padStart(2, "0")}`;
      const assignments = await listAssignments({ siteId: Number(siteId) });
      const active = assignments.filter((a) => {
        const fromDate = new Date(a.from_date);
        const toDate = a.to_date ? new Date(a.to_date) : new Date("9999-12-31");
        return fromDate <= new Date(monthEnd) && toDate >= new Date(monthStart);
      });
      const people = await listPeopleByIds([...new Set(active.map((a) => a.person_id))]);
      let placements = [];
      if (isMultiDesignationEnabled(site)) {
        placements = await ensureGridPlacements(Number(siteId), people, Number(month), Number(year));
      }
      const attendance = await listAttendance({ siteId: Number(siteId), month: Number(month), year: Number(year) });
      const map = buildAttendanceDataMap(attendance, isMultiDesignationEnabled(site));
      const byDesig = {};
      if (isMultiDesignationEnabled(site)) {
        getGridRowsInOrder(people, placements).forEach((row) => {
          const d = row.grid_designation;
          if (!byDesig[d]) byDesig[d] = [];
          byDesig[d].push(row);
        });
      } else {
        people.forEach((p) => {
          const d = p.designation || "No Designation";
          if (!byDesig[d]) byDesig[d] = [];
          byDesig[d].push(p);
        });
      }
      const remarks = await listSummaryRemarks(Number(siteId), Number(month), Number(year));
      const remarksMap = Object.fromEntries(remarks.map((r) => [r.designation, r]));

      const summary = Object.keys(byDesig).sort().map((designation) => {
        const emps = byDesig[designation];
        const authDuty = emps.length * dim;
        let dutyPerf = 0;
        let otTotal = 0;
        let woCount = 0;
        let otDays = 0;
        emps.forEach((employee) => {
          const joiningDate = parseDateOnlyLocal(employee.joining_date);
          const gridDesig = employee.grid_designation || employee.designation;
          for (let day = 1; day <= dim; day++) {
            const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayDate = parseDateOnlyLocal(dateStr);
            if (joiningDate && dayDate < joiningDate) continue;
            const record = isMultiDesignationEnabled(site)
              ? getAttendanceForGridRow(employee.id, dateStr, gridDesig, map, placements, people).record
              : map[`${employee.id}_${dateStr}`];
            if (!record) continue;
            const code = String(record.att_code || "").trim().toUpperCase();
            if (code === "P") dutyPerf++;
            if (code === "WO") woCount++;
            if (record.ot_hours) {
              otTotal += record.ot_hours || 0;
              if (record.ot_hours > 0) otDays++;
            }
          }
        });
        let otDisplay = 0;
        if (site.regular_ot) otDisplay = otDays;
        else otDisplay = Math.round((otTotal / 8) * 100) / 100;
        const total = dutyPerf + otDisplay + woCount;
        const saved = remarksMap[designation] || {};
        const customDays = saved.custom_days || null;
        const auth = customDays || authDuty;
        return {
          designation,
          numEmployees: emps.length,
          authDuty: auth,
          dutyPerf,
          ot: otDisplay,
          wo: woCount,
          total,
          lessDuties: total < auth ? auth - total : 0,
          remarks: saved.remarks || "",
          customDays,
        };
      });
      setRows(summary);
    } catch (err) {
      toast.error(userFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const saveRemarks = async () => {
    try {
      for (const row of rows) {
        await upsertSummaryRemark({
          site_id: Number(siteId),
          designation: row.designation,
          month: Number(month),
          year: Number(year),
          remarks: row.remarks || "",
          custom_days: row.customDays || null,
        });
      }
      toast.success("Remarks saved.");
    } catch (err) {
      toast.error(userFriendlyError(err));
    }
  };

  const exportExcel = () => {
    const header = ["Designation", "Nos", "Auth duty", "Duty perf", "OT", "W/O", "Total", "Less duties", "Remarks"];
    const body = rows.map((r) => [r.designation, r.numEmployees, r.authDuty, r.dutyPerf, r.ot, r.wo, r.total, r.lessDuties, r.remarks]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Summary");
    XLSX.writeFile(wb, `Summary_${siteName}_${month}_${year}.xlsx`);
  };

  return (
    <div className="flex flex-col gap-4">
      <PageTaskHeader title="Monthly summary" subtitle="Designation totals for the selected site and month." />
      <FilterBar>
        <TinySelect value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          <option value="">Select site</option>
          {typedSites.map((s) => <option key={s.id} value={s.id}>{s.site_name}</option>)}
        </TinySelect>
        <TinySelect value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </TinySelect>
        <TinySelect value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {Array.from({ length: 11 }, (_, i) => now.getFullYear() - 5 + i).map((y) => <option key={y} value={y}>{y}</option>)}
        </TinySelect>
        <button type="button" className="erp-btn-primary rounded-control px-3.5 py-2 text-xs" onClick={load} disabled={loading}>{loading ? "Loading…" : "Load"}</button>
        {rows.length ? (
          <>
            <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs" onClick={saveRemarks}>Save remarks</button>
            <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs" onClick={exportExcel}>Export Excel</button>
          </>
        ) : null}
      </FilterBar>

      {rows.length ? (
        <SectionCard title={`Summary of ${siteName} — ${MONTHS[month - 1]} ${year} (${daysInMonth} days)`}>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-ink-secondary border-b border-divider">
                  {["Designation","Nos","Auth duty","Duty perf","OT","W/O","Total","Less","Remarks"].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.designation} className="border-b border-divider">
                    <td className="py-1.5 pr-3">{row.designation}</td>
                    <td className="py-1.5 pr-3">{row.numEmployees}</td>
                    <td className="py-1.5 pr-3">
                      <TinyInput type="number" className="w-20" value={row.customDays ?? row.authDuty} onChange={(e) => {
                        const next = [...rows];
                        next[idx] = { ...row, customDays: Number(e.target.value) || null, authDuty: Number(e.target.value) || row.authDuty };
                        setRows(next);
                      }} />
                    </td>
                    <td className="py-1.5 pr-3">{row.dutyPerf}</td>
                    <td className="py-1.5 pr-3">{row.ot}</td>
                    <td className="py-1.5 pr-3">{row.wo}</td>
                    <td className="py-1.5 pr-3">{row.total}</td>
                    <td className="py-1.5 pr-3">{row.lessDuties}</td>
                    <td className="py-1.5 pr-3">
                      <TinyInput value={row.remarks} onChange={(e) => {
                        const next = [...rows];
                        next[idx] = { ...row, remarks: e.target.value };
                        setRows(next);
                      }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
