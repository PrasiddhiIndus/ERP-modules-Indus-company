import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * In-memory stand-in for the Supabase client. Table writes go through a
 * PostgREST-like builder; the reprocess database function is emulated as one
 * transaction (snapshot, apply, restore on any error), matching Postgres.
 */
const fake = vi.hoisted(() => {
  const UNIQUE = {
    admin_salary_month_runs: [["month_key"]],
    admin_salary_month_lines: [["run_id", "employee_master_id"]],
    admin_salary_run_revisions: [["run_id", "revision_no"]],
  };
  const state = { tables: {}, seq: 0, calls: [], failRpcAt: null, rpcCalls: [] };
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const rows = (t) => (state.tables[t] ||= []);
  const nextId = (t) => `${t.replace(/^admin_salary_/, "")}-${String(++state.seq).padStart(4, "0")}`;
  const uniqueError = (t) => ({
    code: "23505",
    message: `duplicate key value violates unique constraint "${t}_unique"`,
  });

  function violatesUnique(t, row, ignoreId) {
    for (const cols of UNIQUE[t] || []) {
      const hit = rows(t).find(
        (r) => r.id !== ignoreId && cols.every((c) => String(r[c]) === String(row[c]))
      );
      if (hit) return true;
    }
    return false;
  }

  function insertRows(t, list) {
    const added = [];
    for (const raw of list) {
      const row = { id: nextId(t), created_at: "2026-10-06T00:00:00.000Z", ...clone(raw) };
      if (violatesUnique(t, row) || added.some((a) => (UNIQUE[t] || []).some((cols) => cols.every((c) => String(a[c]) === String(row[c]))))) {
        return { error: uniqueError(t) };
      }
      added.push(row);
    }
    rows(t).push(...added);
    return { data: added };
  }

  function builder(table) {
    const q = { op: "select", filters: [], payload: null, single: false, maybe: false, range: null };
    const match = (r) =>
      q.filters.every(([kind, col, val]) => {
        if (kind === "eq") return String(r[col]) === String(val);
        if (kind === "in") return val.map(String).includes(String(r[col]));
        return true;
      });
    const run = () => {
      state.calls.push({ table, op: q.op });
      if (q.op === "insert") {
        const list = Array.isArray(q.payload) ? q.payload : [q.payload];
        const res = insertRows(table, list);
        if (res.error) return { data: null, error: res.error };
        return finish(res.data);
      }
      if (q.op === "update") {
        const hits = rows(table).filter(match);
        for (const r of hits) Object.assign(r, clone(q.payload), { updated_at: "2026-10-06T00:00:00.000Z" });
        return finish(hits);
      }
      if (q.op === "delete") {
        const keep = rows(table).filter((r) => !match(r));
        const gone = rows(table).length - keep.length;
        state.tables[table] = keep;
        return { data: null, error: null, count: gone };
      }
      if (q.op === "upsert") {
        const list = Array.isArray(q.payload) ? q.payload : [q.payload];
        return finish(insertRows(table, list).data || []);
      }
      let out = rows(table).filter(match);
      if (q.order) {
        const [col, asc] = q.order;
        out = [...out].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] < b[col] ? -1 : 1) * (asc ? 1 : -1)));
      }
      if (q.range) out = out.slice(q.range[0], q.range[1] + 1);
      return finish(out);
    };
    const finish = (list) => {
      const data = clone(list);
      if (q.single) {
        if (data.length !== 1) return { data: null, error: { code: "PGRST116", message: "not one row" } };
        return { data: data[0], error: null };
      }
      if (q.maybe) return { data: data[0] ?? null, error: null };
      return { data, error: null };
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

  /** Emulates public.admin_salary_reprocess_month_run: one transaction. */
  function reprocessRpc({ p_run_id, p_run_patch, p_lines, p_revision }) {
    const before = clone(state.tables);
    const seqBefore = state.seq;
    const fail = (step, error) => {
      state.tables = before;
      state.seq = seqBefore;
      return { data: null, error: error || { code: "P0001", message: `failed at ${step}` } };
    };
    if (state.failRpcAt === "before") return fail("before");
    const run = rows("admin_salary_month_runs").find((r) => r.id === p_run_id);
    if (!run) return fail("update_run", { code: "P0002", message: "Salary sheet not found." });
    Object.assign(run, clone(p_run_patch), { updated_at: "2026-10-06T00:00:00.000Z" });
    if (state.failRpcAt === "update_run") return fail("update_run");
    state.tables.admin_salary_month_lines = rows("admin_salary_month_lines").filter((l) => l.run_id !== p_run_id);
    if (state.failRpcAt === "delete_lines") return fail("delete_lines");
    if (p_lines.some((l) => String(l.run_id) !== String(p_run_id))) return fail("insert_lines");
    const ins = insertRows("admin_salary_month_lines", p_lines);
    if (ins.error) return fail("insert_lines", ins.error);
    if (state.failRpcAt === "insert_lines") return fail("insert_lines");
    if (p_revision) {
      const rev = insertRows("admin_salary_run_revisions", [{ run_id: p_run_id, ...p_revision }]);
      if (rev.error) return fail("insert_revision", rev.error);
    }
    if (state.failRpcAt === "insert_revision") return fail("insert_revision");
    return { data: clone(run), error: null };
  }

  const supabase = {
    from: (t) => builder(t),
    schema: () => ({ from: (t) => builder(t) }),
    rpc: async (name, args) => {
      state.rpcCalls.push({ name, args: clone(args) });
      if (name === "admin_salary_reprocess_month_run") return reprocessRpc(args);
      return { data: null, error: null };
    },
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1", email: "hr@example.com" } } }),
      getSession: async () => ({ data: { session: null } }),
    },
    storage: { from: () => ({}) },
  };
  return { state, supabase, clone };
});

