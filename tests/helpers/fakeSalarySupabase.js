/**
 * In-memory stand-in for the Supabase client used by Salary Processing tests.
 * Table writes go through a PostgREST-like builder. The database functions
 * (atomic reprocess, lock, unlock) and the month-lock guard triggers are
 * emulated with Postgres semantics: each call is one transaction that is
 * rolled back on any error.
 */
const UNIQUE = {
  admin_salary_month_runs: [["month_key"]],
  admin_salary_month_lines: [["run_id", "employee_master_id"]],
  admin_salary_run_revisions: [["run_id", "revision_no"]],
};
const LOCK_COLUMNS = ["is_locked", "locked_by", "locked_at", "unlock_reason", "unlocked_by", "unlocked_at"];
const NOW = "2026-10-06T00:00:00.000Z";
const USER = { id: "user-1", email: "hr@example.com" };

export const state = { tables: {}, seq: 0, calls: [], failRpcAt: null, rpcCalls: [], lockAction: "" };
export const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const rows = (t) => (state.tables[t] ||= []);
const nextId = (t) => `${t.replace(/^admin_salary_/, "")}-${String(++state.seq).padStart(4, "0")}`;

class DbError extends Error {
  constructor({ code, message, hint }) {
    super(message);
    this.payload = { code, message, hint };
  }
}
const lockedError = () =>
  new DbError({
    code: "P0001",
    message: "This salary month is locked. Unlock it to make changes.",
    hint: "salary_month_locked",
  });
const uniqueError = (t) =>
  new DbError({ code: "23505", message: `duplicate key value violates unique constraint "${t}_unique"` });

const isLocked = (run) => Boolean(run?.is_locked);
const runById = (id) => rows("admin_salary_month_runs").find((r) => String(r.id) === String(id));

/** Emulates trg_admin_salary_month_runs_lock_guard and trg_admin_salary_month_lines_lock_guard. */
function guard(table, op, oldRow, newRow) {
  if (table === "admin_salary_month_runs") {
    if (op === "delete") {
      if (isLocked(oldRow)) throw lockedError();
      return;
    }
    if (op === "update") {
      const lockChanged = LOCK_COLUMNS.some((c) => (newRow[c] ?? null) !== (oldRow[c] ?? null));
      if (!state.lockAction && lockChanged) {
        throw new DbError({
          code: "P0001",
          message: "Use Lock month or Unlock month to change the lock.",
          hint: "salary_month_lock_columns",
        });
      }
      if (isLocked(oldRow) && state.lockAction !== "unlock") throw lockedError();
      if (!state.lockAction) {
        const oldSummary = oldRow.summary_json || {};
        const newSummary = { ...(newRow.summary_json || {}) };
        if ("lock_history" in oldSummary) newSummary.lock_history = clone(oldSummary.lock_history);
        else delete newSummary.lock_history;
        if ("lock_history" in oldSummary || "lock_history" in (newRow.summary_json || {})) {
          return { ...newRow, summary_json: newSummary };
        }
      }
    }
    return;
  }
  if (table === "admin_salary_month_lines") {
    if ((op === "insert" || op === "update") && isLocked(runById(newRow.run_id))) throw lockedError();
    if ((op === "update" || op === "delete") && isLocked(runById(oldRow.run_id))) throw lockedError();
  }
}

function violatesUnique(t, row, pending) {
  return (UNIQUE[t] || []).some((cols) =>
    [...rows(t), ...pending].some((r) => r !== row && cols.every((c) => String(r[c]) === String(row[c])))
  );
}

function insertRows(t, list) {
  const added = [];
  for (const raw of list) {
    const row = { id: nextId(t), created_at: NOW, ...clone(raw) };
    guard(t, "insert", null, row);
    if (violatesUnique(t, row, added)) throw uniqueError(t);
    added.push(row);
  }
  rows(t).push(...added);
  return added;
}

function updateRows(t, match, patch) {
  const hits = rows(t).filter(match);
  const nextRows = hits.map((r) => {
    const next = { ...r, ...clone(patch), updated_at: NOW };
    return guard(t, "update", r, next) || next;
  });
  hits.forEach((r, i) => Object.assign(r, nextRows[i]));
  return hits;
}

function deleteRows(t, match) {
  const gone = rows(t).filter(match);
  for (const r of gone) guard(t, "delete", r, null);
  state.tables[t] = rows(t).filter((r) => !match(r));
  return gone;
}

