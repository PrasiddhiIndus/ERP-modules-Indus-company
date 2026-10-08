/**
 * Attendance / leave / C/O rules set in the Admin Rules Console.
 *
 * Resolution mirrors public.get_rule():
 *   Employee > Group > Department > Company > built-in default.
 * - Each scope uses its latest active row with effective_from <= the date; a row
 *   whose value is null means "inherit" (override removed).
 * - Several groups with a value: the highest group priority wins.
 * - Group membership = hand-picked employees + departments listed on the group.
 *
 * Values are cached in memory (refreshed at most once a minute) so synchronous
 * register helpers can read them. Until the first successful load, or if the
 * rules tables are unavailable, the defaults below apply — they match the
 * behaviour before the console existed.
 */

export const RULES_TABLE = "admin_attendance_rules";
export const RULE_VALUES_TABLE = "admin_attendance_rule_values";
export const RULE_GROUPS_TABLE = "admin_rule_groups";
export const RULE_GROUP_MEMBERS_TABLE = "admin_rule_group_members";

export const RULE_SCOPES = ["company", "department", "group", "employee"];

export const RULE_KEYS = {
  thirdSaturdayOff: "wo.third_saturday_off",
  woPattern: "wo.pattern",
  woCustomDays: "wo.custom_days",
  woAuto: "wo.auto",
  woAutoHoliday: "wo.auto_holiday",
  coStartDate: "co.start_date",
  coExpiryMonths: "co.expiry_months",
  coSundayPodOnly: "co.sunday_pod_only",
  coThirdSaturdayEarns: "co.third_saturday_earns",
};

const SETUP_DATE = "2000-01-01";

function seedRows(ruleKey, companyValue, departments, deptValue, startId) {
  return [
    { id: startId, rule_key: ruleKey, scope_type: "company", scope_id: null, scope_label: null, value: companyValue, effective_from: SETUP_DATE },
    ...departments.map((department, i) => ({
      id: startId + i + 1,
      rule_key: ruleKey,
      scope_type: "department",
      scope_id: ruleDepartmentKey(department),
      scope_label: department,
      value: deptValue,
      effective_from: SETUP_DATE,
    })),
  ];
}