vi.mock("../src/lib/supabase.js", () => ({ supabase: fake.supabase }));

const { processSalaryMonth, getMonthRunWithLines } = await import(
  "../src/pages/adminOperations/salaryAdmin/salaryMonthProcessing.js"
);

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

function seed() {
  globalThis.localStorage = memoryStorage();
  fake.state.seq = 0;
  fake.state.calls = [];
  fake.state.rpcCalls = [];
  fake.state.failRpcAt = null;
  fake.state.tables = {
    admin_ifsp_employee_master: [
      { id: 101, employee_id: "E101", employee_code: "E101", full_name: "Asha Rao", designation: "Operator", department: "Ops", date_of_joining: "2025-01-10", status: "Active", bank_account_no: "111", ifsc_code: "IFSC0001" },
      { id: 102, employee_id: "E102", employee_code: "E102", full_name: "Ravi Kumar", designation: "Supervisor", department: "Ops", date_of_joining: "2024-06-01", status: "Active", bank_account_no: "222", ifsc_code: "IFSC0002" },
      { id: 103, employee_id: "E103", employee_code: "E103", full_name: "Meena Das", designation: "Clerk", department: "Admin", date_of_joining: "2023-03-15", status: "Active", bank_account_no: "333", ifsc_code: "IFSC0003" },
    ],
    admin_salary_structures: [legacy(101, 30000), legacy(102, 45000), legacy(103, 22000)],
    admin_salary_structure_revisions: [],
  };
}

