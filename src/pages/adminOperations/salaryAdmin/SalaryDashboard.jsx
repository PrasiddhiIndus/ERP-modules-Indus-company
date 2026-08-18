import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Calculator, Search, Wallet } from "lucide-react";
import {
  KpiTile,
  PageTaskHeader,
  SectionCard,
  StatusChip,
  FilterBar,
} from "../components/AdminUi";
import {
  AreaTrendChart,
  BarCompareChart,
  DonutChart,
  ChartPanel,
  compactInrTick,
} from "../../../components/charts/DashboardCharts";
import { formatINR, formatINRPlain } from "./salaryData";
import { listMonthRunsWithLines, monthLabel } from "./salaryMonthProcessing";
import {
  USE_MOCK_SALARY_PROCESSING,
  mockListRunsWithLines,
} from "./salaryProcessingMock";

function monthKeyToLabel(key) {
  if (!key || !/^\d{4}-\d{2}/.test(String(key))) return key || "—";
  const [y, m] = String(key).slice(0, 7).split("-").map(Number);
  return monthLabel(y, m);
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function currentYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthsBack(ym, count) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 - count, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Salary Admin analytics dashboard — spends, component splits, filters, employee search.
 */
export default function SalaryDashboard() {
  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fromYm, setFromYm] = useState(() => monthsBack(currentYm(), 5));
  const [toYm, setToYm] = useState(() => currentYm());
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (USE_MOCK_SALARY_PROCESSING) {
        setBundles(mockListRunsWithLines());
      } else {
        try {
          setBundles(await listMonthRunsWithLines());
        } catch (liveErr) {
          console.warn("Salary dashboard live load failed, using mock", liveErr);
          setBundles(mockListRunsWithLines());
          setError("Live salary sheets unavailable — showing sample data.");
        }
      }
    } catch (err) {
      console.error(err);
      setError("Could not load salary dashboard.");
      setBundles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (bundles || [])
      .filter(({ run }) => {
        const mk = run.month_key || "";
        if (fromYm && mk < fromYm) return false;
        if (toYm && mk > toYm) return false;
        return true;
      })
      .map(({ run, lines }) => {
        let ls = lines || [];
        if (needle) {
          ls = ls.filter((l) => {
            const hay = `${l.employee_code || ""} ${l.employee_name || ""} ${l.designation || ""}`.toLowerCase();
            return hay.includes(needle);
          });
        }
        if (dept !== "all") {
          ls = ls.filter((l) => String(l.designation || "").toLowerCase().includes(dept.toLowerCase()));
        }
        return { run, lines: ls };
      })
      .filter(({ lines }) => lines.length > 0 || !needle);
  }, [bundles, fromYm, toYm, q, dept]);

  const designationOptions = useMemo(() => {
    const set = new Set();
    for (const { lines } of bundles) {
      for (const l of lines || []) {
        if (l.designation) set.add(l.designation);
      }
    }
    return [...set].sort();
  }, [bundles]);

  const analytics = useMemo(() => {
    const byMonth = [];
    let totalGross = 0;
    let totalNet = 0;
    let totalDed = 0;
    let empSet = new Set();
    const split = {
      pf: 0,
      esic: 0,
      pt: 0,
      loan: 0,
      salAdv: 0,
      unpaid: 0,
      tds: 0,
    };
    const earnSplit = { basic: 0, hra: 0, special: 0 };
    const employeeRollup = new Map();

    for (const { run, lines } of filtered) {
      let mGross = 0;
      let mNet = 0;
      let mDed = 0;
      for (const l of lines) {
        const code = l.employee_code || String(l.employee_master_id);
        empSet.add(code);
        mGross += n(l.gross_wages);
        mNet += n(l.net_salary);
        mDed += n(l.total_ded);
        split.pf += n(l.emp_pf);
        split.esic += n(l.emp_esic);
        split.pt += n(l.pt_amount);
        split.loan += n(l.loan);
        split.salAdv += n(l.sal_adv);
        split.unpaid += Math.abs(n(l.unpaid_paid));
        split.tds += n(l.tds);
        earnSplit.basic += n(l.basic_earned);
        earnSplit.hra += n(l.hra_earned);
        earnSplit.special += n(l.special_allowance);

        const prev = employeeRollup.get(code) || {
          code,
          name: l.employee_name || code,
          designation: l.designation || "—",
          gross: 0,
          net: 0,
          ded: 0,
          loan: 0,
          months: 0,
        };
        prev.gross += n(l.gross_wages);
        prev.net += n(l.net_salary);
        prev.ded += n(l.total_ded);
        prev.loan += n(l.loan) + n(l.sal_adv);
        prev.months += 1;
        employeeRollup.set(code, prev);
      }
      totalGross += mGross;
      totalNet += mNet;
      totalDed += mDed;
      byMonth.push({
        key: run.month_key,
        label: monthKeyToLabel(run.month_key),
        fullName: monthKeyToLabel(run.month_key),
        gross: Math.round(mGross),
        net: Math.round(mNet),
        deductions: Math.round(mDed),
        employees: lines.length,
        revision: run.revision_no,
      });
    }

    byMonth.sort((a, b) => String(a.key).localeCompare(String(b.key)));

    const deductionDonut = [
      { name: "PF", value: Math.round(split.pf) },
      { name: "ESIC", value: Math.round(split.esic) },
      { name: "P Tax", value: Math.round(split.pt) },
      { name: "Loan", value: Math.round(split.loan) },
      { name: "Sal Adv", value: Math.round(split.salAdv) },
      { name: "Unpaid/Paid", value: Math.round(split.unpaid) },
      { name: "TDS", value: Math.round(split.tds) },
    ].filter((x) => x.value > 0);

    const earningsDonut = [
      { name: "Basic", value: Math.round(earnSplit.basic) },
      { name: "HRA", value: Math.round(earnSplit.hra) },
      { name: "Special", value: Math.round(earnSplit.special) },
    ].filter((x) => x.value > 0);

    const topEmployees = [...employeeRollup.values()]
      .sort((a, b) => b.net - a.net)
      .slice(0, 10);

    return {
      byMonth,
      totalGross: Math.round(totalGross),
      totalNet: Math.round(totalNet),
      totalDed: Math.round(totalDed),
      empCount: empSet.size,
      avgNet: empSet.size ? Math.round(totalNet / empSet.size) : 0,
      deductionDonut,
      earningsDonut,
      topEmployees,
      monthCount: byMonth.length,
    };
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-6xl w-full mx-auto">
      <PageTaskHeader
        className="mb-0"
        title="Salary Dashboard"
        subtitle="Spends, component splits, and employee search across processed salary months."
      >
        {USE_MOCK_SALARY_PROCESSING ? <StatusChip label="Mock data" severity="warning" /> : null}
        <Link
          to="/app/admin/salary-admin/salary-processing"
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-accent text-white text-[11px] font-medium"
        >
          Processing
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </PageTaskHeader>

      {error ? (
        <p className="text-xs text-amber-800 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5">{error}</p>
      ) : null}

      <SectionCard
        title="Filters"
        className="[&_.erp-card-header]:min-h-0 [&_.erp-card-header]:py-2 [&_.erp-card-body]:p-2.5"
      >
        <FilterBar>
          <label className="text-[10px] uppercase tracking-wide text-slate-500 space-y-0.5">
            <span className="block">From</span>
            <input
              type="month"
              className="h-7 border border-slate-200 rounded px-1.5 text-[11px] bg-white"
              value={fromYm}
              onChange={(e) => setFromYm(e.target.value)}
            />
          </label>
          <label className="text-[10px] uppercase tracking-wide text-slate-500 space-y-0.5">
            <span className="block">To</span>
            <input
              type="month"
              className="h-7 border border-slate-200 rounded px-1.5 text-[11px] bg-white"
              value={toYm}
              onChange={(e) => setToYm(e.target.value)}
            />
          </label>
          <label className="text-[10px] uppercase tracking-wide text-slate-500 space-y-0.5">
            <span className="block">Designation</span>
            <select
              className="h-7 border border-slate-200 rounded px-1.5 text-[11px] bg-white min-w-[8rem]"
              value={dept}
              onChange={(e) => setDept(e.target.value)}
            >
              <option value="all">All</option>
              {designationOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] uppercase tracking-wide text-slate-500 space-y-0.5 flex-1 min-w-[12rem]">
            <span className="block">Master search</span>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              <input
                className="h-7 w-full border border-slate-200 rounded pl-7 pr-2 text-[11px] bg-white"
                placeholder="Code, name, designation…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </label>
          <button
            type="button"
            className="h-7 px-2.5 text-[11px] rounded border border-slate-200 bg-white self-end"
            onClick={load}
          >
            Refresh
          </button>
        </FilterBar>
      </SectionCard>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        <KpiTile label="Months" value={analytics.monthCount} sub="In range" tone="border-slate-200" />
        <KpiTile label="Employees" value={analytics.empCount} sub="Distinct in range" tone="border-slate-200" />
        <KpiTile
          label="Gross paid"
          value={formatINRPlain(analytics.totalGross)}
          sub="Earned wages"
          tone="border-blue-100"
        />
        <KpiTile
          label="Deductions"
          value={formatINRPlain(analytics.totalDed)}
          sub="All components"
          tone="border-amber-100"
        />
        <KpiTile
          label="Net payout"
          value={formatINRPlain(analytics.totalNet)}
          sub={analytics.empCount ? `Avg ${formatINR(analytics.avgNet)}` : "—"}
          tone="border-emerald-100"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartPanel title="Gross vs net by month" subtitle="Processed salary sheets" height={220}>
          {analytics.byMonth.length ? (
            <AreaTrendChart
              data={analytics.byMonth}
              xKey="label"
              series={[
                { key: "gross", name: "Gross", color: "#3b82f6" },
                { key: "net", name: "Net", color: "#059669" },
              ]}
              height={200}
            />
          ) : (
            <p className="text-xs text-slate-500 py-10 text-center">No months in this range.</p>
          )}
        </ChartPanel>

        <ChartPanel title="Deductions by month" subtitle="Total withholdings" height={220}>
          {analytics.byMonth.length ? (
            <BarCompareChart
              data={analytics.byMonth}
              xKey="label"
              series={[{ key: "deductions", name: "Deductions", color: "#d97706" }]}
              height={200}
              yTickFormatter={compactInrTick}
            />
          ) : (
            <p className="text-xs text-slate-500 py-10 text-center">No data.</p>
          )}
        </ChartPanel>

        <ChartPanel title="Deduction split" subtitle="PF · ESIC · PT · Loan · Adv · TDS" height={220}>
          {analytics.deductionDonut.length ? (
            <DonutChart data={analytics.deductionDonut} height={200} formatter={(v) => formatINRPlain(v)} />
          ) : (
            <p className="text-xs text-slate-500 py-10 text-center">No deductions in range.</p>
          )}
        </ChartPanel>

        <ChartPanel title="Earnings split" subtitle="Basic · HRA · Special (earned)" height={220}>
          {analytics.earningsDonut.length ? (
            <DonutChart data={analytics.earningsDonut} height={200} formatter={(v) => formatINRPlain(v)} />
          ) : (
            <p className="text-xs text-slate-500 py-10 text-center">No earnings in range.</p>
          )}
        </ChartPanel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <SectionCard
          title="Top net earners"
          className="lg:col-span-2 [&_.erp-card-header]:min-h-0 [&_.erp-card-header]:py-2 [&_.erp-card-body]:p-2.5"
        >
          {!analytics.topEmployees.length ? (
            <p className="text-xs text-slate-500 py-6 text-center">No employees match filters.</p>
          ) : (
            <div className="overflow-auto max-h-72">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-slate-50 text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-semibold">Code</th>
                    <th className="text-left px-2 py-1.5 font-semibold">Name</th>
                    <th className="text-left px-2 py-1.5 font-semibold">Role</th>
                    <th className="text-right px-2 py-1.5 font-semibold">Gross</th>
                    <th className="text-right px-2 py-1.5 font-semibold">Ded</th>
                    <th className="text-right px-2 py-1.5 font-semibold">Net</th>
                    <th className="text-right px-2 py-1.5 font-semibold">Mos</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.topEmployees.map((e) => (
                    <tr key={e.code} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-2 py-1.5 font-mono">{e.code}</td>
                      <td className="px-2 py-1.5">{e.name}</td>
                      <td className="px-2 py-1.5 text-slate-600 truncate max-w-[8rem]">{e.designation}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatINRPlain(e.gross)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatINRPlain(e.ded)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                        {formatINRPlain(e.net)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{e.months}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Quick links"
          className="[&_.erp-card-header]:min-h-0 [&_.erp-card-header]:py-2 [&_.erp-card-body]:p-2.5"
        >
          <div className="space-y-2">
            <Link
              to="/app/admin/salary-admin/salary-processing"
              className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-2 hover:bg-slate-50"
            >
              <span className="flex items-center gap-2 text-[11px] font-medium text-slate-800">
                <Calculator className="h-3.5 w-3.5 text-teal-600" />
                Salary Processing
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
            </Link>
            <Link
              to="/app/admin/salary-admin/salary-master"
              className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-2 hover:bg-slate-50"
            >
              <span className="flex items-center gap-2 text-[11px] font-medium text-slate-800">
                <Wallet className="h-3.5 w-3.5 text-emerald-600" />
                Salary Master
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
            </Link>
            <Link
              to="/app/admin/salary-admin/salary-components"
              className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-2 hover:bg-slate-50"
            >
              <span className="flex items-center gap-2 text-[11px] font-medium text-slate-800">
                Salary Components
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
            </Link>
            <p className="text-[10px] text-slate-500 leading-relaxed pt-1">
              Loan, Sal Adv, Unpaid/Paid and TDS on Employee Master stay in sync with saved salary
              sheets (two-way with Process / Save).
            </p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
