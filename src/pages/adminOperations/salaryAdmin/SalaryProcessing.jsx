import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Search, Wallet } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { EMPLOYEE_MASTER_TABLE } from "../../../modules/payroll/integrations";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";
import FormDateInput from "../../../components/FormDateInput";
import {
  computeProcessingRow,
  DEFAULT_MONTH_DAYS,
  fetchSalaryStructureMap,
  formatINRPlain,
} from "./salaryData";

const th =
  "px-2.5 py-2.5 text-[10px] font-semibold text-slate-600 uppercase tracking-[0.06em] whitespace-nowrap border-b border-slate-200 align-middle leading-tight bg-slate-50";
const thC = `${th} text-center`;
const thR = `${th} text-right`;
const thL = `${th} text-left`;

const td = "px-2.5 py-2 text-[12px] text-slate-800 border-b border-slate-100 align-middle whitespace-nowrap";
const tdC = `${td} text-center tabular-nums`;
const tdR = `${td} text-right tabular-nums`;
const tdL = `${td} text-left`;

const numIn =
  "w-[4.5rem] h-8 px-1.5 text-right text-[12px] tabular-nums border border-slate-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A8A]/20 focus:border-[#1F3A8A]";
const textIn =
  "h-8 px-2 text-[12px] border border-slate-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A8A]/20 focus:border-[#1F3A8A]";

function monthInputDefault() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Money({ value, muted = false, strong = false }) {
  if (value == null || value === "") {
    return <span className="text-slate-300">—</span>;
  }
  return (
    <span
      className={`tabular-nums ${strong ? "font-semibold text-slate-900" : ""} ${
        muted ? "text-slate-500" : ""
      }`}
    >
      {formatINRPlain(value)}
    </span>
  );
}

function GroupHead({ label, cols, tone }) {
  return (
    <th
      colSpan={cols}
      className={`px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-center border-b border-slate-200 ${tone}`}
    >
      {label}
    </th>
  );
}

/**
 * Salary Processing — professional spreadsheet monthly run from Salary Master.
 */