function dbState() {
  const t = fake.clone(fake.state.tables);
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

const AUG = { year: 2026, month: 8, monthDays: 26, processedOn: "2026-09-01" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-01T06:30:00.000Z"));
  seed();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("D-02 success path: same stored data and result as before", () => {
  it("fresh month process", async () => {
    const res = await processSalaryMonth(AUG);
    expect({ db: dbState(), meta: res.processMeta, run: res.run }).toMatchSnapshot();
  });

  it("full reprocess of an existing month", async () => {
    await processSalaryMonth(AUG);
    fake.state.tables.admin_salary_structures[0].gross_monthly = 32000;
    fake.state.tables.admin_salary_structures[0].special_allowance_monthly = 11000;
    vi.setSystemTime(new Date("2026-09-02T06:30:00.000Z"));
    const res = await processSalaryMonth({ ...AUG, forceFullReprocess: true, processedOn: "2026-09-02" });
    expect({ db: dbState(), meta: res.processMeta, run: res.run, lineCount: res.lines.length }).toMatchSnapshot();
  });

  it("running the same full reprocess twice gives the same lines", async () => {
    await processSalaryMonth(AUG);
    await processSalaryMonth({ ...AUG, forceFullReprocess: true });
    const first = dbState();
    await processSalaryMonth({ ...AUG, forceFullReprocess: true });
    const second = dbState();
    const amounts = (s) => s.lines.map(({ id, line_revision_no, ...l }) => l);
    expect(amounts(second)).toEqual(amounts(first));
    expect(second.runs[0].revision_no).toBe(first.runs[0].revision_no + 1);
    expect(second.revisions.map((r) => r.revision_no)).toEqual([1, 2, 3]);
  });

  it("full reprocess makes one database call and no separate table writes", async () => {
    await processSalaryMonth(AUG);
    fake.state.calls = [];
    fake.state.rpcCalls = [];
    await processSalaryMonth({ ...AUG, forceFullReprocess: true });
    expect(fake.state.rpcCalls.map((c) => c.name)).toEqual(["admin_salary_reprocess_month_run"]);
    const sheetWrites = fake.state.calls.filter(
      (c) =>
        c.op !== "select" &&
        ["admin_salary_month_runs", "admin_salary_month_lines", "admin_salary_run_revisions"].includes(c.table)
    );
    expect(sheetWrites).toEqual([]);
  });

  it("partial process of an existing month", async () => {
    await processSalaryMonth({ ...AUG, processMode: "dept", departments: ["Ops"] });
    const res = await processSalaryMonth({ ...AUG, processMode: "dept", departments: ["Admin"] });
    expect({ db: dbState(), meta: res.processMeta }).toMatchSnapshot();
  });
});

describe("D-02 failure at any step leaves the previous sheet untouched", () => {
  for (const step of ["before", "update_run", "delete_lines", "insert_lines", "insert_revision"]) {
    it(`fails at ${step}`, async () => {
      await processSalaryMonth(AUG);
      const before = fake.clone(fake.state.tables);
      fake.state.tables.admin_salary_structures[0].gross_monthly = 50000;
      const structuresAfterEdit = fake.clone(fake.state.tables.admin_salary_structures);
      fake.state.failRpcAt = step;
      await expect(processSalaryMonth({ ...AUG, forceFullReprocess: true })).rejects.toBeTruthy();
      expect(fake.state.tables.admin_salary_month_runs).toEqual(before.admin_salary_month_runs);
      expect(fake.state.tables.admin_salary_month_lines).toEqual(before.admin_salary_month_lines);
      expect(fake.state.tables.admin_salary_run_revisions).toEqual(before.admin_salary_run_revisions);
      expect(fake.state.tables.admin_salary_structures).toEqual(structuresAfterEdit);
    });
  }

  it("a duplicate employee in the new lines rolls back and shows the existing message", async () => {
    await processSalaryMonth(AUG);
    const before = fake.clone(fake.state.tables);
    const { reprocessMonthRunAtomic } = await import(
      "../src/pages/adminOperations/salaryAdmin/salaryMonthProcessing.js"
    );
    const runId = before.admin_salary_month_runs[0].id;
    const line = { run_id: runId, employee_master_id: 101, net_salary: 1 };
    await expect(
      reprocessMonthRunAtomic({
        runId,
        runPatch: { revision_no: 2, status: "processed" },
        lines: [line, { ...line }],
        revision: { revision_no: 2, changed_by: "user-1", change_summary_json: {} },
      })
    ).rejects.toThrow("Duplicate employee detected on this month sheet. Refresh and try again.");
    expect(fake.state.tables.admin_salary_month_runs).toEqual(before.admin_salary_month_runs);
    expect(fake.state.tables.admin_salary_month_lines).toEqual(before.admin_salary_month_lines);
  });

  it("a revision number already used (concurrent reprocess) rolls back everything", async () => {
    await processSalaryMonth(AUG);
    await processSalaryMonth({ ...AUG, forceFullReprocess: true });
    const before = fake.clone(fake.state.tables);
    fake.state.tables.admin_salary_month_runs[0].revision_no = 1;
    const staleRuns = fake.clone(fake.state.tables.admin_salary_month_runs);
    await expect(processSalaryMonth({ ...AUG, forceFullReprocess: true })).rejects.toMatchObject({ code: "23505" });
    expect(fake.state.tables.admin_salary_month_runs).toEqual(staleRuns);
    expect(fake.state.tables.admin_salary_month_lines).toEqual(before.admin_salary_month_lines);
    expect(fake.state.tables.admin_salary_run_revisions).toEqual(before.admin_salary_run_revisions);
  });

  it("the stored sheet still loads after a failed reprocess", async () => {
    const first = await processSalaryMonth(AUG);
    fake.state.failRpcAt = "insert_lines";
    await expect(processSalaryMonth({ ...AUG, forceFullReprocess: true })).rejects.toBeTruthy();
    const bundle = await getMonthRunWithLines(first.run.id);
    expect(bundle.run.revision_no).toBe(1);
    expect(bundle.lines).toHaveLength(3);
  });
});
