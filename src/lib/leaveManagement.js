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
  if (m === "SPLA" || m === "SPLB") return 0.5;
  if (m === "SPLM") return 1;
  // PTL is treated as leave credit (prompt: PTL = -3)
  if (m === "PTL") return -3;
  return 0;
}

function markWeightForSl(mark) {
  const m = String(mark || "").trim();
  if (m === "SL") return 1;
  if (m === "SBEL") return 1;
  return 0;
}

function markWeightForCl(mark) {
  const m = String(mark || "").trim();
  if (m === "CL") return 1;
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
    .select("emp_code, encash_pl_on_carry_forward");
  if (error) throw error;
  const out = {};
  for (const r of data || []) {
    const code = normalizeAttendanceEmpCode(r.emp_code);
    if (!code) continue;
    out[code] = !!r.encash_pl_on_carry_forward;
  }
  return out;
}

export async function upsertPlEncashPrefs(supabase, prefs) {
  // prefs: { [emp_code]: boolean }
  const rows = Object.entries(prefs || {})
    .map(([emp_code, encash]) => ({
      emp_code: normalizeAttendanceEmpCode(emp_code),
      encash_pl_on_carry_forward: !!encash,
      updated_at: new Date().toISOString(),
    }))
    .filter((r) => !!r.emp_code);
  if (!rows.length) return;
  const { error } = await supabase
    .schema("indus_one")
    .from("employee_pl_encash_pref")
    .upsert(rows, { onConflict: "emp_code" });
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
    .select("emp_code, carried_pl, carried_sl, carried_cl")
    .eq("year", prevYear);
  if (prevErr) throw prevErr;

  const prevByEmp = {};
  for (const r of prevBalances || []) {
    const code = normalizeAttendanceEmpCode(r.emp_code);
    if (!code) continue;
    prevByEmp[code] = r;
  }

  const registerRows = await fetchRegisterMarksForYear(supabase, y);

  const usedByEmp = {};
  for (const row of registerRows || []) {
    const emp_code = normalizeAttendanceEmpCode(row.employee_code);
    if (!emp_code) continue;
    const m = row.mark;

    const plW = markWeightForPl(m);
    const slW = markWeightForSl(m);
    const clW = markWeightForCl(m);

    if (plW === 0 && slW === 0 && clW === 0) continue;

    if (!usedByEmp[emp_code]) usedByEmp[emp_code] = { used_pl: 0, used_sl: 0, used_cl: 0 };
    usedByEmp[emp_code].used_pl += plW;
    usedByEmp[emp_code].used_sl += slW;
    usedByEmp[emp_code].used_cl += clW;
  }

  const rowsToUpsert = (employees || [])
    .map((e) => {
    const emp_code = normalizeAttendanceEmpCode(e.empCode);
    if (!emp_code) return null;
    const prev = prevByEmp[emp_code] || {};

    const opening_pl = Number(prev.carried_pl || 0);
    const opening_sl = Number(prev.carried_sl || 0);
    const opening_cl = Number(prev.carried_cl || 0);

    const used = usedByEmp[emp_code] || { used_pl: 0, used_sl: 0, used_cl: 0 };
    const used_pl = clampNonNegative(used.used_pl);
    const used_sl = clampNonNegative(used.used_sl);
    const used_cl = clampNonNegative(used.used_cl);

    const pl_entitlement = DEFAULT_ANNUAL_ENTITLEMENTS.PL;
    const sl_entitlement = DEFAULT_ANNUAL_ENTITLEMENTS.SL;
    const cl_entitlement = DEFAULT_ANNUAL_ENTITLEMENTS.CL;

    const available_pl = opening_pl + pl_entitlement;
    const available_sl = opening_sl + sl_entitlement;
    const available_cl = opening_cl + cl_entitlement;

    const unused_pl = Math.max(0, available_pl - used_pl);
    const unused_sl = Math.max(0, available_sl - used_sl);
    const unused_cl = Math.max(0, available_cl - used_cl);

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
      emp_code,
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
    .upsert(rowsToUpsert, { onConflict: "emp_code,year" });
  if (error) throw error;
}

/**
 * Build a full yearly balance row for manual edit / bulk import.
 * Recomputes unused_* from opening + entitlement − used.
 */
export function buildLeaveBalanceDbRow(input, year) {
  const emp_code = normalizeAttendanceEmpCode(input.emp_code || input.empCode);
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

  const unused_pl = Math.max(0, opening_pl + pl_entitlement - used_pl);
  const unused_sl = Math.max(0, opening_sl + sl_entitlement - used_sl);
  const unused_cl = Math.max(0, opening_cl + cl_entitlement - used_cl);

  return {
    emp_code,
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
    .upsert(rows, { onConflict: "emp_code,year" });
  if (error) throw error;
  return { count: rows.length };
}

export async function upsertLeaveBalanceYearly(supabase, input, year) {
  const row = buildLeaveBalanceDbRow(input, year);
  if (!row) throw new Error("Employee code and year are required.");
  return upsertLeaveBalancesBatch(supabase, [row]);
}

