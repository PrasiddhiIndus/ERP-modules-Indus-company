/**
 * C/O (Compensatory Off) credit ledger — month-wise balances from current month onward.
 */

import { normalizeAttendanceEmpCode } from "./attendanceDaily";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** First month included in C/O ledger (current calendar month, local). */
export function compOffCutoffMonthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** All twelve calendar months for a year (Jan–Dec). */
export function allCalendarMonthKeysForYear(year) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

/** True when the month is before the C/O data cutoff (no fetch / display). */
export function isCompOffMonthBeforeCutoff(monthKey, refDate = new Date()) {
  const cutoff = compOffCutoffMonthKey(refDate);
  const [cutoffY, cutoffM] = cutoff.split("-").map(Number);
  const [y, m] = String(monthKey).split("-").map(Number);
  if (y < cutoffY) return true;
  if (y === cutoffY && m < cutoffM) return true;
  return false;
}

/** Month keys from cutoff through December for the given year (data fetch scope). */
export function compOffMonthKeysForYear(year, refDate = new Date()) {
  return allCalendarMonthKeysForYear(year).filter((mk) => !isCompOffMonthBeforeCutoff(mk, refDate));
}

export function compOffMonthLabel(monthKey) {
  const m = Number(String(monthKey).slice(5, 7));
  if (!m || m < 1 || m > 12) return monthKey;
  return MONTH_NAMES[m - 1];
}

export async function fetchCompOffAvailableBalance(supabase, employeeCode, asOfDate = null) {
  const code = normalizeAttendanceEmpCode(employeeCode);
  if (!code) return 0;
  const args = { p_employee_code: code };
  if (asOfDate) args.p_as_of = asOfDate;
  const { data, error } = await supabase.schema("indus_one").rpc("get_comp_off_available_balance", args);
  if (error) throw error;
  return Number(data || 0);
}

export async function fetchCompOffMonthlySummary(supabase, year) {
  const { data, error } = await supabase.schema("indus_one").rpc("fetch_comp_off_monthly_summary", {
    p_year: Number(year),
  });
  if (error) throw error;
  return data || [];
}

/** Set an employee's available C/O balance (admin manual adjustment). */
export async function saveCompOffAvailableBalance(supabase, employeeCode, targetBalance) {
  const code = normalizeAttendanceEmpCode(employeeCode);
  if (!code) throw new Error("Employee code is required.");
  const target = Math.max(0, Number(targetBalance));
  if (!Number.isFinite(target)) throw new Error("Enter a valid balance.");
  const { data, error } = await supabase.schema("indus_one").rpc("set_comp_off_available_balance", {
    p_employee_code: code,
    p_target_balance: target,
    p_note: null,
  });
  if (error) throw error;
  return Number(data ?? target);
}

/**
 * Merge RPC summary with employee list.
 * Each month column = C/O earned in that month only (by earned_date).
 * Does not carry/copy credits into later months. Usable period is separate
 * (availableNow = remaining non-expired credits for consumption).
 */
export function buildCompOffEmployeeRows(employees, summaryRows, year, refDate = new Date()) {
  const allMonths = allCalendarMonthKeysForYear(year);
  const currentMonthKey = compOffCutoffMonthKey(refDate);

  const byEmpMonth = new Map();
  for (const row of summaryRows || []) {
    const code = normalizeAttendanceEmpCode(row.employee_code);
    if (!code) continue;
    byEmpMonth.set(`${code}|${row.month_key}`, {
      earned: Number(row.earned || 0),
      used: Number(row.used || 0),
      expired: Number(row.expired || 0),
      available: Number(row.available || 0),
      // Prefer remaining of credits earned in this month (drops when CO uses them).
      remaining:
        row.remaining != null
          ? Number(row.remaining || 0)
          : Number(row.earned || 0),
    });
  }

  return (employees || []).map((emp) => {
    const code = normalizeAttendanceEmpCode(emp.empCode || emp.employee_code);
    const monthBalances = {};
    let availableNow = 0;

    for (const mk of allMonths) {
      if (isCompOffMonthBeforeCutoff(mk, refDate)) {
        monthBalances[mk] = null;
        continue;
      }

      const cell = byEmpMonth.get(`${code}|${mk}`) || {
        earned: 0,
        used: 0,
        expired: 0,
        available: 0,
        remaining: 0,
      };

      // Month column = remaining of C/O earned that month (not copied to other months).
      monthBalances[mk] = Number(cell.remaining || 0);

      if (mk === currentMonthKey) {
        availableNow = Number(cell.available || 0);
      }
    }

    return {
      empCode: code,
      employeeName: emp.employeeName || emp.name || emp.full_name || "—",
      department: emp.department || emp.dept || "—",
      monthBalances,
      availableNow,
    };
  });
}

function compareCompOffStringAsc(a, b) {
  const as = String(a ?? "").toLowerCase();
  const bs = String(b ?? "").toLowerCase();
  if (as === bs) return 0;
  return as < bs ? -1 : 1;
}

/** Sort C/O balance grid rows by employee field or month column (`m_YYYY-MM`). */
export function sortCompOffEmployeeRows(rows, field, direction = "asc") {
  if (!field || !rows?.length) return rows || [];
  const mul = direction === "desc" ? -1 : 1;
  const tieBreak = (a, b) => compareCompOffStringAsc(a.empCode, b.empCode);

  if (field.startsWith("m_")) {
    const mk = field.slice(2);
    return [...rows].sort((a, b) => {
      const av = a.monthBalances?.[mk];
      const bv = b.monthBalances?.[mk];
      const aNull = av == null;
      const bNull = bv == null;
      if (aNull && bNull) return tieBreak(a, b);
      if (aNull) return 1;
      if (bNull) return -1;
      const an = Number(av);
      const bn = Number(bv);
      if (an === bn) return tieBreak(a, b);
      return an < bn ? -mul : mul;
    });
  }

  if (field === "empCode" || field === "employeeName" || field === "department") {
    return [...rows].sort((a, b) => {
      const cmp = compareCompOffStringAsc(a[field], b[field]) * mul;
      return cmp !== 0 ? cmp : tieBreak(a, b);
    });
  }

  return rows;
}

export function formatCompOffError(err) {
  const msg = err?.message || String(err || "");
  if (/insufficient c\/o balance/i.test(msg)) {
    return "Insufficient C/O balance. Employee must earn C/O by working on Week Off, NH, or PH before marking CO.";
  }
  if (/relation|does not exist|schema must be|could not find the function/i.test(msg)) {
    return "C/O ledger is not available. Apply migrations 20260902150000_comp_off_credit_ledger.sql through 20260903100000_comp_off_restore_and_remaining.sql.";
  }
  return msg || "C/O balance operation failed.";
}

export function subscribeCompOffRealtime(supabase, onChange) {
  if (!supabase || typeof onChange !== "function") return () => {};
  const channel = supabase
    .channel("comp-off-balance-realtime")
    .on("postgres_changes", { event: "*", schema: "indus_one", table: "comp_off_credits" }, onChange)
    .on("postgres_changes", { event: "*", schema: "indus_one", table: "comp_off_deductions" }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