/** Runs fn as one transaction: any thrown error restores the previous state. */
function transaction(fn) {
  const before = clone(state.tables);
  const seqBefore = state.seq;
  try {
    return { data: clone(fn()), error: null };
  } catch (err) {
    state.tables = before;
    state.seq = seqBefore;
    if (err instanceof DbError) return { data: null, error: err.payload };
    throw err;
  } finally {
    state.lockAction = "";
  }
}

function builder(table) {
  const q = { op: "select", filters: [], payload: null, single: false, maybe: false, range: null, order: null };
  const match = (r) =>
    q.filters.every(([kind, col, val]) => {
      if (kind === "eq") return String(r[col]) === String(val);
      if (kind === "in") return val.map(String).includes(String(r[col]));
      return true;
    });
  const finish = (list) => {
    const data = clone(list);
    if (q.single) {
      if (data.length !== 1) return { data: null, error: { code: "PGRST116", message: "not one row" } };
      return { data: data[0], error: null };
    }
    if (q.maybe) return { data: data[0] ?? null, error: null };
    return { data, error: null };
  };
  const run = () => {
    state.calls.push({ table, op: q.op });
    if (q.op === "select") {
      let out = rows(table).filter(match);
      if (q.order) {
        const [col, asc] = q.order;
        out = [...out].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] < b[col] ? -1 : 1) * (asc ? 1 : -1)));
      }
      if (q.range) out = out.slice(q.range[0], q.range[1] + 1);
      return finish(out);
    }
    const res = transaction(() => {
      if (q.op === "insert" || q.op === "upsert") {
        return insertRows(table, Array.isArray(q.payload) ? q.payload : [q.payload]);
      }
      if (q.op === "update") return updateRows(table, match, q.payload);
      if (q.op === "delete") return deleteRows(table, match);
      return [];
    });
    if (res.error) return { data: null, error: res.error };
    if (q.op === "delete") return { data: null, error: null };
    return finish(res.data);
  };
  let proxy;
  const api = {
    select: () => proxy,
    insert: (p) => ((q.op = "insert"), (q.payload = p), proxy),
    update: (p) => ((q.op = "update"), (q.payload = p), proxy),
    upsert: (p) => ((q.op = "upsert"), (q.payload = p), proxy),
    delete: () => ((q.op = "delete"), proxy),
    eq: (c, v) => (q.filters.push(["eq", c, v]), proxy),
    in: (c, v) => (q.filters.push(["in", c, v]), proxy),
    order: (c, opts = {}) => ((q.order = [c, opts.ascending !== false]), proxy),
    range: (a, b) => ((q.range = [a, b]), proxy),
    single: () => ((q.single = true), proxy),
    maybeSingle: () => ((q.maybe = true), proxy),
    then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
  };
  proxy = new Proxy(api, { get: (t, k) => (k in t ? t[k] : () => proxy) });
  return proxy;
}

const stepFailure = (step) => new DbError({ code: "P0001", message: `failed at ${step}` });

/** Emulates public.admin_salary_reprocess_month_run. */
function reprocessRpc({ p_run_id, p_run_patch, p_lines, p_revision }) {
  return transaction(() => {
    if (state.failRpcAt === "before") throw stepFailure("before");
    const updated = updateRows("admin_salary_month_runs", (r) => String(r.id) === String(p_run_id), p_run_patch);
    if (!updated.length) throw new DbError({ code: "P0002", message: "Salary sheet not found." });
    if (state.failRpcAt === "update_run") throw stepFailure("update_run");
    deleteRows("admin_salary_month_lines", (l) => String(l.run_id) === String(p_run_id));
    if (state.failRpcAt === "delete_lines") throw stepFailure("delete_lines");
    if (p_lines.some((l) => String(l.run_id) !== String(p_run_id))) {
      throw new DbError({ code: "22023", message: "Every line must belong to this salary sheet." });
    }
    insertRows("admin_salary_month_lines", p_lines);
    if (state.failRpcAt === "insert_lines") throw stepFailure("insert_lines");
    if (p_revision) insertRows("admin_salary_run_revisions", [{ run_id: p_run_id, ...p_revision }]);
    if (state.failRpcAt === "insert_revision") throw stepFailure("insert_revision");
    return runById(p_run_id);
  });
}

function lockHistory(run, entry) {
  const summary = run.summary_json && typeof run.summary_json === "object" ? run.summary_json : {};
  const history = Array.isArray(summary.lock_history) ? summary.lock_history : [];
  return { ...summary, lock_history: [...history, entry] };
}

