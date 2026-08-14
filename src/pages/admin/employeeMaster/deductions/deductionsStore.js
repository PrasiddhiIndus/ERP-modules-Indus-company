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

/** Compare YYYY-MM strings. Returns -1 / 0 / 1. Empty sorts as equal to empty only. */
export function compareYm(a, b) {
  const A = String(a || "").slice(0, 7);
  const B = String(b || "").slice(0, 7);
  if (!A && !B) return 0;
  if (!A) return -1;
  if (!B) return 1;
  if (A < B) return -1;
  if (A > B) return 1;
  return 0;
}

/** Active / open feed salary; hold/closed never do. */
export function feedsSalaryProcessing(status) {
  return status === "active" || status === "open";
}

/** Normalize unpaid/paid kind for UI + salary sign. */
export function normalizeUnpaidKind(kind) {
  const k = String(kind || "").toLowerCase();
  if (k === "paid" || k === "employee_owes" || k === "excess") return "employee_owes";
  // unpaid | company_owes | default
  return "company_owes";
}

/** UI labels for the 2-value Type dropdown (match Employee Master form). */
export function unpaidKindLabel(kind) {
  return normalizeUnpaidKind(kind) === "employee_owes"
    ? "Unpaid (employee owes company)"
    : "Unpaid (company owes employee)";
}

/**
 * Signed unpaid/paid hit for a pay month (0 when closed / outside tenure / months left 0).
 * company_owes → Unpaid (company owes employee) → credit (negative on sheet)
 * employee_owes → Unpaid (employee owes company) → deduct (positive on sheet)
 */
export function unpaidSignedAmountForMonth(record, monthKey) {
  if (!record) return 0;
  if (!feedsSalaryProcessing(record.status)) return 0;
  const monthly =
    Number(record.monthly_amount) ||
    Number(record.installment_amount) ||
    0;
  if (monthly <= 0) return 0;
  const proxy = {
    ...record,
    status: "active",
    monthly_amount: monthly,
    installment_amount: monthly,
    start_month: record.start_month || record.month || "",
  };
  const hit = deductionAmountForMonth(proxy, monthKey, { amountKey: "monthly_amount" });
  if (!hit) return 0;
  return normalizeUnpaidKind(record.kind) === "employee_owes" ? hit : -hit;
}

/**
 * Whether a loan/advance EMI should hit this pay month.
 * Rules: active, months left > 0, EMI > 0, pay month within start→end, balance > 0.
 * Setting months remaining to 0 (early close) stops all future hits.
 */
export function deductionActiveForMonth(record, monthKey, { amountKey = "installment_amount" } = {}) {
  if (!record || !feedsSalaryProcessing(record.status)) return false;
  const mk = String(monthKey || "").slice(0, 7);
  if (!mk) return false;

  const monthsRem =
    record.months_remaining != null
      ? Number(record.months_remaining)
      : record.months != null
        ? Number(record.months)
        : null;
  if (monthsRem != null && Number.isFinite(monthsRem) && monthsRem <= 0) return false;

  const emi = Number(record[amountKey]) || 0;
  if (emi <= 0) return false;

  const bal = Number(record.balance_outstanding);
  if (Number.isFinite(bal) && bal <= 0) return false;

  const start = String(record.start_month || "").slice(0, 7);
  if (start && compareYm(mk, start) < 0) return false;

  let end = String(record.end_month || "").slice(0, 7);
  if (!end && start && monthsRem != null && monthsRem > 0) {
    end = addMonthsYm(start, monthsRem - 1);
  }
  if (end && compareYm(mk, end) > 0) return false;

  return true;
}

/** EMI / recovery amount for a pay month (0 if outside tenure). Caps at remaining balance. */
export function deductionAmountForMonth(record, monthKey, { amountKey = "installment_amount" } = {}) {
  if (!deductionActiveForMonth(record, monthKey, { amountKey })) return 0;
  const emi = round2(record[amountKey]);
  const bal = Number(record.balance_outstanding);
  if (Number.isFinite(bal) && bal > 0) return round2(Math.min(emi, bal));
  return emi;
}

