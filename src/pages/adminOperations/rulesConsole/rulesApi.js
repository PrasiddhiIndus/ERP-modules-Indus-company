/** Rules Console data access (Supabase). */

import { supabase } from "../../../lib/supabase";
import {
  RULES_TABLE,
  RULE_VALUES_TABLE,
  ensureAttendanceRulesLoaded,
  normalizeRuleValueRow,
} from "../../../lib/attendanceRules";
import {
  EMPLOYEE_MASTER_BASE_DEPARTMENTS,
  canonicalDepartmentLabel,
  normalizeDeptKey,
} from "../../../lib/employeeMasterDepartments";

const EMPLOYEE_MASTER_TABLE = "admin_ifsp_employee_master";

function friendlyError(error, fallback) {
  const msg = error?.message || "";
  if (error?.code === "42P01" || error?.code === "PGRST205" || /could not find the (table|function)/i.test(msg)) {
    return "Rules are not set up on this server yet. Ask IT to apply the latest database update.";
  }
  if (error?.code === "42501") return "Your account cannot change rules. Ask an administrator for Rules Console access.";
  if (error?.code === "22023" && msg) return msg;
  return fallback;
}

async function fetchDepartments() {
  const { data, error } = await supabase.from(EMPLOYEE_MASTER_TABLE).select("department,status");
  if (error) throw error;
  const byKey = new Map();
  const add = (raw, active) => {
    const label = canonicalDepartmentLabel(raw);
    if (!label) return;
    const key = normalizeDeptKey(label);
    const entry = byKey.get(key) || { name: label, activeEmployees: 0 };
    if (active) entry.activeEmployees += 1;
    byKey.set(key, entry);
  };
  for (const row of data || []) add(row.department, String(row.status || "").toLowerCase() === "active");
  for (const name of EMPLOYEE_MASTER_BASE_DEPARTMENTS) add(name, false);
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** Catalogue row in one shape, whichever schema version is installed. */
export function normalizeRule(row) {
  const isWired = row.is_wired ?? row.editable ?? false;
  const scopes = Array.isArray(row.allowed_scopes)
    ? row.allowed_scopes
    : row.allows_department
      ? ["company", "department"]
      : ["company"];
  return {
    ...row,
    is_wired: isWired,
    editable: isWired && !row.retired,
    allowed_scopes: scopes,
    allows_department: scopes.includes("department"),
  };
}

/**
 * Managed per employee from Employee Master ("Has weekly off", "Has NH/PH", "Earns C/O", "C/O expires").
 * Saved values, including department weekly-off patterns, keep applying.
 */
export const EMPLOYEE_MASTER_RULE_KEYS = Object.freeze([
  "wo.pattern",
  "wo.custom_days",
  "wo.auto_holiday",
  "co.earn",
  "co.expiry_mode",
]);

/** Rules that belong on the page: hide retired rules, unwired replacements and Employee Master rules. */
export function isRuleVisible(rule) {
  if (EMPLOYEE_MASTER_RULE_KEYS.includes(rule.rule_key)) return false;
  if (rule.retired) return false;
  if (rule.hidden_until_wired && !rule.is_wired) return false;
  return true;
}

/** Value row for the current page (company / department, active only). */
function toPageValue(raw) {
  const row = normalizeRuleValueRow(raw);
  if (row.status !== "active" || !["company", "department"].includes(row.scope_type)) return null;
  return {
    ...row,
    department: row.scope_type === "department" ? row.scope_label || row.scope_id : null,
    previous_value: row.old_value,
  };
}

/** Rules catalogue, every dated value, and departments with active headcount. */
export async function fetchRulesConsole() {
  const [rulesRes, valuesRes, departments] = await Promise.all([
    supabase.from(RULES_TABLE).select("*").order("module").order("sort_order"),
    supabase.from(RULE_VALUES_TABLE).select("*").order("id"),
    fetchDepartments().catch((e) => {
      console.error("[RulesConsole] departments failed", e);
      return EMPLOYEE_MASTER_BASE_DEPARTMENTS.map((name) => ({ name, activeEmployees: 0 }));
    }),
  ]);
  for (const res of [rulesRes, valuesRes]) {
    if (res.error) {
      console.error("[RulesConsole] load failed", res.error);
      throw new Error(friendlyError(res.error, "Could not load rules. Please try again."));
    }
  }
  return {
    rules: (rulesRes.data || []).map(normalizeRule).filter(isRuleVisible),
    values: (valuesRes.data || []).map(toPageValue).filter(Boolean),
    departments,
  };
}

/**
 * Save one change. `department` null = company default; `value` null on a
 * department = back to company default.
 */
export async function saveRuleValue({ ruleKey, department, value, effectiveFrom, reason }) {
  const { data, error } = await supabase.rpc("admin_rules_save", {
    p_rule_key: ruleKey,
    p_department: department || null,
    p_value: value,
    p_effective_from: effectiveFrom,
    p_reason: reason,
  });
  if (error) {
    console.error("[RulesConsole] save failed", error);
    throw new Error(friendlyError(error, "Could not save the change. Please try again."));
  }
  await ensureAttendanceRulesLoaded(supabase, { force: true });
  return data;
}
