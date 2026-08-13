import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, User } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { employmentTypeLabel } from "../../utils/employeeMasterReminders";
import { PageTaskHeader, SectionCard, StatusChip } from "../adminOperations/components/AdminUi";
import EmployeeMasterPersonalForm from "./employeeMaster/EmployeeMasterPersonalForm";
import SalaryEmployeeCtc from "../adminOperations/salaryAdmin/SalaryEmployeeCtc";
import {
  emptyEmployeeDeductions,
  getEmployeeDeductions,
  saveEmployeeDeductions,
} from "./employeeMaster/deductions/deductionsStore";
import EmployeeLoanTab from "./employeeMaster/deductions/EmployeeLoanTab";
import EmployeeSalAdvTab from "./employeeMaster/deductions/EmployeeSalAdvTab";
import EmployeeUnpaidPaidTab from "./employeeMaster/deductions/EmployeeUnpaidPaidTab";
import EmployeeTdsTab from "./employeeMaster/deductions/EmployeeTdsTab";
import EmployeeForm16Tab from "./employeeMaster/deductions/EmployeeForm16Tab";
import EmployeeLeavesTab from "./employeeMaster/EmployeeLeavesTab";
import EmployeeToursTab from "./employeeMaster/EmployeeToursTab";
import EmployeeSalaryHistoryTab from "./employeeMaster/EmployeeSalaryHistoryTab";
import EmployeePayslipsTab from "./employeeMaster/EmployeePayslipsTab";
import EmployeeSalaryRevisionsTab from "./employeeMaster/EmployeeSalaryRevisionsTab";
import { fetchOpenVariancesForEmployee } from "../adminOperations/salaryAdmin/salaryMonthProcessing";
import {
  canAccessSalaryAdmin,
  EMPLOYEE_MASTER_BASIC_TAB_IDS,
} from "../adminOperations/salaryAdmin/salaryAccess";

const TABS = [
  { id: "personal", label: "Personal details" },
  { id: "ctc", label: "CTC details" },
  { id: "leaves", label: "Leaves" },
  { id: "tours", label: "Tours" },
  { id: "loan", label: "Loan" },
  { id: "sal-adv", label: "Sal Adv" },
  { id: "unpaid-paid", label: "Unpaid / Paid Salary" },
  { id: "tds", label: "TDS" },
  { id: "form-16", label: "Form 16" },
  { id: "salary-history", label: "Salary history" },
  { id: "payslips", label: "Payslips" },
  { id: "revisions", label: "Salary Revisions" },
  { id: "documents", label: "Documents and Forms" },
  { id: "fnf", label: "F&F" },
];

const PLACEHOLDER_COPY = {
  documents: {
    title: "Documents and Forms",
    body: "Employee documents and forms will appear here once this section is connected.",
  },
  fnf: {
    title: "Full & Final",
    body: "Full & final settlement details for this employee will appear here once exit workflows are connected.",
  },
};

const CONTENT_TABS = new Set([
  "personal",
  "ctc",
  "leaves",
  "tours",
  "loan",
  "sal-adv",
  "unpaid-paid",
  "tds",
  "form-16",
  "salary-history",
  "payslips",
  "revisions",
]);

function statusSeverity(status) {
  if (status === "Active") return "info";
  if (status === "Inactive" || status === "Left") return "critical";
  return "warning";
}

function PlaceholderPanel({ tabId }) {
  const copy = PLACEHOLDER_COPY[tabId] || {
    title: "Coming soon",
    body: "This section is not available yet.",
  };
  return (
    <SectionCard title={copy.title}>
      <p className="text-sm text-ink-secondary">{copy.body}</p>
    </SectionCard>
  );
}

