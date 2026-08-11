/**
 * Employee Master deduction shells (Loan / Sal Adv / Unpaid-Paid / TDS).
 * Local persistence until Admin Salary processing is rewired.
 * Soft-reads hr_payroll_loans when available; never blocks the profile page.
 */

const STORAGE_KEY = "admin_employee_deductions_v1";

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    console.warn("Employee deductions: could not persist locally", err);
  }
}

export function emptyEmployeeDeductions() {
  return {
    loans: [],
    salaryAdvances: [],
    unpaidPaid: [],
    form16: [],
    tds: {
      mode: "none", // none | auto | manual
      monthly_amount: null,
      wef_month: "",
      remarks: "",
      active: false,
      history: [],
    },
  };
}

export function getEmployeeDeductions(employeeMasterId) {
  if (employeeMasterId == null) return emptyEmployeeDeductions();
  const store = readAll();
  const row = store[String(employeeMasterId)];
  if (!row || typeof row !== "object") return emptyEmployeeDeductions();
  return {
    ...emptyEmployeeDeductions(),
    ...row,
    loans: Array.isArray(row.loans) ? row.loans : [],
    salaryAdvances: Array.isArray(row.salaryAdvances) ? row.salaryAdvances : [],
    unpaidPaid: Array.isArray(row.unpaidPaid) ? row.unpaidPaid : [],
    form16: Array.isArray(row.form16) ? row.form16 : [],
    tds: { ...emptyEmployeeDeductions().tds, ...(row.tds || {}) },
  };
}