export default function SalaryProcessing() {
  const [employees, setEmployees] = useState([]);
  const [salaryMap, setSalaryMap] = useState(() => fetchSalaryStructureMap());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [payMonth, setPayMonth] = useState(monthInputDefault);
  const [showUnset, setShowUnset] = useState(false);
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
      .map((emp) => {
        const structure = salaryMap.get(String(emp.id));
        const ov = overrides[emp.id] || {};
        const presentDays =
          ov.presentDays != null && ov.presentDays !== ""
            ? Number(ov.presentDays)
            : DEFAULT_MONTH_DAYS;
        const calc = computeProcessingRow({
          structure,
          presentDays,
          totalDays: DEFAULT_MONTH_DAYS,
          pfBasicOverride: ov.pfBasic,
          ptOverride: ov.pt,
          loan: ov.loan ?? 0,
          salAdv: ov.salAdv ?? 0,
          unpaidPaid: ov.unpaidPaid ?? 0,
          tds: ov.tds ?? 0,
        });
        return { emp, calc };
      })
      .filter(({ emp, calc }) => {
        if (!showUnset && !calc.declared) return false;
        if (!q) return true;
        return (
          String(emp.full_name || "").toLowerCase().includes(q) ||
          String(emp.employee_code || "").toLowerCase().includes(q) ||
          String(emp.employee_id || "").toLowerCase().includes(q) ||
          String(emp.designation || "").toLowerCase().includes(q) ||
          String(emp.department || "").toLowerCase().includes(q)
        );
      })
      .map((row, i) => ({ ...row, sr: i + 1 }));
  }, [employees, salaryMap, overrides, searchTerm, showUnset]);

  const declaredCount = useMemo(() => {
    let n = 0;
    for (const emp of employees) {
      if (salaryMap.get(String(emp.id))?.declared) n += 1;
    }
    return n;
  }, [employees, salaryMap]);

  const totals = useMemo(() => {
    let gross = 0;
    let ded = 0;
    let net = 0;
    for (const { calc } of rows) {
      if (!calc.declared) continue;
      gross += Number(calc.gross_wages) || 0;
      ded += Number(calc.total_ded) || 0;
      net += Number(calc.net_salary) || 0;
    }
    return { gross, ded, net };
  }, [rows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1F3A8A]" />
      </div>
    );
  }

  return (
    <div className="-m-4 sm:-m-6 min-h-[calc(100vh-4.5rem)] flex flex-col bg-[#f4f6f9]">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-200 bg-white">
        <div className="px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex items-start gap-3">
            <div className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1F3A8A]/10 text-[#1F3A8A]">
              <Wallet className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Salary Processing
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Process monthly payroll from Salary Master CTC.
              </p>
            </div>
          </div>
          <Link
            to="/app/admin/salary-admin/salary-master"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#1F3A8A] text-white text-xs font-semibold hover:bg-[#18307a] shadow-sm"
          >
            Salary Master
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="px-4 sm:px-6 lg:px-8 pb-4 flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700">
            <span className="font-semibold text-slate-500">Pay month</span>
            <input
              type="month"
              value={payMonth}
              onChange={(e) => setPayMonth(e.target.value)}
              className="border-0 bg-transparent text-xs font-medium text-slate-900 outline-none"
            />
          </label>
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search code, name, designation…"
              className="w-full h-9 pl-9 pr-3 border border-slate-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-[#1F3A8A]/20 focus:border-[#1F3A8A] outline-none"
            />
          </div>
          <label className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={showUnset}
              onChange={(e) => setShowUnset(e.target.checked)}
              className="rounded border-slate-300 text-[#1F3A8A] focus:ring-[#1F3A8A]"
            />
            Include without CTC
          </label>

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <span className="inline-flex items-center h-8 px-2.5 rounded-md bg-slate-100 text-[11px] font-semibold text-slate-700 tabular-nums">
              {rows.length} rows
            </span>
            <span className="inline-flex items-center h-8 px-2.5 rounded-md bg-emerald-50 text-[11px] font-semibold text-emerald-800 tabular-nums">
              {declaredCount} CTC set
            </span>
            {totals.net > 0 ? (
              <span className="inline-flex items-center h-8 px-2.5 rounded-md bg-[#1F3A8A]/8 text-[11px] font-semibold text-[#1F3A8A] tabular-nums">
                Net {formatINRPlain(totals.net)}
              </span>
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="px-4 sm:px-6 lg:px-8 pb-3 text-sm text-red-600">{error}</p>
        ) : null}
        {declaredCount === 0 ? (
          <p className="mx-4 sm:mx-6 lg:mx-8 mb-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            No CTC saved yet. Open{" "}
            <Link to="/app/admin/salary-admin/salary-master" className="font-semibold underline">
              Salary Master
            </Link>
            , enter Basic / Special, Save CTC — then rows appear here.
          </p>
        ) : null}
      </div>

      {/* Grid */}
      <div className="flex-1 min-h-0 p-3 sm:p-4 lg:p-5">
        <div className="h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          {rows.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <p className="text-sm text-slate-500 text-center">
                {showUnset
                  ? "No employees match your search."
                  : "No employees with saved CTC to process."}
              </p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="border-collapse min-w-max w-full">
                <thead className="sticky top-0 z-20 shadow-sm">
                  <tr>
                    <th
                      colSpan={3}
                      className="bg-slate-100 border-b border-slate-200 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600 text-left px-2.5 py-1.5"
                    >
                      Employee
                    </th>
                    <GroupHead label="Bank & dates" cols={5} tone="bg-sky-50 text-sky-900" />
                    <GroupHead label="Earnings" cols={9} tone="bg-emerald-50 text-emerald-900" />
                    <GroupHead label="Deductions" cols={7} tone="bg-amber-50 text-amber-950" />
                    <GroupHead label="Payable" cols={3} tone="bg-indigo-50 text-indigo-900" />
                  </tr>
                  <tr>
                    <th className={`${thC} w-12`}>#</th>
                    <th className={`${thC} min-w-[5.5rem]`}>Emp. Code</th>
                    <th className={`${thL} min-w-[10rem]`}>Name</th>
                    <th className={`${thL} min-w-[9rem]`}>Account Number</th>
                    <th className={`${thC} min-w-[7rem]`}>IFSC</th>
                    <th className={`${thL} min-w-[8rem]`}>Designation</th>
                    <th className={`${thC} min-w-[6rem]`}>D.O.J.</th>
                    <th className={`${thC} min-w-[8rem]`}>Confirmation</th>
                    <th className={`${thR} min-w-[6rem]`}>Gross rate</th>
                    <th className={`${thC} min-w-[5rem]`}>
                      P. Days
                      <span className="block font-normal normal-case text-slate-400">/ {DEFAULT_MONTH_DAYS}</span>
                    </th>
                    <th className={`${thR} min-w-[5.5rem]`}>PF Basic</th>
                    <th className={`${thR} min-w-[5.5rem]`}>PF earned</th>
                    <th className={`${thR} min-w-[5rem]`}>Basic</th>
                    <th className={`${thR} min-w-[5.5rem]`}>Basic earned</th>
                    <th className={`${thR} min-w-[5rem]`}>HRA</th>
                    <th className={`${thR} min-w-[5rem]`}>Special</th>
                    <th className={`${thR} min-w-[6rem]`}>Gross wages</th>
                    <th className={`${thR} min-w-[5rem]`}>PF 12%</th>
                    <th className={`${thR} min-w-[4.5rem]`}>ESIC</th>
                    <th className={`${thR} min-w-[5rem]`}>P. Tax</th>
                    <th className={`${thR} min-w-[4.5rem]`}>Loan</th>
                    <th className={`${thR} min-w-[5rem]`}>Sal Adv</th>
                    <th className={`${thR} min-w-[5.5rem]`}>Unpaid/Paid</th>
                    <th className={`${thR} min-w-[4.5rem]`}>TDS</th>
                    <th className={`${thR} min-w-[5.5rem]`}>Total Ded.</th>
                    <th className={`${thR} min-w-[6rem]`}>Net salary</th>
                    <th className={`${thR} min-w-[5.5rem]`}>Bank</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ emp, calc, sr }) => {
                    const ov = overrides[emp.id] || {};
                    const selected = String(selectedId) === String(emp.id);
                    const zebra = sr % 2 === 0;
                    const baseBg = selected
                      ? "bg-sky-50"
                      : zebra
                        ? "bg-slate-50/70"
                        : "bg-white";

                    return (
                      <tr
                        key={emp.id}
                        onClick={() => setSelectedId(emp.id)}
                        className={`cursor-pointer transition-colors hover:bg-sky-50/80 ${selected ? "bg-sky-50" : ""}`}
                      >
                        <td className={`${tdC} text-slate-400 ${baseBg}`}>{sr}</td>
                        <td className={`${tdC} font-mono text-[11px] text-slate-600 ${baseBg}`}>
                          {emp.employee_code || "—"}
                        </td>
                        <td
                          className={`${tdL} font-semibold max-w-[12rem] truncate ${baseBg}`}
                          title={emp.full_name || ""}
                        >
                          {emp.full_name || "—"}
                        </td>

                        <td className={`${tdL} ${baseBg}`} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            className={`${textIn} w-[9.5rem] font-mono`}
                            value={ov.accountNo ?? emp.bank_account_no ?? ""}
                            onChange={(e) => setOverride(emp.id, { accountNo: e.target.value })}
                            placeholder="Account no."
                            aria-label="Account number"
                          />
                        </td>
                        <td className={`${tdC} ${baseBg}`} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            className={`${textIn} w-[7rem] font-mono uppercase`}
                            value={ov.ifsc ?? emp.ifsc_code ?? ""}
                            onChange={(e) =>
                              setOverride(emp.id, { ifsc: e.target.value.toUpperCase() })
                            }
                            placeholder="IFSC"
                            aria-label="IFSC code"
                          />
                        </td>
                        <td className={`${tdL} max-w-[9rem] truncate ${baseBg}`} title={emp.designation || ""}>
                          {emp.designation || "—"}
                        </td>
                        <td className={`${tdC} text-slate-600 ${baseBg}`}>
                          {formatDateDdMmYyyy(emp.date_of_joining) || "—"}
                        </td>
                        <td className={`${tdC} ${baseBg}`} onClick={(e) => e.stopPropagation()}>
                          <FormDateInput
                            value={ov.confirmationDate ?? emp.confirmation_date ?? ""}
                            onChange={(e) =>
                              setOverride(emp.id, { confirmationDate: e.target.value })
                            }
                            className={`${textIn} w-[8.5rem]`}
                            compact
                          />
                        </td>

                        <td className={`${tdR} ${baseBg}`}>
                          <Money value={calc.salary_rate} />
                        </td>
                        <td className={`${tdC} ${baseBg}`} onClick={(e) => e.stopPropagation()}>
                          {calc.declared ? (
                            <input
                              type="number"
                              min="0"
                              max="31"
                              step="0.5"
                              className={numIn}
                              value={ov.presentDays ?? DEFAULT_MONTH_DAYS}
                              onChange={(e) => setOverride(emp.id, { presentDays: e.target.value })}
                              aria-label="Present days"
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={`${tdC} ${baseBg}`} onClick={(e) => e.stopPropagation()}>
                          {calc.declared ? (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              className={numIn}
                              value={ov.pfBasic ?? calc.pf_basic ?? ""}
                              onChange={(e) => setOverride(emp.id, { pfBasic: e.target.value })}
                              aria-label="PF Basic"
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={`${tdR} ${baseBg}`}>
                          <Money value={calc.pf_earned_basic} muted />
                        </td>
                        <td className={`${tdR} ${baseBg}`}>
                          <Money value={calc.basic} />
                        </td>
                        <td className={`${tdR} ${baseBg}`}>
                          <Money value={calc.basic_earned} muted />
                        </td>
                        <td className={`${tdR} ${baseBg}`}>
                          <Money value={calc.hra} muted />
                        </td>
                        <td className={`${tdR} ${baseBg}`}>
                          <Money value={calc.special_allowance} muted />
                        </td>
                        <td className={`${tdR} ${baseBg}`}>
                          <Money value={calc.gross_wages} strong />
                        </td>

                        <td className={`${tdR} ${baseBg}`}>
                          <Money value={calc.emp_pf} />
                        </td>
                        <td className={`${tdR} ${baseBg}`}>
                          <Money value={calc.emp_esic} />
                        </td>
                        <td className={`${tdC} ${baseBg}`} onClick={(e) => e.stopPropagation()}>
                          {calc.declared ? (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              className={numIn}
                              value={ov.pt ?? calc.pt ?? 0}
                              onChange={(e) => setOverride(emp.id, { pt: e.target.value })}
                              aria-label="P. Tax"
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={`${tdC} ${baseBg}`} onClick={(e) => e.stopPropagation()}>
                          {calc.declared ? (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              className={numIn}
                              value={ov.loan ?? 0}
                              onChange={(e) => setOverride(emp.id, { loan: e.target.value })}
                              aria-label="Loan"
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={`${tdC} ${baseBg}`} onClick={(e) => e.stopPropagation()}>
                          {calc.declared ? (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              className={numIn}
                              value={ov.salAdv ?? 0}
                              onChange={(e) => setOverride(emp.id, { salAdv: e.target.value })}
                              aria-label="Salary advance"
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={`${tdC} ${baseBg}`} onClick={(e) => e.stopPropagation()}>
                          {calc.declared ? (
                            <input
                              type="number"
                              step="1"
                              className={numIn}
                              value={ov.unpaidPaid ?? 0}
                              onChange={(e) => setOverride(emp.id, { unpaidPaid: e.target.value })}
                              aria-label="Unpaid or paid"
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={`${tdC} ${baseBg}`} onClick={(e) => e.stopPropagation()}>
                          {calc.declared ? (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              className={numIn}
                              value={ov.tds ?? 0}
                              onChange={(e) => setOverride(emp.id, { tds: e.target.value })}
                              aria-label="TDS"
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={`${tdR} ${baseBg}`}>
                          <Money value={calc.total_ded} strong />
                        </td>
                        <td className={`${tdR} text-emerald-800 ${baseBg}`}>
                          <Money value={calc.net_salary} strong />
                        </td>
                        <td className={`${tdR} ${baseBg}`}>
                          <Money value={calc.bank} strong />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {totals.net > 0 ? (
                  <tfoot className="sticky bottom-0 z-10">
                    <tr className="bg-[#eef2f8] border-t-2 border-[#1F3A8A]/25">
                      <td
                        colSpan={16}
                        className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#1F3A8A] bg-[#eef2f8]"
                      >
                        Period totals
                      </td>
                      <td className="px-2.5 py-2.5 text-right text-[12px] font-semibold tabular-nums text-slate-900 bg-[#eef2f8]">
                        {formatINRPlain(totals.gross)}
                      </td>
                      <td colSpan={7} className="px-2.5 py-2.5 bg-[#eef2f8]" />
                      <td className="px-2.5 py-2.5 text-right text-[12px] font-semibold tabular-nums text-slate-700 bg-[#eef2f8]">
                        {formatINRPlain(totals.ded)}
                      </td>
                      <td className="px-2.5 py-2.5 text-right text-[12px] font-bold tabular-nums text-emerald-700 bg-[#eef2f8]">
                        {formatINRPlain(totals.net)}
                      </td>
                      <td className="px-2.5 py-2.5 text-right text-[12px] font-bold tabular-nums text-[#1F3A8A] bg-[#eef2f8]">
                        {formatINRPlain(totals.net)}
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