function mapHrLoan(row) {
  return {
    id: String(row.id),
    principal: Number(row.principal) || 0,
    balance_outstanding: Number(row.balance_outstanding) || 0,
    months: null,
    months_remaining: null,
    installment_amount: Number(row.installment_amount) || 0,
    start_month: row.start_month ? String(row.start_month).slice(0, 7) : "",
    end_month: row.end_month ? String(row.end_month).slice(0, 7) : "",
    status: row.status || "active",
    remarks: row.remarks || "",
    recoveries: [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    from_hr: true,
  };
}

export default function IfspEmployeeMasterDetail() {
  const { employeeId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();

  const salaryAdmin = canAccessSalaryAdmin(userProfile, user);
  const visibleTabs = useMemo(
    () =>
      salaryAdmin
        ? TABS
        : TABS.filter((t) => EMPLOYEE_MASTER_BASIC_TAB_IDS.includes(t.id)),
    [salaryAdmin]
  );

  const tabParam = searchParams.get("tab") || "personal";
  const activeTab = visibleTabs.some((t) => t.id === tabParam) ? tabParam : "personal";

  const [employee, setEmployee] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [salaryVariances, setSalaryVariances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deductions, setDeductions] = useState(() => emptyEmployeeDeductions());

  const persistDeductions = useCallback(
    (next) => {
      setDeductions(next);
      saveEmployeeDeductions(employeeId, next);
    },
    [employeeId]
  );

  const load = useCallback(async (opts = {}) => {
    const soft = Boolean(opts.soft);
    try {
      if (!soft) setLoading(true);
      setError("");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setEmployee(null);
        setEmployees([]);
        setSalaryVariances([]);
        setError("Session expired. Please log in again.");
        return;
      }

      const [oneRes, allRes] = await Promise.all([
        supabase
          .from("admin_ifsp_employee_master")
          .select("*")
          .eq("id", employeeId)
          .maybeSingle(),
        supabase
          .from("admin_ifsp_employee_master")
          .select("*")
          .order("employee_id", { ascending: true }),
      ]);

      if (oneRes.error) throw oneRes.error;
      if (allRes.error) throw allRes.error;
      if (!oneRes.data) {
        setEmployee(null);
        setEmployees(allRes.data || []);
        setSalaryVariances([]);
        setError("Employee not found.");
        return;
      }
      setEmployee(oneRes.data);
      setEmployees(allRes.data || []);

      if (!soft) {
        const local = getEmployeeDeductions(employeeId);
        let merged = local;

        if (!local.loans?.length) {
          try {
            const { data: hrLoans, error: hrErr } = await supabase
              .from("hr_payroll_loans")
              .select("*")
              .eq("employee_master_id", employeeId)
              .order("created_at", { ascending: false });
            if (!hrErr && hrLoans?.length) {
              merged = {
                ...local,
                loans: hrLoans.map(mapHrLoan),
              };
              saveEmployeeDeductions(employeeId, merged);
            }
          } catch (hrLoadErr) {
            console.warn("Employee Master: HR loans soft-load skipped", hrLoadErr);
          }
        }
        setDeductions(merged);

        try {
          const vars = await fetchOpenVariancesForEmployee(oneRes.data.id);
          setSalaryVariances(vars || []);
        } catch (varErr) {
          console.warn("Employee Master: salary variances soft-load skipped", varErr);
          setSalaryVariances([]);
        }
      }
    } catch (err) {
      console.error("Employee Master detail: load failed", err);
      if (!soft) {
        setEmployee(null);
        setSalaryVariances([]);
        setError("Could not load employee. Please try again.");
      }
    } finally {
      if (!soft) setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  // After Excel import elsewhere, soft-refresh Personal details from DB (keep form mounted)
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      load({ soft: true });
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const setTab = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id === "personal") next.delete("tab");
    else next.set("tab", id);
    setSearchParams(next, { replace: true });
  };

  const listPath = "/app/admin/employee/master";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-6 space-y-3 max-w-3xl">
        <Link to={listPath} className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to Employee Master
        </Link>
        <p className="text-sm text-red-600">{error || "Employee not found."}</p>
      </div>
    );
  }

  const name = employee.full_name || "Employee";
  const code = employee.employee_code || employee.employee_id || "—";
  const segment = employmentTypeLabel(employee.employment_type || employee.employee_id) || "—";

  return (
    <div className="h-[calc(100vh-7rem)] min-h-[28rem] bg-gray-50 flex flex-col overflow-hidden">
      <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 pt-4 md:pt-6 flex flex-col flex-1 min-h-0 gap-4">
        {/* Static top: back + identity */}
        <div className="shrink-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(listPath)}
              className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:text-blue-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Employee Master
            </button>
          </div>

          <PageTaskHeader
            title={name}
            subtitle={[code, employee.designation, employee.department, segment]
              .filter(Boolean)
              .join(" · ")}
          >
            <StatusChip label={employee.status || "—"} severity={statusSeverity(employee.status)} />
          </PageTaskHeader>

          {salaryAdmin && salaryVariances.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
              <p className="font-medium text-amber-900">Salary sheet differs from master</p>
              <p className="mt-1 text-amber-800/90 text-xs leading-relaxed">
                Open differences for{" "}
                {[
                  ...new Set(
                    salaryVariances.map((v) => {
                      const mk = String(v.month_key || "");
                      const [y, m] = mk.split("-");
                      if (!y || !m) return mk || "—";
                      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-IN", {
                        month: "short",
                        year: "2-digit",
                      });
                      return `${label} (rev ${v.revision_no || "—"})`;
                    })
                  ),
                ].join(", ")}
                . Master data was not changed — review in Salary Processing.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[...new Set(salaryVariances.map((v) => v.month_key).filter(Boolean))].map((mk) => (
                  <Link
                    key={mk}
                    to={`/app/admin/salary-admin/salary-processing`}
                    className="inline-flex items-center rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-50"
                  >
                    Open Salary Processing · {mk}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
            <div className="h-14 w-14 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
              <User className="h-7 w-7 text-gray-400" aria-hidden />
            </div>
            <div className="min-w-0 text-sm text-gray-700 space-y-0.5">
              <p>
                <span className="text-gray-500">Machine ID:</span>{" "}
                <span className="font-mono font-medium text-gray-900">{employee.employee_id || "—"}</span>
              </p>
              <p>
                <span className="text-gray-500">Location:</span> {employee.location || "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Static sections nav + independently scrolling main */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 lg:gap-6 pb-4 md:pb-6">
          <aside className="w-full lg:w-52 shrink-0 flex flex-col min-h-0 max-h-48 lg:max-h-none">
            <nav
              className="rounded-lg border border-gray-200 bg-white flex flex-col flex-1 min-h-0 overflow-hidden"
              aria-label="Employee profile sections"
            >
              <p className="shrink-0 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-100 bg-gray-50">
                Sections
              </p>
              <ul className="flex-1 min-h-0 overflow-y-auto py-1 overscroll-contain">
                {visibleTabs.map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <li key={tab.id}>
                      <button
                        type="button"
                        onClick={() => setTab(tab.id)}
                        className={[
                          "w-full text-left px-3 py-2 text-sm border-l-2 transition-colors",
                          active
                            ? "border-blue-600 bg-blue-50 text-blue-800 font-semibold"
                            : "border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                        ].join(" ")}
                      >
                        {tab.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          <div className="min-w-0 flex-1 min-h-0 overflow-y-auto overscroll-contain pr-0.5">
            {activeTab === "personal" ? (
              <SectionCard title="Personal details">
                <EmployeeMasterPersonalForm
                  employee={employee}
                  employees={employees}
                  variant="page"
                  showCancel={false}
                  onSaved={(saved) => {
                    if (saved) {
                      setEmployee((prev) => ({ ...prev, ...saved }));
                      setEmployees((list) =>
                        (list || []).map((row) =>
                          String(row.id) === String(saved.id) ? { ...row, ...saved } : row
                        )
                      );
                    } else {
                      load();
                    }
                  }}
                />
              </SectionCard>
            ) : null}

            {activeTab === "ctc" ? (
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <SalaryEmployeeCtc employeeId={String(employee.id)} embedded persist />
              </div>
            ) : null}

            {activeTab === "leaves" ? <EmployeeLeavesTab employee={employee} /> : null}

            {activeTab === "tours" ? <EmployeeToursTab employee={employee} /> : null}

            {activeTab === "loan" ? (
              <EmployeeLoanTab
                records={deductions.loans}
                onChange={(loans) => persistDeductions({ ...deductions, loans })}
              />
            ) : null}

            {activeTab === "sal-adv" ? (
              <EmployeeSalAdvTab
                records={deductions.salaryAdvances}
                onChange={(salaryAdvances) => persistDeductions({ ...deductions, salaryAdvances })}
              />
            ) : null}

            {activeTab === "unpaid-paid" ? (
              <EmployeeUnpaidPaidTab
                records={deductions.unpaidPaid}
                onChange={(unpaidPaid) => persistDeductions({ ...deductions, unpaidPaid })}
              />
            ) : null}

            {activeTab === "tds" ? (
              <EmployeeTdsTab
                tds={deductions.tds}
                panHint={employee.pan_card_no || ""}
                onChange={(tds) => persistDeductions({ ...deductions, tds })}
              />
            ) : null}

            {activeTab === "form-16" ? (
              <EmployeeForm16Tab
                records={deductions.form16}
                employeeName={employee.full_name || ""}
                onChange={(form16) => persistDeductions({ ...deductions, form16 })}
              />
            ) : null}

            {activeTab === "salary-history" ? <EmployeeSalaryHistoryTab employee={employee} /> : null}

            {activeTab === "payslips" ? <EmployeePayslipsTab employee={employee} /> : null}

            {activeTab === "revisions" ? <EmployeeSalaryRevisionsTab employee={employee} /> : null}

            {!CONTENT_TABS.has(activeTab) ? <PlaceholderPanel tabId={activeTab} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
