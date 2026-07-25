import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { EMPLOYEE_MASTER_TABLE } from "../../../modules/payroll/integrations";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";
import {
  computeProcessingRow,
  DEFAULT_MONTH_DAYS,
  fetchSalaryStructureMap,
  formatINRPlain,
} from "./salaryData";

const th =
  "px-2 py-2 text-[10px] font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap border border-gray-300 bg-gray-100 align-middle leading-tight";
const thCenter = `${th} text-center`;
const thRight = `${th} text-right`;
const thLeft = `${th} text-left`;

const td =
  "px-2 py-1.5 text-xs text-gray-900 border border-gray-200 align-middle whitespace-nowrap bg-white";
const tdCenter = `${td} text-center tabular-nums`;
const tdRight = `${td} text-right tabular-nums`;
const tdLeft = `${td} text-left`;

const tinyInput =
  "w-[4.25rem] h-7 px-1 text-right text-xs tabular-nums border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500";

function monthInputDefault() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Money({ value, empty = "—" }) {
  if (value == null || value === "") return <span className="text-gray-300">{empty}</span>;
  return <span>{formatINRPlain(value)}</span>;
}

/**
 * Salary Processing — spreadsheet-style monthly run from Salary Master CTC.
 * UI only; attendance days / loan / canteen / TDS editable per row.
 */
