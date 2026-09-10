import React, { useEffect, useMemo, useState } from "react";
import { toast } from "../../../lib/toast";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FilterBar, KpiTile, PageTaskHeader, SectionCard, TinySelect } from "../../adminOperations/components/AdminUi";
import { categorizeAttendanceRecord, emptyMetrics } from "../../../lib/siteAttendance/attendanceRules";
import { filterSitesByType } from "../../../lib/siteAttendance/siteTypes";
import { getSite, listAllSites, listAttendance, listSiteDesignations, userFriendlyError } from "../../../lib/siteAttendance/siteAttendanceApi";
import { siteIdsForQuery } from "../../../lib/siteAttendance/siteAttendanceAccess";
import { useSiteAttendanceAccess, useSiteAttendanceType } from "./SiteAttendanceLayout";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function linearRegression(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += values[i]; sumXY += i * values[i]; sumXX += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) || 0;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export default function DashboardPage() {
  const { siteType } = useSiteAttendanceType();
  const access = useSiteAttendanceAccess();
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState("");
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [metrics, setMetrics] = useState(emptyMetrics());
  const [codeBars, setCodeBars] = useState([]);
  const [shortfall, setShortfall] = useState([]);
  const [forecast, setForecast] = useState("—");
  const [loading, setLoading] = useState(false);
  const typedSites = useMemo(() => filterSitesByType(sites, siteType), [sites, siteType]);

  useEffect(() => {
    listAllSites({ siteIds: siteIdsForQuery(access) }).then(setSites).catch((err) => toast.error(userFriendlyError(err)));
  }, [access.seesAllSites, access.allowedSiteIds]);

  useEffect(() => {
    if (!sites.length) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites, siteType, siteId, month, year]);

  const load = async () => {
    setLoading(true);
    try {
      const targetSites = siteId ? typedSites.filter((s) => String(s.id) === String(siteId)) : typedSites;
      const totals = emptyMetrics();
      const codeCounts = {};
      const daily = {};
      let strength = 0;
      for (const s of targetSites) {
        const full = await getSite(s.id);
        const desigs = await listSiteDesignations(s.id);
        strength += desigs.reduce((sum, d) => sum + (d.total_strength || 0), 0);
        const records = await listAttendance({ siteId: s.id, month: Number(month), year: Number(year) });
        records.forEach((rec) => {
          const cat = categorizeAttendanceRecord(rec, full);
          if (cat === "present") totals.present += 1;
          else if (cat === "half") totals.half += 1;
          else if (cat === "leave") totals.leave += 1;
          else if (cat === "weekoff") totals.weekoff += 1;
          else if (cat === "holiday") totals.holiday += 1;
          else if (cat === "coff") totals.coff += 1;
          else totals.other += 1;
          totals.otHours += rec.ot_hours || 0;
          const code = String(rec.att_code || "").toUpperCase() || "Blank";
          codeCounts[code] = (codeCounts[code] || 0) + 1;
          const day = String(rec.att_date).slice(8, 10);
          if (!daily[day]) daily[day] = { present: 0 };
          if (cat === "present" || cat === "half") daily[day].present += cat === "half" ? 0.5 : 1;
        });
      }
      setMetrics(totals);
      setCodeBars(Object.entries(codeCounts).map(([label, value]) => ({ label, value })));
      const trend = Object.keys(daily).sort().map((day) => ({
        label: day,
        onDuty: daily[day].present,
        shortfall: strength ? Math.max(0, strength - daily[day].present) : 0,
      }));
      setShortfall(trend);
      const values = trend.map((t) => t.shortfall);
      const { slope, intercept } = linearRegression(values);
      const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      const next = intercept + slope * values.length;
      setForecast(values.length ? `${avg.toFixed(1)} avg · next ${next.toFixed(1)}` : "—");
    } catch (err) {
      toast.error(userFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageTaskHeader title="Site attendance dashboard" subtitle="Coverage, code mix, and shortfall against configured strength." />
      {!siteType ? (
        <p className="type-meta rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          Showing all site types. Most live sites are Fire — pick a type to filter.
        </p>
      ) : typedSites.length === 0 ? (
        <p className="type-meta rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          No sites of this type yet. Add one under Site Master.
        </p>
      ) : null}
      <FilterBar>
        <TinySelect value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          <option value="">{siteType ? "All sites of this type" : "All sites"}</option>
          {typedSites.map((s) => <option key={s.id} value={s.id}>{s.site_name}</option>)}
        </TinySelect>
        <TinySelect value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </TinySelect>
        <TinySelect value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {Array.from({ length: 11 }, (_, i) => now.getFullYear() - 5 + i).map((y) => <option key={y} value={y}>{y}</option>)}
        </TinySelect>
        <button type="button" className="erp-btn-primary rounded-control px-3.5 py-2 text-xs" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
      </FilterBar>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
        <KpiTile label="Present" value={metrics.present} />
        <KpiTile label="Half day" value={metrics.half} />
        <KpiTile label="Leave" value={metrics.leave} />
        <KpiTile label="Week-off" value={metrics.weekoff} />
        <KpiTile label="OT hours" value={metrics.otHours} />
        <KpiTile label="Shortfall forecast" value={forecast} sub="Linear trend of daily gap vs strength" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Marks by code">
          <div className="h-64 w-full min-w-0 min-h-[16rem]">
            <ResponsiveContainer width="100%" height={256} minWidth={0} debounce={50}>
              <BarChart data={codeBars.length ? codeBars : [{ label: "—", value: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#2563eb" name="Count" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
        <SectionCard title="Daily shortfall">
          <div className="h-64 w-full min-w-0 min-h-[16rem]">
            <ResponsiveContainer width="100%" height={256} minWidth={0} debounce={50}>
              <BarChart data={shortfall.length ? shortfall : [{ label: "—", onDuty: 0, shortfall: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="onDuty" fill="#059669" name="On duty" />
                <Bar dataKey="shortfall" fill="#d97706" name="Shortfall" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