/** Emulates public.admin_salary_lock_month_run. */
function lockRpc({ p_run_id }) {
  return transaction(() => {
    const run = runById(p_run_id);
    if (!run) throw new DbError({ code: "P0002", message: "Salary sheet not found." });
    if (isLocked(run)) return run;
    if (run.status !== "processed") {
      throw new DbError({ code: "22023", message: "Only a processed salary month can be locked." });
    }
    state.lockAction = "lock";
    updateRows("admin_salary_month_runs", (r) => r.id === run.id, {
      is_locked: true,
      locked_by: USER.id,
      locked_at: NOW,
      summary_json: lockHistory(run, { action: "lock", by: USER.id, by_email: USER.email, at: NOW }),
    });
    return runById(p_run_id);
  });
}

/** Emulates public.admin_salary_unlock_month_run. */
function unlockRpc({ p_run_id, p_reason }) {
  return transaction(() => {
    const reason = String(p_reason ?? "").trim();
    if (reason.length < 5) {
      throw new DbError({ code: "22023", message: "Enter a reason for unlocking (at least 5 characters)." });
    }
    const run = runById(p_run_id);
    if (!run) throw new DbError({ code: "P0002", message: "Salary sheet not found." });
    if (!isLocked(run)) throw new DbError({ code: "22023", message: "This salary month is not locked." });
    state.lockAction = "unlock";
    updateRows("admin_salary_month_runs", (r) => r.id === run.id, {
      is_locked: false,
      unlock_reason: reason,
      unlocked_by: USER.id,
      unlocked_at: NOW,
      summary_json: lockHistory(run, { action: "unlock", by: USER.id, by_email: USER.email, at: NOW, reason }),
    });
    return runById(p_run_id);
  });
}

const RPCS = {
  admin_salary_reprocess_month_run: reprocessRpc,
  admin_salary_lock_month_run: lockRpc,
  admin_salary_unlock_month_run: unlockRpc,
};

export const supabase = {
  from: (t) => builder(t),
  schema: () => ({ from: (t) => builder(t) }),
  rpc: async (name, args) => {
    state.rpcCalls.push({ name, args: clone(args) });
    return RPCS[name] ? RPCS[name](args) : { data: null, error: null };
  },
  auth: {
    getUser: async () => ({ data: { user: USER } }),
    getSession: async () => ({ data: { session: null } }),
  },
  storage: { from: () => ({}) },
};

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

const legacy = (id, gross) => ({
  id: `s-${id}`,
  employee_master_id: id,
  declared: true,
  wef_date: "2026-04-01",
  gross_monthly: gross,
  basic_monthly: Math.max(gross / 2, 15000),
  hra_monthly: Math.round(Math.max(gross / 2, 15000) * 0.4),
  special_allowance_monthly: gross - Math.max(gross / 2, 15000) - Math.round(Math.max(gross / 2, 15000) * 0.4),
  emp_pf_monthly: 1800,
  emp_esic_monthly: 0,
  pt_monthly: 200,
  ctc_monthly: gross + 2500,
});

export function seed() {
  globalThis.localStorage = memoryStorage();
  state.seq = 0;
  state.calls = [];
  state.rpcCalls = [];
  state.failRpcAt = null;
  state.lockAction = "";
  state.tables = {
    admin_ifsp_employee_master: [
      { id: 101, employee_id: "E101", employee_code: "E101", full_name: "Asha Rao", designation: "Operator", department: "Ops", date_of_joining: "2025-01-10", status: "Active", bank_account_no: "111", ifsc_code: "IFSC0001" },
      { id: 102, employee_id: "E102", employee_code: "E102", full_name: "Ravi Kumar", designation: "Supervisor", department: "Ops", date_of_joining: "2024-06-01", status: "Active", bank_account_no: "222", ifsc_code: "IFSC0002" },
      { id: 103, employee_id: "E103", employee_code: "E103", full_name: "Meena Das", designation: "Clerk", department: "Admin", date_of_joining: "2023-03-15", status: "Active", bank_account_no: "333", ifsc_code: "IFSC0003" },
    ],
    admin_salary_structures: [legacy(101, 30000), legacy(102, 45000), legacy(103, 22000)],
    admin_salary_structure_revisions: [],
  };
}

export function dbState() {
  const t = clone(state.tables);
  const strip = (r) => {
    const { updated_at, ...rest } = r;
    return rest;
  };
  return {
    runs: (t.admin_salary_month_runs || []).map(strip),
    lines: (t.admin_salary_month_lines || []).map(strip).sort((a, b) => a.employee_master_id - b.employee_master_id),
    revisions: (t.admin_salary_run_revisions || []).map(strip),
  };
}
