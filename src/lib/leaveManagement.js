import { fetchActiveEmployees, fetchRegisterMarksForYear, normalizeAttendanceEmpCode } from "./attendanceDaily";

export const DEFAULT_ANNUAL_ENTITLEMENTS = {
  PL: 18,
  SL: 8,
  CL: 8,
};

// Which attendance-register marks count against the generic carry-forward categories.
function markWeightForPl(mark) {
  const m = String(mark || "").trim();
  if (m === "PL") return 1;
  return 0;
}

function markWeightForSl(mark) {
  const m = String(mark || "").trim();
  if (m === "SL") return 1;
  return 0;
}

function markWeightForCl(mark) {
  const m = String(mark || "").trim();
  if (m === "CL") return 1;
  return 0;
}

function markWeightForSbel(mark) {
  const m = String(mark || "").trim();
  if (m === "SBEL") return 1;
  return 0;
}

function markWeightForSpla(mark) {
  const m = String(mark || "").trim();
  if (m === "SPLA") return 0.5;
  return 0;
}

function markWeightForSplb(mark) {
  const m = String(mark || "").trim();
  if (m === "SPLB") return 0.5;
  return 0;
}

function markWeightForSplm(mark) {
  const m = String(mark || "").trim();
  if (m === "SPLM") return 1;
  return 0;
}

function markWeightForPaternity(mark) {
  const m = String(mark || "").trim();
  if (m === "PTL") return 1;
  return 0;
}

function markWeightForCoff(mark) {
  const m = String(mark || "").trim();
  if (m === "CO") return 1;
  return 0;
}

function clampNonNegative(n) {
  const x = Number(n || 0);
  return x < 0 ? 0 : x;
}

export async function getLeaveCarryForwardRules(supabase) {
  const { data, error } = await supabase
    .schema("indus_one")
    .from("leave_carry_forward_rules")
    .select("id, pl_carry_forward_max, sl_carry_forward_max, cl_carry_forward_max")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return (
    data || {
      id: 1,
      pl_carry_forward_max: DEFAULT_ANNUAL_ENTITLEMENTS.PL, // fallback to something non-zero
      sl_carry_forward_max: DEFAULT_ANNUAL_ENTITLEMENTS.SL,
      cl_carry_forward_max: 0,
    }
  );
}

export async function upsertLeaveCarryForwardRules(supabase, rules) {
  const { error } = await supabase
    .schema("indus_one")
    .from("leave_carry_forward_rules")
    .upsert(
      {
        id: 1,
        pl_carry_forward_max: rules.pl_carry_forward_max,
        sl_carry_forward_max: rules.sl_carry_forward_max,
        cl_carry_forward_max: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  if (error) throw error;
}

export async function fetchPlEncashPrefs(supabase) {
  const { data, error } = await supabase
    .schema("indus_one")
    .from("employee_pl_encash_pref")
    .select("employee_code, encash_pl_on_carry_forward");
  if (error) throw error;
  const out = {};
  for (const r of data || []) {
    const code = normalizeAttendanceEmpCode(r.employee_code);
    if (!code) continue;
    out[code] = !!r.encash_pl_on_carry_forward;
  }
  return out;
}

export async function upsertPlEncashPrefs(supabase, prefs) {
  // prefs: { [employee_code]: boolean }
  const rows = Object.entries(prefs || {})
    .map(([employee_code, encash]) => ({
      employee_code: normalizeAttendanceEmpCode(employee_code),
      encash_pl_on_carry_forward: !!encash,
      updated_at: new Date().toISOString(),
    }))
    .filter((r) => !!r.employee_code);
  if (!rows.length) return;
  const { error } = await supabase
    .schema("indus_one")
    .from("employee_pl_encash_pref")
    .upsert(rows, { onConflict: "employee_code" });
  if (error) throw error;
}

export async function fetchLeaveBalancesForYear(supabase, year) {
  const { data, error } = await supabase
    .schema("indus_one")
    .from("employee_leave_balances_yearly")
    .select("*")
    .eq("year", year);
  if (error) throw error;
  return data || [];
}

export async function recalculateEmployeeLeaveEntitlements(supabase, employeeCode, year) {
  const code = normalizeAttendanceEmpCode(employeeCode);
  const y = Number(year);
  if (!code || !Number.isFinite(y)) return;
  const { error } = await supabase.schema("indus_one").rpc("recalculate_employee_leave_entitlements", {
    p_employee_code: code,
    p_year: y,
  });
  if (error) throw error;
}

export async function recalculateAllLeaveEntitlementsForYear(supabase, year) {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 1900) return 0;
  const { data, error } = await supabase.schema("indus_one").rpc(
    "recalculate_all_leave_entitlements_for_year",
    { p_year: y }
  );
  if (error) throw error;
  return Number(data || 0);
}

function emptyUsedLeaveTotals() {
  return {
    used_pl: 0,
    used_sl: 0,
    used_cl: 0,
    used_sbel: 0,
    used_spla: 0,
    used_splb: 0,
    used_splm: 0,
    used_coff: 0,
    used_paternity: 0,
  };
}

function buildUsedLeaveTotalsByEmployee(registerRows) {
  const usedByEmp = {};
  for (const row of registerRows || []) {
    const emp_code = normalizeAttendanceEmpCode(row.employee_code);
    if (!emp_code) continue;
    const m = row.mark;

    const plW = markWeightForPl(m);
    const slW = markWeightForSl(m);
    const clW = markWeightForCl(m);
    const sbelW = markWeightForSbel(m);
    const splaW = markWeightForSpla(m);
    const splbW = markWeightForSplb(m);
    const splmW = markWeightForSplm(m);
    const coffW = markWeightForCoff(m);
    const paternityW = markWeightForPaternity(m);

    if (
      plW === 0 &&
      slW === 0 &&
      clW === 0 &&
      sbelW === 0 &&
      splaW === 0 &&
      splbW === 0 &&
      splmW === 0 &&
      coffW === 0 &&
      paternityW === 0
    ) {
      continue;
    }

    if (!usedByEmp[emp_code]) usedByEmp[emp_code] = emptyUsedLeaveTotals();
    usedByEmp[emp_code].used_pl += plW;
    usedByEmp[emp_code].used_sl += slW;
    usedByEmp[emp_code].used_cl += clW;
    usedByEmp[emp_code].used_sbel += sbelW;
    usedByEmp[emp_code].used_spla += splaW;
    usedByEmp[emp_code].used_splb += splbW;
    usedByEmp[emp_code].used_splm += splmW;
    usedByEmp[emp_code].used_coff += coffW;
    usedByEmp[emp_code].used_paternity += paternityW;
  }
  return usedByEmp;
}

export async function fetchLeaveUsageFromDailyRegister(supabase, year) {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 1900) return {};
  const registerRows = await fetchRegisterMarksForYear(supabase, y);
  return buildUsedLeaveTotalsByEmployee(registerRows);
}

