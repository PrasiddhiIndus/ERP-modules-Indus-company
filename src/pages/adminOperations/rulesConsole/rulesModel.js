/** Pure helpers for the Rules Console (no React, no network). */

import { resolveRuleValueFromRows, ruleDepartmentKey } from "../../../lib/attendanceRules";
import { isoToDisplayDate } from "../../../utils/dateInput";

export const RULE_MODULES = [
  { id: "weekly_off", label: "Weekly off & holidays" },
  { id: "attendance", label: "Attendance" },
  { id: "leave", label: "Leave" },
  { id: "comp_off", label: "Comp-off (C/O)" },
];

export function todayIso(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const d = new Date(`${value}T00:00:00`);
  return !Number.isNaN(d.getTime()) && todayIso(d) === value;
}

export function formatRuleValue(rule, value) {
  if (value === null || value === undefined) return "Company default";
  if (rule?.value_type === "boolean") return value === true ? "Yes" : "No";
  if (rule?.value_type === "number") return rule.unit ? `${value} ${rule.unit}` : String(value);
  if (rule?.value_type === "date") return isoToDisplayDate(value) || String(value);
  if (rule?.value_type === "select") {
    return (rule.options || []).find((o) => o.value === value)?.label || String(value);
  }
  if (rule?.value_type === "multi_number") {
    const list = Array.isArray(value) ? value : [];
    if (!list.length) return "None";
    return list.map((v) => (rule.options || []).find((o) => o.value === v)?.label ?? String(v)).join(", ");
  }
  return String(value);
}

/** Value in force for the company (department = null) or one department on a date. */
export function valueFor(rule, values, { department = null, onDate = null } = {}) {
  return resolveRuleValueFromRows(values, rule.rule_key, {
    department,
    onDate,
    fallback: rule.default_value ?? null,
  });
}

function latestOwnRow(rows, deptKey, onDate) {
  let best = null;
  for (const row of rows) {
    if (ruleDepartmentKey(row.department) !== deptKey) continue;
    if (String(row.effective_from) > onDate) continue;
    if (
      !best ||
      String(row.effective_from) > String(best.effective_from) ||
      (row.effective_from === best.effective_from && Number(row.id) > Number(best.id))
    ) {
      best = row;
    }
  }
  return best;
}

/** True when the department has its own value (not the company default) on that date. */
export function departmentHasOwnValue(values, ruleKey, department, onDate = todayIso()) {
  const key = ruleDepartmentKey(department);
  if (!key) return false;
  const rows = (values || []).filter((r) => r.rule_key === ruleKey && r.department != null);
  const own = latestOwnRow(rows, key, onDate);
  return Boolean(own && own.value != null);
}

/**
 * Summary for the list row and drawer:
 * - companyValue: company default today
 * - differences: departments whose own value today differs from the company default
 * - scheduled: changes that start after today
 */
export function summarizeRule(rule, values, today = todayIso()) {
  const rows = (values || []).filter((v) => v.rule_key === rule.rule_key);
  const companyValue = valueFor(rule, rows, { onDate: today });

  const deptLabels = new Map();
  for (const row of rows) {
    if (row.department == null) continue;
    const key = ruleDepartmentKey(row.department);
    if (key && !deptLabels.has(key)) deptLabels.set(key, row.department);
  }

  const differences = [];
  for (const [key, department] of deptLabels) {
    const own = latestOwnRow(
      rows.filter((r) => r.department != null),
      key,
      today
    );
    if (!own || own.value == null) continue;
    if (own.value === companyValue) continue;
    differences.push({ department, value: own.value, since: own.effective_from });
  }
  differences.sort((a, b) => a.department.localeCompare(b.department, undefined, { sensitivity: "base" }));

  const scheduled = rows
    .filter((r) => String(r.effective_from) > today)
    .sort((a, b) => String(a.effective_from).localeCompare(String(b.effective_from)) || a.id - b.id);

  return { companyValue, differences, scheduled };
}

export const SETUP_DATE = "2000-01-01";

/** Changes made in the console, newest first (the original setup rows are left out). */
export function ruleHistory(rule, values) {
  return (values || [])
    .filter((v) => v.rule_key === rule.rule_key && String(v.effective_from) > SETUP_DATE)
    .sort(
      (a, b) =>
        String(b.created_at || "").localeCompare(String(a.created_at || "")) || Number(b.id) - Number(a.id)
    );
}

/** Form value → value sent to the server (null = back to company default). */
export function parseFormValue(rule, raw) {
  if (raw === "__inherit") return null;
  if (rule.value_type === "boolean") return raw === "true";
  if (rule.value_type === "number") return raw === "" ? NaN : Number(raw);
  if (rule.value_type === "multi_number") {
    return String(raw ?? "").split(",").filter((s) => s !== "").map(Number).sort((a, b) => a - b);
  }
  if (rule.value_type === "time") return String(raw ?? "").trim().slice(0, 5);
  return String(raw ?? "").trim();
}

export function toFormValue(rule, value) {
  if (value === null || value === undefined) return rule.value_type === "boolean" ? "true" : "";
  if (rule.value_type === "multi_number") {
    return (Array.isArray(value) ? value : []).map(Number).sort((a, b) => a - b).join(",");
  }
  return String(value);
}

/** Client-side checks; the server repeats them. Returns { field: message }. */
export function validateRuleEdit(rule, { department, value, effectiveFrom, reason }, today = todayIso()) {
  const errors = {};
  if (value === null) {
    if (!department) errors.value = "Company default needs a value.";
  } else if (rule.value_type === "number") {
    if (!Number.isInteger(value)) errors.value = "Enter a whole number.";
    else if (rule.min_value != null && value < Number(rule.min_value)) {
      errors.value = `Enter a value between ${rule.min_value} and ${rule.max_value}.`;
    } else if (rule.max_value != null && value > Number(rule.max_value)) {
      errors.value = `Enter a value between ${rule.min_value} and ${rule.max_value}.`;
    }
  } else if (rule.value_type === "date" && !isIsoDate(value)) {
    errors.value = "Enter a valid date.";
  } else if (rule.value_type === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))) {
    errors.value = "Enter a time as HH:MM.";
  } else if (rule.value_type === "select" && !(rule.options || []).some((o) => o.value === value)) {
    errors.value = "Choose one of the options.";
  } else if (
    rule.value_type === "multi_number" &&
    !value.every((v) => (rule.options || []).some((o) => o.value === v))
  ) {
    errors.value = "Choose from the listed values.";
  }
  if (!isIsoDate(effectiveFrom)) errors.effectiveFrom = "Choose the date this starts.";
  else if (effectiveFrom < today) errors.effectiveFrom = "Changes can start today or later.";
  if (String(reason || "").trim().length < 3) errors.reason = "Enter a reason for the change.";
  return errors;
}

/** "Production, R&M +2" */
export function departmentListLabel(departments, max = 3) {
  if (!departments.length) return "";
  const shown = departments.slice(0, max).join(", ");
  return departments.length > max ? `${shown} +${departments.length - max}` : shown;
}
