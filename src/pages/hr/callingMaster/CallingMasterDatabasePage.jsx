import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LayoutDashboard, PhoneCall, RefreshCw, TrendingUp, Users } from "lucide-react";
import FormDateInput from "../../../components/FormDateInput";
import {
  DenseTable,
  FilterBar,
  PageTaskHeader,
  SectionCard,
  StatusChip,
  TinySelect,
} from "../../adminOperations/components/AdminUi";
import { CALLING_MASTER_RECORDS_EVENT } from "./callingMasterConfig";
import { useCallingMasterDropdowns } from "./useCallingMasterDropdowns";
import { loadCallingMasterRecords } from "./callingMasterStorage";

const CHART_COLORS = ["#0f766e", "#0369a1", "#b45309", "#be123c", "#4338ca", "#15803d", "#0e7490", "#a16207"];

function monthKeyFromDate(value) {
  const iso = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return iso.slice(0, 7);
}

function formatMonthLabel(monthKey) {
  if (!monthKey) return "All months";
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function formatDateDisplay(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function countBy(rows, key) {
  const map = new Map();
  rows.forEach((row) => {
    const label = String(row[key] || "").trim() || "Unassigned";
    map.set(label, (map.get(label) || 0) + 1);
  });
  return [...map.entries()]
    .map(([label, count]) => ({ label, name: label, count, value: count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function ChartEmpty({ message = "No data for the selected filters." }) {
  return (
    <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
      {label ? <p className="mb-1 text-xs font-semibold text-slate-700">{label}</p> : null}
      {payload.map((item) => (
        <p key={item.dataKey || item.name} className="text-xs text-slate-600">
          <span className="font-medium" style={{ color: item.color || item.fill }}>
            {item.name}:
          </span>{" "}
          {item.value}
        </p>
      ))}
    </div>
  );
}

export default function CallingMasterDatabasePage() {
  const { options: dropdownOptions } = useCallingMasterDropdowns();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [callerFilter, setCallerFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const loadRecords = async () => {
    setLoading(true);
    try {
      const next = await loadCallingMasterRecords();
      setRecords(next);
      setError("");
    } catch (err) {
      setRecords([]);
      setError(err.message || "Unable to load calling data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
    const refresh = () => loadRecords();
    window.addEventListener(CALLING_MASTER_RECORDS_EVENT, refresh);
    return () => window.removeEventListener(CALLING_MASTER_RECORDS_EVENT, refresh);
  }, []);

  const monthOptions = useMemo(() => {
    const keys = new Set(records.map((row) => monthKeyFromDate(row.callDate)).filter(Boolean));
    return [...keys].sort((a, b) => b.localeCompare(a));
  }, [records]);

  const filtered = useMemo(() => {
    return records.filter((row) => {
      const month = monthKeyFromDate(row.callDate);
      if (monthFilter && month !== monthFilter) return false;
      if (callerFilter && String(row.callingBy || "") !== callerFilter) return false;
      if (fromDate && String(row.callDate || "") < fromDate) return false;
      if (toDate && String(row.callDate || "") > toDate) return false;
      return true;
    });
  }, [records, monthFilter, callerFilter, fromDate, toDate]);

  const callerBreakdown = useMemo(() => countBy(filtered, "callingBy"), [filtered]);
  const suitabilityBreakdown = useMemo(() => countBy(filtered, "siteSuitable"), [filtered]);
  const industryBreakdown = useMemo(() => countBy(filtered, "industryWorked").slice(0, 8), [filtered]);
  const homeStateBreakdown = useMemo(() => countBy(filtered, "homeState").slice(0, 8), [filtered]);
  const cvBreakdown = useMemo(() => countBy(filtered, "cvSubmitted"), [filtered]);
  const workingBreakdown = useMemo(() => countBy(filtered, "currentlyWorking"), [filtered]);

  const monthlyTrend = useMemo(() => {
    const map = new Map();
    filtered.forEach((row) => {
      const key = monthKeyFromDate(row.callDate);
      if (!key) return;
      const current = map.get(key) || { month: key, calls: 0, immediate: 0, cv: 0 };
      current.calls += 1;
      if (row.siteSuitable === "Immediate") current.immediate += 1;
      if (row.cvSubmitted === "Yes") current.cv += 1;
      map.set(key, current);
    });
    return [...map.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((item) => ({
        ...item,
        label: formatMonthLabel(item.month),
      }));
  }, [filtered]);

  const salaryByCaller = useMemo(() => {
    const map = new Map();
    filtered.forEach((row) => {
      const salary = Number(row.salaryGross);
      if (!Number.isFinite(salary) || salary <= 0) return;
      const caller = String(row.callingBy || "").trim() || "Unassigned";
      const bucket = map.get(caller) || { name: caller, total: 0, count: 0 };
      bucket.total += salary;
      bucket.count += 1;
      map.set(caller, bucket);
    });
    return [...map.values()]
      .map((item) => ({
        name: item.name,
        avgSalary: Math.round(item.total / item.count),
        count: item.count,
      }))
      .sort((a, b) => b.avgSalary - a.avgSalary)
      .slice(0, 8);
  }, [filtered]);

  const metrics = useMemo(() => {
    const total = filtered.length;
    const cvYes = filtered.filter((row) => row.cvSubmitted === "Yes").length;
    const working = filtered.filter((row) => row.currentlyWorking === "Yes").length;
    const immediate = filtered.filter((row) => row.siteSuitable === "Immediate").length;
    const uniqueCallers = new Set(filtered.map((row) => row.callingBy).filter(Boolean)).size;
    const salaryValues = filtered
      .map((row) => Number(row.salaryGross))
      .filter((value) => Number.isFinite(value) && value > 0);
    const avgSalary = salaryValues.length
      ? salaryValues.reduce((sum, value) => sum + value, 0) / salaryValues.length
      : 0;
    const experienceValues = filtered
      .map((row) => Number(row.totalExperience))
      .filter((value) => Number.isFinite(value) && value >= 0);
    const avgExperience = experienceValues.length
      ? experienceValues.reduce((sum, value) => sum + value, 0) / experienceValues.length
      : 0;

    return [
      { label: "Total calls", value: total, sub: "In selected period", icon: PhoneCall },
      { label: "Active callers", value: uniqueCallers, sub: "Who logged calls", icon: Users },
      {
        label: "CV submitted",
        value: cvYes,
        sub: total ? `${Math.round((cvYes / total) * 100)}% conversion` : "No calls yet",
        icon: TrendingUp,
      },
      {
        label: "Currently working",
        value: working,
        sub: total ? `${Math.round((working / total) * 100)}% of candidates` : "No calls yet",
        icon: Users,
      },
      {
        label: "Immediate fit",
        value: immediate,
        sub: total ? `${Math.round((immediate / total) * 100)}% ready now` : "No calls yet",
        icon: LayoutDashboard,
      },
      {
        label: "Avg salary",
        value: avgSalary ? `₹${Math.round(avgSalary).toLocaleString("en-IN")}` : "—",
        sub: salaryValues.length ? `Across ${salaryValues.length} filled values` : "No salary data",
        icon: TrendingUp,
      },
      {
        label: "Avg experience",
        value: avgExperience ? `${avgExperience.toFixed(1)} yrs` : "—",
        sub: experienceValues.length ? `Across ${experienceValues.length} profiles` : "No experience data",
        icon: TrendingUp,
      },
      {
        label: "Distinct industries",
        value: new Set(filtered.map((row) => row.industryWorked).filter(Boolean)).size,
        sub: "In filtered set",
        icon: LayoutDashboard,
      },
    ];
  }, [filtered]);

  const recentColumns = [
    { key: "callDate", label: "Date", render: (row) => formatDateDisplay(row.callDate) },
    { key: "callingBy", label: "Calling By" },
    { key: "candidateName", label: "Candidate" },
    { key: "phoneNumber", label: "Mobile" },
    {
      key: "siteSuitable",
      label: "Site Suitable",
      render: (row) => (
        <StatusChip
          label={row.siteSuitable || "Review"}
          severity={row.siteSuitable === "Immediate" ? "info" : row.siteSuitable === "Not suitable" ? "critical" : "warning"}
        />
      ),
    },
    { key: "industryWorked", label: "Industry" },
  ];

  const clearFilters = () => {
    setMonthFilter("");
    setCallerFilter("");
    setFromDate("");
    setToDate("");
  };

  const hasData = filtered.length > 0;

  return (
    <div className="space-y-5">
      <PageTaskHeader
        title="Calling Dashboard"
        subtitle="Live calling metrics, caller productivity, and screening outcomes from Calling Database."
      >
        <button type="button" onClick={loadRecords} className="erp-btn-secondary rounded-control px-3.5 py-2 inline-flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </PageTaskHeader>

      <FilterBar>
        <label>
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Month</span>
          <TinySelect
            value={monthFilter}
            onChange={(event) => setMonthFilter(event.target.value)}
            className="min-w-[10rem] rounded-lg border-slate-200 bg-white text-sm"
          >
            <option value="">All months</option>
            {monthOptions.map((month) => (
              <option key={month} value={month}>
                {formatMonthLabel(month)}
              </option>
            ))}
          </TinySelect>
        </label>

        <label>
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Calling By</span>
          <TinySelect
            value={callerFilter}
            onChange={(event) => setCallerFilter(event.target.value)}
            className="min-w-[10rem] rounded-lg border-slate-200 bg-white text-sm"
          >
            <option value="">All callers</option>
            {(dropdownOptions.callingBy || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </TinySelect>
        </label>

        <label>
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">From date</span>
          <FormDateInput
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            className="h-8 min-w-[11rem] rounded-lg border border-slate-200 bg-white"
          />
        </label>

        <label>
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">To date</span>
          <FormDateInput
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            className="h-8 min-w-[11rem] rounded-lg border border-slate-200 bg-white"
          />
        </label>

        <div className="ml-auto flex items-end">
          <button type="button" onClick={clearFilters} className="erp-btn-secondary rounded-control px-3 py-2">
            Clear filters
          </button>
        </div>
      </FilterBar>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 animate-pulse">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-28 rounded-card border border-slate-200 bg-slate-100" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="relative overflow-hidden rounded-card border border-border bg-gradient-to-br from-white via-white to-slate-50 px-4 py-3.5 shadow-card"
                >
                  <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-teal-500/10" />
                  <div className="relative flex items-start justify-between gap-3">
                    <div>
                      <p className="type-mono-caption">{item.label}</p>
                      <p className="mt-1.5 text-2xl font-semibold text-ink">{item.value}</p>
                      <p className="mt-1 text-xs text-ink-muted">{item.sub}</p>
                    </div>
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {!hasData ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center">
              <LayoutDashboard className="mx-auto h-8 w-8 text-slate-400" />
              <h3 className="mt-3 text-base font-semibold text-slate-900">No calling data yet</h3>
              <p className="mt-2 text-sm text-slate-500">
                Add candidates from the Candidates tab to see live charts and metrics here.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                <SectionCard title="Monthly call trend">
                  {monthlyTrend.length ? (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={monthlyTrend}>
                          <defs>
                            <linearGradient id="callsGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0f766e" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#0f766e" stopOpacity={0.02} />
                            </linearGradient>
                            <linearGradient id="cvGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0369a1" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#0369a1" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                          <Tooltip content={<ChartTooltip />} />
                          <Legend />
                          <Area type="monotone" dataKey="calls" name="Calls" stroke="#0f766e" fill="url(#callsGradient)" strokeWidth={2.5} />
                          <Area type="monotone" dataKey="cv" name="CV submitted" stroke="#0369a1" fill="url(#cvGradient)" strokeWidth={2} />
                          <Area type="monotone" dataKey="immediate" name="Immediate fit" stroke="#b45309" fill="transparent" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <ChartEmpty />
                  )}
                </SectionCard>

                <SectionCard title="Who called">
                  {callerBreakdown.length ? (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={callerBreakdown} layout="vertical" margin={{ left: 16, right: 12 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                          <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: "#64748b" }} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="count" name="Calls" radius={[0, 8, 8, 0]}>
                            {callerBreakdown.map((entry, index) => (
                              <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <ChartEmpty />
                  )}
                </SectionCard>

                <SectionCard title="Site suitability mix">
                  {suitabilityBreakdown.length ? (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={suitabilityBreakdown}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={58}
                            outerRadius={96}
                            paddingAngle={3}
                          >
                            {suitabilityBreakdown.map((entry, index) => (
                              <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<ChartTooltip />} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <ChartEmpty />
                  )}
                </SectionCard>

                <SectionCard title="CV vs currently working">
                  {cvBreakdown.length || workingBreakdown.length ? (
                    <div className="grid h-72 gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500">CV submitted</p>
                        <ResponsiveContainer width="100%" height="85%">
                          <PieChart>
                            <Pie data={cvBreakdown} dataKey="value" nameKey="name" outerRadius={78}>
                              {cvBreakdown.map((entry, index) => (
                                <Cell key={entry.name} fill={CHART_COLORS[(index + 1) % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip content={<ChartTooltip />} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div>
                        <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500">Currently working</p>
                        <ResponsiveContainer width="100%" height="85%">
                          <PieChart>
                            <Pie data={workingBreakdown} dataKey="value" nameKey="name" outerRadius={78}>
                              {workingBreakdown.map((entry, index) => (
                                <Cell key={entry.name} fill={CHART_COLORS[(index + 3) % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip content={<ChartTooltip />} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : (
                    <ChartEmpty />
                  )}
                </SectionCard>

                <SectionCard title="Top industries">
                  {industryBreakdown.length ? (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={industryBreakdown}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} interval={0} angle={-20} textAnchor="end" height={60} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="count" name="Candidates" fill="#0e7490" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <ChartEmpty />
                  )}
                </SectionCard>

                <SectionCard title="Top home states">
                  {homeStateBreakdown.length ? (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={homeStateBreakdown}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} interval={0} angle={-20} textAnchor="end" height={60} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="count" name="Candidates" fill="#15803d" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <ChartEmpty />
                  )}
                </SectionCard>

                <SectionCard title="Average salary by caller" className="xl:col-span-2">
                  {salaryByCaller.length ? (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={salaryByCaller}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="avgSalary" name="Avg salary (₹)" fill="#b45309" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <ChartEmpty message="No salary figures captured for the selected filters." />
                  )}
                </SectionCard>
              </div>

              <SectionCard
                title="Recent filtered calls"
                right={
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <PhoneCall className="h-3.5 w-3.5" />
                    {filtered.length} record(s)
                  </span>
                }
              >
                <DenseTable
                  columns={recentColumns}
                  rows={[...filtered]
                    .sort((a, b) => String(b.callDate || "").localeCompare(String(a.callDate || "")))
                    .slice(0, 12)}
                  rowKey="id"
                  stickyHeader
                  scrollMaxHeight="24rem"
                />
              </SectionCard>
            </>
          )}
        </>
      )}
    </div>
  );
}