export function saveEmployeeDeductions(employeeMasterId, next) {
  if (employeeMasterId == null) return;
  const store = readAll();
  store[String(employeeMasterId)] = next;
  writeAll(store);
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function parseMoney(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export function formatINR(value) {
  if (value == null || value === "" || Number.isNaN(Number(value))) return "—";
  return `₹${Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** EMI from principal ÷ months (floored at ₹1 when months > 0). */
export function suggestEmi(principal, months) {
  const p = Number(principal) || 0;
  const m = Math.max(0, Math.floor(Number(months) || 0));
  if (p <= 0 || m <= 0) return 0;
  return round2(p / m);
}

export function addMonthsYm(ym, monthsToAdd) {
  if (!ym || !/^\d{4}-\d{2}/.test(String(ym))) return "";
  const [y, m] = String(ym).slice(0, 7).split("-").map(Number);
  const d = new Date(y, m - 1 + (Number(monthsToAdd) || 0), 1);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
}

export function currentYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Active/hold feed salary processing; closed never does. */
export function feedsSalaryProcessing(status) {
  return status === "active";
}

/**
 * Two-way sync: push salary-sheet monthly components onto Employee Master deduction shells.
 * Updates Loan EMI / Sal Adv recovery / Unpaid-Paid / TDS so the profile matches the sheet.
 * Does not auto-close loans; sets installment to the sheet amount (including 0).
 */
export function applySalarySheetLineToDeductions(employeeMasterId, line, monthKey = "") {
  if (employeeMasterId == null) return null;
  const d = getEmployeeDeductions(employeeMasterId);
  const now = new Date().toISOString();
  const mk = monthKey ? String(monthKey).slice(0, 7) : currentYm();

  const loanAmt = round2(line?.loan);
  const salAdvAmt = round2(line?.sal_adv);
  const unpaidAmt = round2(line?.unpaid_paid);
  const tdsAmt = round2(line?.tds);

  // —— Loan ——
  let loans = Array.isArray(d.loans) ? [...d.loans] : [];
  const activeLoanIdx = loans.findIndex((l) => l.status === "active");
  if (activeLoanIdx >= 0) {
    const l = loans[activeLoanIdx];
    const recoveries = Array.isArray(l.recoveries) ? [...l.recoveries] : [];
    const sheetRecIdx = recoveries.findIndex(
      (r) => r && r.source === "salary_sheet" && String(r.month || "").slice(0, 7) === mk
    );
    let balance = round2(l.balance_outstanding);
    let monthsRem =
      l.months_remaining != null ? Number(l.months_remaining) : l.months != null ? Number(l.months) : null;

    if (loanAmt > 0) {
      if (sheetRecIdx >= 0) {
        const prevAmt = round2(recoveries[sheetRecIdx].amount);
        const delta = round2(loanAmt - prevAmt);
        balance = Math.max(0, round2(balance - delta));
        recoveries[sheetRecIdx] = {
          ...recoveries[sheetRecIdx],
          amount: loanAmt,
          at: now,
        };
      } else {
        recoveries.push({
          id: newId("rec"),
          amount: loanAmt,
          month: mk,
          source: "salary_sheet",
          at: now,
        });
        balance = Math.max(0, round2(balance - loanAmt));
        if (monthsRem != null && Number.isFinite(monthsRem)) {
          monthsRem = Math.max(0, monthsRem - 1);
        }
      }
    }

    loans[activeLoanIdx] = {
      ...l,
      installment_amount: loanAmt,
      balance_outstanding: balance,
      months_remaining: monthsRem,
      recoveries,
      last_salary_month: mk,
      synced_from_salary: true,
      updated_at: now,
    };
  } else if (loanAmt > 0) {
    loans = [
      {
        id: newId("loan"),
        principal: loanAmt,
        balance_outstanding: 0,
        months: 1,
        months_remaining: 0,
        installment_amount: loanAmt,
        start_month: mk,
        end_month: mk,
        status: "active",
        remarks: "Created from salary sheet",
        recoveries: [
          {
            id: newId("rec"),
            amount: loanAmt,
            month: mk,
            source: "salary_sheet",
            at: now,
          },
        ],
        last_salary_month: mk,
        synced_from_salary: true,
        from_salary_sheet: true,
        created_at: now,
        updated_at: now,
      },
      ...loans,
    ];
  }

  // —— Salary advance ——
  let salaryAdvances = Array.isArray(d.salaryAdvances) ? [...d.salaryAdvances] : [];
  const activeAdvIdx = salaryAdvances.findIndex((a) => a.status === "active");
  if (activeAdvIdx >= 0) {
    const a = salaryAdvances[activeAdvIdx];
    const recoveries = Array.isArray(a.recoveries) ? [...a.recoveries] : [];
    const sheetRecIdx = recoveries.findIndex(
      (r) => r && r.source === "salary_sheet" && String(r.month || "").slice(0, 7) === mk
    );
    let balance = round2(a.balance_outstanding);
    if (salAdvAmt > 0) {
      if (sheetRecIdx >= 0) {
        const prevAmt = round2(recoveries[sheetRecIdx].amount);
        balance = Math.max(0, round2(balance - (salAdvAmt - prevAmt)));
        recoveries[sheetRecIdx] = { ...recoveries[sheetRecIdx], amount: salAdvAmt, at: now };
      } else {
        recoveries.push({
          id: newId("rec"),
          amount: salAdvAmt,
          month: mk,
          source: "salary_sheet",
          at: now,
        });
        balance = Math.max(0, round2(balance - salAdvAmt));
      }
    }
    salaryAdvances[activeAdvIdx] = {
      ...a,
      recovery_amount: salAdvAmt,
      balance_outstanding: balance,
      recoveries,
      last_salary_month: mk,
      synced_from_salary: true,
      updated_at: now,
    };
  } else if (salAdvAmt > 0) {
    salaryAdvances = [
      {
        id: newId("adv"),
        principal: salAdvAmt,
        balance_outstanding: 0,
        recovery_amount: salAdvAmt,
        start_month: mk,
        status: "active",
        remarks: "Created from salary sheet",
        recoveries: [
          {
            id: newId("rec"),
            amount: salAdvAmt,
            month: mk,
            source: "salary_sheet",
            at: now,
          },
        ],
        last_salary_month: mk,
        synced_from_salary: true,
        from_salary_sheet: true,
        created_at: now,
        updated_at: now,
      },
      ...salaryAdvances,
    ];
  }

  // —— Unpaid / Paid ——
  let unpaidPaid = Array.isArray(d.unpaidPaid) ? [...d.unpaidPaid] : [];
  const openIdx = unpaidPaid.findIndex((u) => u.status === "open");
  if (unpaidAmt !== 0) {
    const kind = unpaidAmt < 0 ? "unpaid" : "paid";
    const abs = Math.abs(unpaidAmt);
    if (openIdx >= 0) {
      unpaidPaid[openIdx] = {
        ...unpaidPaid[openIdx],
        kind,
        balance_outstanding: abs,
        last_salary_month: mk,
        synced_from_salary: true,
        updated_at: now,
      };
    } else {
      unpaidPaid = [
        {
          id: newId("up"),
          kind,
          amount: abs,
          balance_outstanding: abs,
          status: "open",
          month: mk,
          remarks: "Synced from salary sheet",
          last_salary_month: mk,
          synced_from_salary: true,
          from_salary_sheet: true,
          created_at: now,
          updated_at: now,
        },
        ...unpaidPaid,
      ];
    }
  } else if (openIdx >= 0 && unpaidPaid[openIdx]?.synced_from_salary) {
    unpaidPaid[openIdx] = {
      ...unpaidPaid[openIdx],
      balance_outstanding: 0,
      status: "closed",
      last_salary_month: mk,
      updated_at: now,
    };
  }

  // —— TDS ——
  const tds = {
    ...emptyEmployeeDeductions().tds,
    ...(d.tds || {}),
  };
  if (tdsAmt > 0) {
    tds.mode = "manual";
    tds.active = true;
    tds.monthly_amount = tdsAmt;
    tds.wef_month = tds.wef_month || mk;
    tds.remarks = tds.remarks || "Synced from salary sheet";
    const hist = Array.isArray(tds.history) ? [...tds.history] : [];
    const hi = hist.findIndex((h) => String(h.month || "").slice(0, 7) === mk);
    const entry = { month: mk, amount: tdsAmt, source: "salary_sheet", at: now };
    if (hi >= 0) hist[hi] = entry;
    else hist.unshift(entry);
    tds.history = hist.slice(0, 36);
  } else if (tds.synced_from_salary || tds.mode === "manual") {
    tds.monthly_amount = 0;
    tds.active = false;
  }
  tds.synced_from_salary = true;
  tds.last_salary_month = mk;

  const next = {
    ...d,
    loans,
    salaryAdvances,
    unpaidPaid,
    tds,
  };
  saveEmployeeDeductions(employeeMasterId, next);
  return next;
}

/** Apply sheet lines → Employee Master deduction shells for a pay month. */
export function applySalarySheetToEmployeeMasters(lines, monthKey) {
  const applied = [];
  for (const line of lines || []) {
    const id = line?.employee_master_id;
    if (id == null) continue;
    try {
      applySalarySheetLineToDeductions(id, line, monthKey);
      applied.push(id);
    } catch (err) {
      console.warn("Salary → master deduction sync failed", id, err);
    }
  }
  return applied;
}