function openingMinusUsed(opening, used) {
  return Math.max(0, Number(opening || 0) - Number(used || 0));
}

const EXTENDED_LEAVE_BALANCE_FIELDS = [
  { opening: "opening_sbel", used: "used_sbel", unused: "unused_sbel" },
  { opening: "opening_spla", used: "used_spla", unused: "unused_spla" },
  { opening: "opening_splb", used: "used_splb", unused: "unused_splb" },
  { opening: "opening_splm", used: "used_splm", unused: "unused_splm" },
  { opening: "opening_coff", used: "used_coff", unused: "unused_coff" },
  { opening: "opening_paternity", used: "used_paternity", unused: "unused_paternity" },
];

function readExtendedLeaveBalanceFields(input = {}) {
  const out = {};
  for (const field of EXTENDED_LEAVE_BALANCE_FIELDS) {
    out[field.opening] = clampNonNegative(input[field.opening]);
    out[field.used] = clampNonNegative(input[field.used]);
    out[field.unused] = openingMinusUsed(out[field.opening], out[field.used]);
  }
  return out;
}

function valueFromCurrentOrFallback(current, key, fallback = 0) {
  if (current && Object.prototype.hasOwnProperty.call(current, key)) {
    return Number(current[key] || 0);
  }
  return Number(fallback || 0);
}

/**
 * Computes yearly balances in `indus_one.employee_leave_balances_yearly`.
 * - CL never carries forward (cap = 0).
 * - SL carries forward up to `sl_carry_forward_max`; remaining unused expires.
 * - PL carries forward up to `pl_carry_forward_max` unless employee prefers encashment.
 */