/**
 * Sum loan EMI + salary-advance recovery for one employee in a pay month.
 * Used by Salary Processing when building / processing the sheet.
 */
export function seedSalaryDeductionsForMonth(employeeMasterId, monthKey) {
  const d = getEmployeeDeductions(employeeMasterId);
  const mk = String(monthKey || currentYm()).slice(0, 7);

  let loan = 0;
  for (const l of d.loans || []) {
    loan += deductionAmountForMonth(l, mk, { amountKey: "installment_amount" });
  }

  let salAdv = 0;
  for (const a of d.salaryAdvances || []) {
    salAdv += deductionAmountForMonth(a, mk, { amountKey: "recovery_amount" });
  }

  let unpaidPaid = 0;
  for (const u of d.unpaidPaid || []) {
    unpaidPaid += unpaidSignedAmountForMonth(u, mk);
  }

  let tds = 0;
  if (d.tds?.active && d.tds.mode === "manual") {
    const wef = String(d.tds.wef_month || "").slice(0, 7);
    if (!wef || compareYm(mk, wef) >= 0) {
      tds = round2(d.tds.monthly_amount);
    }
  }

  return {
    loan: round2(loan),
    salAdv: round2(salAdv),
    unpaidPaid: round2(unpaidPaid),
    tds: round2(tds),
  };
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
  // Only apply recovery / update EMI when this pay month actually deducted (> 0).
  // Zero on the sheet (outside tenure or cleared) must NOT wipe planned EMI for future months.
  let loans = Array.isArray(d.loans) ? [...d.loans] : [];
  const activeLoanIdx = loans.findIndex((l) => l.status === "active");
  if (activeLoanIdx >= 0 && loanAmt > 0) {
    const l = loans[activeLoanIdx];
    const recoveries = Array.isArray(l.recoveries) ? [...l.recoveries] : [];
    const sheetRecIdx = recoveries.findIndex(
      (r) => r && r.source === "salary_sheet" && String(r.month || "").slice(0, 7) === mk
    );
    let balance = round2(l.balance_outstanding);
    let monthsRem =
      l.months_remaining != null ? Number(l.months_remaining) : l.months != null ? Number(l.months) : null;

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

    loans[activeLoanIdx] = {
      ...l,
      installment_amount: loanAmt,
      balance_outstanding: balance,
      months_remaining: monthsRem,
      recoveries,
      last_salary_month: mk,
      synced_from_salary: true,
      updated_at: now,
      ...(balance <= 0 || (monthsRem != null && monthsRem <= 0)
        ? { status: balance <= 0 ? "closed" : l.status, closed_at: balance <= 0 ? now : l.closed_at || null }
        : {}),
    };
  } else if (activeLoanIdx < 0 && loanAmt > 0) {
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
  if (activeAdvIdx >= 0 && salAdvAmt > 0) {
    const a = salaryAdvances[activeAdvIdx];
    const recoveries = Array.isArray(a.recoveries) ? [...a.recoveries] : [];
    const sheetRecIdx = recoveries.findIndex(
      (r) => r && r.source === "salary_sheet" && String(r.month || "").slice(0, 7) === mk
    );
    let balance = round2(a.balance_outstanding);
    let monthsRem =
      a.months_remaining != null ? Number(a.months_remaining) : a.months != null ? Number(a.months) : null;

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
      if (monthsRem != null && Number.isFinite(monthsRem)) {
        monthsRem = Math.max(0, monthsRem - 1);
      }
    }
    salaryAdvances[activeAdvIdx] = {
      ...a,
      recovery_amount: salAdvAmt,
      balance_outstanding: balance,
      months_remaining: monthsRem,
      recoveries,
      last_salary_month: mk,
      synced_from_salary: true,
      updated_at: now,
      ...(balance <= 0
        ? { status: "closed", closed_at: now }
        : {}),
    };
  } else if (activeAdvIdx < 0 && salAdvAmt > 0) {
    salaryAdvances = [
      {
        id: newId("adv"),
        amount: salAdvAmt,
        principal: salAdvAmt,
        balance_outstanding: 0,
        months: 1,
        months_remaining: 0,
        recovery_amount: salAdvAmt,
        start_month: mk,
        end_month: mk,
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

