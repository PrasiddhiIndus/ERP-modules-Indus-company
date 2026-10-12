/**
 * Payroll MIS test kit — in-memory Supabase stand-in, lock / after-lock simulation, report
 * assembly as on the screen, and an expected-vs-actual recorder for the Word test report.
 * No network: every call is answered from memory and logged.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  applyFilters, buildPfBreakup, buildR1, buildR2, buildR3, buildR4, buildR5, buildR6, buildR6Employees,
  buildTrend, fyStartMonth, monthLabel, periodMonths, registerTieOut, rowsForMonths, waterfallData,
} from '../../src/pages/adminOperations/salaryAdmin/mis/misMetrics.js';
import { calendarDueDate } from '../fixtures/payrollMisMock.js';

export const OUT_DIR = path.resolve('node_modules/.cache/payroll-mis-test');

const clone = (v) => JSON.parse(JSON.stringify(v));

// ---------------------------------------------------------------------------
// Expected-vs-actual recorder
// ---------------------------------------------------------------------------
export function createRecorder(file) {
  const records = [];
  const equal = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.005 : JSON.stringify(a) === JSON.stringify(b));
  return {
    records,
    /** Records the figure and returns whether it matched. */
    check(section, label, expected, actual, note = '') {
      const pass = equal(actual, expected);
      records.push({ section, label, expected, actual, pass, note });
      return pass;
    },
    write() {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(path.join(OUT_DIR, `records-${file}.json`), JSON.stringify(records, null, 2));
    },
  };
}

// ---------------------------------------------------------------------------
// Network guard
// ---------------------------------------------------------------------------
export function installNetworkGuard() {
  const attempts = [];
  const blocked = (kind) => (...args) => {
    attempts.push({ kind, target: String(args[0]?.url || args[0] || '') });
    return Promise.reject(new Error(`Network access is disabled in Payroll MIS tests (${kind}).`));
  };
  globalThis.fetch = blocked('fetch');
  globalThis.XMLHttpRequest = function XMLHttpRequestBlocked() {
    attempts.push({ kind: 'xhr', target: '' });
    throw new Error('Network access is disabled in Payroll MIS tests (XMLHttpRequest).');
  };
  globalThis.WebSocket = function WebSocketBlocked(url) {
    attempts.push({ kind: 'websocket', target: String(url) });
    throw new Error('Network access is disabled in Payroll MIS tests (WebSocket).');
  };
  return attempts;
}

// ---------------------------------------------------------------------------
// In-memory database + after-lock simulation
// ---------------------------------------------------------------------------
const TAG_FIELDS = ['vertical_code', 'grade', 'cost_centre', 'position_type', 'exit_reason', 'work_state'];
const UNIQUE = {
  admin_payroll_mis_alert_log: ['alert_date', 'payment_id'],
  admin_payroll_statutory_payments: ['wage_month', 'statute', 'state'],
  admin_payroll_mis_settings: ['key'],
  admin_payroll_employee_tags: ['employee_master_id'],
};

/**
 * Starts with every run unlocked and no snapshot; lock() runs the simulated after-lock trigger
 * (snapshot replace + payment upsert). Payroll lines keep no tags — the trigger adds them.
 */