/** Lower-case, single spaces, no spaces around hyphens — same as public.admin_rule_norm_department(). */
export function ruleDepartmentKey(department) {
  const key = String(department ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-");
  return key || null;
}

/** Trim; all-digit codes lose leading zeros — same as public.admin_rule_norm_employee(). */
export function ruleEmployeeKey(code) {
  const s = String(code ?? "").trim();
  if (!s) return null;
  return /^\d+$/.test(s) ? BigInt(s).toString() : s;
}

export const DEFAULT_RULE_VALUE_ROWS = [
  ...seedRows(
    RULE_KEYS.thirdSaturdayOff,
    true,
    ["Production", "Production-FTC", "Production - Neotech", "R&M", "M&M", "Maintenance-FTC"],
    false,
    -100
  ),
  ...seedRows(RULE_KEYS.coStartDate, "2026-09-01", [], null, -200),
];

/**
 * Accept rows from either schema version (department/department_key before the
 * scopes migration, scope_type/scope_id after) and return the scoped shape.
 */
export function normalizeRuleValueRow(row) {
  if (!row) return null;
  const scopeType = row.scope_type || (row.department != null ? "department" : "company");
  let scopeId = row.scope_id ?? null;
  if (scopeType === "department" && scopeId == null) scopeId = row.department_key ?? ruleDepartmentKey(row.department);
  return {
    id: row.id,
    rule_key: row.rule_key,
    scope_type: scopeType,
    scope_id: scopeType === "company" ? null : scopeId,
    scope_label: row.scope_label ?? row.department ?? null,
    value: row.value === undefined ? null : row.value,
    old_value: row.old_value !== undefined ? row.old_value : row.previous_value ?? null,
    effective_from: String(row.effective_from || "").slice(0, 10),
    status: row.status || "active",
    reason: row.reason,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
    request_id: row.request_id ?? null,
  };
}

function todayIsoLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isNewer(row, best) {
  if (!best) return true;
  if (row.effective_from !== best.effective_from) return row.effective_from > best.effective_from;
  return Number(row.id) > Number(best.id);
}

const rowsByKeyCache = new WeakMap();

/** Rows grouped by rule key (cached per values array). */
function rowsForRule(values, ruleKey) {
  if (!Array.isArray(values)) return [];
  let byKey = rowsByKeyCache.get(values);
  if (!byKey) {
    byKey = new Map();
    for (const raw of values) {
      const row = raw?.scope_type ? raw : normalizeRuleValueRow(raw);
      if (!row) continue;
      if (!byKey.has(row.rule_key)) byKey.set(row.rule_key, []);
      byKey.get(row.rule_key).push(row);
    }
    rowsByKeyCache.set(values, byKey);
  }
  return byKey.get(ruleKey) || [];
}

/** Latest active row per scope (key "type|id") for one rule on a date. */
function latestByScope(values, ruleKey, onDate) {
  const latest = new Map();
  for (const row of rowsForRule(values, ruleKey)) {
    if (row.status && row.status !== "active") continue;
    if (row.effective_from > onDate) continue;
    const key = `${row.scope_type}|${row.scope_id ?? ""}`;
    if (isNewer(row, latest.get(key))) latest.set(key, row);
  }
  return latest;
}

/** Higher priority first; groups without a priority (older schema) fall back to newest first. */
export function compareGroupPriority(a, b) {
  const pa = Number.isFinite(Number(a.priority)) && a.priority != null ? Number(a.priority) : null;
  const pb = Number.isFinite(Number(b.priority)) && b.priority != null ? Number(b.priority) : null;
  if (pa != null && pb != null && pa !== pb) return pb - pa;
  if (pa != null && pb == null) return -1;
  if (pa == null && pb != null) return 1;
  const ca = String(a.created_at || "");
  const cb = String(b.created_at || "");
  if (ca !== cb) return ca < cb ? 1 : -1;
  return String(a.id) < String(b.id) ? 1 : -1;
}

/** Active groups the employee belongs to (members or listed departments). */
export function employeeGroups(snapshot, { employeeCode, department }) {
  const emp = ruleEmployeeKey(employeeCode);
  if (!emp) return [];
  const deptKey = ruleDepartmentKey(department);
  const memberOf = new Set(
    (snapshot?.members || [])
      .filter((m) => ruleEmployeeKey(m.employee_code) === emp)
      .map((m) => String(m.group_id))
  );
  return (snapshot?.groups || []).filter((g) => {
    if (g.is_active === false) return false;
    if (memberOf.has(String(g.id))) return true;
    return Boolean(deptKey) && (g.match_departments || []).some((d) => ruleDepartmentKey(d) === deptKey);
  });
}

/**
 * Resolved value for one employee and where it came from.
 * snapshot = { values, groups, members }.
 * Returns { value, sourceScope, sourceId, sourceLabel, valueId }; sourceScope is
 * employee | group | department | company | default.
 */
export function resolveRuleDetail(snapshot, ruleKey, { employeeCode = null, department = null, onDate = null, fallback = null } = {}) {
  const date = onDate || todayIsoLocal();
  const latest = latestByScope(snapshot?.values, ruleKey, date);
  const pick = (row, scope, label) =>
    row && row.value != null
      ? { value: row.value, sourceScope: scope, sourceId: row.scope_id, sourceLabel: label ?? row.scope_label ?? null, valueId: row.id }
      : null;

  const emp = ruleEmployeeKey(employeeCode);
  if (emp) {
    const hit = pick(latest.get(`employee|${emp}`), "employee");
    if (hit) return hit;

    const groups = employeeGroups(snapshot, { employeeCode: emp, department })
      .filter((g) => latest.get(`group|${g.id}`)?.value != null)
      .sort(compareGroupPriority);
    if (groups.length) return pick(latest.get(`group|${groups[0].id}`), "group", groups[0].name);
  }

  const deptKey = ruleDepartmentKey(department);
  if (deptKey) {
    const hit = pick(latest.get(`department|${deptKey}`), "department");
    if (hit) return hit;
  }

  const company = pick(latest.get("company|"), "company");
  if (company) return company;
  return { value: fallback, sourceScope: "default", sourceId: null, sourceLabel: null, valueId: null };
}

/** Company / department only — mirrors public.admin_rule_value(). */
export function resolveRuleValueFromRows(rows, ruleKey, { department = null, onDate = null, fallback = null } = {}) {
  return resolveRuleDetail({ values: rows, groups: [], members: [] }, ruleKey, { department, onDate, fallback }).value;
}

const DEFAULT_SNAPSHOT = { values: DEFAULT_RULE_VALUE_ROWS, groups: [], members: [] };
let snapshot = DEFAULT_SNAPSHOT;
let loadedAt = 0;
let inflight = null;
const CACHE_MS = 60_000;

export function getRulesSnapshot() {
  return snapshot;
}

export function getCachedRuleRows() {
  return snapshot.values;
}

/** Replace the cache (after a save in the Rules Console, or in tests). */
export function setRulesSnapshot(next) {
  const values = (next?.values || []).map(normalizeRuleValueRow).filter((r) => r && r.status === "active");
  snapshot = values.length
    ? { values, groups: next.groups || [], members: next.members || [] }
    : DEFAULT_SNAPSHOT;
  loadedAt = Date.now();
}

export function setCachedRuleRows(rows) {
  setRulesSnapshot({ values: rows, groups: snapshot.groups, members: snapshot.members });
}

export function resetAttendanceRulesCache() {
  snapshot = DEFAULT_SNAPSHOT;
  loadedAt = 0;
  inflight = null;
}

async function optionalRows(query) {
  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

/**
 * Load rule values, groups and members once per minute. Never throws — on
 * failure the previous (or default) values stay in effect.
 */
export async function ensureAttendanceRulesLoaded(supabase, { force = false } = {}) {
  if (!supabase) return snapshot.values;
  if (!force && loadedAt && Date.now() - loadedAt < CACHE_MS) return snapshot.values;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.from(RULE_VALUES_TABLE).select("*");
      if (error) throw error;
      const [groups, members] = await Promise.all([
        optionalRows(supabase.from(RULE_GROUPS_TABLE).select("*")),
        optionalRows(supabase.from(RULE_GROUP_MEMBERS_TABLE).select("group_id,employee_code")),
      ]);
      if (data?.length) setRulesSnapshot({ values: data, groups, members });
      else loadedAt = Date.now();
    } catch (err) {
      console.warn("[attendanceRules] using default rules:", err?.message || err);
      loadedAt = Date.now();
    } finally {
      inflight = null;
    }
    return snapshot.values;
  })();
  return inflight;
}

