/**
 * Who may open Corporate HR/Admin → Probation Reviews in the ERP:
 *   - an L1 manager with at least one active direct reportee, or
 *   - the designated probation HR signer (employee code 10935).
 *
 * This is independent of Corporate HR/Admin module grants: an Admin user with no
 * reportees does not get it, and granting it does not open any other Admin page.
 * Row-level access (which reviews, which actions) stays inside the Indus One RPCs.
 *
 * Uses the existing security-definer RPC `get_manager_l1_team_roster()`, which returns
 * the caller (is_self) plus their active immediate L1 reportees.
 */
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import { PROBATION_REVIEWS_APP_PATH } from "../../../config/roles";
import { empCodesMatch, INDUS_ONE_SCHEMA, PROBATION_HR_EMPLOYEE_CODE } from "./probationReviewApi";

export const PROBATION_REVIEWS_PATH = PROBATION_REVIEWS_APP_PATH;

const NO_ACCESS = Object.freeze({
  canAccess: false,
  isL1WithReportees: false,
  isProbationHr: false,
  reporteeCount: 0,
  employeeCode: null,
});

/** Pure decision from roster rows + caller code — exported for tests. */
export function decideProbationAccess(rosterRows, callerCode) {
  const rows = Array.isArray(rosterRows) ? rosterRows : [];
  const selfCode = rows.find((r) => r?.is_self)?.employee_code;
  const employeeCode = String(callerCode || selfCode || "").trim() || null;
  const reporteeCount = rows.filter(
    (r) => r && !r.is_self && r.employee_code && !empCodesMatch(r.employee_code, employeeCode)
  ).length;
  const isL1WithReportees = Boolean(employeeCode) && reporteeCount > 0;
  const isProbationHr = empCodesMatch(employeeCode, PROBATION_HR_EMPLOYEE_CODE);
  return {
    canAccess: isL1WithReportees || isProbationHr,
    isL1WithReportees,
    isProbationHr,
    reporteeCount,
    employeeCode,
  };
}

async function loadRoster() {
  const pub = await supabase.rpc("get_manager_l1_team_roster");
  if (!pub.error) return pub.data || [];
  const io = await supabase.schema(INDUS_ONE_SCHEMA).rpc("get_manager_l1_team_roster");
  if (!io.error) return io.data || [];
  throw io.error || pub.error;
}

async function loadCallerCode() {
  const { data, error } = await supabase.schema(INDUS_ONE_SCHEMA).rpc("current_user_emp_code");
  return !error && data ? String(data).trim() || null : null;
}

const cache = new Map();

/** Cached per auth user id; `force` re-checks (e.g. after Employee Master hierarchy edits). */
export function fetchProbationReviewsAccess(userId, profileCode = null, { force = false } = {}) {
  if (!userId) return Promise.resolve(NO_ACCESS);
  if (!force && cache.has(userId)) return cache.get(userId);
  const p = (async () => {
    try {
      const roster = await loadRoster();
      const selfCode = roster.find((r) => r?.is_self)?.employee_code;
      const code = selfCode || profileCode || (await loadCallerCode());
      return decideProbationAccess(roster, code);
    } catch (err) {
      console.warn("[probation-reviews] access check failed:", err?.message || err);
      // Roster unavailable: the HR signer can still be recognised by code; L1 access fails closed.
      const code = profileCode || (await loadCallerCode().catch(() => null));
      return decideProbationAccess([], code);
    }
  })();
  cache.set(userId, p);
  p.then((res) => {
    // Do not pin a failed/empty lookup for the whole session.
    if (!res.canAccess && cache.get(userId) === p) {
      setTimeout(() => cache.get(userId) === p && cache.delete(userId), 60_000);
    }
  });
  return p;
}

export function useProbationReviewsAccess() {
  const { user, userProfile } = useAuth();
  const userId = user?.id || null;
  const profileCode = String(userProfile?.employee_code || "").trim() || null;
  const [state, setState] = useState({ ...NO_ACCESS, loading: Boolean(userId) });

  useEffect(() => {
    if (!userId) {
      setState({ ...NO_ACCESS, loading: false });
      return undefined;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    fetchProbationReviewsAccess(userId, profileCode).then((res) => {
      if (!cancelled) setState({ ...res, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, profileCode]);

  return state;
}