export async function processLeaveBalancesYear(supabase, year) {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 1900) return;

  const [employees, rules, plPrefs] = await Promise.all([
    fetchActiveEmployees(supabase),
    getLeaveCarryForwardRules(supabase),
    fetchPlEncashPrefs(supabase),
  ]);

  const prevYear = y - 1;
  const { data: prevBalances, error: prevErr } = await supabase
    .schema("indus_one")
    .from("employee_leave_balances_yearly")
    .select("employee_code, carried_pl, carried_sl, carried_cl")
    .eq("year", prevYear);
  if (prevErr) throw prevErr;

  const prevByEmp = {};
  for (const r of prevBalances || []) {
    const code = normalizeAttendanceEmpCode(r.employee_code);
    if (!code) continue;
    prevByEmp[code] = r;
  }

  const currentBalances = await fetchLeaveBalancesForYear(supabase, y);
  const currentByEmp = {};
  for (const row of currentBalances || []) {
    const code = normalizeAttendanceEmpCode(row.employee_code);
    if (!code) continue;
    currentByEmp[code] = row;
  }

  const usedByEmp = await fetchLeaveUsageFromDailyRegister(supabase, y);

  const usageRows = (employees || [])
    .map((e) => {
      const emp_code = normalizeAttendanceEmpCode(e.empCode);
      if (!emp_code) return null;
      const prev = prevByEmp[emp_code] || {};
      const current = currentByEmp[emp_code] || null;
      const used = usedByEmp[emp_code] || emptyUsedLeaveTotals();

      return {
        employee_code: emp_code,
        year: y,
        opening_pl: valueFromCurrentOrFallback(current, "opening_pl", prev.carried_pl),
        opening_sl: valueFromCurrentOrFallback(current, "opening_sl", prev.carried_sl),
        opening_cl: valueFromCurrentOrFallback(current, "opening_cl", prev.carried_cl),
        opening_sbel: valueFromCurrentOrFallback(current, "opening_sbel", 0),
        opening_spla: valueFromCurrentOrFallback(current, "opening_spla", 0),
        opening_splb: valueFromCurrentOrFallback(current, "opening_splb", 0),
        opening_splm: valueFromCurrentOrFallback(current, "opening_splm", 0),
        opening_coff: valueFromCurrentOrFallback(current, "opening_coff", 0),
        opening_paternity: valueFromCurrentOrFallback(current, "opening_paternity", 0),
        used_pl: clampNonNegative(used.used_pl),
        used_sl: clampNonNegative(used.used_sl),
        used_cl: clampNonNegative(used.used_cl),
        used_sbel: clampNonNegative(used.used_sbel),
        used_spla: clampNonNegative(used.used_spla),
        used_splb: clampNonNegative(used.used_splb),
        used_splm: clampNonNegative(used.used_splm),
        used_coff: clampNonNegative(used.used_coff),
        used_paternity: clampNonNegative(used.used_paternity),
        processed_at: new Date().toISOString(),
      };
    })
    .filter(Boolean);

  if (usageRows.length) {
    const { error: usageErr } = await supabase
      .schema("indus_one")
      .from("employee_leave_balances_yearly")
      .upsert(usageRows, { onConflict: "employee_code,year" });
    if (usageErr) throw usageErr;
  }

  await recalculateAllLeaveEntitlementsForYear(supabase, y);

  const balances = await fetchLeaveBalancesForYear(supabase, y);
  const balanceByCode = {};
  for (const row of balances) {
    const code = normalizeAttendanceEmpCode(row.employee_code);
    if (!code) continue;
    balanceByCode[code] = row;
  }

  const rowsToUpsert = (employees || [])
    .map((e) => {
    const emp_code = normalizeAttendanceEmpCode(e.empCode);
    if (!emp_code) return null;
    const bal = balanceByCode[emp_code] || {};

    const unused_pl = openingMinusUsed(bal.opening_pl, bal.used_pl);
    const unused_sl = openingMinusUsed(bal.opening_sl, bal.used_sl);
    const unused_cl = openingMinusUsed(bal.opening_cl, bal.used_cl);

    const plCarryCap = Number(rules.pl_carry_forward_max ?? 0);
    const slCarryCap = Number(rules.sl_carry_forward_max ?? 0);
    const clCarryCap = Number(rules.cl_carry_forward_max ?? 0);

    const plCarryAmount = Math.min(unused_pl, plCarryCap);
    const slCarryAmount = Math.min(unused_sl, slCarryCap);
    const clCarryAmount = Math.min(unused_cl, clCarryCap);

    const encash = !!plPrefs[emp_code];
    const carried_pl = encash ? 0 : plCarryAmount;
    const encashed_pl = encash ? plCarryAmount : 0;

    return {
      employee_code: emp_code,
      year: y,
      opening_pl: Number(bal.opening_pl || 0),
      opening_sl: Number(bal.opening_sl || 0),
      opening_cl: Number(bal.opening_cl || 0),
      pl_entitlement: Number(bal.pl_entitlement || 0),
      sl_entitlement: Number(bal.sl_entitlement || 0),
      cl_entitlement: Number(bal.cl_entitlement || 0),
      sbel_entitlement: Number(bal.sbel_entitlement || 0),
      spla_entitlement: Number(bal.spla_entitlement || 0),
      splb_entitlement: Number(bal.splb_entitlement || 0),
      splm_entitlement: Number(bal.splm_entitlement || 0),
      paternity_entitlement: Number(bal.paternity_entitlement || 0),
      used_pl: Number(bal.used_pl || 0),
      used_sl: Number(bal.used_sl || 0),
      used_cl: Number(bal.used_cl || 0),
      used_sbel: Number(bal.used_sbel || 0),
      used_spla: Number(bal.used_spla || 0),
      used_splb: Number(bal.used_splb || 0),
      used_splm: Number(bal.used_splm || 0),
      used_coff: Number(bal.used_coff || 0),
      used_paternity: Number(bal.used_paternity || 0),
      unused_pl,
      unused_sl,
      unused_cl,
      ...readExtendedLeaveBalanceFields(bal),
      carried_pl,
      carried_sl: slCarryAmount,
      carried_cl: clCarryAmount,
      expired_pl: Math.max(0, unused_pl - plCarryAmount),
      expired_sl: Math.max(0, unused_sl - slCarryAmount),
      expired_cl: Math.max(0, unused_cl - clCarryAmount),
      encashed_pl,
      processed_at: new Date().toISOString(),
    };
  })
  .filter(Boolean);

  // Upsert all computed rows.
  const { error } = await supabase
    .schema("indus_one")
    .from("employee_leave_balances_yearly")
    .upsert(rowsToUpsert, { onConflict: "employee_code,year" });
  if (error) throw error;
}

