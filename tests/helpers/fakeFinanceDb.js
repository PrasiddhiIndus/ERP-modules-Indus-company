/**
 * Minimal in-memory stand-in for the supabase-js PostgREST client, enough for
 * src/pages/finance/api/siteLedgerStore.js. Records every request (table, op, audit header)
 * so tests can assert what a save actually wrote.
 */
let idSeq = 0;
const newId = () => {
  idSeq += 1;
  return `00000000-0000-4000-8000-${String(idSeq).padStart(12, '0')}`;
};

export function createFakeFinanceDb(seed = {}) {
  const tables = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((r) => ({ ...r }));
  const requests = [];
  const table = (name) => {
    if (!tables[name]) tables[name] = [];
    return tables[name];
  };

  class Query {
    constructor(name) {
      this.name = name;
      this.op = 'select';
      this.filters = [];
      this.headers = new Headers();
      this.mode = 'many';
      this.selectOpts = null;
      this.returning = false;
      this.rangeFrom = null;
      this.rangeTo = null;
    }
    select(_cols, opts) {
      if (this.op === 'select') this.selectOpts = opts || null;
      else this.returning = true;
      return this;
    }
    eq(col, val) { this.filters.push((r) => String(r[col]) === String(val)); return this; }
    in(col, vals) { const set = new Set(vals.map(String)); this.filters.push((r) => set.has(String(r[col]))); return this; }
    order() { return this; }
    range(from, to) { this.rangeFrom = from; this.rangeTo = to; return this; }
    single() { this.mode = 'single'; return this; }
    maybeSingle() { this.mode = 'maybe'; return this; }
    upsert(rows, opts = {}) { this.op = 'upsert'; this.payload = rows; this.conflict = (opts.onConflict || 'id').split(','); return this; }
    insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
    update(patch) { this.op = 'update'; this.payload = patch; return this; }
    delete() { this.op = 'delete'; return this; }
    setHeader(k, v) { this.headers.set(k, v); return this; }
    matches(r) { return this.filters.every((f) => f(r)); }
    run() {
      const audit = this.headers.get('x-erp-activity');
      if (this.op !== 'select') requests.push({ table: this.name, op: this.op, audit: audit ? JSON.parse(audit) : null });
      const rows = table(this.name);
      let out = [];
      if (this.op === 'select') {
        out = rows.filter((r) => this.matches(r));
        const count = out.length;
        if (this.rangeFrom != null) out = out.slice(this.rangeFrom, this.rangeTo + 1);
        if (this.selectOpts?.head) return { data: null, error: null, count };
        return this.finish(out.map((r) => ({ ...r })), count);
      }
      if (this.op === 'insert' || this.op === 'upsert') {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload];
        for (const row of list) {
          const existing = this.op === 'upsert'
            ? rows.find((r) => this.conflict.every((c) => String(r[c]) === String(row[c])))
            : null;
          if (existing) { Object.assign(existing, row); out.push({ ...existing }); }
          else { const created = { id: newId(), ...row }; rows.push(created); out.push({ ...created }); }
        }
        return this.finish(out);
      }
      if (this.op === 'update') {
        for (const r of rows) if (this.matches(r)) { Object.assign(r, this.payload); out.push({ ...r }); }
        return this.finish(out);
      }
      if (this.op === 'delete') {
        const keep = [];
        for (const r of rows) (this.matches(r) ? out : keep).push(r);
        tables[this.name] = keep;
        if (this.name === 'sites') {
          const gone = new Set(out.map((r) => r.id));
          for (const t of ['site_expense_structure', 'cost_allocations', 'budget_versions', 'period_entries']) {
            tables[t] = table(t).filter((r) => !gone.has(r.site_id));
          }
        }
        return this.finish(out);
      }
      return { data: null, error: null };
    }
    finish(rows, count = null) {
      if (this.mode === 'single') {
        return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'no rows' } };
      }
      if (this.mode === 'maybe') return { data: rows[0] || null, error: null };
      return { data: rows, error: null, count: count ?? rows.length };
    }
    then(resolve, reject) { try { resolve(this.run()); } catch (e) { reject(e); } }
  }

  class Rpc {
    constructor(fn, args) { this.fn = fn; this.args = args; this.headers = new Headers(); }
    setHeader(k, v) { this.headers.set(k, v); return this; }
    run() {
      const audit = this.headers.get('x-erp-activity');
      requests.push({ table: `rpc:${this.fn}`, op: 'rpc', audit: audit ? JSON.parse(audit) : null });
      const a = this.args;
      if (this.fn === 'replace_site_structure') {
        const keep = new Set(a.p_rows.map((r) => r.child_head_id));
        const extra = table('site_expense_structure').filter((r) => r.site_id === a.p_site_id && !keep.has(r.child_head_id));
        if (extra.length) return { data: null, error: { message: `stale page: would remove ${extra.length}` } };
        for (const row of a.p_rows) {
          const ex = table('site_expense_structure').find((r) => r.site_id === a.p_site_id && r.child_head_id === row.child_head_id);
          if (ex) Object.assign(ex, row); else table('site_expense_structure').push({ id: newId(), site_id: a.p_site_id, ...row });
        }
        return { data: table('site_expense_structure').filter((r) => r.site_id === a.p_site_id).length, error: null };
      }
      if (this.fn === 'replace_budget_lines') {
        tables.budget_revenue_lines = table('budget_revenue_lines').filter((r) => r.budget_version_id !== a.p_budget_version_id);
        tables.budget_expense_lines = table('budget_expense_lines').filter((r) => r.budget_version_id !== a.p_budget_version_id);
        for (const r of a.p_revenue_rows) table('budget_revenue_lines').push({ id: newId(), budget_version_id: a.p_budget_version_id, ...r });
        for (const r of a.p_expense_rows) table('budget_expense_lines').push({ id: newId(), budget_version_id: a.p_budget_version_id, ...r });
        return { data: a.p_revenue_rows.length + a.p_expense_rows.length, error: null };
      }
      if (this.fn === 'replace_period_entry_lines') {
        tables.revenue_entry_lines = table('revenue_entry_lines').filter((r) => r.period_entry_id !== a.p_period_entry_id);
        tables.expense_entry_lines = table('expense_entry_lines').filter((r) => r.period_entry_id !== a.p_period_entry_id);
        for (const r of a.p_revenue_rows) table('revenue_entry_lines').push({ id: newId(), period_entry_id: a.p_period_entry_id, ...r });
        for (const r of a.p_expense_rows) table('expense_entry_lines').push({ id: newId(), period_entry_id: a.p_period_entry_id, ...r });
        return { data: a.p_revenue_rows.length + a.p_expense_rows.length, error: null };
      }
      return { data: null, error: { message: `unknown rpc ${this.fn}` } };
    }
    then(resolve, reject) { try { resolve(this.run()); } catch (e) { reject(e); } }
  }

  const client = {
    schema: () => ({
      from: (name) => new Query(name),
      rpc: (fn, args) => new Rpc(fn, args),
    }),
  };

  return {
    client,
    tables,
    requests,
    rows: (name) => table(name),
    resetRequests: () => { requests.length = 0; },
  };
}
