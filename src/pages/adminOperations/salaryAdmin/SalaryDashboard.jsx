import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Calculator,
  LayoutDashboard,
  Users,
  Wallet,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { EMPLOYEE_MASTER_TABLE } from "../../../modules/payroll/integrations";
import { KpiTile, PageTaskHeader, SectionCard } from "../components/AdminUi";
import { fetchSalaryStructureMap, formatINR } from "./salaryData";

/**
 * Salary Admin dashboard — overview of employees vs CTC setup (UI only).
 */
export default function SalaryDashboard() {
  const [employees, setEmployees] = useState([]);
  const [salaryMap, setSalaryMap] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setEmployees([]);
        return;
      }
      const { data, error: fetchError } = await supabase
        .from(EMPLOYEE_MASTER_TABLE)
        .select("id, full_name, employee_code, department, designation")
        .order("employee_id", { ascending: true });
      if (fetchError) throw fetchError;
      setEmployees(data || []);
      setSalaryMap(await fetchSalaryStructureMap());
    } catch (err) {
      console.error("Salary Dashboard: failed to load", err);
      setError("Could not load salary overview. Please try again.");
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    let declared = 0;
    let ctcSum = 0;
    let grossSum = 0;
    for (const emp of employees) {
      const s = salaryMap.get(String(emp.id));
      if (s?.declared && (s.gross_monthly != null || s.basic_monthly != null)) {
        declared += 1;
        ctcSum += Number(s.ctc_annual) || 0;
        grossSum += Number(s.gross_monthly) || Number(s.basic_monthly) || 0;
      }
    }
    return {
      total: employees.length,
      declared,
      pending: Math.max(0, employees.length - declared),
      ctcSum,
      grossSum,
    };
  }, [employees, salaryMap]);

  const recentUnset = useMemo(() => {
    return employees
      .filter((e) => {
        const s = salaryMap.get(String(e.id));
        return !(s?.declared && (s.gross_monthly != null || s.basic_monthly != null));
      })
      .slice(0, 8);
  }, [employees, salaryMap]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-[1200px]">
      <PageTaskHeader
        title="Salary Admin"
        subtitle="Overview of employees and compensation setup. Open Salary Master to set CTC."
      >
        <Link
          to="/app/admin/salary-admin/salary-master"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-deep"
        >
          Open Salary Master
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </PageTaskHeader>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiTile
          label="Employees"
          value={stats.total}
          sub="From Employee Master"
          tone="border-slate-200"
        />
        <KpiTile
          label="CTC declared"
          value={stats.declared}
          sub="Salary set on device"
          tone="border-emerald-100"
        />
        <KpiTile
          label="Pending setup"
          value={stats.pending}
          sub="No salary entered yet"
          tone="border-amber-100"
        />
        <KpiTile
          label="CTC book (annual)"
          value={stats.ctcSum ? formatINR(stats.ctcSum) : "—"}
          sub={stats.grossSum ? `Gross / mo ${formatINR(stats.grossSum)}` : "Enter CTC on Salary Master"}
          tone="border-blue-100"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Quick links">
          <div className="space-y-2">
            <Link
              to="/app/admin/salary-admin/salary-master"
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5 hover:border-accent/30 hover:bg-slate-50/80"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Wallet className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>
                  <span className="block text-xs font-semibold text-gray-900">Salary Master</span>
                  <span className="block text-[11px] text-gray-500">
                    Open an employee profile and set compensation
                  </span>
                </span>
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-gray-300 shrink-0" />
            </Link>
            <Link
              to="/app/admin/salary-admin/salary-processing"
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5 hover:border-accent/30 hover:bg-slate-50/80"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Calculator className="h-4 w-4 text-teal-600 shrink-0" />
                <span>
                  <span className="block text-xs font-semibold text-gray-900">Salary Processing</span>
                  <span className="block text-[11px] text-gray-500">Run monthly salary cycles</span>
                </span>
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-gray-300 shrink-0" />
            </Link>
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-200 px-3 py-2.5 text-[11px] text-gray-500">
              <LayoutDashboard className="h-4 w-4 shrink-0 text-gray-400" />
              CTC values are UI drafts on this device until salary tables are connected.
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Needs CTC setup"
          right={
            <span className="text-[11px] text-gray-500 tabular-nums">{stats.pending} pending</span>
          }
        >
          {recentUnset.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {stats.total === 0
                ? "No employees in Employee Master yet."
                : "All listed employees have a CTC draft."}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recentUnset.map((emp) => (
                <li key={emp.id}>
                  <Link
                    to={`/app/admin/salary-admin/salary-master/${emp.id}`}
                    className="flex items-center justify-between gap-2 py-2 hover:bg-slate-50/80 -mx-1 px-1 rounded"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-gray-900 truncate">
                        {emp.full_name || "—"}
                      </span>
                      <span className="block text-[11px] text-gray-500 truncate">
                        {[emp.employee_code, emp.designation, emp.department]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-[10px] font-medium text-amber-800">
                      Not set
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {stats.pending > recentUnset.length ? (
            <Link
              to="/app/admin/salary-admin/salary-master"
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
            >
              <Users className="h-3.5 w-3.5" />
              View all in Salary Master
            </Link>
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}