/**
 * Build a full yearly balance row for manual edit / bulk import.
 * Recomputes unused_* from opening − used.
 */
export function buildLeaveBalanceDbRow(input, year) {
  const emp_code = normalizeAttendanceEmpCode(
    input.employee_code || input.emp_code || input.empCode
  );
  const y = Number(year);
  if (!emp_code || !Number.isFinite(y) || y < 1900) return null;

  const opening_pl = clampNonNegative(input.opening_pl);
  const opening_sl = clampNonNegative(input.opening_sl);
  const opening_cl = clampNonNegative(input.opening_cl);
  const pl_entitlement = clampNonNegative(
    input.pl_entitlement ?? DEFAULT_ANNUAL_ENTITLEMENTS.PL
  );
  const sl_entitlement = clampNonNegative(
    input.sl_entitlement ?? DEFAULT_ANNUAL_ENTITLEMENTS.SL
  );
  const cl_entitlement = clampNonNegative(
    input.cl_entitlement ?? DEFAULT_ANNUAL_ENTITLEMENTS.CL
  );
  const used_pl = clampNonNegative(input.used_pl);
  const used_sl = clampNonNegative(input.used_sl);
  const used_cl = clampNonNegative(input.used_cl);
  const carried_pl = clampNonNegative(input.carried_pl);
  const carried_sl = clampNonNegative(input.carried_sl);
  const carried_cl = clampNonNegative(input.carried_cl);
  const expired_pl = clampNonNegative(input.expired_pl);
  const expired_sl = clampNonNegative(input.expired_sl);
  const expired_cl = clampNonNegative(input.expired_cl);
  const encashed_pl = clampNonNegative(input.encashed_pl);

  const unused_pl = openingMinusUsed(opening_pl, used_pl);
  const unused_sl = openingMinusUsed(opening_sl, used_sl);
  const unused_cl = openingMinusUsed(opening_cl, used_cl);
  const extended = readExtendedLeaveBalanceFields(input);

  return {
    employee_code: emp_code,
    year: y,
    opening_pl,
    opening_sl,
    opening_cl,
    pl_entitlement,
    sl_entitlement,
    cl_entitlement,
    used_pl,
    used_sl,
    used_cl,
    unused_pl,
    unused_sl,
    unused_cl,
    ...extended,
    carried_pl,
    carried_sl,
    carried_cl,
    expired_pl,
    expired_sl,
    expired_cl,
    encashed_pl,
    processed_at: new Date().toISOString(),
  };
}

export async function upsertLeaveBalancesBatch(supabase, payloads) {
  const rows = (payloads || []).filter(Boolean);
  if (!rows.length) return { count: 0 };
  const { error } = await supabase
    .schema("indus_one")
    .from("employee_leave_balances_yearly")
    .upsert(rows, { onConflict: "employee_code,year" });
  if (error) throw error;
  return { count: rows.length };
}

export async function upsertLeaveBalanceYearly(supabase, input, year) {
  const row = buildLeaveBalanceDbRow(input, year);
  if (!row) throw new Error("Employee code and year are required.");
  const result = await upsertLeaveBalancesBatch(supabase, [row]);
  await recalculateEmployeeLeaveEntitlements(supabase, row.employee_code, year);
  return result;
}