export function createMemoryDb(mock, { lockAll = true, applyPaid = true } = {}) {
  const linesByRun = {};
  for (const [m, rows] of Object.entries(mock.rowsByMonth)) {
    linesByRun[`mock-run-${m}`] = rows.map((r) => {
      const line = clone(r);
      for (const k of TAG_FIELDS) delete line[k];
      return line;
    });
  }
  linesByRun[`mock-run-${mock.draftLines[0]?.month_key || '2026-10'}`] = clone(mock.draftLines).map((r) => {
    for (const k of TAG_FIELDS) delete r[k];
    return r;
  });

  const db = {
    tables: {
      admin_salary_month_runs: clone(mock.runs).map((r) => ({ ...r, is_locked: false })),
      admin_payroll_mis_snapshot: [],
      admin_payroll_statutory_payments: [],
      admin_payroll_mis_settings: clone(mock.settings),
      admin_payroll_employee_tags: clone(mock.tags),
      admin_payroll_departments: clone(mock.departments),
      admin_payroll_cost_allocations: clone(mock.allocations),
      admin_payroll_insurance_premiums: clone(mock.premiums),
      admin_payroll_statutory_rates: clone(mock.rates),
      admin_payroll_compliance_calendar: clone(mock.calendar),
      admin_payroll_budget: clone(mock.budget),
      admin_payroll_mis_access: clone(mock.access),
      admin_payroll_mis_alert_recipients: clone(mock.recipients),
      admin_payroll_mis_alert_log: [],
      admin_payroll_mis_audit_log: [],
      admin_payroll_mis_job_log: [],
      admin_ifsp_employee_master: clone(mock.employees),
    },
    lines: linesByRun,
    storage: [],
    failNextBuild: false,
    triggerRuns: 0,
  };

  const tagOf = (id) => db.tables.admin_payroll_employee_tags.find((t) => t.employee_master_id === id) || {};
  const defaultState = () => db.tables.admin_payroll_mis_settings.find((s) => s.key === 'default_state')?.value || 'ALL';

  db.buildSnapshot = (run) => {
    if (db.failNextBuild) {
      db.failNextBuild = false;
      throw new Error('Simulated snapshot failure');
    }
    const fresh = (db.lines[run.id] || []).map((line) => {
      const t = tagOf(line.employee_master_id);
      return {
        ...clone(line),
        vertical_code: t.vertical_code ?? null,
        grade: t.grade ?? null,
        cost_centre: t.cost_centre ?? null,
        position_type: t.position_type ?? null,
        exit_reason: t.exit_reason ?? null,
        work_state: t.work_state || defaultState(),
      };
    });
    db.tables.admin_payroll_mis_snapshot = db.tables.admin_payroll_mis_snapshot
      .filter((r) => r.month_key !== run.month_key && r.run_id !== run.id)
      .concat(fresh);
  };

  db.syncPayments = (run) => {
    const rows = db.tables.admin_payroll_mis_snapshot.filter((r) => r.month_key === run.month_key);
    const totals = {};
    for (const r of rows) {
      const st = r.work_state || 'ALL';
      const add = (statute, v) => { totals[`${statute}|${st}`] = (totals[`${statute}|${st}`] || 0) + (Number(v) || 0); };
      add('PF', r.emp_pf + r.er_pf);
      add('ESI', r.emp_esic + r.er_esi);
      add('PT', r.pt);
      add('LWF', r.ee_lwf + r.er_lwf);
      add('TDS', r.tds);
    }
    const pay = db.tables.admin_payroll_statutory_payments;
    const seen = new Set();
    for (const [k, amount] of Object.entries(totals)) {
      if (!(amount > 0)) continue;
      const [statute, state] = k.split('|');
      seen.add(k);
      const due = calendarDueDate(statute, state, run.month_key, db.tables.admin_payroll_compliance_calendar);
      const hit = pay.find((p) => p.wage_month === run.month_key && p.statute === statute && p.state === state);
      if (hit) {
        hit.amount_changed_after_payment = hit.amount_changed_after_payment || (hit.paid_on != null && hit.amount !== amount);
        hit.amount = amount;
        hit.run_id = run.id;
        if (hit.paid_on == null) hit.due_date = due;
      } else {
        pay.push({
          id: `mock-pay-${run.month_key}-${statute}`, wage_month: run.month_key, statute, state, run_id: run.id,
          amount, due_date: due, paid_on: null, challan_ref: null, interest: 0, penalty: 0, challan_path: null,
          amount_changed_after_payment: false, note: null,
        });
      }
    }
    for (const p of pay.filter((x) => x.wage_month === run.month_key && !seen.has(`${x.statute}|${x.state}`))) {
      p.amount_changed_after_payment = p.amount_changed_after_payment || (p.paid_on != null && p.amount !== 0);
      p.amount = 0;
    }
  };

  /** UPDATE admin_salary_month_runs SET is_locked = … — the trigger never blocks the lock. */
  db.setLocked = (runId, locked) => {
    const run = db.tables.admin_salary_month_runs.find((r) => r.id === runId);
    const was = !!run.is_locked;
    run.is_locked = locked;
    if (locked && !was && run.status === 'processed') {
      db.triggerRuns += 1;
      try {
        db.buildSnapshot(run);
        db.syncPayments(run);
        db.tables.admin_payroll_mis_job_log.push({ run_id: run.id, month_key: run.month_key, job: 'after_lock', ok: true });
      } catch (err) {
        db.tables.admin_payroll_mis_job_log.push({ run_id: run.id, month_key: run.month_key, job: 'after_lock', ok: false, message: err.message });
      }
    }
    return run;
  };

  /** admin_payroll_mis_mark_paid rules: paid-on date and challan reference are both required. */
  db.markPaid = (id, { paidOn, challanRef, interest = 0, penalty = 0 }) => {
    if (!paidOn || !String(challanRef || '').trim()) {
      return { data: null, error: { code: '22023', message: 'Enter the paid-on date and the challan reference to mark this payment as paid.' } };
    }
    if (interest < 0 || penalty < 0) return { data: null, error: { code: '22023', message: 'Interest and penalty cannot be negative.' } };
    const p = db.tables.admin_payroll_statutory_payments.find((x) => x.id === id);
    if (!p) return { data: null, error: { code: 'P0002', message: 'Payment row not found.' } };
    Object.assign(p, { paid_on: paidOn, challan_ref: String(challanRef).trim(), interest, penalty });
    return { data: clone(p), error: null };
  };

  if (lockAll) {
    for (const run of db.tables.admin_salary_month_runs.filter((r) => r.status === 'processed').sort((a, b) => a.month_key.localeCompare(b.month_key))) {
      db.setLocked(run.id, true);
    }
  }
  if (lockAll && applyPaid) {
    for (const p of mock.payments) {
      if (p.paid_on) db.markPaid(p.id, { paidOn: p.paid_on, challanRef: p.challan_ref, interest: p.interest, penalty: p.penalty });
    }
  }
  return db;
}