/** Resolved value for an employee from the cached snapshot. */
export function getRuleForEmployee(ruleKey, { employeeCode = null, department = null, onDate = null, fallback = null } = {}) {
  return resolveRuleDetail(snapshot, ruleKey, { employeeCode, department, onDate, fallback }).value;
}

export const WEEKLY_OFF_PATTERNS = ["sun_3rd_sat", "sun_only", "none", "custom"];

function isoParts(isoDate) {
  const iso = String(isoDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return { iso, year, month, day, dow: new Date(year, month - 1, day).getDay() };
}

/** 3rd Saturday = Saturday on day 15–21 (same as public.admin_rule_is_third_saturday). */
export function isThirdSaturdayIso(isoDate) {
  const p = isoParts(isoDate);
  return Boolean(p) && p.dow === 6 && p.day >= 15 && p.day <= 21;
}

/** Before Phase 2A the weekly-off rule was "3rd Saturday is a weekly off" per department. */
function legacyThirdSaturdayWorking(department, onDate) {
  if (!department) return false;
  const off = resolveRuleValueFromRows(snapshot.values, RULE_KEYS.thirdSaturdayOff, {
    department,
    onDate,
    fallback: true,
  });
  return off === false;
}

const SETUP_ROW_REASON = "Existing rule at setup";

/**
 * The weekly-off pattern is in use once the database holds a wo.pattern row other than the
 * company starting row that every rule gets at setup (written before Phase 2A, never read).
 */
function weeklyOffPatternInUse() {
  return rowsForRule(snapshot.values, RULE_KEYS.woPattern).some(
    (r) => !(r.scope_type === "company" && r.reason === SETUP_ROW_REASON)
  );
}

/**
 * Weekly-off pattern for an employee on a date — mirrors public.admin_rule_weekly_off_pattern().
 * Before Phase 2A (pattern not in use) it is derived from the old 3rd-Saturday rule.
 */
export function weeklyOffPattern({ employeeCode = null, department = null, onDate = null } = {}) {
  if (!weeklyOffPatternInUse()) {
    return legacyThirdSaturdayWorking(department, onDate) ? "sun_only" : "sun_3rd_sat";
  }
  const value = getRuleForEmployee(RULE_KEYS.woPattern, { employeeCode, department, onDate, fallback: "sun_3rd_sat" });
  return WEEKLY_OFF_PATTERNS.includes(value) ? value : "sun_3rd_sat";
}

function customWeeklyOffDays(ctx) {
  const days = getRuleForEmployee(RULE_KEYS.woCustomDays, { ...ctx, fallback: [0] });
  return Array.isArray(days) ? days.map(Number) : [0];
}

/** Whether the date is a weekly off for the employee — mirrors public.admin_rule_is_weekly_off(). */
export function isWeeklyOffDay(isoDate, { employeeCode = null, department = null } = {}) {
  const p = isoParts(isoDate);
  if (!p) return false;
  const ctx = { employeeCode, department, onDate: p.iso };
  switch (weeklyOffPattern(ctx)) {
    case "none":
      return false;
    case "sun_only":
      return p.dow === 0;
    case "custom":
      return customWeeklyOffDays(ctx).includes(p.dow);
    default:
      return p.dow === 0 || isThirdSaturdayIso(p.iso);
  }
}

function ruleSwitch(ruleKey, isoDate, { employeeCode = null, department = null } = {}) {
  const onDate = String(isoDate ?? "").slice(0, 10) || null;
  return getRuleForEmployee(ruleKey, { employeeCode, department, onDate, fallback: true }) !== false;
}

/** Weekly off that the register fills automatically (wo.auto). */
export function isAutoWeeklyOffDay(isoDate, ctx = {}) {
  return ruleSwitch(RULE_KEYS.woAuto, isoDate, ctx) && isWeeklyOffDay(isoDate, ctx);
}

/** NH/PH apply to the employee (wo.auto_holiday): auto mark and C/O earning. */
export function isAutoHolidayFor(isoDate, ctx = {}) {
  return ruleSwitch(RULE_KEYS.woAutoHoliday, isoDate, ctx);
}

/**
 * Days that can be a weekly off for anyone under any rule value ever saved:
 * Sundays, 3rd Saturdays and every weekday used by a custom pattern. The register
 * sync visits these days to add WO or clear a WO that no longer applies.
 */
export function isWeeklyOffCandidateDate(isoDate) {
  const p = isoParts(isoDate);
  if (!p) return false;
  if (p.dow === 0 || isThirdSaturdayIso(p.iso)) return true;
  const hasCustom = weeklyOffPatternInUse() && rowsForRule(snapshot.values, RULE_KEYS.woPattern).some((r) => r.value === "custom");
  if (!hasCustom) return false;
  return rowsForRule(snapshot.values, RULE_KEYS.woCustomDays).some(
    (r) => Array.isArray(r.value) && r.value.map(Number).includes(p.dow)
  );
}

/** True when the department works the 3rd Saturday (it is not a weekly off) on that date. */
export function isThirdSaturdayWorkingDepartment(department, onDate = null) {
  if (!department) return false;
  const pattern = weeklyOffPattern({ department, onDate });
  if (pattern === "sun_3rd_sat") return false;
  if (pattern === "custom") return !customWeeklyOffDays({ department, onDate }).includes(6);
  return true;
}

/** C/O ledger start date (ISO). */
export function getCompOffStartDate() {
  const value = resolveRuleValueFromRows(snapshot.values, RULE_KEYS.coStartDate, { fallback: "2026-09-01" });
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : "2026-09-01";
}