export default function SalaryProcessing() {
  const [employees, setEmployees] = useState([]);
  const [salaryMap, setSalaryMap] = useState(() => fetchSalaryStructureMap());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [payMonth, setPayMonth] = useState(monthInputDefault);
  const [showUnset, setShowUnset] = useState(false);
  /** per employee overrides: { presentDays, loan, canteen, unpaidPaid, tds } */
  const [overrides, setOverrides] = useState({});
  const [selectedId, setSelectedId] = useState(null);

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
        .select(
          "id, employee_id, employee_code, full_name, designation, department, date_of_joining, confirmation_date, bank_account_no, ifsc_code"
        )
        .order("employee_id", { ascending: true });

      if (fetchError) throw fetchError;
      setEmployees(data || []);
      setSalaryMap(fetchSalaryStructureMap());
    } catch (err) {
      console.error("Salary Processing: failed to load", err);
      setError("Could not load employees for processing. Please try again.");
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refresh = () => setSalaryMap(fetchSalaryStructureMap());
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const setOverride = (id, patch) => {
    setOverrides((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch },
    }));
  };

  const rows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return employees
      .map((emp, idx) => {
        const structure = salaryMap.get(String(emp.id));
        const ov = overrides[emp.id] || {};
        const presentDays =
          ov.presentDays != null && ov.presentDays !== ""
            ? Number(ov.presentDays)
            : DEFAULT_MONTH_DAYS;
        const calc = computeProcessingRow({
          structure,
          presentDays,
          monthDays: DEFAULT_MONTH_DAYS,
          loan: ov.loan ?? 0,
          canteen: ov.canteen ?? 0,
          unpaidPaid: ov.unpaidPaid ?? 0,
          tds: ov.tds ?? 0,
        });
        return { emp, calc, sr: idx + 1 };
      })
      .filter(({ emp, calc }) => {
        if (!showUnset && !calc.declared) return false;
        if (!q) return true;
        return (
          String(emp.full_name || "").toLowerCase().includes(q) ||
          String(emp.employee_code || "").toLowerCase().includes(q) ||
          String(emp.employee_id || "").toLowerCase().includes(q) ||
          String(emp.designation || "").toLowerCase().includes(q)
        );
      })
      .map((row, i) => ({ ...row, sr: i + 1 }));
  }, [employees, salaryMap, overrides, searchTerm, showUnset]);

  const declaredCount = useMemo(() => {
    let n = 0;
    for (const emp of employees) {
      const s = salaryMap.get(String(emp.id));
      if (s?.declared) n += 1;
    }
    return n;
  }, [employees, salaryMap]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-7rem)] w-full overflow-hidden bg-gray-50 flex flex-col">
      <div className="shrink-0 px-4 md:px-6 pt-4 md:pt-5 pb-3 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">Salary Processing</h1>
            <p className="text-sm text-gray-600 mt-1">
              Monthly run from Salary Master CTC. Set present days and adjustments, then review net pay.
            </p>
          </div>
          <Link
            to="/app/admin/salary-admin/salary-master"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-800 hover:bg-gray-50"
          >
            Open Salary Master
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs text-gray-700">
            <span className="font-medium text-gray-500">Pay month</span>
            <input
              type="month"
              value={payMonth}
              onChange={(e) => setPayMonth(e.target.value)}
              className="border-0 bg-transparent text-xs text-gray-900 outline-none"
            />
          </label>
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search code, name…"
              className="w-full h-9 pl-9 pr-3 border border-gray-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <label className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showUnset}
              onChange={(e) => setShowUnset(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show employees without CTC
          </label>
          <span className="text-xs text-gray-500 tabular-nums ml-auto">
            {rows.length} row{rows.length === 1 ? "" : "s"} · {declaredCount} with CTC · base{" "}
            {DEFAULT_MONTH_DAYS} days
          </span>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {declaredCount === 0 ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            No CTC saved yet. Open{" "}
            <Link to="/app/admin/salary-admin/salary-master" className="font-medium underline">
              Salary Master
            </Link>
            , enter Basic / HRA / Special, Save CTC — then rows appear here.
          </p>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 px-4 md:px-6 pb-4">
        <div className="h-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-16 text-center">
              {showUnset
                ? "No employees match your search."
                : "No employees with saved CTC to process."}
            </p>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="border-collapse min-w-max">
                <thead className="sticky top-0 z-20">
                  <tr>
                    <th className={`${thCenter} sticky left-0 z-30 bg-gray-100`}>Sr. No.</th>
                    <th className={thCenter}>Emp. Code</th>
                    <th className={`${thLeft} min-w-[140px]`}>Name</th>
                    <th className={`${thLeft} min-w-[120px]`}>Account Number</th>
                    <th className={thCenter}>IFSC Code</th>
                    <th className={`${thLeft} min-w-[120px]`}>Designation</th>
                    <th className={thCenter}>Date Of Joining</th>
                    <th className={thCenter}>Date of confirmation</th>
                    <th className={thRight}>Salary rate (Gross salary)</th>
                    <th className={thCenter}>
                      P. Days
                      <span className="block font-normal text-gray-500 normal-case">({DEFAULT_MONTH_DAYS})</span>
                    </th>
                    <th className={thRight}>PF Basic</th>
                    <th className={thRight}>PF earned basic</th>
                    <th className={thRight}>Basic</th>
                    <th className={thRight}>Basic Earned</th>
                    <th className={thRight}>HRA</th>
                    <th className={thRight}>Special allowance</th>
                    <th className={thRight}>Gross Wages</th>
                    <th className={thRight}>PF (Emp 12%)</th>
                    <th className={thRight}>ESIC 0.75%</th>
                    <th className={thRight}>P. Tax</th>
                    <th className={thRight}>Loan</th>
                    <th className={thRight}>Canteen</th>
                    <th className={thRight}>Unpaid / Paid</th>
                    <th className={thRight}>TDS</th>
                    <th className={thRight}>Total Ded.</th>
                    <th className={thRight}>Net salary</th>
                    <th className={thRight}>Bank</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ emp, calc, sr }) => {
                    const ov = overrides[emp.id] || {};
                    const selected = String(selectedId) === String(emp.id);
                    const rowBg = selected ? "!bg-amber-200" : "";
                    const cellBg = selected ? "!bg-amber-200" : "";

                    return (
                      <tr
                        key={emp.id}
                        onClick={() => setSelectedId(emp.id)}
                        className={`hover:bg-amber-50/80 cursor-pointer ${selected ? "bg-amber-200" : ""}`}
                      >
                        <td className={`${tdCenter} sticky left-0 z-10 ${selected ? "bg-amber-200" : "bg-white"} ${rowBg}`}>
                          {sr}
                        </td>
                        <td className={`${tdCenter} font-mono text-[11px] ${cellBg}`}>
                          {emp.employee_code || "—"}
                        </td>
                        <td className={`${tdLeft} font-medium max-w-[160px] truncate ${cellBg}`} title={emp.full_name || ""}>
                          {emp.full_name || "—"}
                        </td>
                        <td className={`${tdLeft} font-mono text-[11px] ${cellBg}`}>
                          {emp.bank_account_no || "—"}
                        </td>
                        <td className={`${tdCenter} font-mono text-[11px] ${cellBg}`}>
                          {emp.ifsc_code || "—"}
                        </td>
                        <td className={`${tdLeft} max-w-[140px] truncate ${cellBg}`} title={emp.designation || ""}>
                          {emp.designation || "—"}
                        </td>
                        <td className={`${tdCenter} ${cellBg}`}>
                          {formatDateDdMmYyyy(emp.date_of_joining) || "—"}
                        </td>
                        <td className={`${tdCenter} ${cellBg}`}>
                          {formatDateDdMmYyyy(emp.confirmation_date) || "—"}
                        </td>
                        <td className={`${tdRight} ${cellBg}`}>
                          <Money value={calc.salary_rate} />
                        </td>
                        <td className={`${tdCenter} ${cellBg}`} onClick={(e) => e.stopPropagation()}>
                          {calc.declared ? (
                            <input
                              type="number"
                              min="0"
                              max="31"
                              step="0.5"
                              className={tinyInput}
                              value={ov.presentDays ?? DEFAULT_MONTH_DAYS}
                              onChange={(e) => setOverride(emp.id, { presentDays: e.target.value })}
                              aria-label={`Present days for ${emp.full_name || emp.employee_code}`}
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={`${tdRight} ${cellBg}`}>
                          <Money value={calc.pf_basic} />
                        </td>
                        <td className={`${tdRight} ${cellBg}`}>
                          <Money value={calc.pf_earned_basic} />
                        </td>
                        <td className={`${tdRight} ${cellBg}`}>
                          <Money value={calc.basic} />
                        </td>
                        <td className={`${tdRight} ${cellBg}`}>
                          <Money value={calc.basic_earned} />
                        </td>
                        <td className={`${tdRight} ${cellBg}`}>
                          <Money value={calc.hra} />
                        </td>
                        <td className={`${tdRight} ${cellBg}`}>
                          <Money value={calc.special_allowance} />
                        </td>
                        <td className={`${tdRight} font-semibold ${cellBg}`}>
                          <Money value={calc.gross_wages} />
                        </td>
                        <td className={`${tdRight} ${cellBg}`}>
                          <Money value={calc.emp_pf} />
                        </td>
                        <td className={`${tdRight} ${cellBg}`}>
                          <Money value={calc.emp_esic} />
                        </td>
                        <td className={`${tdRight} ${cellBg}`}>
                          <Money value={calc.pt} />
                        </td>
                        <td className={`${tdCenter} ${cellBg}`} onClick={(e) => e.stopPropagation()}>
                          {calc.declared ? (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              className={tinyInput}
                              value={ov.loan ?? 0}
                              onChange={(e) => setOverride(emp.id, { loan: e.target.value })}
                              aria-label="Loan"
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={`${tdCenter} ${cellBg}`} onClick={(e) => e.stopPropagation()}>
                          {calc.declared ? (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              className={tinyInput}
                              value={ov.canteen ?? 0}
                              onChange={(e) => setOverride(emp.id, { canteen: e.target.value })}
                              aria-label="Canteen"
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={`${tdCenter} ${cellBg}`} onClick={(e) => e.stopPropagation()}>
                          {calc.declared ? (
                            <input
                              type="number"
                              step="1"
                              className={tinyInput}
                              value={ov.unpaidPaid ?? 0}
                              onChange={(e) => setOverride(emp.id, { unpaidPaid: e.target.value })}
                              aria-label="Unpaid or paid salary"
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={`${tdCenter} ${cellBg}`} onClick={(e) => e.stopPropagation()}>
                          {calc.declared ? (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              className={tinyInput}
                              value={ov.tds ?? 0}
                              onChange={(e) => setOverride(emp.id, { tds: e.target.value })}
                              aria-label="TDS"
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={`${tdRight} font-semibold ${cellBg}`}>
                          <Money value={calc.total_ded} />
                        </td>
                        <td className={`${tdRight} font-semibold text-emerald-800 ${cellBg}`}>
                          <Money value={calc.net_salary} />
                        </td>
                        <td className={`${tdRight} font-semibold ${cellBg}`}>
                          <Money value={calc.bank} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