// ---------------------------------------------------------------------------
// Supabase client stand-in (same call shapes as misDb.js / payrollMisAlerts.js)
// ---------------------------------------------------------------------------
export function createMockSupabase(db, { user, calls = [] } = {}) {
  const session = { user };
  const visible = (row) => {
    if (session.user?.full) return true;
    const scopes = db.tables.admin_payroll_mis_access.filter((a) => a.user_id === session.user?.id);
    return scopes.some((s) => String(row.vertical_code || '').toLowerCase() === s.vertical_code
      && (!s.department || String(row.department || '').toLowerCase() === s.department.toLowerCase()));
  };
  const hasAccess = () => !!session.user?.full || db.tables.admin_payroll_mis_access.some((a) => a.user_id === session.user?.id);

  const rpcs = {
    admin_payroll_mis_my_access: () => ({
      full: !!session.user?.full,
      scopes: db.tables.admin_payroll_mis_access.filter((a) => a.user_id === session.user?.id)
        .map((a) => ({ vertical: a.vertical_code, department: a.department })),
    }),
    admin_payroll_mis_full_access: () => !!session.user?.full,
    admin_payroll_mis_months: () => db.tables.admin_salary_month_runs
      .filter((r) => r.is_locked && r.status === 'processed')
      .map((r) => {
        const snap = db.tables.admin_payroll_mis_snapshot.filter((s) => s.month_key === r.month_key).length;
        const job = [...db.tables.admin_payroll_mis_job_log].reverse().find((j) => j.month_key === r.month_key);
        return { month_key: r.month_key, run_id: r.id, line_count: (db.lines[r.id] || []).length, snapshot_count: snap, last_job_ok: job ? job.ok : null };
      })
      .sort((a, b) => b.month_key.localeCompare(a.month_key)),
    admin_payroll_mis_rows: ({ p_from, p_to }) => {
      if (!hasAccess()) throw Object.assign(new Error('You do not have access to payroll reports.'), { code: '42501' });
      return db.tables.admin_payroll_mis_snapshot
        .filter((r) => r.month_key >= p_from && r.month_key <= p_to)
        .filter((r) => db.tables.admin_salary_month_runs.some((run) => run.month_key === r.month_key && run.is_locked))
        .filter(visible)
        .sort((a, b) => a.month_key.localeCompare(b.month_key) || a.employee_master_id - b.employee_master_id);
    },
    admin_payroll_mis_register_totals: ({ p_from, p_to }) => db.tables.admin_salary_month_runs
      .filter((r) => r.is_locked && r.month_key >= p_from && r.month_key <= p_to)
      .map((r) => {
        const lines = db.lines[r.id] || [];
        const s = (k) => lines.reduce((t, l) => t + (Number(l[k]) || 0), 0);
        return { month_key: r.month_key, run_id: r.id, line_count: lines.length, gross: s('gross'), total_deductions: s('total_deductions'), net_pay: s('net_pay'), header_gross: s('gross'), header_deductions: s('total_deductions'), header_net: s('net_pay') };
      }),
    admin_payroll_mis_log: (a) => {
      if (!hasAccess()) throw Object.assign(new Error('You do not have access to payroll reports.'), { code: '42501' });
      db.tables.admin_payroll_mis_audit_log.push({ user_id: session.user?.id, user_email: session.user?.email, report: a.p_report, action: a.p_action, format: a.p_format, period: a.p_period, filters: a.p_filters });
      return null;
    },
    admin_payroll_mis_mark_paid: (a) => {
      const res = db.markPaid(a.p_id, { paidOn: a.p_paid_on, challanRef: a.p_challan_ref, interest: a.p_interest, penalty: a.p_penalty });
      if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code });
      return res.data;
    },
    admin_payroll_mis_rebuild_snapshot: ({ p_run_id }) => {
      const run = db.tables.admin_salary_month_runs.find((r) => r.id === p_run_id);
      db.buildSnapshot(run);
      db.syncPayments(run);
      return db.tables.admin_payroll_mis_snapshot.filter((r) => r.month_key === run.month_key).length;
    },
  };

  class Query {
    constructor(table) {
      Object.assign(this, { table, op: 'select', filters: [], orders: [], payload: null, onConflict: null, rangeArgs: null, single: false, lim: null });
    }

    select() { return this; }

    order(col, { ascending = true } = {}) { this.orders.push([col, ascending]); return this; }

    eq(c, v) { this.filters.push((r) => r[c] === v); return this; }

    is(c, v) { this.filters.push((r) => (r[c] ?? null) === v); return this; }

    gt(c, v) { this.filters.push((r) => Number(r[c]) > v); return this; }

    in(c, vs) { this.filters.push((r) => vs.includes(r[c])); return this; }

    limit(n) { this.lim = n; return this; }

    range(a, b) { this.rangeArgs = [a, b]; return this; }

    maybeSingle() { this.single = true; return this; }

    upsert(p, opts) { Object.assign(this, { op: 'upsert', payload: p, onConflict: opts?.onConflict || null }); return this; }

    insert(p) { Object.assign(this, { op: 'insert', payload: p }); return this; }

    update(p) { Object.assign(this, { op: 'update', payload: p }); return this; }

    delete() { this.op = 'delete'; return this; }

    then(resolve, reject) { return Promise.resolve().then(() => this.exec()).then(resolve, reject); }

    exec() {
      calls.push({ kind: 'from', table: this.table, op: this.op });
      const t = db.tables[this.table] || (db.tables[this.table] = []);
      const match = (r) => this.filters.every((f) => f(r));
      if (this.op === 'insert' || this.op === 'upsert') {
        const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(clone);
        const keys = this.onConflict ? this.onConflict.split(',').map((s) => s.trim()) : UNIQUE[this.table];
        for (const row of list) {
          const hit = keys ? t.find((r) => keys.every((k) => r[k] === row[k])) : null;
          if (hit && this.op === 'insert') return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          if (hit) Object.assign(hit, row);
          else t.push(row);
        }
        return { data: list, error: null };
      }
      if (this.op === 'update') {
        const hits = t.filter(match);
        for (const r of hits) Object.assign(r, clone(this.payload));
        return { data: clone(hits), error: null };
      }
      if (this.op === 'delete') {
        const keep = t.filter((r) => !match(r));
        db.tables[this.table] = keep;
        return { data: null, error: null };
      }
      let rows = t.filter(match).map(clone);
      for (const [col, asc] of [...this.orders].reverse()) {
        rows.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
      }
      if (this.rangeArgs) rows = rows.slice(this.rangeArgs[0], this.rangeArgs[1] + 1);
      if (this.lim != null) rows = rows.slice(0, this.lim);
      if (this.single) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }
  }

  const rpcCall = (name, args = {}) => {
    let rangeArgs = null;
    const call = {
      range(a, b) { rangeArgs = [a, b]; return call; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          calls.push({ kind: 'rpc', name, args });
          const fn = rpcs[name];
          if (!fn) return { data: null, error: { message: `Unknown RPC ${name}` } };
          try {
            let data = clone(fn(args) ?? null);
            if (rangeArgs && Array.isArray(data)) data = data.slice(rangeArgs[0], rangeArgs[1] + 1);
            return { data, error: null };
          } catch (err) {
            return { data: null, error: { message: err.message, code: err.code } };
          }
        }).then(resolve, reject);
      },
    };
    return call;
  };

  return {
    calls,
    session,
    setUser(u) { session.user = u; },
    from: (table) => new Query(table),
    rpc: rpcCall,
    storage: {
      from: (bucket) => ({
        async upload(p, file, opts) {
          calls.push({ kind: 'storage', op: 'upload', bucket, path: p });
          db.storage.push({ bucket, path: p, size: file?.size ?? null, contentType: opts?.contentType });
          return { data: { path: p }, error: null };
        },
        async createSignedUrl(p, secs) {
          calls.push({ kind: 'storage', op: 'signedUrl', bucket, path: p });
          return { data: { signedUrl: `mock://${bucket}/${p}?expires=${secs}` }, error: null };
        },
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Report assembly as on PayrollMisPage (period → months → filters → builders)
// ---------------------------------------------------------------------------
export function assembleReports(rows, lockedKeys, period, { filters = {}, allocations = [], split = false, rates = [], register = [] } = {}) {
  const pm = periodMonths(period, lockedKeys);
  const filtered = applyFilters(rows, filters);
  const cur = rowsForMonths(filtered, pm.current);
  const prev = rowsForMonths(filtered, pm.previous);
  const ytdMonths = lockedKeys.filter((k) => k >= fyStartMonth(pm.last) && k <= pm.last);
  const ytd = rowsForMonths(filtered, ytdMonths);
  const prevLast = pm.previous[pm.previous.length - 1] || null;
  const labels = {
    current: pm.label,
    previous: pm.previous.length
      ? (pm.previous.length === 1 ? monthLabel(pm.previous[0]) : `${monthLabel(pm.previous[0])} – ${monthLabel(prevLast)}`)
      : 'Previous',
    ytd: `YTD ${monthLabel(fyStartMonth(pm.last))} – ${monthLabel(pm.last)}`,
  };
  const lastRows = rowsForMonths(filtered, [pm.last]);
  const prevLastRows = prevLast ? rowsForMonths(filtered, [prevLast]) : [];
  const r2 = buildR2(lastRows, prevLastRows, pm.last, prevLast);
  const anyFilter = Object.values(filters).some(Boolean);
  return {
    pm,
    cur,
    prev,
    ytd,
    labels,
    r2Labels: { current: monthLabel(pm.last), previous: prevLast ? monthLabel(prevLast) : 'Previous' },
    r1: buildR1(cur, prev),
    trend: buildTrend(filtered, lockedKeys, pm.last),
    r2,
    bars: waterfallData(r2),
    r3: buildR3(cur, prev, ytd),
    r4: buildR4(cur, prev, ytd, allocations, { split }),
    r5: buildR5(cur, prev, { from: pm.from, to: pm.to }, allocations, { split }),
    r6: buildR6(cur, prev),
    r6Employees: buildR6Employees(cur),
    pf: buildPfBreakup(cur, rates, pm.last),
    tieOut: !anyFilter ? registerTieOut(rows, register.filter((r) => pm.current.includes(r.month_key))) : null,
  };
}
