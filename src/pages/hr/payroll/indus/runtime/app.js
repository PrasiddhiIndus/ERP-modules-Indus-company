'use strict';
const E = window.PayEngine;
const TEMPLATES = window.SITES;            // site templates; live setups come from the database
const S = { month: '2026-09', view: 'dashboard', sites: {}, siteDocs: {}, hrAtt: {}, arrears: {}, revs: {}, emps: {}, runs: {}, loans: {}, held: {}, ioms: {}, masters: null, db: null, ready: false,
  attSites: [],
  proc: { site: null, sites: [], siteMode: 'pick', siteMenuOpen: false, siteQ: '', step: 1, type: 'REG' }, setup: { site: null, tab: 'general' }, empSite: null, comp: { set: 'CLRA', sites: [] } };
window.S = S;
const payrollRoot = () => document.getElementById('indus-payroll-root');
const $ = s => { const r = payrollRoot(); return r ? r.querySelector(s) : null; };
function gid(id) { const r = payrollRoot(); if (!r) return null; return r.querySelector('[id="' + String(id).replace(/"/g, '') + '"]'); }
function setDb(cls, text) { const el = gid('dbstate'); if (!el) return; el.className = 'dbs ' + cls; el.innerHTML = '<i></i>' + text; }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inr = (x, d = 0) => (x == null || isNaN(x)) ? '' : (+x).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
const num = x => { const v = parseFloat(String(x ?? '').replace(/,/g, '')); return isNaN(v) ? 0 : v; };
const ym = () => S.month.split('-').map(Number);
const monthName = (m = S.month) => { const [y, mm] = m.split('-').map(Number); return new Date(y, mm - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' }); };
const runId = (sid, m = S.month, t = 'REG') => `${sid}_${m}_${t}`;
function toast(t, ms = 3200) { if (S.captureNotes) { S.captureNotes.push(t); return; } const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; (payrollRoot() || document.body).appendChild(d); setTimeout(() => d.remove(), ms); }
const siteList = () => Object.values(S.sites).sort((a, b) => a.name.localeCompare(b.name));
const empsOf = sid => (S.emps[sid] && S.emps[sid].list) || [];
/** Same site ids/names as Attendance / Site Master (`sites` table). */
const attSiteId = row => String(row && row.id != null ? row.id : '');
/** Match Attendance page type filter when Site Attendance has Safety/Fire selected. */
function attendanceSiteTypeFilter() {
  try {
    const val = localStorage.getItem('hr_selected_site_type');
    return val === 'Safety' || val === 'Fire' ? val : '';
  } catch (e) { return ''; }
}
function processSiteList() {
  // Only Attendance / Site Master sites — never fall back to demo payroll templates.
  if (!S.attSitesLoaded) return [];
  const type = attendanceSiteTypeFilter();
  return (S.attSites || [])
    .filter((row) => !type || (row && row.site_type === type))
    .map((row) => {
      const id = attSiteId(row);
      const live = S.sites[id];
      if (live) {
        return Object.assign({}, live, {
          name: row.site_name || live.name,
          site_type: row.site_type || live.site_type || '',
          fromAttendance: true,
          hrSiteId: row.id,
        });
      }
      return {
        id,
        name: row.site_name || `Site ${id}`,
        client: row.contract_details || row.location || '',
        state: 'GJ',
        oc: '—',
        location: row.location || '',
        site_type: row.site_type || '',
        fromAttendance: true,
        hrSiteId: row.id,
      };
    })
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
}
function processSitesSelected() {
  const all = processSiteList();
  const mode = S.proc.siteMode || 'pick';
  if (mode === 'all') return all.map((s) => s.id);
  const picked = Array.isArray(S.proc.sites) ? S.proc.sites.map(String) : [];
  const ids = picked.filter((id) => all.some((s) => s.id === id));
  return ids;
}
function ensureProcFocusSite(preferred) {
  const selected = processSitesSelected();
  if (!selected.length) {
    S.proc.site = null;
    return null;
  }
  const want = preferred != null && preferred !== '' ? String(preferred) : String(S.proc.site || '');
  if (want && selected.includes(want)) {
    S.proc.site = want;
    return want;
  }
  S.proc.site = selected[0];
  return S.proc.site;
}
async function syncAttendanceSites(rows) {
  S.attSitesLoaded = true;
  S.attSites = Array.isArray(rows) ? rows.slice() : [];
  if (!S.db || S.noAccess || !S.attSites.length) {
    if (S.ready) softRender();
    return;
  }
  if (S._attSyncing) {
    S._attSyncPending = S.attSites.slice();
    return;
  }
  S._attSyncing = true;
  let created = 0;
  try {
    for (const row of S.attSites) {
      const id = attSiteId(row);
      if (!id) continue;
      const existing = S.siteDocs[id];
      const name = row.site_name || (existing && existing.name) || `Site ${id}`;
      const client = row.contract_details || row.location || (existing && existing.client) || '';
      const location = row.location || (existing && existing.location) || '';
      if (existing) {
        const same =
          existing.name === name &&
          (existing.client || '') === client &&
          (existing.location || '') === location &&
          String(existing.hrSiteId || '') === String(row.id);
        if (same) continue;
        const doc = storeDoc(Object.assign({}, existing, {
          id,
          name,
          client,
          location,
          hrSiteId: row.id,
          fromAttendance: true,
        }));
        await put('sites/' + id, doc);
        S.siteDocs[id] = Object.assign({ _id: id }, doc);
        continue;
      }
      const tplDoc = Object.values(S.siteDocs || {})[0] || null;
      const tpl = tplDoc || (window.SITES && window.SITES[0]) || null;
      let doc;
      if (tpl) {
        const src = JSON.parse(JSON.stringify(tplDoc ? storeDoc(tplDoc) : strip(tpl)));
        src.id = id;
        src.name = name;
        src.client = client;
        src.location = location;
        src.hrSiteId = row.id;
        src.fromAttendance = true;
        delete src.attMap;
        delete src.demo;
        if (!Array.isArray(src.structure) && src.components && window.STRUCT && (S.cmList || []).length) {
          src.structure = STRUCT.mapSite(src, mastersObj());
          delete src.components;
        }
        doc = storeDoc(src);
      } else {
        doc = {
          id,
          name,
          client,
          location,
          state: 'GJ',
          oc: '—',
          hrSiteId: row.id,
          fromAttendance: true,
          divisor: { type: 'calendar', weeklyOff: [] },
          rateType: 'M',
          rounding: 'component',
          registerSet: 'CLRA',
          params: {},
          components: [],
          esi: true,
        };
      }
      await put('sites/' + id, doc);
      S.siteDocs[id] = Object.assign({ _id: id }, doc);
      if (!S.emps[id]) {
        await put('employees/' + id, { list: [] });
        S.emps[id] = { _id: id, list: [] };
      }
      created += 1;
    }
    resolveAll();
    if (created && S.ready) toast(`Linked ${created} site${created === 1 ? '' : 's'} from Attendance`);
    if (S.ready) softRender();
  } finally {
    S._attSyncing = false;
    if (S._attSyncPending) {
      const pending = S._attSyncPending;
      S._attSyncPending = null;
      syncAttendanceSites(pending);
    }
  }
}

// ---------------- database ----------------
async function connect() {
  let db = null;
  try { db = window.claude && window.claude.use ? await window.claude.use('db') : null; } catch (e) { db = null; }
  S.db = db;
  if (!db) { setDb('bad', 'Database not available'); S.ready = true; render(); return; }
  const timer = setTimeout(() => { if (!S.ready) { setDb('warn', 'Data not reachable yet'); } }, 10000);
  let pending = new Set(['sites', 'employees', 'runs', 'loans', 'held', 'iom', 'masters', 'hr_attendance', 'arrears', 'revisions']);
  const done = k => { pending.delete(k); if (!pending.size && !S.ready) { S.ready = true; clearTimeout(timer); const finish = () => { setDb(S.db && S.db.ephemeral ? 'warn' : 'ok', S.db && S.db.ephemeral ? 'Saved in this session only' : 'All changes saved'); if (S.attSites && S.attSites.length) syncAttendanceSites(S.attSites).finally(() => { render(); setTimeout(() => { if (!S.noAccess) freezePay().catch(() => { }); }, 2500); }); else { render(); setTimeout(() => { if (!S.noAccess) freezePay().catch(() => { }); }, 2500); } }; if (!S.noAccess && !Object.keys(S.siteDocs || {}).length) { if (S.attSites && S.attSites.length) { setDb('warn', 'Linking attendance sites…'); syncAttendanceSites(S.attSites).then(finish, finish); } else { setDb('warn', 'Loading demo sites…'); installDemo().then(finish, finish); } } else finish(); } };
  const sub = (col, key, fn) => db.collection(col).onSnapshot(snap => {
    const o = {}; snap.docs.forEach(d => { if (d.exists) o[d.id] = Object.assign({ _id: d.id }, JSON.parse(JSON.stringify(d.data()))); });
    fn ? fn(o) : (S[key] = o); if (!snap.metadata.fromCache) done(col); if (S.ready && !snap.metadata.hasPendingWrites) softRender();
  }, err => { done(col); if (/permission|denied|forbidden|not allowed|unauthori/i.test((err.code || '') + ' ' + (err.message || ''))) { if (!S.noAccess) { S.noAccess = true; setDb('bad', 'No access to payroll data'); render(); } } else toast('Database error: ' + err.message); });
  sub('sites', null, o => { S.siteDocs = o; resolveAll(); }); sub('employees', 'emps'); sub('runs', 'runs'); sub('hr_attendance', 'hrAtt'); sub('arrears', 'arrears'); sub('revisions', 'revs'); sub('loans', 'loans'); sub('held', 'held'); sub('iom', 'ioms');
  sub('masters', null, o => { S.masters = o.statutory || null; applyMasters(); if (!S.savingMasters) { if (o.components && Array.isArray(o.components.list) && o.components.list.length) { S.cmList = o.components.list; S.mastersVer = o.components.ver || 1; } else if (!S.cmList) S.cmList = statutoryCatalogue(); if (o.formulas && Array.isArray(o.formulas.list)) S.fmList = o.formulas.list; else if (!S.fmList) S.fmList = []; } resolveAll(); });
}
// re-render on data changes, but never while someone is typing in a field, and never over an unsaved site-setup draft
function softRender() {
  const a = document.activeElement;
  if (a && a.closest && a.closest('#page,#modal') && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) { S.pendingRender = true; return; }
  if ($('#modal').innerHTML) { S.pendingRender = true; return; }
  if (S.view === 'setup' || S.view === 'masters' || (S.view === 'employees' && S.em && S.em.form)) { S.pendingRender = true; return; }
  render();
}
document.addEventListener('focusout', () => setTimeout(() => { if (S.pendingRender) { const a = document.activeElement; const modal = $('#modal'); if (!modal) return; if (!(a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) && !modal.innerHTML && S.view !== 'setup' && S.view !== 'masters') { S.pendingRender = false; render(); } } }, 400));
// site setups prepared by Claude ship as a file next to the page; the page offers to load the ones not yet in the database
async function checkSeed() {
  try { const r = await fetch('seed.json', { cache: 'no-store' }); if (!r.ok) return; S.seed = await r.json(); } catch (e) { S.seed = null; }
  if (S.ready) render();
}
function pendingSeed() { if (!S.seed) return []; return Object.keys(S.seed.sites).filter(id => !S.sites[id]); }
async function loadSeed() {
  const ids = pendingSeed(); if (!ids.length) return;
  const b = gid('seedbtn'); if (b) { b.disabled = true; b.textContent = 'Loading…'; }
  let n = 0;
  for (const id of ids) {
    if (!(await put('sites/' + id, S.seed.sites[id]))) break; S.siteDocs[id] = Object.assign({ _id: id }, JSON.parse(JSON.stringify(S.seed.sites[id])));
    if (!S.emps[id]) await put('employees/' + id, S.seed.employees[id] || { list: [] });
    n++; if (b) b.textContent = `Loading… ${n}/${ids.length}`;
  }
  toast(`Loaded ${n} site setups`);
  if (S.cmList && legacySites().length) await migrateLegacy();
}
// First open of an empty browser store: site structures already in the module, with fictional people (no real salaries or bank accounts).
const DEMO_PEOPLE = [
  ['Ravi Kumar', 'M', 'Suresh Kumar'], ['Meera Shah', 'F', 'Anil Shah'], ['Imran Qureshi', 'M', 'Yusuf Qureshi'],
  ['Lakshmi Nair', 'F', 'Gopal Nair'], ['Harpreet Singh', 'M', 'Balwinder Singh'], ['Pooja Deshmukh', 'F', 'Ramesh Deshmukh'],
];
const DEMO_DESIG = ['Fireman', 'Fire Supervisor', 'Helper', 'Safety Officer', 'Security Guard', 'Driver'];
const DEMO_SKILL = ['Unskilled', 'Semi-skilled', 'Skilled', 'Highly skilled'];
function prevMonth(m) { const [y, mo] = String(m).split('-').map(Number); const d = new Date(y, mo - 2, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
async function installDemo() {
  if (S._demoInstalling || Object.keys(S.siteDocs || {}).length) return;
  const templates = window.SITES || [];
  if (!templates.length || !window.STRUCT) return;
  S._demoInstalling = true;
  try {
    const src = templates.map(t => JSON.parse(JSON.stringify(t)));
    const M = STRUCT.buildMasters(src, { components: [], formulas: [] });
    S.cmList = M.components; S.fmList = M.formulas; S.mastersVer = STRUCT.VERSION; S.savingMasters = true;
    await put('masters/components', { list: M.components, ver: STRUCT.VERSION });
    await put('masters/formulas', { list: M.formulas });
    S.savingMasters = false;
    const month = S.month; const now = new Date().toISOString(); let seq = 24001;
    for (let i = 0; i < src.length; i++) {
      const t = src[i];
      const structure = STRUCT.mapSite(t, { components: M.components, formulas: M.formulas });
      const doc = JSON.parse(JSON.stringify(t));
      delete doc.components; delete doc.notes;
      doc.structure = structure; doc.esi = t.esi !== false; doc.demo = true;
      await put('sites/' + t.id, doc);
      S.siteDocs[t.id] = Object.assign({ _id: t.id }, doc);
      const daily = t.rateType === 'D';
      const list = [];
      const count = 4 + (i % 3);
      for (let k = 0; k < count; k++) {
        const person = DEMO_PEOPLE[(i + k) % DEMO_PEOPLE.length];
        const code = String(seq++);
        const rate = daily ? 620 + k * 35 : 16800 + k * 1100 + (i % 4) * 250;
        const basic = (t.params && +t.params.BASIC > 0) ? +t.params.BASIC : (daily ? Math.round(rate * 0.6) : Math.round(rate * 0.5));
        list.push({
          code, name: person[0], father: person[2], sex: person[1], dob: person[1] === 'F' ? '1994-06-12' : '1991-03-18',
          mobile: String(9800000000 + (seq % 10000000)).slice(0, 10), email: '', address: 'Demo quarter, Vadodara',
          aadhaar: String(1000 + (seq % 9000)).slice(-4), pan: k === count - 1 && i === 0 ? '' : ('ABCDE' + String(1000 + (seq % 9000)).slice(-4) + 'F'),
          nominee: person[2], nomineeRel: 'Father', desig: DEMO_DESIG[k % DEMO_DESIG.length], skill: DEMO_SKILL[k % DEMO_SKILL.length],
          doj: k === 0 ? month + '-02' : '2023-04-01', status: 'ACTIVE',
          uan: (i === 1 && k === 0) ? '' : String(100000000000 + seq).slice(0, 12),
          esicNo: String(1000000000 + seq).slice(0, 10), bankName: 'State Bank of India', acct: String(500000000000 + seq),
          ifsc: 'SBIN0001234', branch: 'Vadodara', rate, basic, pf: true, esi: true,
        });
      }
      await put('employees/' + t.id, { list });
      S.emps[t.id] = { _id: t.id, list };
      const rows = list.map((e, k) => ({ code: e.code, name: e.name, PD: Math.max(0, 24 - (k === 3 ? 4 : 0)), OTD: k === 1 ? 2 : 0, OTH: k === 1 ? 16 : 0, NH: k === 2 ? 1 : 0, WOT: k === 2 ? 1 : 0, ODI: 0 }));
      const mode = i % 6;
      const hrBase = { siteId: t.id, month, version: 1, submittedBy: 'Site HR', submittedAt: now, rows, ded: {}, demo: true };
      let h;
      if (mode === 4) h = Object.assign({}, hrBase, { status: 'SUBMITTED', approvedBy: '', approvedAt: '' });
      else if (mode === 5) h = Object.assign({}, hrBase, { status: 'RETURNED', approvedBy: '', approvedAt: '', returnNote: 'OT hours are missing for two people. Please correct and approve again.', returnedAt: now, returnedBy: 'Payroll' });
      else h = Object.assign({}, hrBase, { status: 'APPROVED', approvedBy: 'HR Manager', approvedAt: now });
      await put('hr_attendance/' + t.id + '_' + month, h);
      S.hrAtt[t.id + '_' + month] = Object.assign({ _id: t.id + '_' + month }, h);
      if (mode === 1 || mode === 2 || mode === 3) {
        const run = { siteId: t.id, month, type: 'REG', status: mode === 3 ? 'LOCKED' : 'DRAFT', att: rows.map(r => ({ code: r.code, PD: r.PD, OTD: r.OTD, OTH: r.OTH, NH: r.NH, WOT: r.WOT, ODI: r.ODI })), ded: {}, attSource: 'HR', source: 'HR module', format: 'approved attendance', hr: { version: 1, approvedBy: 'HR Manager', approvedAt: now, importedAt: now } };
        if (mode === 2 && run.att[0]) run.ded[run.att[0].code] = { HOLD_ALL: 'On leave' };
        if (mode >= 2) run.attFinalAt = now;
        if (mode === 3) { run.lockedAt = now; run.lockedBy = 'Payroll'; }
        const id = t.id + '_' + month + '_REG';
        await put('runs/' + id, run);
        S.runs[id] = Object.assign({ _id: id }, run);
      }
    }
    resolveAll();
    for (const [id, run] of Object.entries(S.runs)) {
      if (run.status !== 'LOCKED' || run.snap) continue;
      const site = S.sites[run.siteId]; if (!site) continue;
      try {
        const c = computeRun(site, run);
        run.snap = { components: site.components, params: site.params || {}, designationParams: site.designationParams || {}, divisor: site.divisor, rateType: site.rateType, rounding: site.rounding, esi: site.esi, labourCode50: !!site.labourCode50, state: site.state, stat: site.stat || null };
        run.summary = { heads: c.rows.length, gross: c.tot.GROSS, net: c.tot.NET, er: c.tot.er };
        run.pay = Object.fromEntries(c.rows.map(x => [x.emp.code, payOf(x.emp)]));
        await put('runs/' + id, JSON.parse(JSON.stringify(strip(run))));
      } catch (err) { /* a site formula can fail; the rest of the demo still opens */ }
    }
    const first = src[0]; const people = (S.emps[first.id] && S.emps[first.id].list) || [];
    const emp0 = people[0], emp1 = people[1];
    if (emp0 && emp1) {
      await put('loans/' + first.id + '_' + emp1.code + '_L', { siteId: first.id, empCode: emp1.code, name: emp1.name, type: 'LOAN', amount: 12000, emi: 2000, startMonth: month, given: month + '-01', purpose: 'Medical', recovered: [] });
      await put('loans/' + first.id + '_' + emp0.code + '_A', { siteId: first.id, empCode: emp0.code, name: emp0.name, type: 'ADV', amount: 3000, emi: 3000, startMonth: month, given: month + '-05', purpose: 'Salary advance', recovered: [] });
      await put('held/' + first.id + '_' + month + '_' + emp0.code, { siteId: first.id, siteName: first.name, client: first.client, empCode: emp0.code, name: emp0.name, desig: emp0.desig || '', month, kind: 'FULL', reason: 'On leave', paidDays: 22, gross: emp0.rate, pf: 1800, esi: 135, pt: 200, lwf: 0, otherDed: 0, salaryHeld: Math.max(0, emp0.rate - 2135), payoutsHeld: {}, amount: Math.max(0, emp0.rate - 2135), acct: emp0.acct, ifsc: emp0.ifsc, uan: emp0.uan, heldOn: now, status: 'HELD', release: null });
      const earlier = prevMonth(month);
      await put('held/' + first.id + '_' + earlier + '_' + emp1.code, { siteId: first.id, siteName: first.name, client: first.client, empCode: emp1.code, name: emp1.name, desig: emp1.desig || '', month: earlier, kind: 'PART', reason: 'Documents pending', paidDays: 26, gross: emp1.rate, pf: 1800, esi: 135, pt: 200, lwf: 0, otherDed: 0, salaryHeld: 4000, payoutsHeld: {}, amount: 4000, acct: emp1.acct, ifsc: emp1.ifsc, uan: emp1.uan, heldOn: now, status: 'RELEASED', release: { rejoined: true, date: month + '-03', month, mode: 'NEFT', ref: 'UTRDEMO0001', remarks: 'Documents received' } });
      await put('revisions/' + first.id + '_MW', { kind: 'MINWAGE', siteId: first.id, status: 'SCHEDULED', title: 'Gujarat minimum wage', reference: 'GJ/MW/DEMO', effective: month, createdAt: now, createdBy: 'Payroll', rows: people.slice(0, 3).map(e => ({ code: e.code, name: e.name, desig: e.desig || '', ch: { basic: [e.basic, Math.round(+e.basic * 1.05)], rate: [e.rate, Math.round(+e.rate * 1.05)] } })) });
      await put('iom/' + first.id + '_JOIN', { siteId: first.id, type: 'JOIN', code: emp0.code, name: emp0.name, effective: emp0.doj, details: 'Joined as ' + (emp0.desig || 'worker'), at: now });
    }
    resolveAll();
    toast('Demo sites are ready. Figures use sample people, not live employee records.');
  } catch (err) {
    toast('Demo sites could not be prepared');
  } finally { S._demoInstalling = false; S.savingMasters = false; }
}
function seedBanner() {
  const ids = pendingSeed(); if (!ids.length || !S.db || S.noAccess) return '';
  const emps = ids.reduce((s, id) => s + ((S.seed.employees[id] || {}).list || []).length, 0);
  return `<div class="card" style="border-color:var(--pri);background:var(--pri2)"><div class="row"><div class="grow"><b>${ids.length} new site setups are ready to load</b><div class="small">Prepared from your September 2026 salary sheets — ${emps} employees with their September attendance for checking. Existing sites are not touched.</div></div><button class="btn pri" id="seedbtn" onclick="loadSeed()">Load site setups</button></div></div>`;
}
function applyMasters() { if (S.masters) { if (S.masters.PT) { const pt = JSON.parse(JSON.stringify(S.masters.PT)); Object.values(pt).forEach(t => t && t.slabs.forEach(x => { if (x[0] >= 1e12) x[0] = Infinity; })); Object.assign(E.STATE.PT, pt); } if (S.masters.LWF) Object.assign(E.STATE.LWF, JSON.parse(JSON.stringify(S.masters.LWF))); if (S.masters.STAT) Object.assign(E.STAT, S.masters.STAT); } if (S.siteDocs) resolveAll(); }
// ---- salary structure: masters + site mapping, resolved into the components the engine calculates ----
const mastersObj = () => ({ components: S.cmList || [], formulas: S.fmList || [] });
const cmByCode = () => Object.fromEntries((S.cmList || []).map(c => [c.code, c]));
const fmById = () => Object.fromEntries((S.fmList || []).map(f => [f.id, f]));
// ---- statutory patterns: OLD = central ceilings (PF ₹15,000, ESIC ₹21,000); NEW = Labour Code ceilings. Each site follows the default or is set to one. ----
const PAT_DEF = { DEFAULT: 'OLD', NEW: { PF_CEIL: 25000, EPS_CEIL: 25000, PF_FROM: '2026-09-17', SPLIT: 'DAYS', ESI_CEIL: 42000, ESI_TEST: 'PFW', ESI_FROM: '2026-10-01' } };
const PAT_NAME = { OLD: 'Old pattern', NEW: 'New pattern' };
const ESI_TEST_T = { RATE: 'Monthly gross rate', ESIW: 'ESIC wages of the month', PFW: 'Basic wages (PF wages) of the month' };
function patCfg(src) { const p = src || (S.masters && S.masters.PATTERNS) || {}; return { DEFAULT: p.DEFAULT === 'NEW' ? 'NEW' : 'OLD', NEW: Object.assign({}, PAT_DEF.NEW, p.NEW || {}) }; }
const patOf = d => (d && (d.statPattern === 'OLD' || d.statPattern === 'NEW') ? d.statPattern : patCfg().DEFAULT);
function statObj(d) { if (patOf(d) !== 'NEW') return null; return Object.assign({ key: 'NEW', PF_PREV: E.STAT.PF_CEIL }, patCfg().NEW); }
function patLine(d) { const k = patOf(d); if (k === 'OLD') return `PF ₹${inr(E.STAT.PF_CEIL)} · ESIC ₹${inr(E.STAT.ESI_CEIL)}`; const n = patCfg().NEW; return `PF ₹${inr(n.PF_CEIL)} · ESIC ₹${inr(n.ESI_CEIL)}`; }
function resolveSite(doc) {
  const st = statObj(doc);
  const out = Array.isArray(doc.structure) ? Object.assign({}, doc, { components: STRUCT.resolve(doc, mastersObj()) }) : (st || doc.stat ? Object.assign({}, doc) : doc);
  if (st) out.stat = st; else if (out !== doc) delete out.stat;
  return out;
}
// PF formulas with ₹15,000 written in do not follow the site's pattern; this finds them so they can use PFCEIL instead
const PF15 = /MIN\(\s*15000\s*,|,\s*15000\s*\)/;
const PF12 = /0\.12|12\s*\/\s*100/;
const fixPF = e => String(e).replace(/MIN\(\s*15000\s*,/g, 'MIN(PFCEIL,').replace(/,\s*15000\s*\)/g, ',PFCEIL)');
function pfLiterals() {
  const isPF = x => /PF/i.test(x || '');
  const out = { fm: [], rows: [], legacy: [], sites: new Set() }; const fmUse = {};
  for (const d of Object.values(S.siteDocs || {})) {
    const sid = d.id || d._id;
    if (Array.isArray(d.structure)) for (const r of d.structure) {
      if (r.formula === 'EXPR' && r.expr && PF15.test(r.expr) && (isPF(r.code || r.comp) || PF12.test(r.expr))) { out.rows.push([sid, r]); out.sites.add(sid); }
      else if (/^F/.test(r.formula || '')) (fmUse[r.formula] = fmUse[r.formula] || []).push([sid, isPF(r.code || r.comp)]);
    } else for (const c of d.components || []) if (c.formula && PF15.test(c.formula) && (isPF(c.code) || PF12.test(c.formula))) { out.legacy.push([sid, c]); out.sites.add(sid); }
  }
  out.fm = (S.fmList || []).filter(f => PF15.test(f.expr) && (PF12.test(f.expr) || (fmUse[f.id] || []).some(u => u[1])));
  out.fm.forEach(f => (fmUse[f.id] || []).forEach(u => out.sites.add(u[0])));
  out.n = out.fm.length + out.rows.length + out.legacy.length;
  return out;
}
async function fixPFLiterals(btn) {
  const L = pfLiterals(); if (!L.n) return; if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }
  L.fm.forEach(f => f.expr = fixPF(f.expr));
  L.rows.forEach(([, r]) => r.expr = fixPF(r.expr)); L.legacy.forEach(([, c]) => c.formula = fixPF(c.formula));
  // capture the corrected site docs now: a data refresh during the saves below may replace S.siteDocs with the stored copies
  const docs = {}; for (const sid of new Set([...L.rows, ...L.legacy].map(x => x[0]))) docs[sid] = storeDoc(S.siteDocs[sid]);
  let ok = true;
  if (L.fm.length) ok = await saveMasters('formulas') && ok;
  for (const [sid, doc] of Object.entries(docs)) { ok = (await put('sites/' + sid, doc)) && ok; S.siteDocs[sid] = Object.assign({ _id: sid }, doc); }
  resolveAll(); toast(ok ? `${L.n} PF formula${L.n === 1 ? '' : 's'} now follow the site pattern` : 'Some changes could not be saved'); render();
}
function resolveAll() { const o = {}; for (const [k, d] of Object.entries(S.siteDocs || {})) o[k] = resolveSite(d); S.sites = o; }
function storeDoc(d) { const c = JSON.parse(JSON.stringify(d)); delete c._id; delete c.stat; if (Array.isArray(c.structure)) delete c.components; return c; }
const legacySites = () => Object.values(S.siteDocs || {}).filter(d => !Array.isArray(d.structure));
async function saveMasters(which) {
  const cl = JSON.parse(JSON.stringify(S.cmList || [])), fl = JSON.parse(JSON.stringify(S.fmList || []));
  S.savingMasters = true;
  try {
    const ok = which !== 'formulas' ? await put('masters/components', { list: cl, ver: S.mastersVer || STRUCT.VERSION }) : true;
    const ok2 = which !== 'components' ? await put('masters/formulas', { list: fl }) : true;
    S.cmList = cl; S.fmList = fl; resolveAll(); return ok && ok2;
  } finally { S.savingMasters = false; }
}
const needsGroupingRebuild = () => !!(S.cmList && S.cmList.length && (S.mastersVer || 1) < STRUCT.VERSION && !legacySites().length);
const needsFormulaRebuild = () => !!(S.cmList && S.cmList.length && !(S.fmList || []).length && Object.values(S.siteDocs || {}).some(d => (d.structure || []).some(r => r.formula === 'EXPR' && r.expr)));
async function migrateLegacy(btn) {
  const full = needsGroupingRebuild(); const rebuild = full || needsFormulaRebuild();
  const docs = rebuild ? Object.values(S.siteDocs || {}) : legacySites(); if (!docs.length) return;
  // work from each site's calculated components, so a rebuild keeps every formula exactly
  const src = docs.map(d => { const id = d.id || d._id; return Object.assign({}, d, { id, components: (S.sites[id] || d).components || [] }); });
  const M = STRUCT.buildMasters(src, { components: full ? [] : (S.cmList || []), formulas: rebuild ? [] : (S.fmList || []) });
  S.mastersVer = STRUCT.VERSION;
  const masters = { components: M.components, formulas: M.formulas };
  S.cmList = M.components; S.fmList = M.formulas;
  if (!(await saveMasters())) return;
  let n = 0;
  for (const d of src) { const doc = storeDoc(d); doc.structure = STRUCT.mapSite(d, masters); delete doc.components; if (!(await put('sites/' + d.id, doc))) break; S.siteDocs[d.id] = Object.assign({ _id: d.id }, doc); n++; if (btn) btn.textContent = `Converting… ${n}/${docs.length}`; }
  resolveAll(); const mr = await mergeDuplicates(true); await pruneUnused(true); toast(`Masters ready — ${S.cmList.length} components, ${S.fmList.length} formulas; ${n} sites mapped${mr && mr.n ? ` · ${mr.n} duplicate formulas merged` : ''}`); render();
}
// formulas no site uses; onlyGenerated = only those built automatically from the sheets (never one someone just wrote)
function unusedFormulas(onlyGenerated) { const use = formulaUsage(); return (S.fmList || []).filter(f => !use[f.id] && (!onlyGenerated || f._tpl)); }
async function pruneUnused(onlyGenerated) { const u = new Set(unusedFormulas(onlyGenerated).map(f => f.id)); if (!u.size) return 0; S.fmList = S.fmList.filter(f => !u.has(f.id)); await saveMasters('formulas'); return u.size; }
// formulas that calculate the same thing (BASIC*PD and PD*BASIC, 2*BASIC*OTD and BASIC*OTD*2…) become one
async function mergeDuplicates(quiet) {
  const docs = Object.values(S.siteDocs || {}).filter(d => Array.isArray(d.structure)).map(d => Object.assign(JSON.parse(JSON.stringify(d)), { id: d.id || d._id }));
  const before = Object.fromEntries(docs.map(d => [d.id, JSON.stringify(d.structure)]));
  const old = S.fmList || [];
  const R = STRUCT.mergeEquivalent(mastersObj(), docs, E.compile);
  const n = Object.keys(R.remap).length;
  if (!n && !R.custom) { if (!quiet) toast('No duplicate formulas found'); return { n: 0, custom: 0 }; }
  S.fmList = R.formulas; if (!(await saveMasters('formulas'))) return null;
  for (const d of docs) if (JSON.stringify(d.structure) !== before[d.id]) { const doc = storeDoc(Object.assign({}, S.siteDocs[d.id], { structure: d.structure })); if (await put('sites/' + d.id, doc)) S.siteDocs[d.id] = Object.assign({ _id: d.id }, doc); }
  resolveAll(); await pruneUnused(true);
  if (!quiet) {
    const byKeep = {}; Object.entries(R.remap).forEach(([a, b]) => (byKeep[b] = byKeep[b] || []).push(old.find(f => f.id === a)));
    $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:720px"><h2>${n} duplicate formula${n === 1 ? '' : 's'} merged</h2><p class="small muted">These calculate exactly the same thing, so each group is now one master formula. ${R.custom ? `${R.custom} site-only custom formula${R.custom === 1 ? ' was' : 's were'} also the same as a master formula and now use${R.custom === 1 ? 's' : ''} it.` : ''} Every salary calculates as before.</p>
     <div style="max-height:420px;overflow:auto"><table class="tbl nostick"><thead><tr><th>Kept</th><th>Merged into it</th></tr></thead><tbody>${Object.entries(byKeep).map(([k, fs]) => { const f = S.fmList.find(x => x.id === k); return `<tr><td class="fxl">${prettyHTML(f.expr)}<div class="small muted mono">${k}</div></td><td>${fs.map(x => `<div class="fxl small">${prettyHTML(x.expr)} <span class="muted mono">${x.id}</span></div>`).join('')}</td></tr>`; }).join('')}</tbody></table></div>
     <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn pri" onclick="closeModal()">Done</button></div></div></div>`;
    render();
  }
  return { n, custom: R.custom };
}
function mastersBanner() {
  if (S.noAccess) return '';
  if (needsGroupingRebuild()) { return `<div class="card" style="border-color:var(--pri);background:var(--pri2)"><div class="row"><div class="grow"><b>Improved component grouping is ready</b><div class="small">Some sheet columns were filed under the wrong component — e.g. “Basic Rate 50% of Gross” under Gross salary and “Leave Salary @6.3% on Gross” under Gross salary. Rebuild the masters from your sites to correct this. Every site's formulas, PF / ESIC settings and column names stay exactly as they are, so every salary calculates as before.</div></div><button class="btn pri" id="mig">Rebuild masters</button></div></div>`; }
  if (needsFormulaRebuild()) { const n = Object.keys(S.siteDocs).length; return `<div class="card" style="border-color:var(--warn);background:var(--warnbg)"><div class="row"><div class="grow"><b>The formula master is empty</b><div class="small">Your ${n} sites still calculate correctly, but each one holds its formulas as custom formulas. Rebuild the formula master from them — shared formulas are created once and every site is mapped to them. Every salary calculates exactly as before.</div></div><button class="btn pri" id="mig">Rebuild formula master</button></div></div>`; }
  const L = legacySites(); if (!L.length) return '';
  return `<div class="card" style="border-color:var(--pri);background:var(--pri2)"><div class="row"><div class="grow"><b>${S.cmList ? `${L.length} site${L.length > 1 ? 's' : ''} not yet mapped to the masters` : `Set up the component and formula masters from your ${L.length} site setups`}</b><div class="small">Each site's columns are grouped into master components, identical formulas become one master formula (rates that differ become site parameters), and each site gets a salary structure mapping. Every salary calculates exactly as before.</div></div><button class="btn pri" id="mig">${S.cmList ? 'Map these sites' : 'Build masters'}</button></div></div>`;
}
function bindMig(p) { const b = p.querySelector('#mig'); if (b) b.onclick = () => { b.disabled = true; b.textContent = 'Building…'; migrateLegacy(b); }; }
async function put(path, data) {
  if (S.noAccess) { toast('You have view-only access — ask the owner to give you Contributor access'); return false; }
  if (!S.db) { toast('Not saved — database unavailable in this view'); return false; }
  try { await S.db.doc(path).set(JSON.parse(JSON.stringify(data))); return true; }
  catch (e) { toast(e.code === 'quota_exceeded' ? 'Database is full: ' + e.message : 'Could not save: ' + e.message); return false; }
}
async function del(path) { if (S.db) try { await S.db.doc(path).delete(); } catch (e) { toast('Could not delete: ' + e.message); } }
const strip = o => { const c = JSON.parse(JSON.stringify(o)); delete c._id; return c; };

// ---------------- downloads ----------------
async function saveFile(filename, data) {
  if (S.capture) { S.capture.push({ filename, data }); return; }
  let d = null; try { d = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { }
  if (!d) { toast('Downloads are not available in this view'); return; }
  try { await d.save({ filename, data }); } catch (e) { if (e && e.code !== 'declined') toast('Download failed: ' + (e.message || e.code)); }
}
function xlsxBytes(sheets) {
  const wb = XLSX.utils.book_new(); const used = new Set();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows); if (s.cols) ws['!cols'] = s.cols.map(w => ({ wch: w })); if (s.merges) ws['!merges'] = s.merges;
    let nm = s.name.replace(/[\\/?*\[\]:]/g, '-').slice(0, 31), i = 2; while (used.has(nm.toLowerCase())) { const suf = '~' + i++; nm = s.name.replace(/[\\/?*\[\]:]/g, '-').slice(0, 31 - suf.length) + suf; }
    used.add(nm.toLowerCase()); XLSX.utils.book_append_sheet(wb, ws, nm);
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

// ---------------- payroll core ----------------
function siteCalWD(site, month = S.month) { const [y, m] = month.split('-').map(Number); return E.calendarWorkingDays(y, m, (site.divisor && site.divisor.weeklyOff) || []); }
function loanDue(sid, code, month) {
  let due = { LOAN: 0, ADV: 0, RECOVERY: 0 }, items = [];
  for (const l of Object.values(S.loans)) {
    if (l.siteId !== sid || l.empCode !== code || l.startMonth > month) continue;
    const rec = (l.recovered || []).filter(r => r.month !== month).reduce((s, r) => s + r.amt, 0);
    const bal = l.amount - rec; if (bal <= 0) continue;
    const amt = Math.min(l.emi || bal, bal); due[l.type] += amt; items.push({ id: l._id, amt, type: l.type });
  }
  return { due, items };
}
function computeRun(site, run, month = S.month) {
  if (run && run.status === 'LOCKED' && run.snap) site = Object.assign({}, site, { stat: null }, run.snap);
  const [y, m] = month.split('-').map(Number);
  const emps = empsOf(site.id || site._id); const byCode = Object.fromEntries(emps.map(e => [e.code, e]));
  const rows = [];
  for (const a of (run.att || [])) {
    const emp = empAt(run, byCode[a.code]); if (!emp || a.skip) continue;
    const ded = Object.assign({}, (run.ded || {})[a.code] || {});
    const ld = loanDue(site.id, a.code, month);
    if (ded.LOAN == null) ded.LOAN = ld.due.LOAN; if (ded.ADV == null) ded.ADV = ld.due.ADV;
    let r; try { r = E.calcEmployee(site, emp, a, ded, { month: m, year: y, calendarWD: siteCalWD(site, month) }); }
    catch (err) { (run._errors = run._errors || []).push(`${emp.code}: ${err.message}`); continue; }
    // excess-payment recovery: after all other deductions, never more than 50% of the month's wages in total (Code on Wages s.18(2)); the rest carries forward
    let recDue = ld.due.RECOVERY || 0;
    if (recDue > 0) { const room = Math.max(0, Math.floor(r.GROSS * 0.5) - r.DED); let applied = Math.min(recDue, room); r.recoveryShort = recDue - applied;
      let left = applied; ld.items.filter(it => it.type === 'RECOVERY').forEach(it => { const take = Math.min(it.amt, left); it.amt = take; left -= take; });
      if (applied > 0) { r.lines.XS_RECOVERY = applied; r.DED += applied; r.NET -= applied; } }
    // arrears approved to be paid with this month's salary (their PF/ESIC are on the arrear sheet)
    const arr = arrearsFor(site.id, a.code, month); if (arr) { r.lines.ARREAR_NET = arr; r.NET += arr; }
    applyHold(r, ded);
    rows.push({ emp, att: a, ded, r, loanItems: ld.items.filter(it => it.amt > 0) });
  }
  const tot = { GROSS: 0, DED: 0, NET: 0, lines: {}, groups: {}, er: 0, PF: 0, ESI: 0 };
  for (const x of rows) {
    tot.GROSS += x.r.GROSS; tot.DED += x.r.DED; tot.NET += x.r.NET; tot.er += x.r.er.TOTAL;
    for (const [k, v] of Object.entries(x.r.lines)) tot.lines[k] = (tot.lines[k] || 0) + v;
    for (const [k, v] of Object.entries(x.r.groups)) tot.groups[k] = (tot.groups[k] || 0) + v;
  }
  return { rows, tot };
}
// Full hold: statutory deductions are still made; everything left (salary and separate payouts) goes to Held, net = 0
const HOLD_REASONS = ['On leave', 'Absconded', 'Documents pending', 'Under inquiry', 'Other'];
function applyHold(r, ded) {
  if (!ded || !ded.HOLD_ALL) return;
  const amt = Math.max(0, r.NET); const pay = {}; let payT = 0;
  for (const [g, v] of Object.entries(r.groups)) { if (v > 0) { pay[g] = v; payT += v; r.groups[g] = 0; } }
  r.heldFull = { reason: ded.HOLD_ALL, amount: amt, payouts: pay, payoutTotal: payT };
  r.lines.HELD = (r.lines.HELD || 0) + amt; r.DED += amt; r.NET = r.NET - amt;
}
// ---- attendance from the HR module ----
// The HR module posts each site's monthly attendance to hr_attendance/{siteId}_{yyyy-mm}; payroll imports it once HR approves it.
const hrDoc = (sid, month = S.month) => S.hrAtt[sid + '_' + month] || null;
function hrStatus(sid, month = S.month) {
  const h = hrDoc(sid, month); const run = S.runs[runId(sid, month)];
  if (run && run.att && run.att.length && run.attSource === 'UPLOAD') return { k: 'upload', t: 'Uploaded directly', c: 'p-warn' };
  if (!h) return { k: 'none', t: 'Not received', c: 'p-mute' };
  if (h.status === 'RETURNED') return { k: 'returned', t: 'Sent back to HR', c: 'p-bad' };
  if (h.status !== 'APPROVED') return { k: 'submitted', t: 'Awaiting HR approval', c: 'p-warn' };
  if (run && run.hr && run.hr.version === (h.version || 1)) return { k: 'imported', t: 'Imported', c: 'p-ok' };
  if (run && run.hr) return { k: 'changed', t: 'Changed in HR', c: 'p-bad' };
  return { k: 'approved', t: 'Approved — ready', c: 'p-pri' };
}
const fmtWhen = t => t ? new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
async function importFromHR(site, run) {
  const h = hrDoc(site.id); if (!h || h.status !== 'APPROVED') { toast('HR has not approved this attendance yet'); return; }
  run.att = (h.rows || []).map(r => { const a = { code: String(r.code) }; for (const [k, v] of Object.entries(r)) if (k !== 'code' && k !== 'name' && k !== 'remarks' && typeof v === 'number') a[k] = v; if (r.remarks) a.remarks = r.remarks; return a; });
  run.ded = Object.assign({}, run.ded || {}); for (const [code, dd] of Object.entries(h.ded || {})) run.ded[code] = Object.assign({}, run.ded[code] || {}, dd);
  run.attSource = 'HR'; delete run.uploadReason; run.source = 'HR module'; run.format = 'approved attendance';
  run.hr = { version: h.version || 1, approvedBy: h.approvedBy || '', approvedAt: h.approvedAt || '', importedAt: new Date().toISOString() };
  delete run.attFinalAt; validateAtt(site, run); await saveRun(run); S.proc.step = 2; render(); toast(`Attendance imported from HR for ${run.att.length} employees`);
}
function returnToHRModal(site) {
  const h = hrDoc(site.id);
  $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:520px"><h2>Send attendance back to HR</h2><p class="small muted">${esc(site.name)} · ${monthName()}. HR corrects it in the HR module and approves it again; payroll can then import the corrected version.</p>
   <label class="f">What needs correcting<textarea class="in" id="rt_note" rows="3" placeholder="e.g. OT hours missing for 4 employees; codes 5833 and 5913 not in the employee master"></textarea></label>
   <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" id="rt_ok">Send back</button></div></div></div>`;
  $('#rt_ok').onclick = async () => { const note = $('#rt_note').value.trim(); if (!note) { toast('Say what needs correcting'); return; }
    const doc = Object.assign({}, h); delete doc._id; doc.status = 'RETURNED'; doc.returnNote = note; doc.returnedAt = new Date().toISOString(); doc.returnedBy = (S.user && (S.user.name || S.user.email)) || 'Payroll';
    if (await put('hr_attendance/' + site.id + '_' + S.month, doc)) { S.hrAtt[site.id + '_' + S.month] = doc; closeModal(); toast('Sent back to HR'); render(); } };
}
function hrSpecModal() {
  $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:680px"><h2>How the HR module sends attendance</h2>
   <p class="small muted">One record per site per month, written by the HR module when the site's attendance is submitted and again when it is approved.</p>
   <table class="tbl nostick small"><thead><tr><th>Field</th><th>Meaning</th></tr></thead><tbody>
   ${[['Record ID', '<span class="mono">{siteId}_{yyyy-mm}</span>, e.g. <span class="mono">BPCL-BINA_2026-09</span>'], ['siteId, month', 'Payroll site ID and month'], ['status', '<span class="mono">SUBMITTED</span> → <span class="mono">APPROVED</span>; payroll may set <span class="mono">RETURNED</span> with a note'], ['version', 'Goes up by 1 each time HR changes it after approval'], ['submittedBy / submittedAt, approvedBy / approvedAt', 'Who and when'],
     ['rows', 'One per employee: <span class="mono">code</span> (employee code) and monthly totals — <span class="mono">PD</span> paid days, <span class="mono">OTD</span> OT days, <span class="mono">OTH</span> OT hours, <span class="mono">NH</span> holidays, <span class="mono">WOT</span> weekly-off worked, <span class="mono">ODI</span>, <span class="mono">LD</span>, optional <span class="mono">WD</span>, <span class="mono">remarks</span>'], ['ded (optional)', 'Site deductions recorded by HR, per employee code, e.g. electricity or canteen']].map(([a, b]) => `<tr><td style="white-space:nowrap"><b>${a}</b></td><td>${b}</td></tr>`).join('')}</tbody></table>
   <p class="small muted" style="margin-top:10px">Payroll imports only approved attendance. Employee codes must match the employee master; unknown codes are flagged in Review & clean.</p>
   <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn pri" onclick="closeModal()">Close</button></div></div></div>`;
}
// prototype only: fill hr_attendance from the September sheets, as the HR module would
async function demoHR(siteIds) {
  let n = 0;
  for (const sid of siteIds) { const emps = empsOf(sid).filter(e => e.sample && e.sample.att); if (!emps.length || hrDoc(sid)) continue;
    const ded = {}; emps.forEach(e => { const d2 = {}; for (const [k, v] of Object.entries(e.sample.ded || {})) if (v && !['ADV', 'LOAN', 'HELD'].includes(k)) d2[k] = v; if (Object.keys(d2).length) ded[e.code] = d2; });
    const approved = n % 9 !== 4; const now = new Date().toISOString();
    const doc = { siteId: sid, month: S.month, status: approved ? 'APPROVED' : 'SUBMITTED', version: 1, submittedBy: 'Site HR', submittedAt: now, approvedBy: approved ? 'HR Manager' : '', approvedAt: approved ? now : '', rows: emps.map(e => Object.assign({ code: e.code, name: e.name }, e.sample.att)), ded, demo: true };
    if (!(await put('hr_attendance/' + sid + '_' + S.month, doc))) break; S.hrAtt[sid + '_' + S.month] = doc; n++; }
  toast(`Demo: HR attendance for ${n} site${n === 1 ? '' : 's'}`); render();
}
function runStatus(sid, month = S.month) {
  const r = S.runs[runId(sid, month)];
  if (!r) return { k: 'none', t: 'Not started', c: 'p-mute' };
  if (r.status === 'LOCKED') return { k: 'locked', t: 'Locked', c: 'p-ok' };
  if (r.att && r.att.length && r.attFinalAt) return { k: 'draft', t: 'Salary in process', c: 'p-pri' };
  if (r.att && r.att.length) return { k: 'draft', t: 'Attendance in review', c: 'p-warn' };
  return { k: 'none', t: 'Not started', c: 'p-mute' };
}

// ---------------- layout ----------------
const IC = {
  components: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="4" rx="1.5"/><rect x="3" y="10" width="18" height="4" rx="1.5"/><rect x="3" y="16" width="11" height="4" rx="1.5"/></svg>',
  formulas: '<svg viewBox="0 0 24 24"><path d="M14 4h-2.5a2.5 2.5 0 00-2.5 2.5V20"/><path d="M6 11h7"/><path d="M14 13l5 6M19 13l-5 6"/></svg>',
  dashboard: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  process: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h7"/><path d="M16 15l3 3 3-3"/><path d="M19 18v-8"/></svg>',
  employees: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/></svg>',
  loans: '<svg viewBox="0 0 24 24"><rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19M6.5 15h3"/></svg>',
  revisions: '<svg viewBox="0 0 24 24"><path d="M3 17l5-5 4 4 8-8"/><path d="M14 8h6v6"/></svg>',
  held: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/></svg>',
  reports: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  compliance: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  setup: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  masters: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/><path d="M9 3v18"/></svg>',
};
const NAV = [['grp', 'Payroll'], ['dashboard', 'Dashboard'], ['process', 'Process salary'], ['employees', 'Employee master'], ['held', 'Held salary'], ['loans', 'Loans & recoveries'], ['revisions', 'Increments & revisions'],
  ['grp', 'Reports & compliance'], ['reports', 'Reports'], ['compliance', 'Registers & files'], ['masters', 'Statutory masters'],
  ['grp', 'Configuration'], ['setup', 'Site setup'], ['components', 'Salary components'], ['formulas', 'Formula master']];
const CTX = { dashboard: () => `${monthName()} · ${Object.keys(S.sites).length} sites`, process: () => S.proc.site && S.sites[S.proc.site] ? `${S.sites[S.proc.site].name} · ${monthName()}` : monthName(),
  setup: () => S.setup.site && S.sites[S.setup.site] ? S.sites[S.setup.site].name : 'Components, rules and rates per site', employees: () => 'Every employee across all sites — personal, statutory, bank and salary details, and site mapping',
  revisions: () => 'Minimum wage revisions, increments and the full history of every pay change', loans: () => 'Loans, salary advances and excess-payment recoveries — deducted automatically in each salary run', components: () => 'Earnings, deductions and employer contributions used across all sites', formulas: () => 'Formulas written once and reused by every site that maps them', reports: () => 'Wage, compliance, bonus and management reports for any period', held: () => 'Salaries held after statutory deductions, and their release', compliance: () => `Statutory registers and upload files · ${monthName()}`, masters: () => 'Central PF / ESIC rates, and professional tax and labour welfare fund by state' };
function statutoryCatalogue() {
  const sys = (window.STRUCT && window.STRUCT.SYSTEM_COMPONENTS) || [];
  return sys.map(c => Object.assign({ pf: false, esi: false }, c));
}
function renderNav() {
  const root = payrollRoot();
  if (!root) return;
  root.querySelectorAll('nav, #nav').forEach(n => n.remove());
}
function go(v, extra) { S.view = v; Object.assign(S, extra || {}); try { if (window.__indusPayrollOnView) window.__indusPayrollOnView(v); } catch (e) { } render(); }
function render() {
  renderNav();
  const title = $('#ptitle');
  if (!title) return;
  const t = Object.fromEntries(NAV.filter(n => n[0] !== 'grp'));
  title.textContent = t[S.view] || 'Dashboard';
  try { $('#pctx').textContent = (CTX[S.view] || (() => ''))(); } catch (e) { $('#pctx').textContent = ''; }
  const p = $('#page');
  if (!S.ready) { p.innerHTML = '<div class="empty">Loading payroll data…</div>'; return; }
  if (S.noAccess) { p.innerHTML = `<div class="card" style="max-width:640px;margin:40px auto;text-align:center;padding:36px"><div class="bico" style="margin:0 auto 14px;width:40px;height:40px;font-size:18px">!</div><h2 style="margin:0 0 8px">You don't have access to the payroll data</h2><p class="muted" style="margin:0 0 6px">This payroll holds employee salaries and bank details, so only people the owner has added can open it.</p><p class="muted" style="margin:0">Ask the owner to share this page with you as a <b>Contributor</b> (to process salary) or higher, then reload.</p></div>`; return; }
  if (!S.cmList) S.cmList = statutoryCatalogue();
  if (!S.fmList) S.fmList = [];
  ({ dashboard: vDashboard, process: vProcess, setup: vSetup, employees: vEmployees, loans: vLoans, revisions: vRevisions, held: vHeld, reports: vReports, compliance: vCompliance, masters: vMasters, components: vComponents, formulas: vFormulas }[S.view] || vDashboard)(p);
}
function emptyState() {
  return `<div class="card empty"><h2>No sites set up yet</h2><p>Add a client site to start this month's payroll. Each site keeps its own salary structure, state and statutory pattern. People and approved attendance come from HR.</p>
  ${S.db ? '<button class="btn pri" onclick="newSiteModal()">Add a site from a template</button>' : ''}</div>`;
}

// ---------------- Dashboard ----------------
const cr = x => { x = +x || 0; const a = Math.abs(x); return a >= 1e7 ? '₹' + (x / 1e7).toFixed(2) + ' Cr' : a >= 1e5 ? '₹' + (x / 1e5).toFixed(2) + ' L' : '₹' + inr(x); };
function vDashboard(p) {
  const sites = siteList(); let heads = 0, gross = 0, net = 0, er = 0, flags = 0; const cnt = { none: 0, draft: 0, locked: 0, rules: 0 };
  const rows = sites.map(s => {
    const st = runStatus(s.id); const run = S.runs[runId(s.id)];
    let c = null; if (run && run.att && run.att.length) { c = computeRun(s, run); heads += c.rows.length; gross += c.tot.GROSS; net += c.tot.NET; er += c.tot.er; }
    cnt[st.k]++; if (s.source && s.source.mode === 'typed') cnt.rules++;
    const fl = run && run.att ? run.att.filter(a => a.flags && a.flags.length).length : 0; flags += fl;
    return { s, st, c, fl, n: empsOf(s.id).filter(e => e.status !== 'EXIT').length };
  });
  const f = S.dashFilter || 'all';
  const pct = k => sites.length ? (cnt[k] / sites.length * 100).toFixed(1) : 0;
  const hrIn = sites.filter(s2 => hrDoc(s2.id)).length, hrOk = sites.filter(s2 => (hrDoc(s2.id) || {}).status === 'APPROVED').length;
  const demoable = sites.filter(s2 => !hrDoc(s2.id) && empsOf(s2.id).some(e => e.sample)).map(s2 => s2.id);
  p.innerHTML = seedBanner() + (sites.length ? `<div class="card hrband"><div class="grow"><b>Attendance from HR — ${monthName()}</b><div class="small muted">${hrOk} approved · ${hrIn - hrOk} awaiting approval or sent back · ${sites.length - hrIn} not received</div></div><div class="hrbar"><i style="width:${sites.length ? hrOk / sites.length * 100 : 0}%;background:var(--okdot)"></i><i style="width:${sites.length ? (hrIn - hrOk) / sites.length * 100 : 0}%;background:var(--warndot)"></i></div></div>` : '') + `
  <div class="kpis">
   <div class="kpi"><div class="l">Sites processed</div><div class="v">${cnt.locked} <span class="muted" style="font-size:15px;font-weight:500">/ ${sites.length}</span></div>
    <div class="bar"><i style="width:${pct('locked')}%;background:var(--okdot)"></i><i style="width:${pct('draft')}%;background:var(--warndot)"></i></div>
    <div class="s">${cnt.draft} in progress · ${cnt.none} not started</div></div>
   <div class="kpi"><div class="l">Employees paid</div><div class="v">${inr(heads)}</div><div class="s">${flags ? `${flags} attendance rows flagged` : 'No attendance flags'}${Object.values(S.held).filter(h => hStatus(h) === 'HELD').length ? ` · <a href="#held" style="color:var(--bad)">${Object.values(S.held).filter(h => hStatus(h) === 'HELD').length} held</a>` : ''}</div></div>
   <div class="kpi"><div class="l">Gross wages</div><div class="v">${cr(gross)}</div><div class="s">Across salary sheets</div></div>
   <div class="kpi"><div class="l">Net to bank</div><div class="v">${cr(net)}</div><div class="s">Salary only, excl. separate payouts</div></div>
   <div class="kpi"><div class="l">Employer contributions</div><div class="v">${cr(er)}</div><div class="s">PF, EDLI, admin, ESIC, LWF</div></div>
  </div>
  <div class="card flush"><div class="chead"><h2>Sites</h2><span class="grow"></span>
   ${sites.length ? '' : '<button class="btn pri sm" onclick="newSiteModal()">Add a site from a template</button>'}
   <div class="seg" id="dseg">${[['all', 'All', sites.length], ['none', 'Not started', cnt.none], ['draft', 'In progress', cnt.draft], ['locked', 'Locked', cnt.locked], ['rules', 'Rules to set', cnt.rules]].map(([k, t, n]) => `<button data-f="${k}" class="${f === k ? 'on' : ''}">${t}<span>${n}</span></button>`).join('')}</div>
   <input class="in" placeholder="Search sites" id="dq" style="width:200px"></div>
  <div class="scroll"><table class="tbl" id="dtbl"><thead><tr><th>Site</th><th>State</th><th class="n">Employees</th><th class="n">Gross</th><th class="n">Net</th><th>HR attendance</th><th>Flags</th><th>Setup</th><th>Status</th><th></th></tr></thead><tbody>
  ${rows.filter(x => f === 'all' || (f === 'rules' ? x.s.source && x.s.source.mode === 'typed' : x.st.k === f)).map(x => `<tr class="click" data-id="${x.s.id}" data-k="${x.st.k}" data-q="${esc((x.s.name + ' ' + x.s.client + ' ' + x.s.state).toLowerCase())}">
   <td><div class="siteline"><b>${esc(x.s.name)}</b><small>${esc(x.s.client)}${x.s.oc && x.s.oc !== '—' ? ' · OC ' + esc(x.s.oc) : ''}</small></div></td>
   <td><span class="tag" title="${esc(E.STATE.NAMES[x.s.state] || '')}">${x.s.state}</span></td>
   <td class="n">${x.c ? `${x.c.rows.length}<span class="muted"> / ${x.n}</span>` : `<span class="muted">${x.n}</span>`}</td>
   <td class="n">${x.c ? inr(x.c.tot.GROSS) : '<span class="muted">—</span>'}</td><td class="n">${x.c ? inr(x.c.tot.NET) : '<span class="muted">—</span>'}</td>
   <td><span class="pill ${hrStatus(x.s.id).c}">${hrStatus(x.s.id).t}</span></td><td>${x.fl ? `<span class="flag">${x.fl}</span>` : ''}</td><td>${setupBadge(x.s)}</td><td><span class="pill ${x.st.c}">${x.st.t}</span></td><td class="go">›</td></tr>`).join('') || '<tr><td colspan="10" class="empty">No sites set up yet. Add a client site to start this month\'s payroll. Each site keeps its own salary structure, state and statutory pattern.</td></tr>'}
  </tbody></table></div></div>`;
  const hda = $('#hr_demo_all'); if (hda) hda.onclick = () => { hda.disabled = true; hda.textContent = 'Loading…'; demoHR(demoable); };
  $('#dq').oninput = e => { const q = e.target.value.toLowerCase(); $('#dtbl').querySelectorAll('tbody tr').forEach(tr => tr.style.display = tr.dataset.q.includes(q) ? '' : 'none'); };
  p.querySelectorAll('#dseg button').forEach(b => b.onclick = () => { S.dashFilter = b.dataset.f; render(); });
  p.querySelectorAll('#dtbl tr.click').forEach(tr => tr.onclick = () => go('process', { proc: { site: tr.dataset.id, sites: [tr.dataset.id], siteMode: 'pick', step: tr.dataset.k === 'none' ? 1 : 3, type: 'REG' } }));
}

function setupBadge(s) {
  if (s.kind === 'payout') return '<span class="tag">Side payout</span>';
  if (s.source && s.source.mode === 'typed') return '<span class="pill p-warn" title="Value-only export: set the components before go-live">Rules to set</span>';
  if (s.source) return '<span class="tag" title="Translated from ' + esc(s.source.file) + '">Imported</span>';
  return '<span class="tag">Hand-checked</span>';
}
// ---------------- Process salary ----------------
function sitePicker(cur, onch, id = 'sitepick') {
  const list = processSiteList().length ? processSiteList() : siteList();
  setTimeout(() => { const el = gid(id); if (el) el.onchange = e => onch(e.target.value); });
  return `<select class="in" id="${id}" style="min-width:320px"><option value="">— choose a site —</option>${list.map(s => `<option value="${s.id}" ${s.id === cur ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`;
}
function processSiteSummary(all, selected) {
  if (!S.attSitesLoaded) return 'Loading sites…';
  if (!all.length) return 'No sites yet';
  if (!selected.length) return 'Select site';
  if (selected.length === all.length) return `All sites (${all.length})`;
  if (selected.length === 1) {
    const s = all.find((x) => x.id === selected[0]);
    return s ? s.name : '1 site';
  }
  const first = all.find((x) => x.id === selected[0]);
  return `${selected.length} sites · ${(first && first.name) || selected[0]}`;
}
function processSiteControls() {
  const all = processSiteList();
  const open = !!S.proc.siteMenuOpen;
  if (!Array.isArray(S.proc.sites)) S.proc.sites = [];
  // Default: nothing selected until user picks (or Select all)
  if (S.proc.siteMode !== 'all' && S.proc.siteMode !== 'pick') S.proc.siteMode = 'pick';
  const selected = processSitesSelected();
  const focus = ensureProcFocusSite(S.proc.site);
  const focusSite = all.find((s) => s.id === focus) || S.sites[focus] || null;
  const type = attendanceSiteTypeFilter();
  const summary = processSiteSummary(all, selected);
  const siteLabel = (id) => {
    const s = all.find((x) => x.id === id) || S.sites[id] || { id, name: id };
    return s.name || id;
  };
  const menu = open
    ? `<div class="ps-menu" id="ps_menu" role="listbox" aria-multiselectable="true">
        <div class="ps-menu-tools">
          <input class="in grow" id="ps_q" placeholder="Search site…" value="${esc(S.proc.siteQ || '')}" autocomplete="off">
          <button type="button" class="btn sm" id="ps_all">Select all</button>
          <button type="button" class="btn sm" id="ps_none">Clear</button>
        </div>
        <div class="ps-list">
          ${all.map((s) => `<label class="chk ps-opt" data-ps-name="${esc(String(s.name || '').toLowerCase())}" data-ps-loc="${esc(String(s.location || '').toLowerCase())}" data-ps-client="${esc(String(s.client || '').toLowerCase())}"><input type="checkbox" data-ps="${esc(s.id)}" ${selected.includes(s.id) ? 'checked' : ''}><span title="${esc(s.name)}">${esc(s.name)}</span></label>`).join('')
            || '<span class="small muted ps-empty-static">No sites from Attendance yet. Add them under Site Attendance → Site Master.</span>'}
        </div>
        <div class="ps-menu-foot small muted">${selected.length} of ${all.length} selected${type ? ` · ${esc(type)}` : ''} · multi-select</div>
      </div>`
    : '';
  // Match Run type: a normal select. Only needed when 2+ sites are ticked.
  const focusSelect = selected.length > 1
    ? `<label class="f ps-field ps-field-focus"><span class="small muted">Working on</span>
        <select class="in" id="ps_focus">${selected.map((id) =>
          `<option value="${esc(id)}" ${id === focus ? 'selected' : ''}>${esc(siteLabel(id))}</option>`
        ).join('')}</select>
      </label>`
    : '';
  const chips = selected.length > 1
    ? `<div class="ps-chips" aria-label="Selected sites">
        <span class="ps-chips-label small muted">Selected</span>
        <div class="ps-chips-list">${selected.map((id) => {
          const name = siteLabel(id);
          const on = id === focus;
          return `<div class="ps-chip ${on ? 'on' : ''}" data-pf="${esc(id)}" role="button" tabindex="0" title="${esc(name)}">
            <span class="ps-chip-name">${esc(name)}</span>
            ${on ? '<span class="ps-chip-badge">Working on</span>' : ''}
            <button type="button" class="ps-chip-x" data-px="${esc(id)}" aria-label="Remove ${esc(name)}">×</button>
          </div>`;
        }).join('')}</div>
      </div>`
    : '';
  return {
    focus,
    focusSite,
    selected,
    html: `<div class="card ps-card">
      <div class="ps-bar">
        <label class="f ps-field ps-field-sites"><span class="small muted">Sites</span>
          <button type="button" class="in ps-trigger" id="ps_trigger" aria-haspopup="listbox" aria-expanded="${open ? 'true' : 'false'}">
            <span class="ps-trigger-label ${selected.length ? '' : 'placeholder'}">${esc(summary)}</span>
            <span class="ps-trigger-caret" aria-hidden="true"></span>
          </button>
          ${menu}
        </label>
        <label class="f ps-field ps-field-rtype"><span class="small muted">Run type</span>
          <select class="in" id="rtype">${[['REG', 'Regular monthly'], ['ARR', 'Arrears'], ['FNF', 'Full & Final'], ['SUP', 'Supplementary / revised']].map(([k, t]) => `<option value="${k}" ${S.proc.type === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </label>
        ${focusSelect}
        <div class="ps-status">
          ${focus && S.sites[focus] ? patPill(S.sites[focus], focus) : ''}
          ${focus ? `<span class="pill ${runStatus(focus).c}">${runStatus(focus).t}</span>` : ''}
        </div>
      </div>
      ${chips}
      <p class="ps-help small muted">Same site list as Attendance. Open Sites and tick one or more to process.</p>
    </div>`,
  };
}
function bindProcessSiteControls(p) {
  const trigger = $('#ps_trigger');
  if (trigger) trigger.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    S.proc.siteMenuOpen = !S.proc.siteMenuOpen;
    if (!S.proc.siteMenuOpen) S._psOutsideBound = false;
    render();
  };
  const qEl = $('#ps_q');
  const applySiteFilter = () => {
    if (!qEl) return;
    S.proc.siteQ = qEl.value;
    const q = String(S.proc.siteQ || '').trim().toLowerCase();
    const list = p.querySelector('.ps-list');
    if (!list) return;
    let shown = 0;
    list.querySelectorAll('.ps-opt').forEach((lab) => {
      const hay = `${lab.dataset.psName || ''} ${lab.dataset.psLoc || ''} ${lab.dataset.psClient || ''}`;
      const show = !q || hay.includes(q);
      lab.style.display = show ? '' : 'none';
      if (show) shown += 1;
    });
    let empty = list.querySelector('.ps-empty');
    if (!shown && processSiteList().length) {
      if (!empty) {
        empty = document.createElement('span');
        empty.className = 'small muted ps-empty';
        empty.textContent = 'No sites match this search.';
        list.appendChild(empty);
      }
      empty.style.display = '';
    } else if (empty) empty.style.display = 'none';
  };
  if (qEl) {
    qEl.oninput = applySiteFilter;
    qEl.onkeydown = (e) => {
      if (e.key === 'Escape') { S.proc.siteMenuOpen = false; render(); }
    };
    applySiteFilter();
    // Keep search focused after checkbox re-renders
    if (S.proc.siteMenuOpen && S._psKeepSearchFocus != null) {
      const pos = Number(S._psKeepSearchFocus) || 0;
      S._psKeepSearchFocus = null;
      setTimeout(() => {
        const el = $('#ps_q');
        if (!el) return;
        el.focus();
        try { el.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
      }, 0);
    }
  }
  const focusEl = $('#ps_focus');
  if (focusEl) focusEl.onchange = () => {
    ensureProcFocusSite(focusEl.value);
    S.proc.step = 1;
    render();
  };
  p.querySelectorAll('[data-ps]').forEach((c) => {
    c.onchange = () => {
      S.proc.siteMode = 'pick';
      // Only update from currently visible options so a search filter does not clear hidden ticks
      const q = String(S.proc.siteQ || '').trim().toLowerCase();
      const prev = new Set(Array.isArray(S.proc.sites) ? S.proc.sites.map(String) : []);
      p.querySelectorAll('.ps-opt').forEach((lab) => {
        const input = lab.querySelector('input[data-ps]');
        if (!input) return;
        const id = input.dataset.ps;
        const hay = `${lab.dataset.psName || ''} ${lab.dataset.psLoc || ''} ${lab.dataset.psClient || ''}`;
        const visible = !q || hay.includes(q);
        if (!visible) return;
        if (input.checked) prev.add(id);
        else prev.delete(id);
      });
      S.proc.sites = [...prev];
      ensureProcFocusSite(S.proc.site);
      S.proc.step = 1;
      S.proc.siteMenuOpen = true;
      const qBox = $('#ps_q');
      if (qBox) S._psKeepSearchFocus = qBox.selectionStart || String(S.proc.siteQ || '').length;
      render();
    };
  });
  const allBtn = $('#ps_all');
  if (allBtn) allBtn.onclick = () => {
    S.proc.siteMode = 'pick';
    S.proc.sites = processSiteList().map((s) => s.id);
    S.proc.siteMenuOpen = true;
    ensureProcFocusSite(S.proc.site);
    render();
  };
  const noneBtn = $('#ps_none');
  if (noneBtn) noneBtn.onclick = () => {
    S.proc.siteMode = 'pick';
    S.proc.sites = [];
    S.proc.site = null;
    S.proc.siteMenuOpen = true;
    render();
  };
  const setFocusSite = (id) => {
    ensureProcFocusSite(id);
    S.proc.step = 1;
    render();
  };
  p.querySelectorAll('[data-pf]').forEach((el) => {
    el.onclick = (e) => {
      if (e.target && e.target.closest && e.target.closest('[data-px]')) return;
      setFocusSite(el.dataset.pf);
    };
    el.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setFocusSite(el.dataset.pf);
      }
    };
  });
  p.querySelectorAll('[data-px]').forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = String(btn.dataset.px || '');
      S.proc.siteMode = 'pick';
      S.proc.sites = (Array.isArray(S.proc.sites) ? S.proc.sites : []).map(String).filter((x) => x !== id);
      if (String(S.proc.site || '') === id) S.proc.site = null;
      ensureProcFocusSite(S.proc.site);
      S.proc.step = 1;
      render();
    };
  });
  // Close dropdown when clicking outside
  if (S.proc.siteMenuOpen && !S._psOutsideBound) {
    S._psOutsideBound = true;
    const close = (ev) => {
      if (!S.proc.siteMenuOpen) {
        S._psOutsideBound = false;
        document.removeEventListener('mousedown', close, true);
        return;
      }
      const menu = $('#ps_menu');
      const trg = $('#ps_trigger');
      if ((menu && menu.contains(ev.target)) || (trg && trg.contains(ev.target))) return;
      S.proc.siteMenuOpen = false;
      S._psOutsideBound = false;
      document.removeEventListener('mousedown', close, true);
      render();
    };
    setTimeout(() => document.addEventListener('mousedown', close, true), 0);
  }
}
function curRun(sid) {
  const id = runId(sid, S.month, S.proc.type);
  return S.runs[id] || { siteId: sid, month: S.month, type: S.proc.type, status: 'DRAFT', att: [], ded: {} };
}
async function saveRun(run) { run.updatedAt = new Date().toISOString(); const id = runId(run.siteId, run.month, run.type); S.runs[id] = Object.assign({ _id: id }, run); return put('runs/' + id, strip(run)); }

function vProcess(p) {
  const ctl = processSiteControls();
  const sid = ctl.focus;
  let site = sid ? (S.sites[sid] || ctl.focusSite) : null;
  let head = ctl.html;
  const finishHead = () => { bindProcessSiteControls(p); bindRType(); };
  if (!S.attSitesLoaded) {
    p.innerHTML = head + `<div class="card empty">Loading sites from Attendance…</div>`;
    finishHead();
    return;
  }
  if (!processSiteList().length) {
    p.innerHTML = head + `<div class="card empty"><h2>No sites from Attendance</h2><p>Add sites under Site Attendance → Site Master. The same sites will appear in this dropdown for salary processing.</p></div>`;
    finishHead();
    return;
  }
  if (!site || !processSitesSelected().length) {
    p.innerHTML = head + `<div class="card empty">Open the Sites dropdown and tick one or more sites to process salary for ${monthName()}.</div>`;
    finishHead();
    return;
  }
  if (!S.sites[sid]) {
    p.innerHTML = head + `<div class="card empty">Linking <b>${esc(site.name || sid)}</b> from Attendance into payroll… Refresh if this stays open.</div>`;
    finishHead();
    if (S.attSites && S.attSites.length) syncAttendanceSites(S.attSites);
    return;
  }
  site = S.sites[sid];
  if (S.proc.type === 'ARR') { p.innerHTML = head; finishHead(); vArrears(p, site); return; }
  const dueR = site ? dueRevs(sid, S.month) : [];
  if (dueR.length && S.proc.type === 'REG') head += `<div class="note warn" style="display:flex;gap:12px;align-items:center;margin-bottom:14px"><div class="grow"><b>Salary revision not applied yet:</b> ${dueR.map(r => `${esc(r.title || '')} (effective ${monthName(r.effective)})`).join('; ')}. Apply it before processing ${monthName()} so this salary uses the new rates.</div><button class="btn sm pri" id="dueRev">Review</button></div>`;
  if (dueR.length && S.proc.type === 'REG') setTimeout(() => { const b = $('#dueRev'); if (b) b.onclick = () => { S.rv = Object.assign(S.rv || {}, { mode: 'view', id: dueR[0]._id || dueR[0].id, back: null }); go('revisions'); }; }, 0);
  if (S.proc.type === 'FNF') { p.innerHTML = head; finishHead(); vFnF(p, site); return; }
  const run = curRun(sid); const locked = run.status === 'LOCKED';
  const st = S.proc.step;
  const steps = [['Attendance', 1], ['Review & clean', 2], ['Salary sheet', 3], ['Lock & files', 4]];
  p.innerHTML = head + (S.proc.type === 'SUP' ? `<div class="note warn" style="margin-bottom:12px">Supplementary run: upload or edit the corrected attendance. The salary sheet shows only the difference against the locked regular run for ${monthName()}.</div>` : '') +
    `<div class="steps">${steps.map(([t, n]) => { const done = n === 1 ? !!(run.att && run.att.length) : n === 2 ? !!run.attFinalAt : n === 3 ? locked : locked; const gated = n >= 3 && !run.attFinalAt; return `<div class="step ${st === n ? 'on' : ''} ${done && st !== n ? 'done' : ''}" data-s="${n}" style="${gated ? 'opacity:.55' : ''}" title="${gated ? 'Finalize attendance first' : ''}"><span class="no">${done && st !== n ? '✓' : n}</span>${t}</div>`; }).join('')}</div><div id="pbody"></div>`;
  finishHead();
  p.querySelectorAll('.step').forEach(el => el.onclick = () => { S.proc.step = +el.dataset.s; render(); });
  const b = $('#pbody');
  if (st === 1) stepUpload(b, site, run, locked);
  if (st === 2) stepReview(b, site, run, locked);
  if (st >= 3 && !run.attFinalAt && run.att && run.att.length) { b.innerHTML = `<div class="card empty"><h2>Attendance is not finalized yet</h2><p>Review the attendance, mark any salaries to hold, then finalize it to process salary.</p><button class="btn pri" onclick="S.proc.step=2;render()">Go to Review & clean</button></div>`; return; }
  if (st === 3) stepSheet(b, site, run, locked);
  if (st === 4) stepLock(b, site, run, locked);
}
function bindRType() { const r = $('#rtype'); if (r) r.onchange = e => { S.proc.type = e.target.value; S.proc.step = 1; render(); }; }

// ----- Step 1: attendance upload -----
const DEFAULT_CODES = { P: { pd: 1 }, X: { pd: 1 }, '1': { pd: 1 }, A: {}, AB: {}, '0': {}, WO: {}, W: {}, OFF: {}, HD: { pd: 0.5 }, H: { pd: 0.5 }, '½': { pd: 0.5 }, PH: { nh: 1 }, NH: { nh: 1 }, FH: { nh: 1 }, WOP: { wot: 1 }, POW: { wot: 1 }, DP: { pd: 1, ot: 1 }, PP: { pd: 1, ot: 1 }, OT: { ot: 1 }, CL: { pd: 1 }, SL: { pd: 1 }, EL: { pd: 1 }, L: {}, LWP: {} };
function codesOf(site) { return Object.assign({}, DEFAULT_CODES, site.attCodes || {}); }
function stepUpload(b, site, run, locked) {
  const has = run.att && run.att.length; const h = hrDoc(site.id); const hs = hrStatus(site.id);
  const sample = empsOf(site.id).some(e => e.sample);
  const hrRows = h ? (h.rows || []) : []; const tot = k => hrRows.reduce((t, r) => t + (+r[k] || 0), 0);
  const known = new Set(empsOf(site.id).map(e => String(e.code))); const unknownN = hrRows.filter(r => !known.has(String(r.code))).length;
  let hrBody = '';
  if (!h) hrBody = `<div class="hrstate none"><span class="hrdot"></span><div><b>Not received from HR yet</b><div class="small muted">The site's attendance for ${monthName()} has not been submitted in the HR module.</div></div></div>
     `;
  else {
    const st = h.status;
    hrBody = `<div class="hrstate ${st === 'APPROVED' ? 'ok' : st === 'RETURNED' ? 'bad' : 'warn'}"><span class="hrdot"></span><div><b>${st === 'APPROVED' ? 'Approved in HR' : st === 'RETURNED' ? 'Sent back to HR for correction' : 'Submitted — awaiting HR approval'}</b>
       <div class="small muted">${st === 'APPROVED' ? `by ${esc(h.approvedBy || 'HR')} · ${fmtWhen(h.approvedAt)}` : st === 'RETURNED' ? `${fmtWhen(h.returnedAt)} · “${esc(h.returnNote || '')}”` : `by ${esc(h.submittedBy || 'site HR')} · ${fmtWhen(h.submittedAt)}`}${(h.version || 1) > 1 ? ` · version ${h.version}` : ''}${h.demo ? ' · demo data' : ''}</div></div></div>
     <div class="hrsum"><div><span>Employees</span><b>${hrRows.length}</b></div><div><span>Paid days</span><b>${inr(tot('PD'), 1)}</b></div><div><span>OT days / hours</span><b>${inr(tot('OTD'), 1)} / ${inr(tot('OTH'), 1)}</b></div><div><span>NH / PH</span><b>${inr(tot('NH'), 1)}</b></div></div>
     ${unknownN ? `<div class="small" style="color:var(--warn);margin-top:8px">${unknownN} employee code${unknownN === 1 ? '' : 's'} not in the employee master — you can match them in Review & clean.</div>` : ''}
     ${hs.k === 'changed' ? `<div class="note warn small" style="margin-top:10px">HR changed this attendance after you imported it (now version ${h.version}). Re-import to use the corrected figures.</div>` : ''}
     ${hs.k === 'imported' ? `<div class="small muted" style="margin-top:10px">Imported ${fmtWhen(run.hr.importedAt)}.</div>` : ''}
     ${locked ? '' : `<div class="row" style="gap:8px;margin-top:14px">${st === 'APPROVED' ? `<button class="btn pri" id="hr_imp">${hs.k === 'imported' ? 'Import again' : hs.k === 'changed' ? 'Re-import corrected attendance' : 'Import attendance from HR'}</button>` : ''}${st !== 'RETURNED' ? '<button class="btn" id="hr_ret">Send back to HR</button>' : ''}</div>`}`;
  }
  const upOpen = S.proc.upOpen || (has && run.attSource === 'UPLOAD');
  b.innerHTML = `<div style="display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:16px;align-items:start"><div>
   <div class="card"><div class="row" style="margin-bottom:12px"><div class="grow"><h2 style="margin:0">Attendance from the HR module</h2><div class="small muted">Standard process — the site's attendance is entered and approved in HR, then imported here.</div></div><a href="#" class="small" id="hr_spec">How HR sends it</a></div>
    ${locked ? '<div class="note warn">This run is locked. Unlock it in step 4 to change attendance.</div>' : hrBody}</div>
   ${locked ? '' : `<div class="card upalt ${upOpen ? 'open' : ''}"><div class="row upalt-h" id="up_tog"><span class="chev">›</span><div class="grow"><b>Alternative: upload attendance directly</b><div class="small muted">Only when the HR module can't be used for this site or month</div></div></div>
    ${upOpen ? `<div style="margin-top:14px"><label class="f">Reason for uploading directly<select class="in" id="up_reason"><option value="">Choose a reason…</option>${['HR module not yet live for this site', 'HR attendance delayed — salary deadline', 'Correction file from the client', 'Other'].map(r => `<option ${S.proc.upReason === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
     <div class="drop ${S.proc.upReason ? '' : 'dis'}" id="drop" style="margin-top:12px"><b>Drop the site's attendance file here</b><br><span class="muted">or click to choose · Excel (.xlsx/.xls) or CSV</span><input type="file" id="file" accept=".xlsx,.xls,.csv" hidden></div>
     <p class="small muted">Day-wise codes, punch times or monthly totals are recognised; the column mapping is saved for the site. The upload is marked on the salary sheet and dashboard.</p>
     <div class="row" style="gap:8px"><button class="btn sm" id="tmpl">Download standard template</button></div></div>` : ''}</div>`}
   </div>
   <div class="card"><h2>This run</h2>
    ${has ? `<p style="margin-top:0"><b>${run.att.length}</b> employees · ${run.attSource === 'HR' ? `<span class="pill p-ok">From HR module</span>` : run.attSource === 'UPLOAD' ? `<span class="pill p-warn">Uploaded directly</span>` : `<span class="pill p-mute">${esc(run.source || 'loaded')}</span>`}</p>
     ${run.attSource === 'UPLOAD' && run.uploadReason ? `<p class="small muted">Reason: ${esc(run.uploadReason)}${run.source ? ` · file ${esc(run.source)}` : ''}</p>` : ''}
     <p class="small muted">${run.att.filter(a => a.flags && a.flags.length).length} rows flagged · last changed ${run.updatedAt ? new Date(run.updatedAt).toLocaleString('en-IN') : '—'}</p>
     <button class="btn pri" onclick="S.proc.step=2;render()">Review & clean →</button>` : '<p class="muted">No attendance loaded yet.</p>'}
    <h3>Site rules applied to attendance</h3>
    <div class="small">Divisor: <b>${site.divisor.type === 'fixed' ? site.divisor.days + ' days (fixed)' : 'calendar — ' + siteCalWD(site) + ' days this month'}</b> · Shift: <b>${(site.params || {}).HRS || 8} hrs</b> · Pay period from day <b>${(site.payPeriod || {}).startDay || 1}</b></div>
   </div></div>`;
  const sp = $('#hr_spec'); if (sp) sp.onclick = e => { e.preventDefault(); hrSpecModal(); };
  if (locked) return;
  const hd = $('#hr_demo'); if (hd) hd.onclick = e => { e.preventDefault(); demoHR([site.id]); };
  const hi = $('#hr_imp'); if (hi) hi.onclick = () => { if (has && run.attSource === 'UPLOAD') confirmModal('Replace the uploaded attendance?', 'The attendance you uploaded directly will be replaced by the approved attendance from HR.', () => importFromHR(site, run)); else importFromHR(site, run); };
  const hr = $('#hr_ret'); if (hr) hr.onclick = () => returnToHRModal(site);
  $('#up_tog').onclick = () => { S.proc.upOpen = !upOpen; render(); };
  const rs = $('#up_reason'); if (rs) rs.onchange = () => { S.proc.upReason = rs.value; render(); };
  const f = $('#file'), d = $('#drop');
  if (d) { d.onclick = () => { if (!S.proc.upReason) { toast('Choose the reason for uploading directly first'); return; } f.click(); };
    d.ondragover = e => { e.preventDefault(); d.classList.add('over'); }; d.ondragleave = () => d.classList.remove('over');
    d.ondrop = e => { e.preventDefault(); d.classList.remove('over'); if (!S.proc.upReason) { toast('Choose the reason for uploading directly first'); return; } if (e.dataTransfer.files[0]) readAttFile(e.dataTransfer.files[0], site, run); };
    f.onchange = () => f.files[0] && readAttFile(f.files[0], site, run); }
  const us = $('#usesample'); if (us) us.onclick = async () => {
    if (!S.proc.upReason) { toast('Choose the reason for uploading directly first'); return; }
    const att = empsOf(site.id).filter(e => e.sample).map(e => Object.assign({ code: e.code }, e.sample.att));
    const ded = {}; empsOf(site.id).forEach(e => { if (e.sample && e.sample.ded) { const d2 = {}; for (const [k, v] of Object.entries(e.sample.ded)) if (v) d2[k] = v; if (Object.keys(d2).length) ded[e.code] = d2; } });
    run.att = att; run.ded = ded; run.source = 'September 2026 salary sheet'; run.format = 'monthly totals'; run.attSource = 'UPLOAD'; run.uploadReason = S.proc.upReason; delete run.hr;
    validateAtt(site, run); await saveRun(run); S.proc.step = 2; render(); toast('Attendance loaded for ' + att.length + ' employees');
  };
  const tm = $('#tmpl'); if (tm) tm.onclick = () => {
    const [y, m] = ym(); const n = new Date(y, m, 0).getDate();
    const hdr = ['Emp Code', 'Employee Name', ...Array.from({ length: n }, (_, i) => String(i + 1)), 'OT Hours', 'Remarks'];
    const rows = [[`Indus Fire Safety Pvt Ltd — Attendance ${monthName()} — ${site.name}`], ['Codes: P present, A absent, WO weekly off, HD half day, PH/NH holiday, WOP worked on weekly off, DP double duty, OT extra duty'], hdr,
      ...empsOf(site.id).filter(e => e.status !== 'EXIT').map(e => [e.code, e.name])];
    saveFile(`Attendance_template_${site.id}_${S.month}.xlsx`, xlsxBytes([{ name: 'Attendance', rows, cols: [10, 28, ...Array(n).fill(4), 9, 14] }]));
  };
}
function readAttFile(file, site, run) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const wb = XLSX.read(new Uint8Array(rd.result), { type: 'array', cellDates: true });
      const sheets = wb.SheetNames.map(n => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }));
      mappingModal(file.name, sheets, site, run);
    } catch (e) { toast('Could not read the file: ' + e.message); }
  };
  rd.readAsArrayBuffer(file);
}
const FIELDS = [['code', 'Emp code / client ID'], ['name', 'Employee name'], ['PD', 'Paid days'], ['OTD', 'OT days'], ['OTH', 'OT hours'], ['NH', 'NH/PH days'], ['WOT', 'Weekly-off worked'], ['ODI', 'Special duty days'], ['WD', 'Working days (override)'], ['date', 'Date (punch)'], ['in', 'In time (punch)'], ['out', 'Out time (punch)'], ['hours', 'Hours worked (punch)']];
const GUESS = { code: /(emp|employee)?\s*(code|id|no\b|number|token|card)/i, name: /name/i, PD: /(paid|p\.?\s*days|present|days\s*worked|^days$|attend)/i, OTD: /ot\s*(duty|days)|extra\s*duty/i, OTH: /ot\s*(hrs|hours)/i, NH: /\b(nh|ph|holiday)/i, WOT: /(w\.?\s*off|weekly).*(ot|work)|wo\s*ot/i, ODI: /special|odi/i, WD: /working\s*days/i, date: /^date$/i, in: /^(in|in\s*time|punch\s*in|time\s*in)$/i, out: /^(out|out\s*time|punch\s*out|time\s*out)$/i, hours: /(hours|hrs|duration)/i };
function detect(rows) {
  // find header row: first row with >=3 text cells
  let hi = 0; for (let i = 0; i < Math.min(rows.length, 15); i++) { const r = rows[i]; const t = r.filter(c => typeof c === 'string' && c.trim()).length; const dayCols = r.filter(c => /^\s*([1-9]|[12]\d|3[01])\s*$/.test(String(c))).length; if (dayCols >= 25 || t >= 3 && r.some(c => GUESS.name.test(String(c)) || GUESS.code.test(String(c)))) { hi = i; break; } }
  const h = rows[hi].map(c => String(c instanceof Date ? c.getDate() : c).trim());
  const dayIdx = h.map((c, i) => /^([1-9]|[12]\d|3[01])$/.test(c) ? i : -1).filter(i => i >= 0);
  const fmt = dayIdx.length >= 25 ? 'daywise' : (h.some(c => GUESS.in.test(c)) && h.some(c => GUESS.out.test(c)) ? 'punch' : 'totals');
  const map = {}; FIELDS.forEach(([k]) => { const i = h.findIndex((c, j) => GUESS[k] && GUESS[k].test(c) && !dayIdx.includes(j) && !Object.values(map).includes(j)); if (i >= 0) map[k] = i; });
  return { hi, h, dayIdx, fmt, map };
}
function mappingModal(fname, sheets, site, run) {
  let si = 0; let det = detect(sheets[0].rows);
  const saved = site.attMap; if (saved && saved.fmt) { det.fmt = saved.fmt; for (const [k, name] of Object.entries(saved.cols || {})) { const i = det.h.indexOf(name); if (i >= 0) det.map[k] = i; } }
  const draw = () => {
    const rows = sheets[si].rows; const prev = rows.slice(det.hi + 1, det.hi + 6);
    const extraF = (site.attFields || []); extraF.forEach(([k, t]) => { if (!FIELDS.some(f => f[0] === k)) FIELDS.push([k, t]); if (!GUESS[k]) GUESS[k] = new RegExp(t.replace(/[^a-z ]/gi, '').split(' ')[0], 'i'); });
    const need = det.fmt === 'daywise' ? ['code', 'name', 'OTH'] : det.fmt === 'punch' ? ['code', 'name', 'date', 'in', 'out', 'hours'] : ['code', 'name', 'PD', 'OTD', 'OTH', 'NH', 'WOT', 'ODI', 'WD', ...extraF.map(f => f[0])];
    $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:900px"><h2>Confirm attendance columns — ${esc(fname)}</h2>
    <div class="row" style="margin-bottom:10px"><label class="f">Sheet<select class="in" id="msheet">${sheets.map((s, i) => `<option value="${i}" ${i === si ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
    <label class="f">Header row<input class="in" type="number" id="mhi" value="${det.hi + 1}" style="width:80px"></label>
    <label class="f">Layout<select class="in" id="mfmt">${[['daywise', 'Day-wise codes (1–31)'], ['totals', 'Monthly totals'], ['punch', 'Punch in/out times']].map(([k, t]) => `<option value="${k}" ${det.fmt === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    ${det.fmt === 'daywise' ? `<span class="pill p-pri">${det.dayIdx.length} day columns found</span>` : ''}</div>
    <div class="grid g3">${need.map(k => `<label class="f">${FIELDS.find(f => f[0] === k)[1]}<select class="in" data-k="${k}"><option value="">—</option>${det.h.map((c, i) => `<option value="${i}" ${det.map[k] === i ? 'selected' : ''}>${esc(c || '(col ' + (i + 1) + ')')}</option>`).join('')}</select></label>`).join('')}</div>
    <h3>Preview</h3><div class="scroll" style="max-height:200px"><table class="tbl"><thead><tr>${det.h.slice(0, 40).map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${prev.map(r => `<tr>${r.slice(0, 40).map(c => `<td>${esc(c instanceof Date ? c.toLocaleDateString('en-IN') : c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" id="mcancel">Cancel</button><button class="btn pri" id="mok">Import attendance</button></div></div></div>`;
    $('#msheet').onchange = e => { si = +e.target.value; det = detect(sheets[si].rows); draw(); };
    $('#mhi').onchange = e => { const rws = sheets[si].rows; det.hi = Math.max(0, +e.target.value - 1); const d2 = detect([rws[det.hi]]); det.h = d2.h; det.dayIdx = d2.dayIdx; det.map = d2.map; draw(); };
    $('#mfmt').onchange = e => { det.fmt = e.target.value; draw(); };
    $('#modal').querySelectorAll('select[data-k]').forEach(s => s.onchange = () => { s.value === '' ? delete det.map[s.dataset.k] : det.map[s.dataset.k] = +s.value; });
    $('#mcancel').onclick = () => closeModal();
    $('#mok').onclick = async () => {
      if (det.map.code == null && det.map.name == null) { toast('Choose the employee code or name column'); return; }
      const att = parseAtt(sheets[si].rows, det, site);
      run.attSource = 'UPLOAD'; run.uploadReason = S.proc.upReason || 'Other'; delete run.hr; run.att = att.rows; run.source = fname; run.format = { daywise: 'day-wise codes', totals: 'monthly totals', punch: 'punch times' }[det.fmt];
      run.unknownCodes = att.unknown;
      validateAtt(site, run);
      site.attMap = { fmt: det.fmt, cols: Object.fromEntries(Object.entries(det.map).map(([k, i]) => [k, det.h[i]])) };
      { const doc = storeDoc(Object.assign({}, S.siteDocs[site.id] || site, { attMap: site.attMap })); await put('sites/' + site.id, doc); S.siteDocs[site.id] = Object.assign({ _id: site.id }, doc); resolveAll(); } await saveRun(run);
      closeModal(); S.proc.step = 2; render();
      toast(`Imported ${att.rows.length} rows` + (att.unknown.length ? ` · unknown codes: ${att.unknown.join(', ')}` : ''));
    };
  };
  draw();
}
function parseAtt(rows, det, site) {
  const out = {}, unknown = new Set(); const codes = codesOf(site); const HRS = (site.params || {}).HRS || 8;
  const get = (r, k) => det.map[k] != null ? r[det.map[k]] : '';
  const keyOf = r => { const c = String(get(r, 'code')).trim().replace(/\.0$/, ''); const n = String(get(r, 'name')).trim(); return { c, n }; };
  for (const r of rows.slice(det.hi + 1)) {
    const { c, n } = keyOf(r); if (!c && !n) continue; if (/total/i.test(n) || /total/i.test(c)) continue;
    if (det.fmt === 'totals') {
      if (isNaN(parseFloat(get(r, 'PD'))) && det.map.PD != null) continue;
      out[c || n] = { rawCode: c, rawName: n, PD: num(get(r, 'PD')), OTD: num(get(r, 'OTD')), OTH: num(get(r, 'OTH')), NH: num(get(r, 'NH')), WOT: num(get(r, 'WOT')), ODI: num(get(r, 'ODI')) };
      (site.attFields || []).forEach(([k]) => { if (det.map[k] != null) out[c || n][k] = num(get(r, k)); });
      if (det.map.WD != null && num(get(r, 'WD'))) out[c || n].WD = num(get(r, 'WD'));
    } else if (det.fmt === 'daywise') {
      const a = { rawCode: c, rawName: n, PD: 0, OTD: 0, OTH: num(get(r, 'OTH')), NH: 0, WOT: 0, days: [] };
      for (const i of det.dayIdx) {
        let v = String(r[i] ?? '').trim().toUpperCase(); a.days.push(v);
        if (!v) continue;
        if (/^\d+(\.\d+)?$/.test(v) && +v > 1) { const h = +v; a.PD += h >= HRS - 0.5 ? 1 : h >= HRS / 2 ? 0.5 : 0; if (h > HRS) a.OTH += h - HRS; continue; }
        const parts = v.split(/[\/+]/);
        for (const pc of parts) { const m = codes[pc]; if (!m) { unknown.add(pc); continue; } a.PD += m.pd || 0; a.OTD += m.ot || 0; a.NH += m.nh || 0; a.WOT += m.wot || 0; }
      }
      out[c || n] = a;
    } else { // punch
      const k = c || n; const a = out[k] || (out[k] = { rawCode: c, rawName: n, PD: 0, OTD: 0, OTH: 0, NH: 0, WOT: 0, daysSeen: {} });
      let h = num(get(r, 'hours'));
      if (!h) { const t = x => { if (x instanceof Date) return x.getHours() + x.getMinutes() / 60; if (typeof x === 'number') return (x % 1) * 24; const m = String(x).match(/(\d{1,2})[:.](\d{2})/); return m ? +m[1] + +m[2] / 60 : NaN; }; const ti = t(get(r, 'in')), to = t(get(r, 'out')); if (!isNaN(ti) && !isNaN(to)) h = to >= ti ? to - ti : to + 24 - ti; }
      if (!h) continue;
      const day = String(get(r, 'date')); if (a.daysSeen[day]) continue; a.daysSeen[day] = 1;
      a.PD += h >= HRS - 0.5 ? 1 : h >= HRS / 2 ? 0.5 : 0; if (h > HRS + 0.25) a.OTH += Math.round((h - HRS) * 4) / 4;
    }
  }
  // match to master
  const emps = empsOf(site.id); const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  const res = [];
  for (const a of Object.values(out)) {
    delete a.daysSeen;
    let e = emps.find(x => x.code === a.rawCode) || emps.find(x => x.clientId && x.clientId === a.rawCode) || (a.rawName && emps.find(x => norm(x.name) === norm(a.rawName)));
    a.code = e ? e.code : (a.rawCode || a.rawName); a.matched = !!e;
    a.PD = Math.round(a.PD * 100) / 100; a.OTH = Math.round(a.OTH * 100) / 100;
    res.push(a);
  }
  return { rows: res, unknown: [...unknown] };
}
function validateAtt(site, run) {
  const emps = empsOf(site.id); const byCode = Object.fromEntries(emps.map(e => [e.code, e]));
  const wd = site.divisor.type === 'fixed' ? site.divisor.days : siteCalWD(site);
  const [y, m] = ym(); const calDays = new Date(y, m, 0).getDate();
  const others = Object.values(S.runs).filter(r => r.month === S.month && r.type === 'REG' && r.siteId !== site.id);
  for (const a of run.att) {
    const f = [];
    if (!byCode[a.code]) f.push('Unknown employee');
    const lim = a.WD || wd;
    if (a.PD > lim) f.push(`Paid days ${a.PD} > ${lim}`);
    if (a.PD + (a.OTD || 0) + (a.WOT || 0) > calDays + 0.01) f.push('Total duty > days in month');
    const e = byCode[a.code]; if (e && e.status === 'EXIT') f.push('Marked as exited');
    for (const o of others) if ((o.att || []).some(x => x.code === a.code && x.PD > 0)) f.push('Also in ' + (S.sites[o.siteId] || {}).name);
    a.flags = f;
  }
  const present = new Set(run.att.map(a => a.code));
  run.missing = emps.filter(e => e.status !== 'EXIT' && !present.has(e.code)).map(e => e.code);
}

// ----- Step 2: review -----
function inputDeds(site) { return site.components.filter(c => (c.type === 'D' || c.type === 'E') && c.input && !c.off); }
function salaryGaps(site, run) {
  const byCode = Object.fromEntries(empsOf(site.id).map((e, i) => [e.code, [e, i]])); const out = [];
  for (const a of (run.att || [])) { if (a.skip || !byCode[a.code]) continue; const [e, idx] = byCode[a.code]; let sp; try { sp = salarySpec(site, e); } catch (x) { sp = { usesRate: true, usesBasic: false }; }
    const miss = []; if ((sp.usesRate || !sp.usesBasic) && !(+e.rate > 0)) miss.push((e.rateType || site.rateType) === 'D' ? 'gross rate per day' : 'gross salary');
    if (sp.usesBasic && !(+e.basic > 0) && !(+(site.params || {}).BASIC > 0)) miss.push('basic');
    if (miss.length) out.push({ a, e, idx, miss }); }
  return out;
}
function setSalaryFromRun(site, idx) { S.em = Object.assign(S.em || { q: '', site: '', st: 'ACTIVE', miss: '', page: 0, tab: 'list' }, { site: site.id, ret: JSON.parse(JSON.stringify(S.proc)) }); S.em.open = site.id + '|' + empsOf(site.id)[idx].code; S.view = 'employees'; openEmpForm('EDIT', site.id, idx, 'salary'); }
function stepReview(b, site, run, lockedRun) {
  if (!run.att || !run.att.length) { b.innerHTML = '<div class="card empty">Load attendance first.</div>'; return; }
  validateAtt(site, run);
  const fin = !!run.attFinalAt; const locked = lockedRun || fin;
  const nHold = run.att.filter(a => ((run.ded || {})[a.code] || {}).HOLD_ALL).length;
  const emps = empsOf(site.id); const byCode = Object.fromEntries(emps.map(e => [e.code, e]));
  const deds = inputDeds(site).filter(c => c.code !== 'LOAN' && c.code !== 'ADV');
  const hsr = hrStatus(site.id); const srcNote = run.attSource === 'HR' ? `<div class="srcline ok">Attendance from the <b>HR module</b> — approved by ${esc((run.hr || {}).approvedBy || 'HR')} ${fmtWhen((run.hr || {}).approvedAt)}${hsr.k === 'changed' ? ' · <b style="color:var(--bad)">HR has changed it since — re-import in step 1</b>' : ''}</div>` : run.attSource === 'UPLOAD' ? `<div class="srcline warn">Attendance <b>uploaded directly</b> — ${esc(run.uploadReason || '')}${hrDoc(site.id) && hrDoc(site.id).status === 'APPROVED' ? ' · approved HR attendance is now available in step 1' : ''}</div>` : '';
  const cols = [['PD', 'Paid days'], ['OTD', 'OT days'], ['OTH', 'OT hrs'], ['NH', 'NH/PH'], ['WOT', 'WO worked'], ['ODI', 'Spl duty'], ['WD', 'Working days']];
  const usedCols = cols.concat(site.attFields || []).filter(([k]) => k === 'PD' || k === 'WD' || run.att.some(a => a[k]) || site.components.some(c => c.formula && new RegExp('\\b' + k + '\\b').test(c.formula)));
  const flagged = run.att.filter(a => a.flags.length).length;
  const unknown = run.att.filter(a => !byCode[a.code]);
  const gaps = salaryGaps(site, run); const gapSet = new Set(gaps.map(g => g.a.code));
  b.innerHTML = `${srcNote}
  ${gaps.length ? `<div class="card flush blockcard"><div class="chead"><span class="bico">!</span><div class="grow"><h2 style="color:var(--bad)">Salary not added for ${gaps.length} employee${gaps.length === 1 ? '' : 's'}</h2><div style="margin:4px 0 2px;font-size:13px">${gaps.slice(0, 10).map(g => `<b>${esc(g.e.name)}</b> <span class="mono muted">(${esc(g.e.code)})</span>`).join(', ')}${gaps.length > 10 ? ` and ${gaps.length - 10} more` : ''}</div><div class="small muted">Their salary would come out as zero. Set the salary in the employee master, or leave them out of this month. Finalizing is blocked until this is cleared.</div></div></div>
   <div class="scroll"><table class="tbl nostick"><thead><tr><th>Emp. code</th><th>Employee name</th><th>Designation</th><th class="n">Paid days</th><th>Missing</th><th></th></tr></thead><tbody>${gaps.map(g => `<tr><td class="mono"><b>${esc(g.e.code)}</b></td><td><b>${esc(g.e.name)}</b></td><td class="small">${esc(g.e.desig || '')}</td><td class="n">${inr(g.a.PD, 1)}</td><td>${g.miss.map(m => `<span class="flag bad">${m}</span>`).join('')}</td><td class="n" style="white-space:nowrap">${locked ? '' : `<button class="btn sm pri" data-setsal="${g.idx}">Set salary</button> <button class="btn sm" data-skipsal="${esc(g.a.code)}">Leave out this month</button>`}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
  ${unknown.length ? `<div class="card"><h2>Match ${unknown.length} unknown ${unknown.length === 1 ? 'person' : 'people'}</h2><p class="small muted">The attendance has names or IDs that aren't in this site's master. Match each to an employee (the client ID is remembered for next month) or leave out.</p>
   <table class="tbl"><thead><tr><th>In attendance</th><th>Match to</th><th></th></tr></thead><tbody>${unknown.map((a, i) => `<tr><td><b>${esc(a.rawName || '')}</b> <span class="muted mono">${esc(a.rawCode || '')}</span> · ${a.PD} days</td><td><select class="in" data-un="${i}"><option value="">— leave out —</option>${emps.map(e => `<option value="${e.code}">${e.code} · ${esc(e.name)}</option>`).join('')}</select></td><td><button class="btn sm" data-ap="${i}">Apply</button></td></tr>`).join('')}</tbody></table></div>` : ''}
  ${run.missing && run.missing.length ? `<div class="note warn" style="margin-bottom:12px"><b>${run.missing.length} active employees are not in the attendance:</b> ${run.missing.map(c => `${c} ${esc((byCode[c] || {}).name || '')}`).join(', ')}. <button class="btn sm" id="addmiss" ${locked ? 'disabled' : ''}>Add them with 0 days</button> or mark them as exited in Employees & IOM.</div>` : ''}
  ${fin ? `<div class="note" style="margin-bottom:12px;display:flex;align-items:center;gap:12px"><span class="grow"><b>Attendance finalized</b> on ${new Date(run.attFinalAt).toLocaleString('en-IN')}${nHold ? ` · ${nHold} salar${nHold === 1 ? 'y' : 'ies'} held in full` : ''}. Editing is closed.</span>${lockedRun ? '' : '<button class="btn sm" id="reopen">Reopen attendance</button>'}<button class="btn sm pri" onclick="S.proc.step=3;render()">Open salary sheet →</button></div>` : ''}
  <div class="card flush"><div class="chead"><div class="grow"><h2>Attendance & one-off deductions</h2><div class="small muted">${run.att.length} rows · ${flagged ? `<span class="flag">${flagged} flagged</span>` : 'no flags'}${nHold ? ` · <b>${nHold}</b> salary hold${nHold === 1 ? '' : 's'}` : ''} · loan EMIs and advances come from the loan register</div></div>
   ${fin ? '' : `<button class="btn pri" id="finalize" ${gaps.length ? `disabled title="Salary not added for ${gaps.length} employee(s)"` : ''}>Finalize attendance & process salary →</button>`}</div>
  <div class="scroll"><table class="tbl nw" id="rtbl"><thead><tr><th>Code</th><th>Name</th><th>Desig.</th>${usedCols.map(([, t]) => `<th class="n">${t}</th>`).join('')}${deds.map(d => `<th class="n">${esc(d.label)}</th>`).join('')}<th>Hold full salary</th><th>Flags</th></tr></thead><tbody>
  ${run.att.map((a, i) => { const e = byCode[a.code] || {}; const dd = (run.ded || {})[a.code] || {};
    return `<tr class="${dd.HOLD_ALL ? 'held' : ''}" style="${a.skip ? 'opacity:.4' : ''}"><td class="mono">${esc(a.code)}</td><td>${esc(e.name || a.rawName || '')}</td><td class="small">${esc(e.desig || '')}</td>
    ${usedCols.map(([k]) => `<td class="n"><input class="cell" data-i="${i}" data-k="${k}" value="${a[k] ?? (k === 'WD' ? '' : 0)}" ${locked ? 'disabled' : ''} placeholder="${k === 'WD' ? (site.divisor.type === 'fixed' ? site.divisor.days : siteCalWD(site)) : ''}"></td>`).join('')}
    ${deds.map(d => `<td class="n"><input class="cell" data-i="${i}" data-d="${d.code}" value="${dd[d.code] || ''}" ${locked ? 'disabled' : ''}></td>`).join('')}
    <td>${locked ? (dd.HOLD_ALL ? `<span class="pill p-bad">Held · ${esc(dd.HOLD_ALL)}</span>` : '') : `<select class="in" data-hold="${i}" style="width:170px;${dd.HOLD_ALL ? 'color:var(--bad);font-weight:600' : ''}"><option value="">—</option>${HOLD_REASONS.map(h => `<option ${dd.HOLD_ALL === h ? 'selected' : ''}>${h}</option>`).join('')}</select>`}</td>
    <td>${gapSet.has(a.code) && !a.skip ? '<span class="flag bad">Salary not added</span>' : ''}${a.flags.map(f => `<span class="flag ${/Unknown|>/.test(f) ? 'bad' : ''}">${esc(f)}</span>`).join('')}</td></tr>`; }).join('')}
  </tbody></table></div></div>`;
  let t = null; const persist = () => { clearTimeout(t); t = setTimeout(async () => { validateAtt(site, run); await saveRun(run); }, 700); };
  b.querySelectorAll('input.cell').forEach(inp => inp.onchange = () => {
    const a = run.att[+inp.dataset.i];
    if (inp.dataset.k) { if (inp.dataset.k === 'WD' && inp.value === '') delete a.WD; else a[inp.dataset.k] = num(inp.value); }
    else { run.ded = run.ded || {}; const d = run.ded[a.code] = run.ded[a.code] || {}; if (inp.value === '') delete d[inp.dataset.d]; else d[inp.dataset.d] = num(inp.value); }
    persist();
  });
  b.querySelectorAll('[data-ap]').forEach(btn => btn.onclick = async () => {
    const a = unknown[+btn.dataset.ap]; const sel = b.querySelector(`[data-un="${btn.dataset.ap}"]`).value;
    if (!sel) { a.skip = true; } else { const raw = a.rawCode || a.rawName; a.code = sel; a.matched = true; const e = emps.find(x => x.code === sel); if (e && raw && raw !== sel) { e.clientId = raw; await put('employees/' + site.id, { list: emps }); } }
    validateAtt(site, run); await saveRun(run); render();
  });
  b.querySelectorAll('[data-hold]').forEach(sel => sel.onchange = async () => {
    const a = run.att[+sel.dataset.hold]; run.ded = run.ded || {}; const d = run.ded[a.code] = run.ded[a.code] || {};
    if (sel.value) d.HOLD_ALL = sel.value; else delete d.HOLD_ALL;
    await saveRun(run); render();
  });
  b.querySelectorAll('[data-setsal]').forEach(x => x.onclick = () => setSalaryFromRun(site, +x.dataset.setsal));
  b.querySelectorAll('[data-skipsal]').forEach(x => x.onclick = () => confirmModal('Leave out of this month?', 'This employee will not be paid in this salary run. You can add them back by reloading attendance.', async () => { const a = run.att.find(r => r.code === x.dataset.skipsal); if (a) a.skip = true; await saveRun(run); render(); toast('Left out of this month'); }));
  const fz = $('#finalize'); if (fz) fz.onclick = () => {
    const sgp = salaryGaps(site, run); if (sgp.length) { toast(`Salary not added for ${sgp.slice(0, 3).map(g => `${g.e.name} (${g.e.code})`).join(', ')}${sgp.length > 3 ? ` +${sgp.length - 3} more` : ''}`); return; }
    const unk = run.att.filter(a => !byCode[a.code] && !a.skip).length;
    const go3 = async () => { run.attFinalAt = new Date().toISOString(); await saveRun(run); S.proc.step = 3; render(); toast('Attendance finalized — salary processed'); };
    const msg = [flagged ? `${flagged} rows are still flagged.` : '', unk ? `${unk} unmatched people will be left out of salary.` : '', nHold ? `${nHold} salar${nHold === 1 ? 'y is' : 'ies are'} marked to hold in full.` : ''].filter(Boolean).join(' ');
    if (msg) confirmModal('Finalize attendance?', msg + ' Attendance editing will close; you can reopen it until salary is locked.', go3); else go3();
  };
  const ro = $('#reopen'); if (ro) ro.onclick = async () => { delete run.attFinalAt; run.reopenLog = (run.reopenLog || []).concat({ at: new Date().toISOString() }); await saveRun(run); render(); };
  const am = $('#addmiss'); if (am) am.onclick = async () => { run.missing.forEach(c => run.att.push({ code: c, PD: 0, OTD: 0, OTH: 0, NH: 0, WOT: 0 })); validateAtt(site, run); await saveRun(run); render(); };
}

// ----- Step 3: salary sheet -----
function sheetCols(site, run) { const c = site.components.filter(c => !c.off && c.type !== 'C'); if (!c.some(x => x.code === 'HELD')) c.push({ code: 'HELD', label: 'Held', type: 'D', virtual: true }); if (run && run.rows.some(x => x.r.lines.XS_RECOVERY)) c.push({ code: 'XS_RECOVERY', label: 'Excess pay recovery', type: 'D', virtual: true }); return c; }
function stepSheet(b, site, run, locked) {
  if (!run.att || !run.att.length) { b.innerHTML = '<div class="card empty">Load attendance first.</div>'; return; }
  const c = computeRun(site, run); let base = null;
  if (S.proc.type === 'SUP') { const reg = S.runs[runId(site.id, S.month, 'REG')]; if (reg && reg.status === 'LOCKED') base = computeRun(site, reg); }
  const baseBy = base ? Object.fromEntries(base.rows.map(x => [x.emp.code, x])) : null;
  const comps = sheetCols(site, c); const E_ = comps.filter(x => x.type === 'E'), D_ = comps.filter(x => x.type === 'D'), X_ = comps.filter(x => x.type === 'X');
  const groups = [...new Set(X_.map(x => x.group))]; const hasArr = c.rows.some(x => x.r.lines.ARREAR_NET);
  const val = (x, k) => { const v = k === 'GROSS' ? x.r.GROSS : k === 'DED' ? x.r.DED : k === 'NET' ? x.r.NET : (x.r.lines[k] || 0); if (!baseBy) return v; const bx = baseBy[x.emp.code]; const bv = !bx ? 0 : k === 'GROSS' ? bx.r.GROSS : k === 'DED' ? bx.r.DED : k === 'NET' ? bx.r.NET : (bx.r.lines[k] || 0); return v - bv; };
  const body = c.rows.map(x => {
    const hf = x.r.heldFull;
    return `<tr class="${hf ? 'held' : ''}"><td class="mono">${esc(x.emp.code)}</td><td>${esc(x.emp.name)}${hf ? ` <span class="pill p-bad" title="Salary held in full after statutory deductions">Held · ${esc(hf.reason)}</span>` : ''}</td><td class="small muted">${esc(x.emp.desig || '')}</td><td class="n">${inr(x.emp.rate, x.emp.rate % 1 ? 2 : 0)}</td><td class="n">${x.att.PD}</td>
    ${E_.map(k => `<td class="n">${inr(val(x, k.code))}</td>`).join('')}<td class="n b">${inr(val(x, 'GROSS'))}</td>
    ${D_.map(k => `<td class="n">${inr(val(x, k.code))}</td>`).join('')}<td class="n">${inr(val(x, 'DED'))}</td>${hasArr ? `<td class="n">${inr(x.r.lines.ARREAR_NET || 0)}</td>` : ''}<td class="n b">${inr(val(x, 'NET'))}</td>
    ${groups.map(g => `<td class="n">${inr(x.r.groups[g] || 0)}</td>`).join('')}</tr>`;
  }).join('');
  const sum = k => c.rows.reduce((s, x) => s + val(x, k), 0);
  const errs = run._errors || []; delete run._errors;
  const arrN = c.rows.filter(x => x.r.lines.ARREAR_NET), recN = c.rows.filter(x => x.r.lines.XS_RECOVERY), shortN = c.rows.filter(x => x.r.recoveryShort);
  const extraNote = arrN.length || recN.length || shortN.length ? `<div class="note" style="margin-bottom:12px">${arrN.length ? `<b>Arrears:</b> ₹${inr(arrN.reduce((t, x) => t + x.r.lines.ARREAR_NET, 0))} net for ${arrN.length} employee${arrN.length === 1 ? '' : 's'} from the approved arrear sheet is added to net pay (their PF / ESIC arrears are on the arrear sheet). ` : ''}${recN.length ? `<b>Excess pay recovery:</b> ₹${inr(recN.reduce((t, x) => t + x.r.lines.XS_RECOVERY, 0))} from ${recN.length} employee${recN.length === 1 ? '' : 's'}. ` : ''}${shortN.length ? `₹${inr(shortN.reduce((t, x) => t + x.r.recoveryShort, 0))} carried forward to keep deductions within 50% of wages.` : ''}</div>` : '';
  b.innerHTML = `${extraNote}${errs.length ? `<div class="note warn" style="margin-bottom:12px"><b>${errs.length} employees could not be calculated</b> — fix the site formulas in Site setup: ${esc(errs.slice(0, 3).join(' · '))}</div>` : ''}
  ${(() => { const hs = c.rows.filter(x => x.r.heldFull); if (!hs.length) return ''; const amt = hs.reduce((a, x) => a + x.r.heldFull.amount + x.r.heldFull.payoutTotal, 0); return `<div class="note warn" style="margin-bottom:12px"><b>${hs.length} salar${hs.length === 1 ? 'y' : 'ies'} held in full</b> (${hs.map(x => esc(x.emp.name)).join(', ')}): ₹${inr(amt)} held. PF, ESIC, PT and LWF are still deducted and filed; net pay is ₹0 and they are left out of the bank file. They appear in Held salary when this run is locked.</div>`; })()}
  <div class="card"><div class="row" style="margin-bottom:10px"><h2 class="grow" style="margin:0">${S.proc.type === 'SUP' ? 'Difference to pay (supplementary)' : 'Salary sheet'} — ${esc(site.name)} — ${monthName()}</h2>
   <button class="btn" id="dlsheet">Download salary sheet (.xlsx)</button><button class="btn pri" onclick="S.proc.step=4;render()">Lock & files →</button></div>
  <div class="scroll"><table class="tbl nw"><thead><tr><th>Code</th><th>Name</th><th>Desig.</th><th class="n">Rate</th><th class="n">Paid days</th>
   ${E_.map(k => `<th class="n">${esc(k.label)}</th>`).join('')}<th class="n">Gross</th>${D_.map(k => `<th class="n">${esc(k.label)}</th>`).join('')}<th class="n">Total ded.</th>${hasArr ? '<th class="n">Arrears (net)</th>' : ''}<th class="n">Net payable</th>
   ${groups.map(g => `<th class="n">${esc(g)} (separate)</th>`).join('')}</tr></thead>
  <tbody>${body}</tbody><tfoot><tr><td colspan="4">Total · ${c.rows.length} employees</td><td class="n">${inr(c.rows.reduce((s, x) => s + x.att.PD, 0), 2)}</td>
   ${E_.map(k => `<td class="n">${inr(sum(k.code))}</td>`).join('')}<td class="n">${inr(sum('GROSS'))}</td>${D_.map(k => `<td class="n">${inr(sum(k.code))}</td>`).join('')}<td class="n">${inr(sum('DED'))}</td>${hasArr ? `<td class="n">${inr(c.rows.reduce((t, x) => t + (x.r.lines.ARREAR_NET || 0), 0))}</td>` : ''}<td class="n">${inr(sum('NET'))}</td>
   ${groups.map(g => `<td class="n">${inr(c.tot.groups[g] || 0)}</td>`).join('')}</tr></tfoot></table></div></div>
  <div class="grid g3">
   <div class="card"><h2>Employer cost</h2><table class="tbl">${['EPF', 'EPS', 'EDLI', 'ADMIN', 'ESI', 'LWF'].map(k => `<tr><td>${{ EPF: 'Employer EPF (3.67% + balance)', EPS: 'EPS 8.33%', EDLI: 'EDLI 0.5%', ADMIN: 'PF admin 0.5%', ESI: 'Employer ESIC 3.25%', LWF: 'Employer LWF' }[k]}</td><td class="n">₹${inr(c.rows.reduce((s, x) => s + x.r.er[k], 0))}</td></tr>`).join('')}<tfoot><tr><td>Total</td><td class="n">₹${inr(c.tot.er)}</td></tr></tfoot></table></div>
   <div class="card"><h2>Separate payouts</h2>${groups.length ? `<table class="tbl">${groups.map(g => `<tr><td>${esc(g)}</td><td class="n">₹${inr(c.tot.groups[g] || 0)}</td></tr>`).join('')}</table><p class="small muted">Paid as their own sheet and bank file, outside PF/ESI unless the component is flagged.</p>` : '<p class="muted">None at this site.</p>'}</div>
   <div class="card"><h2>Labour Code 50% test</h2>${site.labourCode50 ? `<p>Switched on. Employees whose excluded allowances exceed 50% of pay: <b>${c.rows.filter(x => x.r.codeWagesAddBack > 0).length}</b>; total add-back to wages ₹${inr(c.rows.reduce((s, x) => s + (x.r.codeWagesAddBack || 0), 0))}.</p>` : '<p class="muted">Switched off for this site (Site setup → General).</p>'}</div>
  </div>`;
  $('#dlsheet').onclick = () => downloadSalarySheet(site, run, c);
}
function salaryAoa(site, c, title) {
  const comps = sheetCols(site, c); const hasArr = c.rows.some(x => x.r.lines.ARREAR_NET); const E_ = comps.filter(x => x.type === 'E'), D_ = comps.filter(x => x.type === 'D');
  const hdr = ['Sr. No.', 'Emp. Code', 'Employee Name', 'Bank Account Number', 'IFSC Code', 'Designation', 'Working Days', 'Salary Rate', 'Basic Rate', 'Paid Days', 'OT Days', 'OT Hours', 'NH/PH', ...E_.map(x => x.label), 'Gross Earning', ...D_.map(x => x.label), 'Total Ded.', ...(hasArr ? ['Arrears (net)'] : []), 'Net Payable', 'Remarks'];
  const rows = c.rows.map((x, i) => [i + 1, x.emp.code, x.emp.name, x.emp.acct || '', x.emp.ifsc || '', x.emp.desig || '', x.att.WD || (site.divisor.type === 'fixed' ? site.divisor.days : siteCalWD(site)), x.emp.rate, x.emp.basic ?? (site.params || {}).BASIC ?? '', x.att.PD, x.att.OTD || 0, x.att.OTH || 0, x.att.NH || 0,
    ...E_.map(k => x.r.lines[k.code] || 0), x.r.GROSS, ...D_.map(k => x.r.lines[k.code] || 0), x.r.DED, ...(hasArr ? [x.r.lines.ARREAR_NET || 0] : []), x.r.NET, [x.r.heldFull ? `Salary held — ${x.r.heldFull.reason}` : '', x.r.lines.ARREAR_NET ? 'Includes arrears (see arrear sheet)' : '', x.r.recoveryShort ? `Recovery ₹${x.r.recoveryShort} carried forward (50% limit)` : ''].filter(Boolean).join('; ')]);
  const tot = hdr.map((h, j) => j < 9 ? (j === 2 ? 'TOTAL' : '') : j === hdr.length - 1 ? '' : rows.reduce((s, r) => s + (+r[j] || 0), 0));
  return [['Indus Fire Safety Private Limited'], [site.name + (site.oc ? ` (O.C. No. ${site.oc})` : '')], [title], [], hdr, ...rows, tot];
}
function downloadSalarySheet(site, run, c) {
  const sheets = [{ name: monthName(), rows: salaryAoa(site, c, `Salary sheet for the month of ${monthName()}`), cols: [6, 9, 28, 18, 13, 14, 8, 10, 9, 8, 7, 7, 7] }];
  const X_ = sheetCols(site).filter(x => x.type === 'X'); const groups = [...new Set(X_.map(x => x.group))];
  for (const g of groups) {
    const rows = c.rows.filter(x => x.r.groups[g]).map((x, i) => [i + 1, x.emp.code, x.emp.name, x.emp.acct || '', x.emp.ifsc || '', x.emp.desig || '', x.att.PD, x.r.groups[g], 0, x.r.groups[g]]);
    sheets.push({ name: g + ' ' + monthName(), rows: [['Indus Fire Safety Private Limited'], [site.name], [`${g} — ${monthName()}`], [], ['Sr. No.', 'Emp. Code', 'Employee Name', 'Bank Account Number', 'IFSC Code', 'Designation', 'Paid Days', 'Amount', 'Held', 'Net Payable'], ...rows, ['', '', 'TOTAL', '', '', '', '', rows.reduce((s, r) => s + r[7], 0), 0, rows.reduce((s, r) => s + r[9], 0)]], cols: [6, 9, 28, 18, 13, 14, 8, 10, 8, 10] });
  }
  saveFile(`Salary_${site.id}_${S.month}${S.proc.type !== 'REG' ? '_' + S.proc.type : ''}.xlsx`, xlsxBytes(sheets));
}

// ----- Step 4: lock & files -----
function stepLock(b, site, run, locked) {
  if (!run.att || !run.att.length) { b.innerHTML = '<div class="card empty">Load attendance first.</div>'; return; }
  const c = computeRun(site, run); const flagged = run.att.filter(a => a.flags && a.flags.length).length;
  const sg = locked ? [] : salaryGaps(site, run);
  const groups = [...new Set(sheetCols(site).filter(x => x.type === 'X').map(x => x.group))];
  b.innerHTML = `<div class="grid g2">
   <div class="card"><h2>${locked ? 'Locked' : 'Finalise this run'}</h2>
    ${locked ? `<p>Locked on <b>${new Date(run.lockedAt).toLocaleString('en-IN')}</b>. Registers, PF/ESIC files and bank files now use these figures. Loan recoveries and held amounts were posted to their registers.</p>
     <button class="btn danger" id="unlock">Unlock to correct…</button>` :
     `<p>${c.rows.length} employees · gross ₹${inr(c.tot.GROSS)} · net ₹${inr(c.tot.NET)}</p>
     ${flagged ? `<div class="note warn" style="margin-bottom:10px">${flagged} rows still have flags. You can lock anyway; the flags stay on record.</div>` : ''}
     <p class="small muted">Locking freezes the salary sheet, posts loan/advance recoveries and held salary to their registers, and makes the run available to Registers & files.</p>
     ${sg.length ? `<div class="note" style="border-color:#fda29b;background:var(--badbg);color:var(--bad);margin-bottom:10px"><b>Salary not added for ${sg.length} employee${sg.length === 1 ? '' : 's'}</b> — ${sg.slice(0, 8).map(g => `${esc(g.e.name)} (${esc(g.e.code)})`).join(', ')}${sg.length > 8 ? ` and ${sg.length - 8} more` : ''}. Reopen attendance and set the salary or leave them out before locking.</div>` : ''}
     <button class="btn pri" id="lock" ${sg.length ? 'disabled' : ''}>Lock ${monthName()}</button>`}
   </div>
   <div class="card"><h2>Files for this site</h2><div class="grid" style="gap:8px">
    <button class="btn" id="f1">Salary sheet (.xlsx, with separate-payout sheets)</button>
    <button class="btn" id="f2">Bank transfer file — salary (.csv)</button>
    ${groups.map(g => `<button class="btn" data-g="${esc(g)}">Bank transfer file — ${esc(g)} (.csv)</button>`).join('')}
    <button class="btn" id="f3">Payslips (.html, one per page)</button>
    <button class="btn" id="f4">Wage register — ${site.registerSet === 'CODE' ? 'Form IV (Labour Code)' : 'Form XVII (CLRA)'} (.xlsx)</button>
    </div><p class="small muted">All PF, ESIC and statutory registers across sites are in Registers & files.</p></div></div>`;
  $('#f1').onclick = () => downloadSalarySheet(site, run, c);
  $('#f2').onclick = () => bankFile(site, c, null);
  b.querySelectorAll('[data-g]').forEach(x => x.onclick = () => bankFile(site, c, x.dataset.g));
  $('#f3').onclick = () => payslips([{ site, c }]);
  $('#f4').onclick = () => { const set = site.registerSet === 'CODE' ? 'CODE_IV' : 'XVII'; downloadRegister(set, [{ site, c, run }]); };
  const L = $('#lock'); if (L) L.onclick = async () => {
    run.status = 'LOCKED'; run.lockedAt = new Date().toISOString(); run.lockedBy = (S.user && (S.user.name || S.user.email)) || '';
    run.snap = JSON.parse(JSON.stringify({ components: site.components, params: site.params || {}, designationParams: site.designationParams || {}, divisor: site.divisor, rateType: site.rateType, rounding: site.rounding, esi: site.esi, labourCode50: !!site.labourCode50, state: site.state, stat: site.stat || null }));
    run.summary = { heads: c.rows.length, gross: c.tot.GROSS, net: c.tot.NET, er: c.tot.er };
    run.pay = Object.fromEntries(c.rows.map(x => { const m = empsOf(site.id).find(e => String(e.code) === String(x.emp.code)) || x.emp; return [m.code, payOf(m)]; }));
    run.ded = run.ded || {};
    for (const x of c.rows) {
      const d = run.ded[x.emp.code] = run.ded[x.emp.code] || {}; if (d.LOAN == null) d.LOAN = x.ded.LOAN; if (d.ADV == null) d.ADV = x.ded.ADV;
      for (const it of x.loanItems) { const l = S.loans[it.id]; if (!l) continue; l.recovered = (l.recovered || []).filter(r => r.month !== S.month); l.recovered.push({ month: S.month, amt: it.amt, site: site.id }); await put('loans/' + it.id, strip(l)); }
      const heldAmt = (x.r.lines.HELD || 0) + (x.r.heldFull ? x.r.heldFull.payoutTotal : 0);
      const hid = `${site.id}_${S.month}_${x.emp.code}`; const prev = S.held[hid] || {};
      if (heldAmt > 0) {
        const L = x.r.lines;
        await put('held/' + hid, { siteId: site.id, siteName: site.name, client: site.client, empCode: x.emp.code, name: x.emp.name, desig: x.emp.desig || '', month: S.month,
          kind: x.r.heldFull ? 'FULL' : 'PART', reason: x.r.heldFull ? x.r.heldFull.reason : (prev.reason || ''), paidDays: x.att.PD, gross: x.r.GROSS,
          pf: L.PF || 0, esi: L.ESI || 0, pt: L.PT || 0, lwf: L.LWF || 0, otherDed: x.r.DED - (L.HELD || 0) - (L.PF || 0) - (L.ESI || 0) - (L.PT || 0) - (L.LWF || 0),
          salaryHeld: L.HELD || 0, payoutsHeld: x.r.heldFull ? x.r.heldFull.payouts : {}, amount: heldAmt, acct: x.emp.acct || '', ifsc: x.emp.ifsc || '', uan: x.emp.uan || '',
          heldOn: new Date().toISOString(), status: prev.status === 'RELEASED' ? 'RELEASED' : 'HELD', release: prev.release || null });
      } else if (S.held[hid] && prev.status !== 'RELEASED') await del('held/' + hid);
    }
    for (const a of Object.values(S.arrears)) if (a.siteId === site.id && a.payMode === 'SALARY' && a.payMonth === S.month && a.status === 'APPROVED') { const doc = Object.assign({}, a, { status: 'PAID', paidAt: new Date().toISOString(), paidIn: S.month }); delete doc._id; await put('arrears/' + a.id, doc); S.arrears[a.id] = Object.assign({ _id: a.id }, doc); }
    await saveRun(run); toast('Locked'); render();
  };
  const U = $('#unlock'); if (U) U.onclick = () => confirmModal('Unlock this run?', 'Registers and files will use the corrected figures after you lock again. Loan recoveries for this month are recalculated on re-lock.', async () => { run.status = 'DRAFT'; run.unlockLog = (run.unlockLog || []).concat({ at: new Date().toISOString(), by: (S.user && (S.user.name || S.user.email)) || '' }); for (const a of Object.values(S.arrears)) if (a.siteId === site.id && a.status === 'PAID' && a.paidIn === S.month && a.payMode === 'SALARY') { const doc = Object.assign({}, a, { status: 'APPROVED' }); delete doc._id; delete doc.paidAt; delete doc.paidIn; await put('arrears/' + a.id, doc); S.arrears[a.id] = Object.assign({ _id: a.id }, doc); } await saveRun(run); render(); });
}
function closeModal() { $('#modal').innerHTML = ''; if (S.pendingRender) { S.pendingRender = false; render(); } }
function confirmModal(title, text, ok) {
  $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:460px"><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="row" style="justify-content:flex-end"><button class="btn" id="cn">Cancel</button><button class="btn pri" id="cy">Confirm</button></div></div></div>`;
  $('#cn').onclick = () => closeModal(); $('#cy').onclick = () => { closeModal(); ok(); };
}
function bankFile(site, c, group) {
  const csvq = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const rows = c.rows.map(x => ({ x, amt: group ? (x.r.groups[group] || 0) : x.r.NET })).filter(r => r.amt > 0);
  const lines = [['Sr No', 'Beneficiary Name', 'Account Number', 'IFSC', 'Amount', 'Emp Code', 'Narration'].join(',')].concat(rows.map((r, i) => [i + 1, r.x.emp.name, "'" + (r.x.emp.acct || ''), r.x.emp.ifsc || '', r.amt.toFixed(2), r.x.emp.code, `${group || 'Salary'} ${monthName()}`].map(csvq).join(',')));
  const missing = rows.filter(r => !r.x.emp.acct || !r.x.emp.ifsc).length;
  if (missing) toast(`${missing} employees have no bank account or IFSC in the master`);
  saveFile(`Bank_${group || 'Salary'}_${site.id}_${S.month}.csv`, lines.join('\r\n'));
}

// ----- payslips (Form XIX / Form V) -----
function payslips(list) {
  const css = `body{font:12px Arial;margin:0}.slip{page-break-after:always;padding:18px 26px;max-width:760px;margin:auto}.h{text-align:center;border-bottom:2px solid #222;padding-bottom:6px;margin-bottom:8px}.h b{font-size:15px}table{width:100%;border-collapse:collapse;margin-top:6px}td,th{border:1px solid #999;padding:4px 6px;text-align:left}td.n{text-align:right}.g{display:grid;grid-template-columns:1fr 1fr;gap:2px 20px}.f{margin-top:22px;display:flex;justify-content:space-between}`;
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Payslips ${monthName()}</title><style>${css}</style></head><body>`;
  for (const { site, c } of list) {
    const comps = sheetCols(site); const E_ = comps.filter(x => x.type === 'E'), D_ = comps.filter(x => x.type === 'D');
    for (const x of c.rows) {
      const form = site.registerSet === 'CODE' ? 'Form V — Wage slip [Code on Wages (Central) Rules, 2026]' : 'Form XIX — Wage slip [Rule 78(1)(b), Contract Labour (R&A) Central Rules]';
      html += `<div class="slip"><div class="h"><div class="small">${form}</div><b>Indus Fire Safety Private Limited</b><div>Indus House, Block No-501, Opp. GSFC Main Gate, Dashrath, Vadodara</div></div>
      <div class="g"><div>Establishment: <b>${esc(site.name)}</b></div><div>Wage period: <b>${monthName()}</b></div><div>Name: <b>${esc(x.emp.name)}</b></div><div>Emp. code: <b>${esc(x.emp.code)}</b></div>
      <div>Designation: ${esc(x.emp.desig || '')}</div><div>Father's name: ${esc(x.emp.father || '')}</div><div>UAN: ${esc(x.emp.uan || '')}</div><div>ESIC IP: ${esc(x.emp.esicNo || '')}</div>
      <div>Rate of wages: ₹${inr(x.emp.rate, 2)} ${x.emp.rateType === 'D' || site.rateType === 'D' ? '/day' : '/month'}</div><div>Days worked: ${x.att.PD} · OT: ${x.att.OTD || 0} days / ${x.att.OTH || 0} hrs</div><div>Bank A/c: ${esc(x.emp.acct || '')} (${esc(x.emp.ifsc || '')})</div></div>
      <table><tr><th>Earnings</th><th class="n">₹</th><th>Deductions</th><th class="n">₹</th></tr>
      ${Array.from({ length: Math.max(E_.length, D_.length) }, (_, i) => `<tr><td>${E_[i] ? esc(E_[i].label) : ''}</td><td class="n">${E_[i] ? inr(x.r.lines[E_[i].code] || 0) : ''}</td><td>${D_[i] ? esc(D_[i].label) : ''}</td><td class="n">${D_[i] ? inr(x.r.lines[D_[i].code] || 0) : ''}</td></tr>`).join('')}
      <tr><th>Gross</th><th class="n">${inr(x.r.GROSS)}</th><th>Total deductions</th><th class="n">${inr(x.r.DED)}</th></tr>
      <tr><th colspan="3">Net payable</th><th class="n">₹${inr(x.r.NET)}</th></tr></table>
      ${x.r.heldFull ? `<p><b>Salary held — ${esc(x.r.heldFull.reason)}.</b> Statutory deductions made; ₹${inr(x.r.heldFull.amount + x.r.heldFull.payoutTotal)} will be released on return to duty.</p>` : ''}
      ${Object.keys(x.r.groups).length ? `<p>Paid separately: ${Object.entries(x.r.groups).map(([g, v]) => `${esc(g)} ₹${inr(v)}`).join(' · ')}</p>` : ''}
      <div class="f"><span>Employee's signature / thumb impression</span><span>For Indus Fire Safety Pvt Ltd (Contractor)</span></div></div>`;
    }
  }
  saveFile(`Payslips_${list.length === 1 ? list[0].site.id : 'All'}_${S.month}.html`, html + '</body></html>');
}

// ----- Arrears -----
// net arrears an employee gets with a month's salary
function arrearsFor(sid, code, month) { let t = 0; for (const a of Object.values(S.arrears || {})) { if (a.siteId !== sid || a.payMode !== 'SALARY' || a.payMonth !== month || !['APPROVED', 'PAID'].includes(a.status)) continue; const r = (a.rows || []).find(x => String(x.code) === String(code)); if (r) t += r.tot.net; } return t; }
const ARR_REASONS = ['Minimum wage revision', 'Salary increment', 'Client rate revision', 'Wage settlement / court order', 'Other'];
// recalculate a locked month for some employees with revised rates; returns per-employee differences
function arrearCalc(site, A) {
  const months = Object.values(S.runs).filter(r => r.siteId === site.id && r.type === 'REG' && r.status === 'LOCKED' && r.month >= A.from && r.month <= A.to).sort((a, b) => a.month.localeCompare(b.month));
  const emps = empsOf(site.id); const inScope = e => A.scope === 'all' || (A.scope === 'desig' ? (A.desigs || []).includes(e.desig) : (A.codes || []).includes(String(e.code)));
  const chg = (v, c) => { if (!c || c.val === '' || c.val == null) return v; const n = +c.val; return c.mode === 'set' ? n : c.mode === 'add' ? (+v || 0) + n : Math.round((+v || 0) * (1 + n / 100) * 100) / 100; };
  // with a revision: each employee's own revised rates; otherwise the change rule, applied to what was paid that month
  const reviseOne = e => { if (A.revRows) { const o = A.revRows[String(e.code)]; if (!o) return null; const n = JSON.parse(JSON.stringify(e)); for (const [f, v] of Object.entries(o)) setEmpVal(n, f, v); return n; }
    return Object.assign({}, e, { rate: chg(e.rate, A.rate), basic: e.basic != null || (A.basic && A.basic.mode === 'set') ? chg(e.basic, A.basic) : e.basic }); };
  const per = {}; const sk = ['PF', 'ESI', 'PT', 'LWF'];
  for (const run of months) {
    const base = Object.assign({}, site, run.snap ? { stat: null } : {}, run.snap || {}); const rev = Object.assign({}, base, { params: Object.assign({}, base.params || {}, A.params || {}) });
    const [y, m] = run.month.split('-').map(Number); const ctx = { month: m, year: y, calendarWD: siteCalWD(base, run.month) };
    for (const a of run.att || []) {
      if (a.skip) continue; const m0 = emps.find(e => String(e.code) === String(a.code)); if (!m0 || !inScope(m0)) continue; const e0 = empAt(run, m0); const e1 = reviseOne(e0); if (!e1) continue;
      const ded = Object.assign({}, (run.ded || {})[a.code] || {}); delete ded.HOLD_ALL;
      let o, n; try { o = E.calcEmployee(base, e0, a, ded, ctx); n = E.calcEmployee(rev, e1, a, ded, ctx); } catch (err) { continue; }
      const d = { month: run.month, pd: a.PD || 0, lines: {}, pfw: n.pfWages - o.pfWages, epsw: n.epsWages - o.epsWages, edliw: (n.edliWages != null ? n.edliWages : n.epsWages) - (o.edliWages != null ? o.edliWages : o.epsWages), esiw: (n.lines.ESI > 0 || o.lines.ESI > 0) ? n.ESIW - o.ESIW : 0, er: {} };
      for (const c of base.components) if ((c.type === 'E' || sk.includes(c.code)) && !c.input) { const v = (n.lines[c.code] || 0) - (o.lines[c.code] || 0); if (v) d.lines[c.code] = v; }
      ['EPF', 'EPS', 'EDLI', 'ADMIN', 'ESI'].forEach(k => d.er[k] = (n.er[k] || 0) - (o.er[k] || 0));
      d.gross = n.GROSS - o.GROSS; if (!A.includePT) delete d.lines.PT; delete d.lines.LWF;
      if (!d.gross && !d.lines.PF && !d.lines.ESI) continue;
      const p = per[a.code] = per[a.code] || { code: String(a.code), name: e0.name, desig: e0.desig || '', uan: e0.uan || '', esicNo: e0.esicNo || '', acct: e0.acct || '', ifsc: e0.ifsc || '', months: [] };
      p.months.push(d);
    }
  }
  const rows = Object.values(per).map(p => { const t = { gross: 0, PF: 0, ESI: 0, PT: 0, pfw: 0, epsw: 0, edliw: 0, esiw: 0, EPF: 0, EPS: 0, EDLI: 0, ADMIN: 0, ESI_ER: 0, lines: {} };
    p.months.forEach(d => { t.gross += d.gross; t.PF += d.lines.PF || 0; t.ESI += d.lines.ESI || 0; t.PT += d.lines.PT || 0; t.pfw += d.pfw; t.epsw += d.epsw; t.edliw += d.edliw || 0; t.esiw += d.esiw; t.EPF += d.er.EPF; t.EPS += d.er.EPS; t.EDLI += d.er.EDLI; t.ADMIN += d.er.ADMIN; t.ESI_ER += d.er.ESI; for (const [k, v] of Object.entries(d.lines)) if (!sk.includes(k)) t.lines[k] = (t.lines[k] || 0) + v; });
    t.net = Math.round(t.gross - t.PF - t.ESI - t.PT); return Object.assign(p, { tot: t }); }).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  return { months: months.map(r => r.month), rows };
}
function vArrears(p, site) {
  const list = Object.values(S.arrears).filter(a => a.siteId === site.id).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const lockedMonths = Object.values(S.runs).filter(r => r.siteId === site.id && r.type === 'REG' && r.status === 'LOCKED').map(r => r.month).sort();
  const AR = S.arr && S.arr.siteId === site.id ? S.arr : null;
  if (AR) return arrearEditor(p, site, AR, lockedMonths);
  const st = a => ({ DRAFT: ['Draft', 'p-mute'], APPROVED: [a.payMode === 'SALARY' ? `To be paid with ${monthName(a.payMonth)} salary` : 'Approved — to be paid', 'p-pri'], PAID: ['Paid' + (a.paidIn ? ' with ' + monthName(a.paidIn) + ' salary' : ''), 'p-ok'] })[a.status] || [a.status, 'p-mute'];
  p.insertAdjacentHTML('beforeend', `<div class="card flush"><div class="chead"><div class="grow"><h2>Arrear sheets — ${esc(site.name)}</h2><div class="small muted">For a wage revision given with a back date: each locked month is recalculated with the new rates on the same attendance, and the difference is paid with PF and ESIC arrears.</div></div><button class="btn pri" id="ar_new" ${lockedMonths.length ? '' : 'disabled title="Arrears are worked out from locked months"'}>+ New arrear sheet</button></div>
   ${list.length ? `<table class="tbl nostick"><thead><tr><th>Period</th><th>Reason</th><th class="n">Employees</th><th class="n">Gross arrears</th><th class="n">PF + ESIC (employee)</th><th class="n">Net arrears</th><th>Status</th><th></th></tr></thead><tbody>${list.map(a => { const T = k => (a.rows || []).reduce((t, r) => t + r.tot[k], 0); return `<tr class="erow" data-ar="${a.id}"><td>${monthName(a.from)}${a.to !== a.from ? ' – ' + monthName(a.to) : ''}</td><td class="small">${esc(a.reason || '')}</td><td class="n">${(a.rows || []).length}</td><td class="n">${inr(T('gross'))}</td><td class="n">${inr(T('PF') + T('ESI'))}</td><td class="n b">${inr(T('net'))}</td><td><span class="pill ${st(a)[1]}">${st(a)[0]}</span></td><td class="go">›</td></tr>`; }).join('')}</tbody></table>` : `<div class="empty">${lockedMonths.length ? 'No arrear sheets yet for this site.' : 'No locked months yet — arrears are worked out from locked salary months.'}</div>`}</div>`);
  const nb = $('#ar_new'); if (nb) nb.onclick = () => { S.arr = { siteId: site.id, id: null, status: 'DRAFT', from: lockedMonths[0], to: lockedMonths[lockedMonths.length - 1], reason: ARR_REASONS[0], scope: 'all', desigs: [], codes: [], rate: { mode: 'set', val: '' }, basic: { mode: 'set', val: '' }, params: {}, includePT: false, payMode: 'SALARY', payMonth: S.month, applyForward: true, rows: null }; render(); };
  p.querySelectorAll('[data-ar]').forEach(r => r.onclick = () => { S.arr = JSON.parse(JSON.stringify(S.arrears[r.dataset.ar])); delete S.arr._id; render(); });
}
function arrearEditor(p, site, A, lockedMonths) {
  const emps = empsOf(site.id).filter(e => e.status !== 'EXIT'); const desigs = [...new Set(emps.map(e => e.desig).filter(Boolean))].sort();
  const ro = A.status !== 'DRAFT'; const params = Object.keys(site.params || {});
  const T = k => (A.rows || []).reduce((t, r) => t + r.tot[k], 0);
  const modeSel = (id, c) => `<select class="in" id="${id}_m" style="width:150px" ${ro ? 'disabled' : ''}>${[['set', 'New amount'], ['add', 'Increase by ₹'], ['pct', 'Increase by %']].map(([v, t]) => `<option value="${v}" ${c.mode === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  p.insertAdjacentHTML('beforeend', `<div class="row" style="margin-bottom:12px"><button class="btn" id="ar_back">‹ Arrear sheets</button><span class="grow"></span>${A.status === 'DRAFT' && A.id ? '<button class="btn danger" id="ar_del">Delete draft</button>' : ''}</div>
   <div class="card"><div class="gsh"><b>1 · Revision</b><span>What changed, from when, and for whom</span></div>
    <div class="efgrid g3c">
     <label class="ef"><span class="efl">Arrears from (month)</span><select class="in" id="ar_from" ${ro ? 'disabled' : ''}>${lockedMonths.map(m => `<option value="${m}" ${A.from === m ? 'selected' : ''}>${monthName(m)}</option>`).join('')}</select><em>first month the new rates apply</em></label>
     <label class="ef"><span class="efl">To (month)</span><select class="in" id="ar_to" ${ro ? 'disabled' : ''}>${lockedMonths.map(m => `<option value="${m}" ${A.to === m ? 'selected' : ''}>${monthName(m)}</option>`).join('')}</select><em>last locked month paid at the old rates</em></label>
     <label class="ef"><span class="efl">Reason</span><select class="in" id="ar_reason" ${ro ? 'disabled' : ''}>${ARR_REASONS.map(r => `<option ${A.reason === r ? 'selected' : ''}>${r}</option>`).join('')}</select><em></em></label>
     <label class="ef"><span class="efl">Employees</span><select class="in" id="ar_scope" ${ro ? 'disabled' : ''}><option value="all" ${A.scope === 'all' ? 'selected' : ''}>All employees at the site</option><option value="desig" ${A.scope === 'desig' ? 'selected' : ''}>By designation</option><option value="codes" ${A.scope === 'codes' ? 'selected' : ''}>Selected employees</option></select><em></em></label>
     ${A.scope === 'desig' ? `<label class="ef" style="grid-column:span 2"><span class="efl">Designations</span><div class="mchips">${desigs.map(d => `<button type="button" class="mchip ${A.desigs.includes(d) ? 'on' : ''}" style="width:auto;padding:5px 10px" data-ds="${esc(d)}" ${ro ? 'disabled' : ''}>${esc(d)}</button>`).join('')}</div><em></em></label>` : ''}
     ${A.scope === 'codes' ? `<label class="ef" style="grid-column:span 2"><span class="efl">Employees (${A.codes.length} chosen)</span><div style="max-height:150px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:6px 10px">${emps.map(e => `<label class="chk small" style="display:flex"><input type="checkbox" data-ec="${esc(e.code)}" ${A.codes.includes(String(e.code)) ? 'checked' : ''} ${ro ? 'disabled' : ''}> ${esc(e.code)} · ${esc(e.name)} <span class="muted">${esc(e.desig || '')}</span></label>`).join('')}</div><em></em></label>` : ''}
    </div>
    ${A.revId ? `<div class="note" style="margin:14px 0 0"><b>Rates from the salary revision “${esc(A.revTitle || '')}”</b> — each of the ${Object.keys(A.revRows || {}).length} employees is recalculated with their own revised rates. To change them, edit the revision in Increments & revisions.</div>` : `
    <div class="efsub">Revised rates — leave blank what did not change</div>
    <div class="efgrid g3c">
     <label class="ef"><span class="efl">Gross salary rate</span><div class="row" style="gap:6px;flex-wrap:nowrap">${modeSel('ar_rate', A.rate)}<div class="rin" style="flex:1"><input id="ar_rate" value="${esc(A.rate.val)}" inputmode="decimal" placeholder="no change" ${ro ? 'disabled' : ''}></div></div><em></em></label>
     <label class="ef"><span class="efl">Basic rate</span><div class="row" style="gap:6px;flex-wrap:nowrap">${modeSel('ar_basic', A.basic)}<div class="rin" style="flex:1"><input id="ar_basic" value="${esc(A.basic.val)}" inputmode="decimal" placeholder="no change" ${ro ? 'disabled' : ''}></div></div><em>e.g. the new minimum wage per day</em></label>
     ${params.map(k => `<label class="ef"><span class="efl">Site rate ${esc(k)} <span class="muted">(now ${esc(String(site.params[k]))})</span></span><div class="rin"><input data-pp="${esc(k)}" value="${esc(A.params[k] ?? '')}" inputmode="decimal" placeholder="no change" ${ro ? 'disabled' : ''}></div><em></em></label>`).join('')}
    </div>
    `}
    <div class="row" style="gap:24px;margin-top:14px"><label class="sw"><input type="checkbox" id="ar_pt" ${A.includePT ? 'checked' : ''} ${ro ? 'disabled' : ''}><span></span>Recalculate PT on arrears month by month</label>${ro ? '' : '<span class="grow"></span><button class="btn pri" id="ar_calc">Calculate arrears</button>'}</div></div>
   ${A.rows ? `<div class="card flush"><div class="chead"><div class="grow"><b style="font-size:14px">2 · Arrear sheet</b><div class="small muted">${A.rows.length} employees · ${(A.months || []).map(monthName).join(', ')}</div></div><button class="btn" id="ar_dl">Download arrear sheet</button><button class="btn" id="ar_ecr">PF arrear ECR</button><button class="btn" id="ar_esi">ESIC arrear statement</button></div>
     <div class="kpis" style="grid-template-columns:repeat(5,1fr);padding:0 20px"><div class="kpi"><div class="l">Gross arrears</div><div class="v">₹${inr(T('gross'))}</div></div><div class="kpi"><div class="l">PF employee</div><div class="v">₹${inr(T('PF'))}</div><div class="s">on ₹${inr(T('pfw'))} arrear PF wages</div></div><div class="kpi"><div class="l">ESIC employee</div><div class="v">₹${inr(T('ESI'))}</div></div><div class="kpi"><div class="l">Net arrears</div><div class="v">₹${inr(T('net'))}</div></div><div class="kpi"><div class="l">Employer PF + ESIC</div><div class="v">₹${inr(T('EPF') + T('EPS') + T('EDLI') + T('ADMIN') + T('ESI_ER'))}</div></div></div>
     ${A.rows.some(r => r.tot.net < 0) ? `<div class="note warn" style="margin:0 20px 12px">Net arrears are negative for ${A.rows.filter(r => r.tot.net < 0).length} employee${A.rows.filter(r => r.tot.net < 0).length === 1 ? '' : 's'}: the higher basic raises PF more than it raises gross (the balancing allowance shrinks). Check whether the gross salary rate should also be revised. If approved as it is, the shortfall is deducted from the salary it is paid with.</div>` : ''}
     <div class="scroll" style="max-height:440px"><table class="tbl nostick"><thead><tr><th>Code</th><th>Name</th><th class="n">Months</th><th class="n">Gross arrears</th><th class="n">PF</th><th class="n">ESIC</th>${A.includePT ? '<th class="n">PT</th>' : ''}<th class="n">Net arrears</th><th class="n">Employer PF</th><th class="n">Employer ESIC</th></tr></thead><tbody>
     ${A.rows.map(r => `<tr><td class="mono">${esc(r.code)}</td><td>${esc(r.name)}<div class="small muted">${r.months.map(d => `${monthName(d.month).slice(0, 3)} ₹${inr(d.gross)}`).join(' · ')}</div></td><td class="n">${r.months.length}</td><td class="n">${inr(r.tot.gross)}</td><td class="n">${inr(r.tot.PF)}</td><td class="n">${inr(r.tot.ESI)}</td>${A.includePT ? `<td class="n">${inr(r.tot.PT)}</td>` : ''}<td class="n b">${inr(r.tot.net)}</td><td class="n">${inr(r.tot.EPF + r.tot.EPS + r.tot.EDLI + r.tot.ADMIN)}</td><td class="n">${inr(r.tot.ESI_ER)}</td></tr>`).join('') || `<tr><td colspan="10" class="empty">No difference with these rates.</td></tr>`}</tbody></table></div></div>
    <div class="card"><div class="gsh"><b>3 · Payment</b><span>How the net arrears reach the employees</span></div>
     <div class="row" style="gap:28px;flex-wrap:wrap"><label class="chk"><input type="radio" name="ar_pay" value="SALARY" ${A.payMode === 'SALARY' ? 'checked' : ''} ${ro ? 'disabled' : ''}> Pay with the salary of <select class="in" id="ar_pm" style="width:170px;margin-left:6px" ${ro ? 'disabled' : ''}>${[0, 1, 2].map(k => { const [y, m] = S.month.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; return `<option value="${v}" ${A.payMonth === v ? 'selected' : ''}>${monthName(v)}</option>`; }).join('')}</select></label>
      <label class="chk"><input type="radio" name="ar_pay" value="SEPARATE" ${A.payMode === 'SEPARATE' ? 'checked' : ''} ${ro ? 'disabled' : ''}> Pay separately now (own bank file)</label></div>
     <p class="small muted">With salary: the net arrears appear as an “Arrears (net)” column on that month's salary sheet and go out in the same bank transfer. Either way, PF arrears are filed with the separate arrear ECR and ESIC arrears added to the ESIC return of the month they are paid.</p>
     ${A.revId ? '' : `<label class="sw" style="margin-top:6px"><input type="checkbox" id="ar_fwd" ${A.applyForward ? 'checked' : ''} ${ro ? 'disabled' : ''}><span></span>Also apply the new rates to the employee master from ${monthName(S.month)} onward</label>`}
     <div class="row" style="justify-content:flex-end;gap:8px;margin-top:14px">${A.status === 'DRAFT' ? '<button class="btn" id="ar_save">Save draft</button><button class="btn pri" id="ar_ok">Approve arrears</button>' : ''}${A.status === 'APPROVED' && A.payMode === 'SEPARATE' ? '<button class="btn" id="ar_bank">Bank file</button><button class="btn pri" id="ar_paid">Mark as paid</button>' : ''}${A.status === 'APPROVED' ? '<button class="btn" id="ar_reopen">Reopen</button>' : ''}</div></div>` : ''}`);
  const rd = () => { if (ro) return; A.from = $('#ar_from').value; A.to = $('#ar_to').value; if (A.to < A.from) A.to = A.from; A.reason = $('#ar_reason').value; if ($('#ar_rate')) { A.rate = { mode: $('#ar_rate_m').value, val: $('#ar_rate').value.trim() }; A.basic = { mode: $('#ar_basic_m').value, val: $('#ar_basic').value.trim() }; } A.includePT = $('#ar_pt').checked; if (!A.revId) { A.params = {}; p.querySelectorAll('[data-pp]').forEach(i => { if (i.value.trim() !== '') A.params[i.dataset.pp] = num(i.value); }); } const pm = p.querySelector('[name=ar_pay]:checked'); if (pm) A.payMode = pm.value; const pmm = $('#ar_pm'); if (pmm) A.payMonth = pmm.value; const fw = $('#ar_fwd'); if (fw) A.applyForward = fw.checked; };
  $('#ar_back').onclick = () => { S.arr = null; render(); };
  const sc = $('#ar_scope'); if (sc) sc.onchange = () => { rd(); A.scope = sc.value; A.rows = null; render(); };
  p.querySelectorAll('[data-ds]').forEach(b => b.onclick = () => { rd(); const d = b.dataset.ds; A.desigs = A.desigs.includes(d) ? A.desigs.filter(x => x !== d) : [...A.desigs, d]; A.rows = null; render(); });
  p.querySelectorAll('[data-ec]').forEach(c => c.onchange = () => { A.codes = [...p.querySelectorAll('[data-ec]:checked')].map(x => x.dataset.ec); });
  const calc = $('#ar_calc'); if (calc) calc.onclick = () => { rd(); if (A.scope === 'desig' && !A.desigs.length) { toast('Choose at least one designation'); return; } if (A.scope === 'codes' && !A.codes.length) { toast('Choose at least one employee'); return; } if (!A.revId && !A.rate.val && !A.basic.val && !Object.keys(A.params).length) { toast('Enter at least one revised rate'); return; } const R = arrearCalc(site, A); A.rows = R.rows; A.months = R.months; render(); };
  const save = async (status) => { rd(); if (!A.id) A.id = `${site.id}_${Date.now()}`; A.status = status; A.createdAt = A.createdAt || new Date().toISOString(); if (status === 'APPROVED') A.approvedAt = new Date().toISOString(); const doc = JSON.parse(JSON.stringify(A)); if (await put('arrears/' + A.id, doc)) { S.arrears[A.id] = Object.assign({ _id: A.id }, doc); if (A.revId && S.revs[A.revId] && S.revs[A.revId].arrearId !== A.id) { S.revs[A.revId].arrearId = A.id; saveRev(Object.assign({ id: A.revId }, S.revs[A.revId])); } return true; } return false; };
  const sv = $('#ar_save'); if (sv) sv.onclick = async () => { if (await save('DRAFT')) toast('Draft saved'); render(); };
  const ok = $('#ar_ok'); if (ok) ok.onclick = () => { rd(); if (!A.rows || !A.rows.length) { toast('Nothing to approve — calculate first'); return; }
    confirmModal('Approve these arrears?', `₹${inr(T('net'))} net to ${A.rows.length} employees, ${A.payMode === 'SALARY' ? 'paid with the ' + monthName(A.payMonth) + ' salary' : 'paid separately'}.${A.applyForward ? ' The new rates are also saved to the employee master.' : ''}`, async () => {
      if (!(await save('APPROVED'))) return;
      if (A.applyForward) await applyArrearRates(site, A);
      toast('Arrears approved'); render(); }); };
  const ro2 = $('#ar_reopen'); if (ro2) ro2.onclick = () => confirmModal('Reopen these arrears?', 'They come off the salary sheet until approved again. Rates already saved to the employee master stay.', async () => { await save('DRAFT'); render(); });
  const pd = $('#ar_paid'); if (pd) pd.onclick = async () => { A.paidAt = new Date().toISOString(); await save('PAID'); toast('Marked as paid'); render(); };
  const del0 = $('#ar_del'); if (del0) del0.onclick = () => confirmModal('Delete this draft?', 'Nothing has been paid from it.', async () => { await del('arrears/' + A.id); delete S.arrears[A.id]; S.arr = null; render(); });
  const fn = t => `${t}_${site.id}_${A.from}${A.to !== A.from ? '_to_' + A.to : ''}`;
  const dl = $('#ar_dl'); if (dl) dl.onclick = () => arrearSheetXlsx(site, A, fn('Arrear_Sheet'));
  const ecr = $('#ar_ecr'); if (ecr) ecr.onclick = () => { const miss = A.rows.filter(r => r.tot.pfw > 0 && !r.uan).length; const lines = A.rows.filter(r => r.tot.pfw > 0 || r.tot.PF > 0).map(r => [r.uan || 'UAN-MISSING', r.name, Math.round(r.tot.pfw), Math.round(r.tot.epsw), Math.round(r.tot.edliw), Math.round(r.tot.PF), Math.round(r.tot.EPF), Math.round(r.tot.EPS)].join('#~#'));
    saveFile(fn('PF_Arrear_ECR') + '.txt', new TextEncoder().encode(lines.join('\n'))); if (miss) toast(`${miss} employee${miss === 1 ? '' : 's'} without UAN — fill them in the employee master before uploading`); };
  const esi = $('#ar_esi'); if (esi) esi.onclick = () => saveFile(fn('ESIC_Arrears') + '.xlsx', xlsxBytes([{ name: 'ESIC arrears', rows: [['Indus Fire Safety Private Limited — ESIC on arrears'], [site.name + ' · arrears ' + monthName(A.from) + (A.to !== A.from ? ' to ' + monthName(A.to) : '') + ' · paid ' + (A.payMode === 'SALARY' ? 'with ' + monthName(A.payMonth) + ' salary' : 'separately')], ['Add these wages and contributions to the ESIC return of the month the arrears are paid.'], [], ['IP number', 'Name', 'Arrear wages', 'Employee 0.75%', 'Employer 3.25%'], ...A.rows.filter(r => r.tot.esiw || r.tot.ESI).map(r => [r.esicNo || '', r.name, Math.round(r.tot.esiw), r.tot.ESI, r.tot.ESI_ER])], cols: [14, 28, 12, 12, 12] }]));
  const bk = $('#ar_bank'); if (bk) bk.onclick = () => { const rows = A.rows.filter(r => r.tot.net > 0).map(r => [r.code, r.name, r.acct, r.ifsc, r.tot.net, 'Arrears ' + monthName(A.from)]); saveFile(fn('Arrear_Bank') + '.csv', new TextEncoder().encode(['Emp Code,Name,Account,IFSC,Amount,Narration', ...rows.map(x => x.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n'))); };
}
async function applyArrearRates(site, A) {
  await freezePay([site.id]); const before = Object.fromEntries(empsOf(site.id).map(e => [String(e.code), JSON.parse(JSON.stringify(e))]));
  const list = empsOf(site.id).map(e => Object.assign({}, e)); const R = arrearCalc; // scope + change rules reused
  const inScope = e => A.scope === 'all' || (A.scope === 'desig' ? (A.desigs || []).includes(e.desig) : (A.codes || []).includes(String(e.code)));
  const chg = (v, c) => { if (!c || c.val === '' || c.val == null) return v; const n = +c.val; return c.mode === 'set' ? n : c.mode === 'add' ? (+v || 0) + n : Math.round((+v || 0) * (1 + n / 100) * 100) / 100; };
  let n = 0; list.forEach(e => { if (e.status === 'EXIT' || !inScope(e)) return; const r0 = e.rate, b0 = e.basic; e.rate = chg(e.rate, A.rate); if (e.basic != null || (A.basic && A.basic.mode === 'set' && A.basic.val !== '')) e.basic = chg(e.basic, A.basic); if (e.rate !== r0 || e.basic !== b0) n++; });
  await put('employees/' + site.id, { list }); S.emps[site.id] = Object.assign(S.emps[site.id] || {}, { list });
  if (Object.keys(A.params || {}).length) { const doc = storeDoc(Object.assign({}, S.siteDocs[site.id] || site, { params: Object.assign({}, (S.siteDocs[site.id] || site).params || {}, A.params) })); await put('sites/' + site.id, doc); S.siteDocs[site.id] = Object.assign({ _id: site.id }, doc); resolveAll(); }
  const rows = list.map(e => { const ch = payDiff(before[String(e.code)], e); return Object.keys(ch).length ? { code: String(e.code), name: e.name, desig: e.desig || '', ch } : null; }).filter(Boolean);
  if (rows.length) { const R = { kind: 'ARREAR', siteId: site.id, title: `${A.reason} (with arrears)`, ref: '', effective: S.month, status: 'APPLIED', createdAt: new Date().toISOString(), createdBy: who(), appliedAt: new Date().toISOString(), appliedBy: who(), rows, arrearId: A.id }; await saveRev(R); }
  if (false) await put('iom/' + site.id + '_' + Date.now(), { siteId: site.id, type: 'RATE', code: '', name: `${n} employees`, effective: A.from + '-01', details: `${A.reason}: revised rates applied (arrears ${monthName(A.from)}${A.to !== A.from ? ' – ' + monthName(A.to) : ''} approved)`, at: new Date().toISOString() });
}
function arrearSheetXlsx(site, A, name) {
  const cm = Object.fromEntries(site.components.map(c => [c.code, c.label]));
  const codes = [...new Set(A.rows.flatMap(r => Object.keys(r.tot.lines)))];
  const head = [['Indus Fire Safety Private Limited'], [site.name + (site.oc && site.oc !== '—' ? ` (O.C. No. ${site.oc})` : '')], [`Arrear sheet — ${A.reason} — ${monthName(A.from)}${A.to !== A.from ? ' to ' + monthName(A.to) : ''}`], []];
  const sum = ['Sr. No.', 'Emp. Code', 'Employee Name', 'Designation', 'Bank Account', 'IFSC', 'Months', ...codes.map(k => cm[k] || k), 'Gross arrears', 'PF arrears (12%)', 'ESIC arrears (0.75%)', ...(A.includePT ? ['PT'] : []), 'Net arrears', 'Arrear PF wages', 'Employer EPF', 'EPS', 'EDLI + admin', 'Employer ESIC'];
  const rows = A.rows.map((r, i) => [i + 1, r.code, r.name, r.desig, r.acct, r.ifsc, r.months.length, ...codes.map(k => r.tot.lines[k] || 0), r.tot.gross, r.tot.PF, r.tot.ESI, ...(A.includePT ? [r.tot.PT] : []), r.tot.net, r.tot.pfw, r.tot.EPF, r.tot.EPS, r.tot.EDLI + r.tot.ADMIN, r.tot.ESI_ER]);
  const tot = sum.map((h, j) => j === 2 ? 'TOTAL' : j >= 7 ? rows.reduce((t, r) => t + (+r[j] || 0), 0) : '');
  const det = A.rows.flatMap(r => r.months.map(d => [r.code, r.name, monthName(d.month), d.pd, ...codes.map(k => d.lines[k] || 0), d.gross, d.lines.PF || 0, d.lines.ESI || 0, ...(A.includePT ? [d.lines.PT || 0] : []), d.pfw]));
  saveFile(name + '.xlsx', xlsxBytes([{ name: 'Arrear sheet', rows: [...head, sum, ...rows, tot], cols: [6, 9, 26, 14, 18, 13, 7] },
    { name: 'Month-wise', rows: [...head, ['Emp. Code', 'Name', 'Month', 'Paid days', ...codes.map(k => cm[k] || k), 'Gross difference', 'PF', 'ESIC', ...(A.includePT ? ['PT'] : []), 'PF wages difference'], ...det], cols: [9, 26, 14, 9] }]));
}
// ----- Full & Final -----
function vFnF(p, site) {
  const emps = empsOf(site.id);
  p.insertAdjacentHTML('beforeend', `<div class="card"><h2>Full & Final settlement</h2><div class="row"><label class="f">Employee<select class="in" id="fe">${emps.map(e => `<option value="${e.code}">${e.code} · ${esc(e.name)}${e.status === 'EXIT' ? ' (exited)' : ''}</option>`).join('')}</select></label>
  <label class="f">Last working day<input class="in" type="date" id="fl"></label><label class="f">Days in last month<input class="in" type="number" id="fd" value="0" style="width:90px"></label>
  <label class="f">Leave encashment days<input class="in" type="number" id="fle" value="0" style="width:90px"></label><label class="f">Bonus payable (₹)<input class="in" type="number" id="fb" value="0" style="width:110px"></label>
  <label class="f">Notice recovery (₹)<input class="in" type="number" id="fn" value="0" style="width:110px"></label><button class="btn pri" id="fgo">Prepare statement</button></div><div id="fout"></div></div>`);
  $('#fgo').onclick = () => {
    const code = $('#fe').value; const e = emps.find(x => x.code === code); const [y, m] = ym();
    const r = E.calcEmployee(site, e, { PD: num($('#fd').value) }, {}, { month: m, year: y, calendarWD: siteCalWD(site) });
    const held = Object.values(S.held).filter(h => h.siteId === site.id && h.empCode === code && !h.releasedIn).reduce((s, h) => s + h.amount, 0);
    const loanBal = Object.values(S.loans).filter(l => l.siteId === site.id && l.empCode === code).reduce((s, l) => s + l.amount - (l.recovered || []).reduce((a, b) => a + b.amt, 0), 0);
    const basicDay = (e.basic ?? (site.params || {}).BASIC ?? 0) / ((site.params || {}).BASIC ? (site.divisor.days || 26) : 1);
    const leave = Math.round(basicDay * num($('#fle').value));
    const yrs = e.doj ? (new Date($('#fl').value || Date.now()) - new Date(e.doj)) / (365.25 * 864e5) : 0;
    const grat = yrs >= 4.75 ? Math.round(basicDay * 26 * 15 / 26 * Math.round(yrs)) : 0;
    const items = [['Salary for last month (net)', r.NET], ['Held salary pending release', held], ['Leave encashment', leave], ['Bonus payable', num($('#fb').value)], ['Gratuity' + (grat ? ` (${Math.round(yrs)} yrs)` : ' (under 5 years — nil)'), grat], ['Less: loan/advance balance', -loanBal], ['Less: notice period recovery', -num($('#fn').value)]];
    const tot = items.reduce((s, i) => s + i[1], 0);
    $('#fout').innerHTML = `<h3>F&F statement — ${esc(e.name)}</h3><table class="tbl" style="max-width:560px">${items.map(i => `<tr><td>${i[0]}</td><td class="n">${inr(i[1])}</td></tr>`).join('')}<tfoot><tr><td>Net payable</td><td class="n">₹${inr(tot)}</td></tr></tfoot></table>
    <button class="btn" id="fdl" style="margin-top:10px">Download statement (.xlsx)</button>`;
    $('#fdl').onclick = () => saveFile(`FnF_${code}_${S.month}.xlsx`, xlsxBytes([{ name: 'F&F', rows: [['Indus Fire Safety Private Limited'], ['Full & Final Statement'], ['Employee', e.name, 'Code', code], ['Site', site.name, 'Last working day', $('#fl').value], [], ...items, ['Net payable', tot]] }]));
  };
}

// ---------------- Site setup ----------------
function vSetup(p) {
  const sid = S.setup.site || (siteList()[0] || {}).id; S.setup.site = sid; const site = S.sites[sid];
  if (!site) { p.innerHTML = `${mastersBanner()}<div class="card empty"><h2>No sites yet</h2><p>Add a client site to set its salary structure, state and statutory pattern.</p><button class="btn pri" onclick="newSiteModal()">Add a site from a template</button></div>`; bindMig(p); return; }
  if (!S.setup.draft || S.setup.draft.id !== sid) { S.setup.draft = JSON.parse(JSON.stringify(strip(site))); S.setup.draft.id = sid; }
  const d = S.setup.draft; const structured = Array.isArray(d.structure);
  const emps = empsOf(sid).filter(e => e.status !== 'EXIT').length; const live = (d.components || []).filter(c => !c.off);
  const cf = bonusCfg(d); const nRates = Object.keys(d.params || {}).length, nDes = Object.values(d.designationParams || {}).reduce((t, o) => t + Object.keys(o).length, 0);
  const custom = structured ? d.structure.filter(r => r.formula === 'EXPR' && r.expr).length : 0;
  const tabs = [
    ['general', 'General', 'Name, state and pay rules'],
    ['components', 'Salary structure', `${live.filter(c => c.type === 'E').length} earnings · ${live.filter(c => c.type === 'D').length} deductions${custom ? ` · ${custom} custom` : ''}`],
    ['params', 'Rates & designation rules', nRates || nDes ? `${nRates} rate${nRates === 1 ? '' : 's'} · ${nDes} designation rule${nDes === 1 ? '' : 's'}` : 'None set'],
    ['attendance', 'Attendance codes', d.attMap ? 'Column mapping saved' : 'Standard codes'],
    ['bonus', 'Bonus', cf.mode ? BONUS_MODES[cf.mode].split(' — ')[0] : 'Not set yet'],
    ['test', 'Test a calculation', 'Try any employee']];
  if (!tabs.some(t => t[0] === S.setup.tab)) S.setup.tab = 'general';
  p.innerHTML = `${mastersBanner()}
  <div class="card shead"><span class="mcode lg">${esc(d.state || '')}</span><div class="grow" style="min-width:0"><div class="small muted">${esc(d.client || '')}</div><h2 style="margin:2px 0 8px;font-size:18px">${esc(d.name)}</h2>
    <div class="schips2"><span>${d.rateType === 'D' ? 'Daily-rated' : 'Monthly-rated'}</span><span>${d.divisor && d.divisor.type === 'fixed' ? d.divisor.days + '-day month' : 'Calendar working days'}</span><span>${emps} employee${emps === 1 ? '' : 's'}</span><span>${d.registerSet === 'CODE' ? 'Labour Code forms' : 'CLRA registers'}</span><span>ESIC ${d.esi === false ? 'not applicable' : 'applicable'}</span>${d.labourCode50 ? '<span>50% wage test on</span>' : ''}<span class="${patOf(d) === 'NEW' ? 'chipok' : ''}">${PAT_NAME[patOf(d)]} · ${patLine(d)}</span></div></div>
    <div class="col" style="display:flex;flex-direction:column;gap:8px;align-items:flex-end"><div style="width:340px">${sitePicker(sid, v => { S.setup.site = v; S.setup.draft = null; render(); }, 'setsite')}</div><button class="btn sm" onclick="newSiteModal()">+ New site from template</button></div></div>
  <div class="sgrid"><div class="card flush snav">${tabs.map(([k, t, sub]) => `<div class="snavi ${S.setup.tab === k ? 'on' : ''}" data-t="${k}"><b>${t}</b><span>${esc(sub)}</span></div>`).join('')}</div>
   <div id="sbody" style="min-width:0"></div></div>`;
  p.querySelectorAll('.snavi').forEach(t => t.onclick = () => { S.setup.tab = t.dataset.t; render(); });
  bindMig(p);
  ({ general: setGeneral, components: (b, dd) => Array.isArray(dd.structure) ? setStructure(b, dd) : setComponents(b, dd), params: setParams, attendance: setAttendance, bonus: setBonus, test: setTest })[S.setup.tab]($('#sbody'), d);
}
const saveBar = (id = 'ssave') => `<div class="ssbar"><span class="small muted grow" id="${id}msg">Changes on this page are saved for the whole site.</span><button class="btn pri" id="${id}">Save site setup</button></div>`;
async function saveSite(d) { const doc = storeDoc(d); const ok = await put('sites/' + d.id, doc); if (ok) { S.siteDocs[d.id] = Object.assign({ _id: d.id }, doc); resolveAll(); toast('Site setup saved'); const m = gid('ssavemsg'); if (m) m.textContent = 'Saved ' + new Date().toLocaleTimeString('en-IN'); } }
function setGeneral(b, d) {
  const st = Object.keys(E.STATE.NAMES);
  const sel = (id, opts, cur) => `<select class="in" id="${id}">${opts.map(([v, t]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const fld = (label, html, hint, span) => `<label class="ef" ${span ? `style="grid-column:span ${span}"` : ''}><span class="efl">${label}</span>${html}${hint ? `<em>${hint}</em>` : '<em></em>'}</label>`;
  b.innerHTML = `${d.notes ? `<div class="note ${d.source && d.source.mode === 'typed' ? 'warn' : ''}" style="margin-bottom:16px">${esc(d.notes)}${d.source ? `<br><span class="small muted">Translated from ${esc(d.source.file)}</span>` : ''}</div>` : ''}
   <div class="card gsec"><div class="gsh"><b>Site details</b><span>Shown on registers, payslips and bank files</span></div><div class="efgrid g3c">
    ${fld('Site name', `<input class="in" id="g_name" value="${esc(d.name)}">`, '', 2)}${fld('O.C. number', `<input class="in" id="g_oc" value="${esc(d.oc || '')}">`)}
    ${fld('Principal employer (client)', `<input class="in" id="g_client" value="${esc(d.client)}">`, '', 2)}${fld('State', sel('g_state', st.map(x => [x, E.STATE.NAMES[x]]), d.state), 'drives PT, LWF and registers')}
    ${fld('Site address', `<input class="in" id="g_addr" value="${esc(d.address || '')}">`, '', 2)}${fld('Nature of work', `<input class="in" id="g_work" value="${esc(d.work || 'Fire & safety services')}">`)}</div></div>
   <div class="card gsec"><div class="gsh"><b>Pay calculation</b><span>How the month is counted and rounded</span></div><div class="efgrid g3c">
    ${fld('Rate type', sel('g_rt', [['M', 'Monthly salary rate'], ['D', 'Daily rate']], d.rateType), 'default for employees')}
    ${fld('Working-days divisor', sel('g_dt', [['fixed', 'Fixed number of days'], ['calendar', 'Calendar days in the month']], d.divisor.type))}
    <label class="ef" id="g_ddw"><span class="efl">Fixed days</span><input class="in" type="number" id="g_dd" value="${d.divisor.days || 26}"><em></em></label>
    <label class="ef" id="g_wow"><span class="efl">Weekly off (calendar divisor)</span>${sel('g_wo', [['', 'None — all days count'], ['0', 'Sunday']], (d.divisor.weeklyOff || []).includes(0) ? '0' : '')}<em></em></label>
    ${fld('Pay period starts on day', `<input class="in" type="number" min="1" max="28" id="g_ps" value="${(d.payPeriod || {}).startDay || 1}">`, '1 = calendar month')}
    ${fld('Rounding', sel('g_rd', [['component', 'Every component to the rupee'], ['none', 'Keep paise, round net only']], d.rounding === 'none' ? 'none' : 'component'))}</div></div>
   <div class="card gsec"><div class="gsh"><b>Compliance</b><span>Registers and statutory applicability</span></div><div class="efgrid g3c">
    ${fld('Register format', sel('g_rs', [['CLRA', 'Old CLRA forms (XIII, XVI, XVII, XIX–XXIII)'], ['CODE', 'New Labour Code forms (I, IV, V, IX)']], d.registerSet === 'CODE' ? 'CODE' : 'CLRA'))}
    ${fld('ESIC at this site', sel('g_esi', [['1', 'Applicable (area notified)'], ['0', 'Not applicable']], d.esi === false ? '0' : '1'))}
    ${fld('Labour Code 50% wage test', sel('g_lc', [['0', 'Off'], ['1', 'On — add back excluded allowances above 50%']], d.labourCode50 ? '1' : '0'))}
    ${fld('Statutory pattern', sel('g_pat', [['', `Follow default (${PAT_NAME[patCfg().DEFAULT]})`], ['OLD', 'Old — PF ₹' + inr(E.STAT.PF_CEIL) + ', ESIC ₹' + inr(E.STAT.ESI_CEIL)], ['NEW', 'New — PF ₹' + inr(patCfg().NEW.PF_CEIL) + ', ESIC ₹' + inr(patCfg().NEW.ESI_CEIL)]], d.statPattern || ''), 'PF wage ceiling and ESIC limit', 2)}
    <div class="ef" style="grid-column:span 1"><span class="efl">Works on</span><div id="g_patx" class="small" style="padding-top:6px"></div><em></em></div></div>
    <div id="g_patn"></div></div>
   <div class="card gsec"><div class="gsh"><b>Notes for the salary team</b><span>Contract points, client instructions</span></div><textarea class="in" id="g_notes" rows="3" style="width:100%;box-sizing:border-box">${esc(d.notes || '')}</textarea></div>
   ${saveBar()}`;
  const patx = () => { const v = $('#g_pat').value; const t = { statPattern: v || undefined }; const k = patOf(t); const n = patCfg().NEW;
    $('#g_patx').innerHTML = `<span class="pill ${k === 'NEW' ? 'p-ok' : 'p-mute'}">${PAT_NAME[k]}</span> ${patLine(t)}`;
    const sid = d.id; const L = pfLiterals(); const typed = (S.sites[sid] ? S.sites[sid].components : d.components || []).filter(c => c.input && /PF/i.test(c.code) && /WAGE|LIMIT|BASIC/i.test(c.code)).map(c => c.label || c.code);
    const notes = [];
    if (k === 'NEW') notes.push(`From ${n.PF_FROM ? new Date(n.PF_FROM).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'the first run'}: PF on wages up to ₹${inr(n.PF_CEIL)} (EPS/EDLI up to ₹${inr(n.EPS_CEIL)}). ESIC from ${n.ESI_FROM ? monthName(n.ESI_FROM.slice(0, 7)) : 'the first run'}: covered when ${ESI_TEST_T[n.ESI_TEST].charAt(0).toLowerCase() + ESI_TEST_T[n.ESI_TEST].slice(1)} is up to ₹${inr(n.ESI_CEIL)}.`);
    if (k === 'NEW' && L.sites.has(sid)) notes.push(`<b>This site's PF formula has ₹15,000 written in</b>, so it will not pick up the new ceiling. Fix it in Statutory masters → Statutory patterns.`);
    if (k === 'NEW' && typed.length) notes.push(`PF wages here are typed in each month (${typed.map(esc).join(', ')}). Enter them up to ₹${inr(n.PF_CEIL)} on the new pattern.`);
    $('#g_patn').innerHTML = notes.length ? `<div class="note ${notes.length > 1 ? 'warn' : ''}" style="margin:4px 0 2px">${notes.join('<br>')}</div>` : ''; };
  patx(); $('#g_pat').onchange = patx;
  const tog = () => { const f = $('#g_dt').value === 'fixed'; $('#g_ddw').style.display = f ? '' : 'none'; $('#g_wow').style.display = f ? 'none' : ''; }; tog(); $('#g_dt').onchange = tog;
  $('#ssave').onclick = () => {
    Object.assign(d, { name: $('#g_name').value, client: $('#g_client').value, oc: $('#g_oc').value, state: $('#g_state').value, address: $('#g_addr').value, work: $('#g_work').value, rateType: $('#g_rt').value, rounding: $('#g_rd').value, registerSet: $('#g_rs').value, esi: $('#g_esi').value === '1', labourCode50: $('#g_lc').value === '1', notes: $('#g_notes').value });
    if ($('#g_pat').value) d.statPattern = $('#g_pat').value; else delete d.statPattern;
    d.divisor = { type: $('#g_dt').value, days: num($('#g_dd').value) || 26, weeklyOff: $('#g_wo').value === '' ? [] : [0] }; d.payPeriod = { startDay: num($('#g_ps').value) || 1 };
    saveSite(d); render();
  };
}
const TYPE_T = { E: 'Earning (in gross)', X: 'Paid separately', D: 'Deduction', R: 'Employer contribution', C: 'Working figure' };
function testVars(d) {
  const e = empsOf(d.id)[0] || { code: 'TEST', name: 'Sample', rate: 20000, basic: 512.5 };
  return { emp: e, att: (e.sample && e.sample.att) || { PD: 26 } };
}
function checkFormula(d, upto) {
  // compile every formula and run on a sample employee
  try { const { emp, att } = testVars(d); const dd = Object.assign({}, d, { components: d.components.slice(0, upto == null ? undefined : upto + 1) }); E.calcEmployee(dd, emp, att, {}, { month: ym()[1], year: ym()[0], calendarWD: siteCalWD(d) }); return null; } catch (err) { return err.message; }
}
function setComponents(b, d) {
  const draw = () => {
    b.innerHTML = `<div class="card"><div class="row"><h2 class="grow" style="margin:0">Components & logic — evaluated top to bottom</h2><button class="btn" id="addc">+ Add component</button></div>
    <p class="small muted">Formulas work like Excel. Use attendance (<span class="mono">PD OTD OTH NH WOT ODI WD TD</span>), employee (<span class="mono">RATE BASIC DRATE MRATE DAILY HRS</span>), parameters from the next tab, and the code of any component above. Functions: <span class="mono">R() MIN() MAX() IF() CEIL() FLOOR()</span>. PF and ESIC use <span class="mono">PFW</span>/<span class="mono">ESIW</span> — the sum of components ticked for PF/ESI. Leave the PT and LWF formula blank to use the state slab.</p>
    <div class="scroll" style="max-height:none"><table class="tbl"><thead><tr><th></th><th>Code</th><th>Column name on sheet</th><th>Type</th><th style="width:36%">Formula</th><th>PF</th><th>ESI</th><th>Group</th><th>On</th><th></th></tr></thead><tbody>
    ${d.components.map((c, i) => `<tr><td class="small muted">${i + 1}</td><td><input class="in mono" style="width:120px" data-i="${i}" data-f="code" value="${esc(c.code)}"></td>
     <td style="min-width:200px"><input class="in" style="width:100%" data-i="${i}" data-f="label" value="${esc(c.label)}" title="${esc(c.label)}"></td>
     <td><select class="in" data-i="${i}" data-f="type">${Object.entries(TYPE_T).map(([k, t]) => `<option value="${k}" ${c.type === k ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
     <td><input class="in formula" data-i="${i}" data-f="formula" value="${esc(c.formula ?? '')}" placeholder="${c.code === 'PT' || c.code === 'LWF' ? 'state slab' : c.input ? 'entered monthly' : ''}"><div class="err" id="ferr${i}"></div></td>
     <td>${c.type === 'E' ? `<input type="checkbox" data-i="${i}" data-f="pf" ${c.pf ? 'checked' : ''}>` : ''}</td><td>${c.type === 'E' || c.type === 'X' ? `<input type="checkbox" data-i="${i}" data-f="esi" ${c.esi ? 'checked' : ''}>` : ''}</td>
     <td>${c.type === 'X' ? `<input class="in" style="width:90px" data-i="${i}" data-f="group" value="${esc(c.group || '')}">` : ''}</td>
     <td><input type="checkbox" data-i="${i}" data-f="on" ${!c.off ? 'checked' : ''}></td>
     <td class="row" style="gap:2px;flex-wrap:nowrap"><button class="btn sm ghost" data-up="${i}">↑</button><button class="btn sm ghost" data-dn="${i}">↓</button><button class="btn sm ghost danger" data-rm="${i}">✕</button></td></tr>`).join('')}
    </tbody></table></div>${saveBar()}</div>`;
    b.querySelectorAll('[data-f]').forEach(el => el.onchange = () => {
      const c = d.components[+el.dataset.i]; const f = el.dataset.f;
      if (f === 'on') c.off = !el.checked; else if (el.type === 'checkbox') c[f] = el.checked; else if (f === 'formula') c.formula = el.value.trim() === '' ? (c.code === 'PT' || c.code === 'LWF' || c.input ? (c.input ? c.code : null) : '') : el.value.trim(); else c[f] = f === 'code' ? el.value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '') : el.value;
      if (f === 'type' || f === 'code') draw(); else validate();
    });
    b.querySelectorAll('[data-up]').forEach(x => x.onclick = () => { const i = +x.dataset.up; if (i > 0) { [d.components[i - 1], d.components[i]] = [d.components[i], d.components[i - 1]]; draw(); } });
    b.querySelectorAll('[data-dn]').forEach(x => x.onclick = () => { const i = +x.dataset.dn; if (i < d.components.length - 1) { [d.components[i + 1], d.components[i]] = [d.components[i], d.components[i + 1]]; draw(); } });
    b.querySelectorAll('[data-rm]').forEach(x => x.onclick = () => { d.components.splice(+x.dataset.rm, 1); draw(); });
    $('#addc').onclick = () => { const D0 = d.components.findIndex(c => c.type === 'D'); d.components.splice(D0 < 0 ? d.components.length : D0, 0, { code: 'NEW' + (d.components.length + 1), label: 'New allowance', type: 'E', formula: '0' }); draw(); };
    $('#ssave').onclick = () => { if (validate()) saveSite(d); else toast('Fix the formula errors first'); };
    validate();
  };
  const validate = () => {
    let ok = true; d.components.forEach((c, i) => { const el = $('#ferr' + i); if (el) el.textContent = ''; });
    const codes = new Set(); for (const [i, c] of d.components.entries()) { if (codes.has(c.code)) { $('#ferr' + i).textContent = 'Duplicate code'; ok = false; } codes.add(c.code); }
    for (let i = 0; i < d.components.length; i++) { const m = checkFormula(d, i); if (m) { const el = $('#ferr' + i); if (el && !el.textContent) el.textContent = m.replace(/^.*?:/, '').slice(0, 120); ok = false; break; } }
    $('#ssavemsg').textContent = ok ? 'All formulas calculate.' : ''; return ok;
  };
  draw();
}
function setParams(b, d) {
  d.params = d.params || {}; d.designationParams = d.designationParams || {};
  const draw = () => {
    b.innerHTML = `<div class="grid g2"><div class="card"><h2>Site rates & parameters</h2><p class="small muted">Named values used in formulas — e.g. fixed basic, TPT rate, washing amount, shift hours. Change a rate here once and every formula picks it up.</p>
    <table class="tbl"><thead><tr><th>Name</th><th>Value</th><th></th></tr></thead><tbody>${Object.entries(d.params).map(([k, v]) => `<tr><td class="mono">${esc(k)}</td><td><input class="in" data-p="${esc(k)}" value="${v}"></td><td><button class="btn sm ghost danger" data-pr="${esc(k)}">✕</button></td></tr>`).join('')}
    <tr><td><input class="in mono" id="np_k" placeholder="NAME" style="width:120px"></td><td><input class="in" id="np_v" placeholder="value"></td><td><button class="btn sm" id="np">Add</button></td></tr></tbody></table></div>
    <div class="card"><h2>Designation rules</h2><p class="small muted">Override a parameter for one designation — e.g. at Balrampur HRA is 30% for DCPO but 10% for Fireman (<span class="mono">HRAP</span>).</p>
    <table class="tbl"><thead><tr><th>Designation</th><th>Parameter</th><th>Value</th><th></th></tr></thead><tbody>
    ${Object.entries(d.designationParams).flatMap(([g, o]) => Object.entries(o).map(([k, v]) => `<tr><td>${esc(g)}</td><td class="mono">${esc(k)}</td><td><input class="in" data-dg="${esc(g)}" data-dk="${esc(k)}" value="${v}"></td><td><button class="btn sm ghost danger" data-dr="${esc(g)}|${esc(k)}">✕</button></td></tr>`)).join('')}
    <tr><td><input class="in" id="nd_g" placeholder="FM" style="width:90px"></td><td><input class="in mono" id="nd_k" placeholder="HRAP" style="width:90px"></td><td><input class="in" id="nd_v" placeholder="0.10" style="width:80px"></td><td><button class="btn sm" id="nd">Add</button></td></tr></tbody></table>
    <p class="small muted">Per-employee rates (salary rate, basic, TPT rate…) are on each employee in Employees & IOM.</p></div></div>${saveBar()}`;
    b.querySelectorAll('[data-p]').forEach(el => el.onchange = () => d.params[el.dataset.p] = isNaN(+el.value) ? el.value : +el.value);
    b.querySelectorAll('[data-pr]').forEach(el => el.onclick = () => { delete d.params[el.dataset.pr]; draw(); });
    b.querySelectorAll('[data-dg]').forEach(el => el.onchange = () => d.designationParams[el.dataset.dg][el.dataset.dk] = +el.value);
    b.querySelectorAll('[data-dr]').forEach(el => el.onclick = () => { const [g, k] = el.dataset.dr.split('|'); delete d.designationParams[g][k]; if (!Object.keys(d.designationParams[g]).length) delete d.designationParams[g]; draw(); });
    $('#np').onclick = () => { const k = $('#np_k').value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, ''); if (k) { d.params[k] = num($('#np_v').value); draw(); } };
    $('#nd').onclick = () => { const g = $('#nd_g').value.trim(), k = $('#nd_k').value.trim().toUpperCase(); if (g && k) { (d.designationParams[g] = d.designationParams[g] || {})[k] = num($('#nd_v').value); draw(); } };
    $('#ssave').onclick = () => saveSite(d);
  };
  draw();
}
function setAttendance(b, d) {
  d.attCodes = d.attCodes || {}; const all = codesOf(d);
  const draw = () => {
    b.innerHTML = `<div class="card"><h2>Attendance codes for day-wise sheets</h2><p class="small muted">What each code in the client's day-wise attendance counts as. Codes can be combined in a cell with / or + (e.g. <span class="mono">P/OT</span>). Plain numbers above 1 are read as hours worked against the shift of ${(d.params || {}).HRS || 8} hrs.</p>
    <table class="tbl" style="max-width:720px"><thead><tr><th>Code</th><th class="n">Paid day</th><th class="n">OT day</th><th class="n">NH/PH</th><th class="n">Weekly-off worked</th><th></th></tr></thead><tbody>
    ${Object.entries(Object.assign({}, DEFAULT_CODES, d.attCodes)).map(([k, v]) => `<tr><td class="mono">${esc(k)}${d.attCodes[k] ? ' <span class="pill p-pri">site</span>' : ''}</td>${['pd', 'ot', 'nh', 'wot'].map(f => `<td class="n"><input class="cell" data-c="${esc(k)}" data-f="${f}" value="${v[f] || 0}"></td>`).join('')}<td>${d.attCodes[k] ? `<button class="btn sm ghost danger" data-cr="${esc(k)}">✕</button>` : ''}</td></tr>`).join('')}
    <tr><td><input class="in mono" id="nc" placeholder="CODE" style="width:80px"></td><td colspan="5"><button class="btn sm" id="ncb">Add code</button></td></tr></tbody></table>
    ${d.attMap ? `<h3>Saved column mapping</h3><p class="small">Layout <b>${esc(d.attMap.fmt)}</b> · ${Object.entries(d.attMap.cols || {}).map(([k, v]) => `${k} ← “${esc(v)}”`).join(' · ')}</p>` : '<p class="small muted">No column mapping saved yet — it is saved on the first upload.</p>'}${saveBar()}</div>`;
    b.querySelectorAll('[data-c]').forEach(el => el.onchange = () => { const k = el.dataset.c; d.attCodes[k] = Object.assign({}, all[k] || {}, d.attCodes[k] || {}); d.attCodes[k][el.dataset.f] = num(el.value); draw(); });
    b.querySelectorAll('[data-cr]').forEach(el => el.onclick = () => { delete d.attCodes[el.dataset.cr]; draw(); });
    $('#ncb').onclick = () => { const k = $('#nc').value.trim().toUpperCase(); if (k) { d.attCodes[k] = { pd: 1 }; draw(); } };
    $('#ssave').onclick = () => saveSite(d);
  };
  draw();
}
function setBonus(b, d) {
  const cf = bonusCfg(d); const mode = (d.bonus && d.bonus.mode) || '';
  const codes = d.components.filter(c => !c.off && ['E', 'X', 'C'].includes(c.type));
  b.innerHTML = `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start"><div class="card"><h2>Bonus rule for this site</h2>
   <p class="small muted" style="margin-top:0">Set how this client's contract pays bonus. The yearly bonus sheet in Reports follows exactly this rule.</p>
   <div class="grid g2">
    <label class="f">How bonus is paid<select class="in" id="b_mode"><option value="" ${!mode ? 'selected' : ''}>— Not set yet —</option>${Object.entries(BONUS_MODES).map(([k, t]) => `<option value="${k}" ${mode === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f">Paid in (month / occasion)<input class="in" id="b_pay" value="${esc(cf.payMonth)}" placeholder="e.g. October (Diwali)"></label>
   </div>
   <div id="b_more" style="${mode === 'annual' ? '' : 'display:none'}">
    <label class="f" style="margin-top:12px">Bonus wages each month (formula)<input class="in mono" id="b_base" value="${esc(cf.base)}"></label>
    <div class="small muted" style="margin-top:4px">Use this site's component codes and figures, e.g. <span class="mono">BASIC_E + DA</span>, <span class="mono">GROSS - OT</span>, <span class="mono">PD * 25</span>, <span class="mono">MIN(BASIC_E, 7000)</span>.</div>
    <div class="grid g3" style="margin-top:12px">
     <label class="f">Bonus %<input class="in" type="number" step="0.01" id="b_pct" value="${cf.pct}"></label>
     <label class="f">Cap on bonus wages ₹/month<input class="in" type="number" id="b_cap" value="${cf.cap ?? ''}" placeholder="No cap"></label>
     <label class="f">Cap for part months<select class="in" id="b_cp"><option value="1" ${cf.capProrate ? 'selected' : ''}>Pro-rata to paid days</option><option value="0" ${!cf.capProrate ? 'selected' : ''}>Full cap</option></select></label>
     <label class="f">Eligible only if (formula)<input class="in mono" id="b_elig" value="${esc(cf.elig)}" placeholder="Everyone, e.g. MRATE <= 21000"></label>
     <label class="f">Minimum days in year<input class="in" type="number" id="b_md" value="${cf.minDays ?? ''}" placeholder="None"></label>
     <label class="f">Minimum bonus ₹<input class="in" type="number" id="b_min" value="${cf.minAmt ?? ''}" placeholder="None"></label>
    </div>
    <div class="small muted" style="margin-top:8px">Codes at this site: ${codes.map(c => `<span class="mono" title="${esc(c.label)}">${c.code}</span>`).join(', ')}, and PD, WD, OTD, GROSS, RATE, MRATE, BASIC.</div>
   </div>
   <label class="f" style="margin-top:12px">Notes (contract clause, client instruction)<textarea class="in" id="b_note" rows="2">${esc(cf.note)}</textarea></label>
   ${saveBar()}</div>
   <div class="card" style="overflow:auto"><h2>Check the rule</h2><div id="b_prev" class="small muted">Choose “Calculated yearly” to preview.</div></div></div>`;
  const read = () => ({ mode: $('#b_mode').value || null, payMonth: $('#b_pay').value.trim(), base: $('#b_base').value.trim(), pct: num($('#b_pct').value), cap: $('#b_cap').value === '' ? null : num($('#b_cap').value), capProrate: $('#b_cp').value === '1', elig: $('#b_elig').value.trim(), minDays: $('#b_md').value === '' ? null : num($('#b_md').value), minAmt: $('#b_min').value === '' ? null : num($('#b_min').value), note: $('#b_note').value });
  const prev = () => {
    const box = $('#b_prev'); const bb = read(); $('#b_more').style.display = bb.mode === 'annual' ? '' : 'none';
    if (bb.mode !== 'annual') { box.innerHTML = bb.mode === 'monthly' ? 'Bonus is part of the monthly salary at this site — it is not on the yearly bonus sheet.' : bb.mode === 'none' ? 'No bonus at this site.' : 'Choose how bonus is paid at this site.'; return; }
    const tmp = Object.assign({}, d, { bonus: bb }); const c2 = bonusCfg(tmp);
    const run = S.runs[runId(d.id)]; let rows = [];
    if (run && run.att && run.att.length) rows = computeRun(tmp, run).rows.slice(0, 8);
    else rows = empsOf(d.id).slice(0, 8).map(e => { const att = Object.assign({ PD: 26 }, (e.sample && e.sample.att) || {}); try { return { emp: e, att, r: E.calcEmployee(tmp, e, att, {}, { month: ym()[1], year: ym()[0], calendarWD: siteCalWD(tmp) }) }; } catch (x) { return null; } }).filter(Boolean);
    try {
      const out = rows.map(r => ({ r, b: bonusMonth(tmp, c2, r) }));
      box.innerHTML = `<p class="muted" style="margin-top:0">${esc(bonusRuleText(c2))}. ${run && run.att && run.att.length ? monthName(S.month) + ' attendance' : 'Sample attendance'}, first ${out.length} employees:</p><table class="tbl"><thead><tr><th>Employee</th><th class="n">Days</th><th class="n">Formula value</th><th class="n">Bonus wages</th><th class="n">Bonus this month</th></tr></thead><tbody>${out.map(({ r, b: x }) => `<tr><td>${esc(r.emp.name)}</td><td class="n">${inr(x.pd, 1)}</td><td class="n">${inr(x.earned)}</td><td class="n">${x.ok ? inr(x.bw) : '<span class="muted">not eligible</span>'}</td><td class="n b">${x.ok ? inr(x.bw * c2.pct / 100, 2) : '0'}</td></tr>`).join('')}</tbody></table>`;
    } catch (err) { box.innerHTML = `<div class="err">${esc(err.message)}</div>`; }
  };
  b.querySelectorAll('input,select,textarea').forEach(el => el.addEventListener('change', prev)); prev();
  $('#ssave').onclick = () => { const bb = read(); if (bb.mode === 'annual') { try { E.compile(bb.base); if (bb.elig) E.compile(bb.elig); } catch (err) { toast('Formula error: ' + err.message); return; } } d.bonus = bb; delete d.bonusMode; saveSite(d); };
}
function showUnsetBonus() {
  const list = siteList().filter(s => !bonusCfg(s).mode && s.kind !== 'payout');
  $('#modal').innerHTML = (`<div class="modal-bg"><div class="modal" style="max-width:640px"><h2>Sites without a bonus rule</h2><p class="small muted">Open a site to set its rule. The suggestion is from the salary components — a site with a bonus component in the salary is probably “paid every month”.</p><div style="max-height:420px;overflow:auto"><table class="tbl"><tbody>${list.map(s => `<tr><td>${esc(s.name)}</td><td class="small muted">suggest: ${bonusCfg(s).guess === 'monthly' ? 'paid every month' : 'yearly sheet'}</td><td><a href="#" data-us="${s.id}">Set rule</a></td></tr>`).join('')}</tbody></table></div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" onclick="closeModal()">Close</button></div></div></div>`);
  (payrollRoot() || document).querySelectorAll('[data-us]').forEach(a => a.onclick = e => { e.preventDefault(); closeModal(); S.setup = Object.assign(S.setup || {}, { site: a.dataset.us, tab: 'bonus', draft: null }); go('setup'); });
}
function setTest(b, d) {
  const emps = empsOf(d.id); let code = (emps[0] || {}).code;
  const draw = () => {
    const e = emps.find(x => x.code === code) || { code: 'TEST', name: 'Sample', rate: 20000, basic: 512.5 };
    const att = Object.assign({ PD: 26, OTD: 0, OTH: 0, NH: 0, WOT: 0, ODI: 0 }, (e.sample && e.sample.att) || {}, S._testAtt || {});
    let r = null, err = null; try { r = E.calcEmployee(d, e, att, (e.sample && e.sample.ded) || {}, { month: ym()[1], year: ym()[0], calendarWD: siteCalWD(d) }); } catch (x) { err = x.message; }
    b.innerHTML = `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:16px;align-items:start"><div class="card"><h2>Inputs</h2><label class="f">Employee<select class="in" id="te">${emps.map(x => `<option value="${x.code}" ${x.code === code ? 'selected' : ''}>${x.code} · ${esc(x.name)} · ${esc(x.desig || '')}</option>`).join('')}</select></label>
     <div class="grid g3" style="margin-top:10px">${['PD', 'OTD', 'OTH', 'NH', 'WOT', 'ODI', 'WD'].map(k => `<label class="f">${{ PD: 'Paid days', OTD: 'OT days', OTH: 'OT hours', NH: 'NH / PH days', WOT: 'Week-off worked', ODI: 'Special duty', WD: 'Working days' }[k]}<input class="in" data-a="${k}" value="${att[k] ?? ''}" placeholder="${k === 'WD' ? 'site' : ''}"></label>`).join('')}</div>
     <p class="small muted">Rate ₹${inr(e.rate, 2)} ${e.rateType === 'D' || d.rateType === 'D' ? '/day' : '/month'} · basic ${inr(e.basic ?? (d.params || {}).BASIC, 2)}</p>
</div>
     <div class="card"><h2>Result</h2>${err ? `<div class="err">${esc(err)}</div>` : `<table class="tbl">${d.components.filter(c => !c.off).map(c => `<tr><td>${esc(c.label)} <span class="muted mono">${c.code}</span></td><td class="small muted">${TYPE_T[c.type]}</td><td class="n">${c.type === 'C' ? inr(r.lines[c.code], 2) : inr(r.lines[c.code])}</td></tr>`).join('')}
     <tfoot><tr><td>Gross</td><td></td><td class="n">${inr(r.GROSS)}</td></tr><tr><td>Deductions</td><td></td><td class="n">${inr(r.DED)}</td></tr><tr><td>Net payable</td><td></td><td class="n">₹${inr(r.NET)}</td></tr><tr><td class="small">PF wages / ESIC wages</td><td></td><td class="n small">${inr(r.PFW)} / ${inr(r.ESIW)}</td></tr></tfoot></table>`}</div></div>`;
    $('#te').onchange = e2 => { code = e2.target.value; S._testAtt = null; draw(); };
    b.querySelectorAll('[data-a]').forEach(el => el.onchange = () => { S._testAtt = Object.assign({}, S._testAtt, { [el.dataset.a]: el.value === '' ? undefined : num(el.value) }); draw(); });
  };
  draw();
}
// ---------------- Salary component master ----------------
const TYPE_PILL = { E: ['Earning', 'p-ok'], X: ['Paid separately', 'p-pri'], D: ['Deduction', 'p-bad'], R: ['Employer contribution', 'p-warn'], C: ['Working figure', 'p-mute'] };
const typePill = t => `<span class="pill ${(TYPE_PILL[t] || ['', 'p-mute'])[1]}">${(TYPE_PILL[t] || [t])[0]}</span>`;
function compUsage() { const u = {}; for (const d of Object.values(S.siteDocs || {})) if (Array.isArray(d.structure)) for (const r of d.structure) if (r.comp) (u[r.comp] = u[r.comp] || new Set()).add(d.id || d._id); return u; }
function formulaUsage() { const u = {}; for (const d of Object.values(S.siteDocs || {})) if (Array.isArray(d.structure)) for (const r of d.structure) if (r.formula && /^F/.test(r.formula)) (u[r.formula] = u[r.formula] || []).push({ site: d.id || d._id, row: r }); return u; }
function vComponents(p) {
  const F = S.cmf || (S.cmf = { q: '', t: '' });
  const list = S.cmList || []; const use = compUsage();
  if (!list.length) { p.innerHTML = mastersBanner() || '<div class="card empty">No components yet. Load your site setups first.</div>'; bindMig(p); return; }
  const cnt = t => list.filter(c => c.type === t).length;
  const q = F.q.trim().toLowerCase();
  const rows = list.filter(c => (!F.t || c.type === F.t) && (!q || [c.code, c.name, c.desc, ...(c.seen || [])].some(x => x && String(x).toLowerCase().includes(q))))
    .sort((a, b) => 'EXDRC'.indexOf(a.type) - 'EXDRC'.indexOf(b.type) || (b.system ? 1 : 0) - (a.system ? 1 : 0) || (use[b.code] ? use[b.code].size : 0) - (use[a.code] ? use[a.code].size : 0) || a.name.localeCompare(b.name));
  p.innerHTML = `${mastersBanner()}
  <div class="kpis" style="grid-template-columns:repeat(5,1fr)">${['E', 'X', 'D', 'R', 'C'].map(t => `<div class="kpi" style="cursor:pointer" data-kt="${t}"><div class="l">${{ E: 'Earnings', X: 'Paid separately', D: 'Deductions', R: 'Employer contributions', C: 'Working figures' }[t]}</div><div class="v">${cnt(t)}</div><div class="s">${t === 'R' ? 'statutory + site-defined' : t === 'C' ? 'helper figures, not paid' : t === 'X' ? 'outside gross' : t === 'E' ? 'make up gross' : 'reduce net'}</div></div>`).join('')}</div>
  <div class="card flush"><div class="chead" style="gap:10px;flex-wrap:wrap"><div class="rin" style="width:240px"><i style="font-size:15px">⌕</i><input id="cm_q" placeholder="Search name, code or sheet column name" value="${esc(F.q)}"></div>
   <div class="seg">${[['', 'All'], ['E', 'Earnings'], ['X', 'Paid separately'], ['D', 'Deductions'], ['R', 'Employer'], ['C', 'Working']].map(([k, t]) => `<button class="${F.t === k ? 'on' : ''}" data-t="${k}">${t}</button>`).join('')}</div><span class="grow"></span>
   <button class="btn" id="cm_dl">Download</button><button class="btn" id="cm_mx">Site mapping matrix</button><button class="btn pri" id="cm_new">+ New component</button></div>
   <div class="scroll"><table class="tbl nostick"><thead><tr><th>Component</th><th>Type</th><th class="n">PF wage</th><th class="n">ESIC wage</th><th>Seen on sheets as</th><th class="n">Sites</th></tr></thead><tbody>
   ${rows.map(c => { const n = use[c.code] ? use[c.code].size : 0; return `<tr class="erow" data-cm="${esc(c.code)}"><td><b>${esc(c.name)}</b>${c.system ? ` <span class="pill p-mute">${c.system === 'auto' ? 'automatic' : 'statutory rule'}</span>` : ''}<div class="small muted mono">${esc(c.code)}</div>${c.desc ? `<div class="small muted">${esc(c.desc)}</div>` : ''}</td><td>${typePill(c.type)}</td><td class="n">${c.type === 'E' ? (c.pf ? '✓' : '<span class="muted">—</span>') : ''}</td><td class="n">${c.type === 'E' || c.type === 'X' ? (c.esi ? '✓' : '<span class="muted">—</span>') : ''}</td><td class="small muted"><div style="max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc((c.seen || []).join(' · '))}">${esc((c.seen || []).slice(0, 4).join(' · '))}</div></td><td class="n">${c.system === 'auto' ? '<span class="muted">all</span>' : n || '<span class="muted">0</span>'}</td></tr>`; }).join('') || '<tr><td colspan="6" class="empty">No components match.</td></tr>'}</tbody></table></div></div>`;
  bindMig(p);
  let t; $('#cm_q').oninput = e => { clearTimeout(t); t = setTimeout(() => { F.q = e.target.value; render(); const i = $('#cm_q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); };
  p.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { F.t = b.dataset.t; render(); });
  p.querySelectorAll('[data-kt]').forEach(b => b.onclick = () => { F.t = b.dataset.kt; render(); });
  p.querySelectorAll('[data-cm]').forEach(r => r.onclick = () => compModal(r.dataset.cm));
  $('#cm_new').onclick = () => compModal(null);
  $('#cm_dl').onclick = () => saveFile('Salary_Component_Master.xlsx', xlsxBytes([{ name: 'Components', rows: [['Code', 'Name', 'Type', 'PF wage', 'ESIC wage', 'System', 'Description', 'Sites using', 'Seen on sheets as'], ...list.map(c => [c.code, c.name, TYPE_PILL[c.type][0], c.pf ? 'Yes' : '', c.esi ? 'Yes' : '', c.system || '', c.desc || '', use[c.code] ? use[c.code].size : 0, (c.seen || []).join('; ')])], cols: [18, 34, 20, 9, 9, 10, 40, 10, 60] }]));
  $('#cm_mx').onclick = () => mappingMatrix();
}
function mappingMatrix() {
  const cm = cmByCode(), fm = fmById(); const sites = siteList().filter(s => Array.isArray((S.siteDocs[s.id] || {}).structure));
  const used = (S.cmList || []).filter(c => sites.some(s => S.siteDocs[s.id].structure.some(r => r.comp === c.code)));
  const cell = (st, c) => { const r = st.structure.find(x => x.comp === c.code); if (!r) return ''; if (r.off) return 'off'; const f = r.formula; const ps = r.params ? ' [' + Object.entries(r.params).map(([k, v]) => k + '=' + v).join(', ') + ']' : '';
    return (f === 'STAT' ? 'Statutory rule' : f === 'INPUT' ? 'Entered monthly' : f === 'EXPR' ? 'Custom: ' + (r.expr || '') : (fm[f] ? f + ' ' + fm[f].name : f)) + ps; };
  const rows = sites.map(s => [s.name, s.state, ...used.map(c => cell(S.siteDocs[s.id], c))]);
  saveFile('Site_Salary_Structure_Mapping.xlsx', xlsxBytes([{ name: 'Mapping', rows: [['Site', 'State', ...used.map(c => `${c.name} (${TYPE_PILL[c.type][0]})`)], ...rows], cols: [36, 6, ...used.map(() => 28)] },
    { name: 'Formulas', rows: [['ID', 'Name', 'Formula', 'Parameters', 'Sites using'], ...(S.fmList || []).map(f => [f.id, f.name, f.expr, (f.params || []).map(x => x.k + ' (' + x.label + ', default ' + x.def + ')').join('; '), (formulaUsage()[f.id] || []).length])], cols: [8, 60, 50, 40, 10] }]));
}
function compModal(code) {
  const ex = code ? (S.cmList || []).find(c => c.code === code) : null; const c = ex ? Object.assign({}, ex) : { code: '', name: '', type: 'E', pf: false, esi: false, desc: '' };
  const use = compUsage()[code] ? [...compUsage()[code]] : []; const locked = !!(ex && (use.length || ex.system));
  $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:640px"><h2>${ex ? esc(ex.name) : 'New salary component'}</h2>
   ${ex && ex.system ? `<div class="note small" style="margin-bottom:10px">${ex.system === 'auto' ? 'Calculated automatically from PF / ESIC / LWF rules — it is not mapped to sites.' : 'Uses the statutory rule unless a site maps its own formula.'}</div>` : ''}
   <div class="grid g2"><label class="f">Code<input class="in mono" id="c_code" value="${esc(c.code)}" ${ex ? 'readonly' : ''} placeholder="e.g. NIGHT_ALW"></label><label class="f">Name<input class="in" id="c_name" value="${esc(c.name)}" ${ex && ex.system ? 'readonly' : ''}></label></div>
   <label class="f" style="margin-top:10px">Type<div class="seg fseg" id="c_type">${Object.entries(TYPE_PILL).map(([k, [t]]) => `<button type="button" data-v="${k}" class="${c.type === k ? 'on' : ''}" ${locked && c.type !== k ? 'disabled' : ''}>${t}</button>`).join('')}</div></label>
   <div class="row" style="gap:28px;margin-top:14px" id="c_flags"><label class="sw"><input type="checkbox" id="c_pf" ${c.pf ? 'checked' : ''}><span></span>Counts for PF wages</label><label class="sw"><input type="checkbox" id="c_esi" ${c.esi ? 'checked' : ''}><span></span>Counts for ESIC wages</label></div>
   <div class="small muted" style="margin-top:6px">Default for every site — a site can override this in its salary structure.${use.length ? ` <b style="color:var(--warn)">Changing it changes PF / ESIC wages at the sites among these ${use.length} that use the default.</b>` : ''}</div>
   <label class="f" style="margin-top:12px">Description<input class="in" id="c_desc" value="${esc(c.desc || '')}" placeholder="What it is for, any rule from the contract"></label>
   ${use.length ? `<div class="small muted" style="margin-top:12px">Used at ${use.length} site${use.length > 1 ? 's' : ''}: ${use.slice(0, 8).map(id => esc((S.sites[id] || {}).name || id)).join(', ')}${use.length > 8 ? '…' : ''}</div>` : ''}
   <div class="row" style="margin-top:16px">${ex && !use.length && !ex.system ? '<button class="btn danger" id="c_del">Delete</button>' : ''}<span class="grow"></span><button class="btn" onclick="closeModal()">Cancel</button>${ex && ex.system === 'auto' ? '' : '<button class="btn pri" id="c_ok">Save</button>'}</div></div></div>`;
  const flags = () => { const t = c.type; $('#c_pf').closest('label').style.display = t === 'E' ? '' : 'none'; $('#c_esi').closest('label').style.display = t === 'E' || t === 'X' ? '' : 'none'; };
  (payrollRoot() || document).querySelectorAll('#c_type button').forEach(b => b.onclick = () => { c.type = b.dataset.v; (payrollRoot() || document).querySelectorAll('#c_type button').forEach(x => x.classList.toggle('on', x === b)); flags(); }); flags();
  const dl = $('#c_del'); if (dl) dl.onclick = async () => { S.cmList = S.cmList.filter(x => x.code !== code); await saveMasters('components'); closeModal(); render(); toast('Component deleted'); };
  const ok = $('#c_ok'); if (ok) ok.onclick = async () => {
    c.code = $('#c_code').value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, ''); c.name = $('#c_name').value.trim(); c.desc = $('#c_desc').value.trim(); c.pf = c.type === 'E' && $('#c_pf').checked; c.esi = (c.type === 'E' || c.type === 'X') && $('#c_esi').checked;
    if (!c.code || !c.name) { toast('Enter a code and a name'); return; }
    if (!ex && (S.cmList || []).some(x => x.code === c.code)) { toast('That code already exists'); return; }
    S.cmList = ex ? S.cmList.map(x => x.code === code ? c : x) : [...(S.cmList || []), c];
    if (await saveMasters('components')) { closeModal(); toast(ex ? 'Component saved' + (use.length ? ` — applies to ${use.length} sites` : '') : 'Component added'); render(); }
  };
}
// ---------------- Formula master ----------------
const PUNIT = { fraction: ['%', v => +(v * 100).toFixed(4), v => v / 100], percent: ['%', v => v, v => v], rupees: ['₹', v => v, v => v], '': ['', v => v, v => v] };
const pShow = (p, v) => (PUNIT[p.unit || ''] || PUNIT['']) [1](v);
const pStore = (p, v) => (PUNIT[p.unit || ''] || PUNIT['']) [2](v);
const pLabel = (p, v) => { const u = PUNIT[p.unit || ''] || PUNIT['']; return u[0] === '₹' ? '₹' + inr(u[1](v), 2).replace(/\.00$/, '') : u[1](v) + (u[0] === '%' ? '%' : ''); };
function prettyHTML(expr) {
  const cm = cmByCode(); const toks = []; const keep = h => { toks.push(h); return '\u0002' + (toks.length - 1) + '\u0003'; };
  let e = String(expr || '').replace(/\[([A-Z0-9_]+)\]/g, (m, k) => keep(`<span class="fx c">${esc(cm[k] ? cm[k].name : k)}</span>`)).replace(/\{([A-Z0-9_]+)\}/g, (m, k) => keep(`<span class="fx p">${esc(k)}</span>`))
    .replace(/\b([A-Z][A-Z0-9_]*)\b/g, (m, k) => STRUCT.SYSTEM_VARS[k] ? keep(`<span class="fx v">${STRUCT.SYSTEM_VARS[k]}</span>`) : ['R', 'MIN', 'MAX', 'IF', 'ROUND', 'CEIL', 'FLOOR', 'ABS'].includes(k) ? keep(`<b>${k === 'R' ? 'ROUND' : k}</b>`) : keep(`<span class="fx r">${esc(k)}</span>`));
  e = esc(e).replace(/\*/g, ' × ').replace(/\//g, ' ÷ ').replace(/([+\-])/g, ' $1 ').replace(/,/g, ', ');
  return e.replace(/\u0002(\d+)\u0003/g, (m, i) => toks[+i]);
}
function vFormulas(p) {
  const F = S.fxf || (S.fxf = { q: '', comp: '', open: null });
  if (F.open) return formulaEditor(p, F);
  const list = S.fmList || []; const use = formulaUsage(); const cm = cmByCode();
  if (!list.length && !(S.cmList || []).length) { p.innerHTML = mastersBanner() || '<div class="card empty">No formulas yet.</div>'; bindMig(p); return; }
  const q = F.q.trim().toLowerCase();
  const rows = list.filter(f => (!F.comp || f.for === F.comp) && (!q || [f.id, f.name, f.expr, f.desc].some(x => x && String(x).toLowerCase().includes(q)))).sort((a, b) => (use[b.id] || []).length - (use[a.id] || []).length || a.name.localeCompare(b.name));
  const comps = [...new Set(list.map(f => f.for).filter(Boolean))].map(k => cm[k]).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  const sitesUsing = id => new Set((use[id] || []).map(u => u.site)).size;
  const groups = {}; rows.forEach(f => (groups[f.for || ''] = groups[f.for || ''] || []).push(f));
  const gsites = k => new Set(groups[k].flatMap(f => (use[f.id] || []).map(u => u.site))).size;
  const gkeys = Object.keys(groups).sort((a, b) => gsites(b) - gsites(a) || ((cm[a] || {}).name || '').localeCompare((cm[b] || {}).name || ''));
  const auto = f => !f.name || f.name.startsWith(((cm[f.for] || {}).name || '') + ' — ');
  F.exp = F.exp || {}; const isOpen = k => !!q || !!F.comp || !!F.exp[k];
  const unused = unusedFormulas(false);
  p.innerHTML = `${mastersBanner()}
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)"><div class="kpi"><div class="l">Master formulas</div><div class="v">${list.length}</div><div class="s">for ${new Set(list.map(f => f.for)).size} components</div></div><div class="kpi"><div class="l">Site components using them</div><div class="v">${inr(Object.values(use).reduce((t, a) => t + a.length, 0))}</div><div class="s">across ${new Set(Object.values(use).flat().map(u => u.site)).size} sites</div></div><div class="kpi"><div class="l">With parameters</div><div class="v">${list.filter(f => (f.params || []).length).length}</div><div class="s">rate set per site</div></div><div class="kpi"><div class="l">Custom (site-only)</div><div class="v">${inr(Object.values(S.siteDocs || {}).reduce((t, d) => t + (d.structure || []).filter(r => r.formula === 'EXPR' && r.expr).length, 0))}</div><div class="s">can be saved to the master</div></div></div>
  <div class="card flush"><div class="chead" style="gap:10px;flex-wrap:wrap"><div class="rin" style="width:260px"><i style="font-size:15px">⌕</i><input id="fx_q" placeholder="Search formulas" value="${esc(F.q)}"></div>
   <select class="in" id="fx_c" style="width:230px"><option value="">All components</option>${comps.map(c => `<option value="${c.code}" ${F.comp === c.code ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
   ${q || F.comp ? '' : `<button class="btn sm ghost" id="fx_all">${gkeys.every(k => F.exp[k]) ? 'Collapse all' : 'Expand all'}</button>`}<span class="grow"></span>
   ${unused.length ? `<button class="btn" id="fx_unused">Remove unused (${unused.length})</button>` : ''}<button class="btn" id="fx_dup">Merge duplicates</button><button class="btn pri" id="fx_new">+ New formula</button></div>
   <div class="fxlist">${gkeys.map(k => { const g = groups[k]; const c = cm[k]; const open = isOpen(k); const n = gsites(k); const top = g[0];
     return `<div class="fxgrp ${open ? 'open' : ''}"><div class="fxhead" data-gx="${esc(k)}"><span class="chev">›</span><div class="grow" style="min-width:0"><div class="row" style="gap:8px"><b>${esc(c ? c.name : 'Other')}</b>${c ? typePill(c.type) : ''}</div>${open ? '' : `<div class="fxprev">${prettyHTML(top.expr)}${g.length > 1 ? `<span class="muted small"> and ${g.length - 1} other way${g.length > 2 ? 's' : ''}</span>` : ''}</div>`}</div><span class="fxmeta">${g.length} way${g.length === 1 ? '' : 's'}</span><span class="fxmeta"><b>${n}</b> site${n === 1 ? '' : 's'}</span></div>
      ${open ? `<div class="fxbody">${g.map(f => { const su = new Set((use[f.id] || []).map(u => u.site)).size; return `<div class="fxrow erow" data-fx="${f.id}"><div class="grow" style="min-width:0"><div class="fxl">${prettyHTML(f.expr)}</div><div class="small muted"><span class="mono">${f.id}</span>${auto(f) ? '' : ' · ' + esc(f.name)}${f.desc ? ' · ' + esc(f.desc) : ''}</div></div><div class="fxpar">${(f.params || []).map(x => `<span class="pchip">${esc(x.label || x.k)} <i>${pLabel(x, x.def)}</i></span>`).join(' ')}</div><span class="fxmeta ${su ? '' : 'muted'}">${su ? `<b>${su}</b> site${su === 1 ? '' : 's'}` : 'not used'}</span></div>`; }).join('')}</div>` : ''}</div>`; }).join('') || '<div class="empty">No formulas match.</div>'}</div></div>`;
  bindMig(p);
  let t; $('#fx_q').oninput = e => { clearTimeout(t); t = setTimeout(() => { F.q = e.target.value; render(); const i = $('#fx_q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); };
  $('#fx_c').onchange = e => { F.comp = e.target.value; render(); };
  p.querySelectorAll('[data-fx]').forEach(r => r.onclick = () => { F.open = r.dataset.fx; F.draft = null; render(); window.scrollTo(0, 0); });
  $('#fx_new').onclick = () => { F.open = 'NEW'; F.draft = null; render(); };
  p.querySelectorAll('[data-gx]').forEach(h => h.onclick = () => { F.exp[h.dataset.gx] = !F.exp[h.dataset.gx]; render(); });
  const fa = $('#fx_all'); if (fa) fa.onclick = () => { const all = gkeys.every(k => F.exp[k]); gkeys.forEach(k => F.exp[k] = !all); render(); };
  const fu = $('#fx_unused'); if (fu) fu.onclick = () => confirmModal(`Remove ${unused.length} unused formula${unused.length === 1 ? '' : 's'}?`, 'No site uses them. Sites and salaries are not affected.', async () => { const n = await pruneUnused(false); toast(`${n} unused formula${n === 1 ? '' : 's'} removed`); render(); });
  $('#fx_dup').onclick = async e => { e.target.disabled = true; e.target.textContent = 'Checking…'; await mergeDuplicates(false); };
}
function formulaCheck(expr, params) {
  // compile with every reference replaced, to catch syntax errors
  try { const e = String(expr).replace(/\[([A-Z0-9_]+)\]/g, (m, k) => 'C_' + k).replace(/\{([A-Z0-9_]+)\}/g, (m, k) => { const p = (params || []).find(x => x.k === k); return String(p ? p.def || 0 : 0); }); if (!e.trim()) return 'Enter a formula'; E.compile(e); return null; } catch (err) { return err.message; }
}
function formulaEditor(p, F) {
  const isNew = F.open === 'NEW'; const src = isNew ? { id: '', name: '', expr: '', params: [], for: '', desc: '' } : (S.fmList || []).find(f => f.id === F.open);
  if (!src) { F.open = null; return vFormulas(p); }
  const d = F.draft || (F.draft = JSON.parse(JSON.stringify(src))); const cm = cmByCode(); const uses = isNew ? [] : (formulaUsage()[src.id] || []);
  const syncParams = () => { const need = STRUCT.formulaNeeds(d.expr).params; d.params = need.map(k => (d.params || []).find(p2 => p2.k === k) || { k, label: k, unit: '', def: 0 }); };
  syncParams();
  const comps = (S.cmList || []).filter(c => c.system !== 'auto').sort((a, b) => a.name.localeCompare(b.name));
  const err = formulaCheck(d.expr, d.params);
  const needs = STRUCT.formulaNeeds(d.expr);
  p.innerHTML = `<div class="row" style="margin-bottom:12px"><button class="btn" id="fe_back">‹ All formulas</button><span class="grow"></span>${!isNew && !uses.length ? '<button class="btn danger" id="fe_del">Delete</button>' : ''}<button class="btn pri" id="fe_save">${isNew ? 'Create formula' : 'Save formula'}</button></div>
  <div class="fegrid"><div>
   <div class="card"><div class="grid g2"><label class="f">Formula name<input class="in" id="fe_name" value="${esc(d.name)}" placeholder="e.g. HRA — % of earned basic"></label><label class="f">Mainly used for<select class="in" id="fe_for"><option value="">—</option>${comps.map(c => `<option value="${c.code}" ${d.for === c.code ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>
    <label class="f" style="margin-top:12px">Formula<textarea class="in mono" id="fe_expr" rows="3" spellcheck="false" style="font-size:14px">${esc(d.expr)}</textarea></label>
    <div class="fehelp"><span class="small muted">Insert:</span> <select class="in" id="fe_ic" style="width:220px;height:30px"><option value="">Component…</option>${comps.map(c => `<option value="${c.code}">${esc(c.name)}</option>`).join('')}</select>
     ${['PD', 'WD', 'OTD', 'OTH', 'NH', 'TD', 'RATE', 'BASIC', 'GROSS', 'PFW'].map(v => `<button class="btn sm" data-ins="${v}" title="${STRUCT.SYSTEM_VARS[v]}">${STRUCT.SYSTEM_VARS[v]}</button>`).join('')}<button class="btn sm" id="fe_ip">+ Parameter</button></div>
    <div class="small muted" style="margin-top:8px"><span class="fx c">[CODE]</span> a component · <span class="fx p">{NAME}</span> a parameter each site sets · plain names are site rates (e.g. <span class="mono">HRAP</span>) · functions <span class="mono">R() MIN() MAX() IF() CEIL() FLOOR()</span></div>
    <div class="fepre">${err ? `<div class="err">${esc(err)}</div>` : prettyHTML(d.expr)}</div>
    <label class="f" style="margin-top:12px">Description<input class="in" id="fe_desc" value="${esc(d.desc || '')}" placeholder="When to use it, contract clause"></label></div>
   <div class="card"><h2 style="margin-top:0">Parameters</h2>${d.params.length ? `<p class="small muted" style="margin-top:0">Each site that uses this formula sets its own value; the default is used when it doesn't.</p><table class="tbl nostick"><thead><tr><th>Name</th><th>Label</th><th>Unit</th><th class="n">Default</th></tr></thead><tbody>${d.params.map((x, i) => `<tr><td class="mono">{${esc(x.k)}}</td><td><input class="in" data-pl="${i}" value="${esc(x.label || '')}" style="width:100%"></td><td><select class="in" data-pu="${i}"><option value="" ${!x.unit ? 'selected' : ''}>Number</option><option value="fraction" ${x.unit === 'fraction' ? 'selected' : ''}>% (stored as 0.05)</option><option value="percent" ${x.unit === 'percent' ? 'selected' : ''}>% (stored as 5)</option><option value="rupees" ${x.unit === 'rupees' ? 'selected' : ''}>₹ amount</option></select></td><td class="n"><div class="rin sm" style="margin-left:auto">${x.unit === 'rupees' ? '<i>₹</i>' : ''}<input data-pd="${i}" value="${pShow(x, x.def)}">${x.unit === 'fraction' || x.unit === 'percent' ? '<i>%</i>' : ''}</div></td></tr>`).join('')}</tbody></table>` : '<p class="small muted" style="margin:0">None. Put <span class="mono">{NAME}</span> in the formula for any value that differs between sites — e.g. <span class="mono">[BASIC]*{PCT}</span>.</p>'}
    ${needs.rates.length ? `<div class="small muted" style="margin-top:10px">Site rates this formula reads: ${needs.rates.map(r => `<span class="mono">${esc(r)}</span>`).join(', ')} — set in each site's Rates tab, by designation, or per employee.</div>` : ''}</div>
  </div><div>
   <div class="card"><h2 style="margin-top:0">Try it</h2><div id="fe_try"></div></div>
  </div></div>
  <div class="card flush"><div class="chead"><div class="grow"><h2>Used at ${new Set(uses.map(u => u.site)).size} site${new Set(uses.map(u => u.site)).size === 1 ? '' : 's'}</h2><div class="small muted">Each row is a site column calculated with this formula</div></div></div>${uses.length ? `<div class="scroll" style="max-height:420px"><table class="tbl nostick"><thead><tr><th>Site</th><th>State</th><th>Column on the salary sheet</th><th>Component</th>${d.params.map(x => `<th class="n">${esc(x.label || x.k)}</th>`).join('')}</tr></thead><tbody>${uses.slice().sort((a, b) => ((S.sites[a.site] || {}).name || '').localeCompare((S.sites[b.site] || {}).name || '')).map(u => { const st = S.sites[u.site] || {}; const m = cm[u.row.comp] || {}; return `<tr><td>${esc(st.name || u.site)}</td><td><span class="tag">${esc(st.state || '')}</span></td><td>${esc(u.row.label || m.name || u.row.code)} <span class="small muted mono">${esc(u.row.code)}</span></td><td class="small">${esc(m.name || '')}</td>${d.params.map(x => `<td class="n">${u.row.params && u.row.params[x.k] != null ? pLabel(x, u.row.params[x.k]) : `<span class="muted">${pLabel(x, x.def)} (default)</span>`}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>` : '<div class="empty small">Not mapped to any site yet. Map it from Site setup → Salary structure.</div>'}</div>`;
  const tryBox = () => {
    const box = $('#fe_try'); if (!box) return; const n = STRUCT.formulaNeeds(d.expr); F.tv = F.tv || {};
    const vars = [...n.comps.map(k => ['C_' + k, cm[k] ? cm[k].name : k]), ...Object.keys(STRUCT.SYSTEM_VARS).filter(k => new RegExp('\\b' + k + '\\b').test(d.expr.replace(/\[[^\]]*\]|\{[^}]*\}/g, ''))).map(k => [k, STRUCT.SYSTEM_VARS[k]]), ...n.rates.filter(r => !STRUCT.SYSTEM_VARS[r]).map(r => [r, r + ' (site rate)'])];
    const DEF = { PD: 26, WD: 26, RATE: 18000, BASIC: 520, OTD: 2, OTH: 8, NH: 1, TD: 26, HRS: 8, GROSS: 18000, PFW: 15000, ESIW: 18000, MRATE: 18000, DRATE: 692, PFCEIL: 15000, ESICEIL: 21000 };
    let res = ''; try { const e = d.expr.replace(/\[([A-Z0-9_]+)\]/g, (m, k) => 'C_' + k).replace(/\{([A-Z0-9_]+)\}/g, (m, k) => { const x = d.params.find(y => y.k === k); return String(x ? x.def || 0 : 0); }); const v = {}; vars.forEach(([k]) => v[k] = F.tv[k] != null ? +F.tv[k] : (DEF[k] != null ? DEF[k] : 1000)); res = '₹' + inr(E.compile(e).f(v), 2); } catch (x) { res = '—'; }
    box.innerHTML = `<div class="grid g2" style="gap:8px 12px">${vars.map(([k, l]) => `<label class="f small">${esc(l)}<input class="in" data-tv="${k}" value="${F.tv[k] != null ? F.tv[k] : (DEF[k] != null ? DEF[k] : 1000)}"></label>`).join('') || '<span class="small muted">Nothing to enter.</span>'}</div><div class="fetry">Result <b>${res}</b></div><div class="small muted">Parameters use their default values.</div>`;
    box.querySelectorAll('[data-tv]').forEach(i => i.onchange = () => { F.tv[i.dataset.tv] = i.value; tryBox(); });
  };
  tryBox();
  const reread = () => { d.name = $('#fe_name').value; d.for = $('#fe_for').value; d.desc = $('#fe_desc').value; };
  let tt; $('#fe_expr').oninput = e => { clearTimeout(tt); tt = setTimeout(() => { reread(); d.expr = e.target.value.trim(); const pos = e.target.selectionStart; render(); const x = $('#fe_expr'); if (x) { x.focus(); x.setSelectionRange(pos, pos); } }, 500); };
  const ins = txt => { const x = $('#fe_expr'); const a = x.selectionStart, b = x.selectionEnd; reread(); d.expr = x.value.slice(0, a) + txt + x.value.slice(b); render(); const y = $('#fe_expr'); y.focus(); y.setSelectionRange(a + txt.length, a + txt.length); };
  $('#fe_ic').onchange = e => { if (e.target.value) ins('[' + e.target.value + ']'); };
  p.querySelectorAll('[data-ins]').forEach(b => b.onclick = () => ins(b.dataset.ins));
  $('#fe_ip').onclick = () => { let k = 'PCT', j = 2; while (d.params.some(x => x.k === k)) k = 'PCT' + j++; ins('{' + k + '}'); };
  p.querySelectorAll('[data-pl]').forEach(i => i.oninput = () => d.params[+i.dataset.pl].label = i.value);
  p.querySelectorAll('[data-pu]').forEach(i => i.onchange = () => { reread(); d.params[+i.dataset.pu].unit = i.value; render(); });
  p.querySelectorAll('[data-pd]').forEach(i => i.onchange = () => { const x = d.params[+i.dataset.pd]; x.def = pStore(x, num(i.value)); tryBox(); });
  $('#fe_back').onclick = () => { F.open = null; F.draft = null; render(); };
  const del = $('#fe_del'); if (del) del.onclick = () => confirmModal('Delete this formula?', 'It is not used by any site.', async () => { S.fmList = S.fmList.filter(f => f.id !== src.id); await saveMasters('formulas'); F.open = null; F.draft = null; render(); toast('Formula deleted'); });
  $('#fe_save').onclick = () => {
    reread(); d.expr = $('#fe_expr').value.trim(); syncParams();
    const e2 = formulaCheck(d.expr, d.params); if (e2) { toast('Formula error: ' + e2); return; }
    if (!d.name.trim()) { toast('Give the formula a name'); return; }
    const doSave = async () => {
      if (isNew) { const nmax = Math.max(0, ...(S.fmList || []).map(f => +String(f.id).slice(1) || 0)); d.id = 'F' + String(nmax + 1).padStart(3, '0'); S.fmList = [...(S.fmList || []), d]; }
      else S.fmList = S.fmList.map(f => f.id === src.id ? Object.assign({}, d, { _tpl: src.expr === d.expr ? src._tpl : undefined }) : f);
      if (await saveMasters('formulas')) { toast(isNew ? 'Formula created' : `Formula saved${uses.length ? ` — ${new Set(uses.map(u => u.site)).size} sites updated` : ''}`); F.open = d.id; F.draft = null; render(); }
    };
    if (!isNew && uses.length && src.expr !== d.expr) confirmModal('Change the calculation at ' + new Set(uses.map(u => u.site)).size + ' sites?', 'Every site using this formula calculates with the new version from its next salary run. Locked months keep the figures they were locked with.', doSave); else doSave();
  };
}
// ---------------- Site salary structure (mapping) ----------------
function setStructure(b, d) {
  const cm = cmByCode(), fm = fmById(); S.setup.openRows = S.setup.openRows || {};
  const res = () => { d.components = STRUCT.resolve(d, mastersObj()); };
  const draw = () => {
    res();
    let sample = null, serr = null; try { const { emp, att } = testVars(d); sample = { emp, r: E.calcEmployee(d, emp, att, {}, { month: ym()[1], year: ym()[0], calendarWD: siteCalWD(d) }) }; } catch (x) { serr = x.message; }
    const st = d.structure; const open = S.setup.openRows;
    const inUse = new Set(st.map(r => r.comp));
    const avail = (S.cmList || []).filter(c => c.system !== 'auto' && !inUse.has(c.code)).sort((a, b2) => 'EXDRC'.indexOf(a.type) - 'EXDRC'.indexOf(b2.type) || a.name.localeCompare(b2.name));
    const typeOf = r => r.type || (cm[r.comp] || {}).type || 'E';
    const calcText = (r, i) => { const f = fm[r.formula]; if (f) { let h = prettyHTML(f.expr); (f.params || []).forEach(x => { const v = r.params && r.params[x.k] != null ? r.params[x.k] : x.def; h = h.split(`<span class="fx p">${x.k}</span>`).join(`<span class="fx p">${pLabel(x, v)}</span>`); }); return h; } if (r.formula === 'STAT') return '<span class="muted">Statutory rule</span>'; if (r.formula === 'INPUT') return '<span class="muted">Entered each month</span>'; return r.expr ? `<span class="mono small">${esc(r.expr)}</span>` : '<span class="muted">—</span>'; };
    const fOpts = (r, m) => { const all = (S.fmList || []); const sug = all.filter(f => f.for === r.comp), rest = all.filter(f => f.for !== r.comp).sort((a, b2) => a.name.localeCompare(b2.name));
      const o = (v, t) => `<option value="${v}" ${r.formula === v ? 'selected' : ''}>${esc(t)}</option>`;
      return `${STRUCT.STAT_CODES.includes(r.comp) ? o('STAT', 'Statutory rule') : ''}${o('INPUT', 'Entered each month')}${o('EXPR', 'Custom formula for this site')}${sug.length ? `<optgroup label="For ${esc(m.name || r.comp)}">${sug.map(f => o(f.id, STRUCT.pretty(f.expr, cm))).join('')}</optgroup>` : ''}<optgroup label="All master formulas">${rest.map(f => o(f.id, f.name)).join('')}</optgroup>`; };
    const row = (r, i) => {
      const m = cm[r.comp] || { name: r.label || r.code, type: r.type || 'E' }; const comp = d.components[i] || {}; const f = fm[r.formula]; const type = typeOf(r);
      const val = sample && sample.r.lines[comp.code]; const isOpen = !!open[r.code || r.comp];
      const tags = [r.formula === 'EXPR' && r.expr ? '<span class="stag w">custom</span>' : '', comp.pf && type === 'E' ? '<span class="stag">PF</span>' : '', comp.esi ? '<span class="stag">ESIC</span>' : '', r.off ? '<span class="stag m">off</span>' : ''].join('');
      let detail = '';
      if (isOpen) {
        const pfDiff = r.pf != null && !!r.pf !== !!m.pf, esiDiff = r.esi != null && !!r.esi !== !!m.esi;
        let calc = '';
        if (f) calc = `${(f.params || []).length ? `<div class="sparams">${(f.params || []).map(x => { const v = r.params && r.params[x.k] != null ? r.params[x.k] : null; const u = PUNIT[x.unit || ''] || PUNIT['']; return `<label class="ef"><span class="efl">${esc(x.label || x.k)}</span><div class="rin">${u[0] === '₹' ? '<i>₹</i>' : ''}<input data-par="${i}" data-k="${esc(x.k)}" value="${v != null ? u[1](v) : ''}" placeholder="${u[1](x.def)} (default)">${u[0] === '%' ? '<i>%</i>' : ''}</div><em></em></label>`; }).join('')}</div>` : ''}<div class="fepre" style="margin-top:8px">${prettyHTML(f.expr)}</div>`;
        else if (r.formula === 'EXPR') calc = `<input class="in mono" style="width:100%;font-size:12.5px" data-expr="${i}" value="${esc(r.expr ?? '')}" placeholder="formula using this site's codes"><div style="margin-top:6px"><a href="#" class="small" data-tomaster="${i}">Save this formula to the formula master</a></div>`;
        else if (r.formula === 'INPUT') calc = `<div class="small muted">Typed in attendance review each month.</div>`;
        else if (r.formula === 'STAT') calc = '<div class="small muted">Uses the PF / ESIC / PT / LWF rule from Statutory masters.</div>';
        detail = `<div class="sdet"><div class="sdet-main"><label class="ef"><span class="efl">Calculation</span><select class="in" data-fsel="${i}">${fOpts(r, m)}</select><em></em></label>${calc}<div class="err small" id="serr${i}"></div></div>
          <div class="sdet-side"><label class="ef"><span class="efl">Column name on this site's sheet</span><input class="in" data-lab="${i}" value="${esc(r.label || '')}" placeholder="${esc(m.name)}"><em>code in formulas: <span class="mono">${esc(r.code || r.comp)}</span></em></label>
           <div class="stoggles">${type === 'E' ? `<label class="sw"><input type="checkbox" data-pf="${i}" ${comp.pf ? 'checked' : ''}><span></span>PF wage${pfDiff ? ' <i class="ovr" title="Different from the master default"></i>' : ''}</label>` : ''}${type === 'E' || type === 'X' ? `<label class="sw"><input type="checkbox" data-esi="${i}" ${comp.esi ? 'checked' : ''}><span></span>ESIC wage${esiDiff ? ' <i class="ovr"></i>' : ''}</label>` : ''}<label class="sw"><input type="checkbox" data-on="${i}" ${!r.off ? 'checked' : ''}><span></span>In use</label></div>
           <div class="row" style="gap:6px;margin-top:10px"><button class="btn sm" data-up="${i}">↑ Move up</button><button class="btn sm" data-dn="${i}">↓ Move down</button><span class="grow"></span><button class="btn sm danger" data-rm="${i}">Remove</button></div></div></div>`;
      }
      return `<div class="srow ${isOpen ? 'open' : ''} ${r.off ? 'off' : ''}"><div class="srow-h" data-tog="${esc(r.code || r.comp)}"><span class="chev">›</span><div class="srow-n"><b>${esc(r.label || m.name)}</b>${r.label && r.label !== m.name ? `<span>${esc(m.name)}</span>` : ''}</div><div class="srow-c">${calcText(r, i)}</div><div class="srow-t">${tags}</div><div class="srow-v">${val != null && !r.off ? '₹' + inr(val) : '<span class="muted">—</span>'}</div></div>${detail}</div>`;
    };
    const groups = [['E', 'Earnings', 'make up gross'], ['X', 'Paid separately', 'outside gross'], ['D', 'Deductions', ''], ['R', 'Employer contributions', 'cost only'], ['C', 'Working figures', 'helper calculations, not paid']];
    b.innerHTML = `<div class="card flush">
      <div class="chead" style="gap:12px;flex-wrap:wrap"><div class="grow"><h2>Salary structure</h2><div class="small muted">Click a component to change its formula, rates or settings.</div></div>
       <button class="btn sm ghost" id="st_exp">${st.every(r => open[r.code || r.comp]) ? 'Collapse all' : 'Expand all'}</button></div>
      ${sample ? `<div class="ssample"><span>Sample: <b>${esc(sample.emp.name)}</b></span><span>Gross <b>₹${inr(sample.r.GROSS)}</b></span><span>Deductions <b>₹${inr(sample.r.DED)}</b></span><span class="net">Net <b>₹${inr(sample.r.NET)}</b></span>${sample.r.er.EXTRA ? `<span>Employer extras <b>₹${inr(sample.r.er.EXTRA)}</b></span>` : ''}</div>` : `<div class="err" style="padding:10px 20px">${esc(serr || '')}</div>`}
      ${groups.map(([t, title, sub]) => { const idx = st.map((r, i) => i).filter(i => typeOf(st[i]) === t); if (!idx.length) return ''; return `<div class="sgrp"><div class="sgrp-h"><span class="sbar ${t}"></span><b>${title}</b><span class="small muted">${idx.length}${sub ? ' · ' + sub : ''}</span></div>${idx.map(i => row(st[i], i)).join('')}</div>`; }).join('')}
      <div class="stfoot"><div class="row" style="gap:8px"><select class="in" id="st_add" style="width:300px"><option value="">Add a component from the master…</option>${['E', 'X', 'D', 'R', 'C'].map(t => { const g = avail.filter(c => c.type === t); return g.length ? `<optgroup label="${TYPE_PILL[t][0]}s">${g.map(c => `<option value="${c.code}">${esc(c.name)}</option>`).join('')}</optgroup>` : ''; }).join('')}</select><button class="btn" id="st_addb">Add</button><a href="#" class="small" id="st_newc">New component in master</a></div></div>
    </div>${saveBar()}`;
    const ch = () => { setTimeout(draw, 0); };
    b.querySelectorAll('[data-tog]').forEach(h => h.onclick = () => { const k = h.dataset.tog; open[k] = !open[k]; draw(); });
    $('#st_exp').onclick = () => { const all = st.every(r => open[r.code || r.comp]); st.forEach(r => open[r.code || r.comp] = !all); draw(); };
    b.querySelectorAll('[data-fsel]').forEach(el => el.onchange = () => { const r = st[+el.dataset.fsel]; const v = el.value; if (v === 'EXPR' && r.formula !== 'EXPR') r.expr = (d.components[+el.dataset.fsel] || {}).formula || ''; r.formula = v; if (!fm[v]) delete r.params; ch(); });
    b.querySelectorAll('[data-par]').forEach(el => el.onchange = () => { const r = st[+el.dataset.par]; const f = fm[r.formula]; const x = (f.params || []).find(y => y.k === el.dataset.k); r.params = r.params || {}; if (el.value.trim() === '') delete r.params[x.k]; else r.params[x.k] = pStore(x, num(el.value)); if (!Object.keys(r.params).length) delete r.params; ch(); });
    b.querySelectorAll('[data-expr]').forEach(el => el.onchange = () => { st[+el.dataset.expr].expr = el.value.trim(); ch(); });
    b.querySelectorAll('[data-lab]').forEach(el => el.onchange = () => { const r = st[+el.dataset.lab]; if (el.value.trim()) r.label = el.value.trim(); else delete r.label; ch(); });
    const flag = (attr, key) => b.querySelectorAll(`[data-${attr}]`).forEach(el => el.onchange = () => { const r = st[+el.dataset[attr]]; const m = cm[r.comp] || {}; if (!!el.checked === !!m[key] && m.code) delete r[key]; else r[key] = el.checked; ch(); });
    flag('pf', 'pf'); flag('esi', 'esi');
    b.querySelectorAll('[data-on]').forEach(el => el.onchange = () => { const r = st[+el.dataset.on]; if (el.checked) delete r.off; else r.off = true; ch(); });
    const sameTypeNeighbour = (i, dir) => { const t = typeOf(st[i]); for (let j = i + dir; j >= 0 && j < st.length; j += dir) if (typeOf(st[j]) === t) return j; return -1; };
    b.querySelectorAll('[data-up]').forEach(x => x.onclick = () => { const i = +x.dataset.up, j = sameTypeNeighbour(i, -1); if (j >= 0) { [st[j], st[i]] = [st[i], st[j]]; ch(); } });
    b.querySelectorAll('[data-dn]').forEach(x => x.onclick = () => { const i = +x.dataset.dn, j = sameTypeNeighbour(i, 1); if (j >= 0) { [st[j], st[i]] = [st[i], st[j]]; ch(); } });
    b.querySelectorAll('[data-rm]').forEach(x => x.onclick = () => { const i = +x.dataset.rm; const code = st[i].code || st[i].comp; const usedBy = d.components.filter((c, j) => j !== i && c.formula && new RegExp('\\b' + code + '\\b').test(c.formula)).map(c => c.label); if (usedBy.length) { toast(`${code} is used in: ${usedBy.slice(0, 3).join(', ')}`); return; } st.splice(i, 1); ch(); });
    $('#st_addb').onclick = () => { const code = $('#st_add').value; if (!code) return; const m = cm[code]; const row = { comp: code, code, formula: STRUCT.STAT_CODES.includes(code) ? 'STAT' : (S.fmList || []).find(f => f.for === code) ? (S.fmList || []).find(f => f.for === code).id : 'EXPR' }; if (row.formula === 'EXPR') row.expr = '0';
      const firstD = st.findIndex(r => typeOf(r) === 'D'); const at = ['D', 'R'].includes(m.type) || firstD < 0 ? st.length : firstD; st.splice(at, 0, row); open[code] = true; ch(); };
    $('#st_newc').onclick = e => { e.preventDefault(); compModal(null); };
    b.querySelectorAll('[data-tomaster]').forEach(a => a.onclick = e => { e.preventDefault(); toMasterModal(d, +a.dataset.tomaster, draw); });
    $('#ssave').onclick = () => { if (validate()) saveSite(d); else toast('Fix the formula errors first'); };
    validate();
  };
  const validate = () => { let ok = true; for (let i = 0; i < d.components.length; i++) { const m = checkFormula(d, i); if (m) { const k = d.structure[i].code || d.structure[i].comp; if (!S.setup.openRows[k]) { S.setup.openRows[k] = true; setTimeout(draw, 0); } const el = $('#serr' + i); if (el) el.textContent = m.replace(/^.*?:/, '').slice(0, 120); ok = false; break; } } const sm = $('#ssavemsg'); if (sm) sm.textContent = ok ? 'All formulas calculate.' : 'A formula has an error — see the open component.'; return ok; };
  draw();
}
function toMasterModal(d, i, redraw) {
  const r = d.structure[i]; const cm = cmByCode();
  // turn this site's codes into component references so other sites can use it
  const codeToComp = {}; d.structure.forEach(x => { if (x.comp) codeToComp[x.code || x.comp] = x.comp; });
  const expr = String(r.expr || '').replace(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g, (m, k) => codeToComp[k] && k !== (r.code || r.comp) ? '[' + codeToComp[k] + ']' : m);
  $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:620px"><h2>Save to formula master</h2><p class="small muted">Other sites can then pick it. Component codes become component references; change any number that differs by site into a parameter like <span class="mono">{PCT}</span>.</p>
   <label class="f">Name<input class="in" id="tm_name" value="${esc((cm[r.comp] || {}).name || r.code)} — "></label><label class="f" style="margin-top:10px">Formula<input class="in mono" id="tm_expr" value="${esc(expr)}"></label>
   <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" id="tm_ok">Save and use here</button></div></div></div>`;
  $('#tm_ok').onclick = async () => {
    const e2 = $('#tm_expr').value.trim(); const params = STRUCT.formulaNeeds(e2).params.map(k => ({ k, label: k, unit: '', def: 0 })); const er = formulaCheck(e2, params); if (er) { toast('Formula error: ' + er); return; }
    const nmax = Math.max(0, ...(S.fmList || []).map(f => +String(f.id).slice(1) || 0)); const f = { id: 'F' + String(nmax + 1).padStart(3, '0'), name: $('#tm_name').value.trim() || 'New formula', expr: e2, params, for: r.comp, desc: 'From ' + d.name };
    S.fmList = [...(S.fmList || []), f]; if (!(await saveMasters('formulas'))) return; r.formula = f.id; delete r.expr; closeModal(); redraw(); toast('Saved to the formula master — save the site to keep the change');
  };
}
function newSiteModal() {
  $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:560px"><h2>New site from a template</h2>
  <p class="small muted">Copy an existing site's component logic, then adjust names, rates and formulas.</p>
  <label class="f">Copy logic from<select class="in" id="ns_t">${(Object.keys(S.sites).length ? siteList() : TEMPLATES).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
  <div class="grid g2" style="margin-top:10px"><label class="f">New site ID<input class="in mono" id="ns_id" placeholder="CLIENT-LOCATION"></label><label class="f">Site name<input class="in" id="ns_name"></label></div>
  <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" id="ns_c">Cancel</button><button class="btn pri" id="ns_ok">Create site</button></div></div></div>`;
  $('#ns_c').onclick = () => closeModal();
  $('#ns_ok').onclick = async () => {
    const id = $('#ns_id').value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, ''); if (!id || S.sites[id]) { toast('Enter a new, unique site ID'); return; }
    const src = S.sites[$('#ns_t').value] || TEMPLATES.find(t => t.id === $('#ns_t').value);
    const d = JSON.parse(JSON.stringify(strip(src))); d.id = id; d.name = $('#ns_name').value || id; delete d.attMap;
    await put('sites/' + id, storeDoc(d)); S.siteDocs[id] = Object.assign({ _id: id }, storeDoc(d)); resolveAll(); await put('employees/' + id, { list: [] }); closeModal(); S.setup.site = id; go('setup');
  };
}

// ---------------- Employees & IOM ----------------
const EMP_SECTIONS = [
  ['Personal', [['name', 'Full name'], ['father', "Father's / husband's name"], ['sex', 'Sex (M/F)'], ['dob', 'Date of birth', 'date'], ['mobile', 'Mobile'], ['email', 'Email'], ['address', 'Permanent address'], ['aadhaar', 'Aadhaar (last 4 only)'], ['pan', 'PAN'], ['nominee', 'Nominee'], ['nomineeRel', 'Nominee relation']]],
  ['Employment', [['code', 'Emp. code'], ['desig', 'Designation'], ['skill', 'Skill (Unskilled/Semi/Skilled/Highly)'], ['doj', 'Date of joining', 'date'], ['clientId', 'Client attendance ID']]],
  ['Salary', [['rate', 'Salary rate (gross)', 'number'], ['rateType', 'Rate type (M/D, blank = site)'], ['basic', 'Basic rate (per day, or monthly fixed)', 'number']]],
  ['Statutory', [['uan', 'UAN'], ['esicNo', 'ESIC IP no.']]],
  ['Bank', [['bankName', 'Bank name'], ['acct', 'Bank account no.'], ['ifsc', 'IFSC'], ['branch', 'Branch']]]];
const EMP_FIELDS = EMP_SECTIONS.flatMap(x => x[1]);
const EMP_REQ = [['name', 'Name'], ['father', "Father's name"], ['sex', 'Sex'], ['dob', 'Date of birth'], ['doj', 'Date of joining'], ['desig', 'Designation'], ['mobile', 'Mobile'], ['aadhaar', 'Aadhaar'], ['uan', 'UAN'], ['esicNo', 'ESIC IP'], ['acct', 'Bank account'], ['ifsc', 'IFSC']];
const empMissing = e => EMP_REQ.filter(([k]) => e[k] == null || e[k] === '').map(x => x[1]).filter(x => !(x === 'ESIC IP' && e.esi === false));
const empPct = e => Math.round(100 * (1 - empMissing(e).length / EMP_REQ.length));
const allEmps = () => siteList().flatMap(st => empsOf(st.id).map((e, idx) => ({ e, st, idx })));
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
function vEmployees(p) {
  const F = S.em || (S.em = { q: '', site: S.empSite || '', st: 'ACTIVE', miss: '', page: 0, tab: 'list', open: null });
  if (F.form) return empForm(p, F);
  if (F.open) return empProfile(p, F);
  const all = allEmps(); const act = all.filter(x => x.e.status !== 'EXIT');
  const ym0 = S.month; const joined = act.filter(x => (x.e.doj || '').slice(0, 7) === ym0).length; const exited = all.filter(x => x.e.status === 'EXIT' && (x.e.exitDate || '').slice(0, 7) === ym0).length;
  const incomplete = act.filter(x => empMissing(x.e).length).length;
  const q = F.q.trim().toLowerCase();
  let list = all.filter(x => (!F.site || x.st.id === F.site) && (F.st === 'ALL' || (F.st === 'EXIT' ? x.e.status === 'EXIT' : x.e.status !== 'EXIT')) && (!F.miss || (F.miss === 'ANY' ? empMissing(x.e).length : empMissing(x.e).includes(F.miss))));
  if (q) list = list.filter(x => [x.e.code, x.e.name, x.e.uan, x.e.esicNo, x.e.mobile, x.e.acct, x.e.clientId, x.e.desig].some(v => v != null && String(v).toLowerCase().includes(q)));
  const PER = 50, pages = Math.max(1, Math.ceil(list.length / PER)); if (F.page >= pages) F.page = 0;
  const shown = list.slice(F.page * PER, F.page * PER + PER);
  const ioms = Object.values(S.ioms).filter(i => !F.site || i.siteId === F.site).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const siteF = F.site ? S.sites[F.site] : null;
  p.innerHTML = `<div class="kpis" style="grid-template-columns:repeat(5,1fr)">
   <div class="kpi"><div class="l">Active employees</div><div class="v">${inr(act.length)}</div><div class="s">across ${new Set(act.map(x => x.st.id)).size} sites</div></div>
   <div class="kpi"><div class="l">Joined in ${monthName(ym0)}</div><div class="v">${joined}</div><div class="s">by date of joining</div></div>
   <div class="kpi"><div class="l">Exits in ${monthName(ym0)}</div><div class="v">${exited}</div><div class="s">${all.length - act.length} exited in total</div></div>
   <div class="kpi"><div class="l">Profiles incomplete</div><div class="v" style="color:${incomplete ? 'var(--warn)' : 'inherit'}">${inr(incomplete)}</div><div class="s"><a href="#" id="k_inc">show them</a></div></div>
   <div class="kpi"><div class="l">UAN missing</div><div class="v">${inr(act.filter(x => !x.e.uan).length)}</div><div class="s"><a href="#" id="k_uan">show them</a></div></div></div>
  <div class="card flush">
   <div class="chead" style="flex-wrap:wrap;gap:10px"><div class="seg">${[['list', 'Employees'], ['iom', 'IOM log']].map(([k, t]) => `<button class="${F.tab === k ? 'on' : ''}" data-tab="${k}">${t}${k === 'iom' ? `<span>${ioms.length}</span>` : `<span>${inr(list.length)}</span>`}</button>`).join('')}</div><span class="grow"></span>
    <button class="btn" id="e_tpl">Import template</button><button class="btn" id="e_imp">Bulk import</button><button class="btn" id="e_exp">Download master</button><button class="btn pri" id="e_new">+ Add employee</button></div>
   <div class="efilt"><div class="rin" style="width:300px"><i style="font-size:15px">⌕</i><input id="e_q" placeholder="Search name, code, UAN, mobile, account" value="${esc(F.q)}"></div>
    <select class="in" id="e_site" style="width:300px"><option value="">All sites (${siteList().length})</option>${siteList().map(st => `<option value="${st.id}" ${F.site === st.id ? 'selected' : ''}>${esc(st.name)} (${empsOf(st.id).filter(e => e.status !== 'EXIT').length})</option>`).join('')}</select>
    <div class="seg">${[['ACTIVE', 'Active'], ['EXIT', 'Exited'], ['ALL', 'All']].map(([k, t]) => `<button class="${F.st === k ? 'on' : ''}" data-st="${k}">${t}</button>`).join('')}</div>
    <select class="in" id="e_miss" style="width:190px"><option value="">Any profile</option><option value="ANY" ${F.miss === 'ANY' ? 'selected' : ''}>Incomplete profiles</option>${EMP_REQ.map(([, t]) => `<option value="${t}" ${F.miss === t ? 'selected' : ''}>Missing ${t}</option>`).join('')}</select></div>
   ${siteF && F.tab === 'list' ? `<div class="esite"><span class="mcode">${siteF.state}</span><div class="grow"><b>${esc(siteF.name)}</b><span class="small muted"> · ${esc(siteF.client || '')} · ${(siteF.rateType === 'D') ? 'daily rated' : 'monthly rated'} · ${empsOf(siteF.id).filter(e => e.status !== 'EXIT').length} active</span></div><button class="btn sm" onclick="iomModal('TRANSFER')">Transfer in</button></div>` : ''}
   ${F.tab === 'iom' ? (ioms.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Entered</th><th>Type</th><th>Employee</th><th>Site</th><th>Effective</th><th>Details</th></tr></thead><tbody>${ioms.map(i => `<tr><td class="small">${new Date(i.at).toLocaleString('en-IN')}</td><td><span class="pill p-pri">${i.type}</span></td><td>${esc(i.code)} · ${esc(i.name || '')}</td><td class="small">${esc((S.sites[i.siteId] || {}).name || '')}</td><td class="small">${esc(i.effective || '')}</td><td class="small">${esc(i.details || '')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No IOMs yet. Joinings, rate changes, transfers and exits are logged here.</div>') :
   `<div class="scroll"><table class="tbl etbl"><thead><tr><th>Employee</th>${F.site ? '' : '<th>Site</th>'}<th>Designation</th><th class="n">Rate</th><th>Joined</th><th>UAN</th><th>ESIC IP</th><th>Bank</th><th>Profile</th><th>Status</th></tr></thead><tbody>
    ${shown.map(({ e, st }) => { const pc = empPct(e); const ms = empMissing(e); return `<tr class="erow" data-open="${st.id}|${esc(e.code)}"><td><div class="eav"><span>${esc(initials(e.name))}</span><div><b>${esc(e.name)}</b><em class="mono">${esc(e.code)}</em></div></div></td>${F.site ? '' : `<td class="small" style="max-width:220px;overflow:hidden;text-overflow:ellipsis">${esc(st.name)}</td>`}<td class="small">${esc(e.desig || '')}</td><td class="n" style="white-space:nowrap">${+e.rate > 0 ? `${inr(e.rate, (e.rateType || st.rateType) === 'D' ? 2 : 0)}<span class="small muted"> /${(e.rateType || st.rateType) === 'D' ? 'day' : 'mo'}</span>` : '<span class="flag">salary not set</span>'}</td><td class="small">${esc(e.doj || '') || '<span class="muted">—</span>'}</td><td class="small mono">${esc(e.uan || '') || '<span class="flag">missing</span>'}</td><td class="small mono">${esc(e.esicNo || '') || (e.esi === false ? '<span class="muted">n/a</span>' : '<span class="flag">missing</span>')}</td><td class="small mono">${e.acct ? '••' + esc(String(e.acct).slice(-4)) : '<span class="flag">missing</span>'}</td><td title="${esc(ms.length ? 'Missing: ' + ms.join(', ') : 'Complete')}"><div class="pbar"><i style="width:${pc}%;background:${pc === 100 ? 'var(--ok)' : pc >= 70 ? 'var(--pri)' : 'var(--warn)'}"></i></div><span class="small muted">${pc}%</span></td><td>${e.status === 'EXIT' ? '<span class="pill p-mute">Exited</span>' : '<span class="pill p-ok">Active</span>'}</td></tr>`; }).join('') || `<tr><td colspan="10" class="empty">No employees match.</td></tr>`}</tbody></table></div>
   <div class="row" style="padding:10px 20px;border-top:1px solid var(--line2)"><span class="small muted grow">${list.length ? `${F.page * PER + 1}–${Math.min(list.length, F.page * PER + PER)} of ${inr(list.length)}` : ''}</span><button class="btn sm" id="pg_p" ${F.page ? '' : 'disabled'}>‹ Previous</button><span class="small">Page ${F.page + 1} of ${pages}</span><button class="btn sm" id="pg_n" ${F.page < pages - 1 ? '' : 'disabled'}>Next ›</button></div>`}
  </div>`;
  p.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { F.tab = b.dataset.tab; render(); });
  p.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { F.st = b.dataset.st; F.page = 0; render(); });
  $('#e_site').onchange = e => { F.site = e.target.value; S.empSite = F.site || S.empSite; F.page = 0; render(); };
  $('#e_miss').onchange = e => { F.miss = e.target.value; F.page = 0; render(); };
  let t; $('#e_q').oninput = e => { clearTimeout(t); t = setTimeout(() => { F.q = e.target.value; F.page = 0; render(); const i = $('#e_q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); };
  $('#k_inc').onclick = e => { e.preventDefault(); F.miss = 'ANY'; F.st = 'ACTIVE'; F.tab = 'list'; render(); };
  $('#k_uan').onclick = e => { e.preventDefault(); F.miss = 'UAN'; F.st = 'ACTIVE'; F.tab = 'list'; render(); };
  const pp = $('#pg_p'), pn = $('#pg_n'); if (pp) pp.onclick = () => { F.page--; render(); }; if (pn) pn.onclick = () => { F.page++; render(); };
  p.querySelectorAll('[data-open]').forEach(r => r.onclick = () => { F.open = r.dataset.open; render(); window.scrollTo(0, 0); });
  $('#e_new').onclick = () => openEmpForm('JOIN', F.site || S.empSite || (siteList()[0] || {}).id);
  $('#e_exp').onclick = () => exportEmpMaster(list);
  $('#e_tpl').onclick = () => saveFile('Employee_Import_Template.xlsx', xlsxBytes([{ name: 'Employees', rows: [['Site', ...EMP_FIELDS.map(f => f[1]), 'PF applicable (Y/N)', 'ESIC (Y/N/blank=auto)'], [siteF ? siteF.name : (siteList()[0] || {}).name || '', ...EMP_FIELDS.map(() => '')]], cols: [36, ...EMP_FIELDS.map(() => 16), 12, 12] }, { name: 'Sites', rows: [['Site name (copy exactly into the Site column)', 'Site ID', 'State'], ...siteList().map(st => [st.name, st.id, st.state])], cols: [50, 22, 8] }]));
  $('#e_imp').onclick = () => importEmployees();
}
const BANKS = { SBIN: 'State Bank of India', HDFC: 'HDFC Bank', ICIC: 'ICICI Bank', UTIB: 'Axis Bank', PUNB: 'Punjab National Bank', BARB: 'Bank of Baroda', CNRB: 'Canara Bank', UBIN: 'Union Bank of India', BKID: 'Bank of India', IDIB: 'Indian Bank', IOBA: 'Indian Overseas Bank', MAHB: 'Bank of Maharashtra', CBIN: 'Central Bank of India', UCBA: 'UCO Bank', PSIB: 'Punjab & Sind Bank', KKBK: 'Kotak Mahindra Bank', YESB: 'Yes Bank', INDB: 'IndusInd Bank', IDFB: 'IDFC First Bank', FDRL: 'Federal Bank', KARB: 'Karnataka Bank', SIBL: 'South Indian Bank', RATN: 'RBL Bank', AUBL: 'AU Small Finance Bank', DCBL: 'DCB Bank', CSBK: 'CSB Bank', KVBL: 'Karur Vysya Bank', TMBL: 'Tamilnad Mercantile Bank', CIUB: 'City Union Bank', JAKA: 'J&K Bank', BDBL: 'Bandhan Bank', ESFB: 'Equitas Small Finance Bank', UJVN: 'Ujjivan Small Finance Bank', AIRP: 'Airtel Payments Bank', IPOS: 'India Post Payments Bank', SVCB: 'SVC Co-operative Bank', COSB: 'Cosmos Co-operative Bank', SRCB: 'Saraswat Co-operative Bank', GSCB: 'Gujarat State Co-op Bank', KCCB: 'Kalupur Commercial Co-op Bank', NKGS: 'NKGSB Co-op Bank', ABHY: 'Abhyudaya Co-op Bank', HSBC: 'HSBC', SCBL: 'Standard Chartered', CITI: 'Citibank', DBSS: 'DBS Bank' };
const SKILLS = ['Unskilled', 'Semi-skilled', 'Skilled', 'Highly skilled'];
const RELATIONS = ['Wife', 'Husband', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Other'];
// field definitions for the employee form: key, label, kind, options
const EF = {
  personal: { t: 'Personal details', d: 'As on Aadhaar / bank records', f: [
    ['name', 'Full name', 'text', { req: 1, span: 2, ph: 'As on Aadhaar', cap: 1 }], ['father', "Father's / husband's name", 'text', { span: 2, cap: 1 }],
    ['sex', 'Gender', 'seg', { opts: [['M', 'Male'], ['F', 'Female'], ['O', 'Other']] }], ['dob', 'Date of birth', 'date', {}], ['mobile', 'Mobile number', 'mobile', {}], ['email', 'Email', 'email', { ph: 'optional' }],
    ['address', 'Permanent address', 'area', { span: 4 }], ['aadhaar', 'Aadhaar — last 4 digits', 'digits', { len: 4, ph: 'XXXX' }], ['pan', 'PAN', 'pan', { ph: 'ABCDE1234F' }], ['nominee', 'Nominee name', 'text', { cap: 1 }], ['nomineeRel', 'Relation', 'select', { opts: RELATIONS }]] },
  job: { t: 'Employment', d: 'Site mapping and position', f: [
    ['__site', 'Site', 'site', { req: 1, span: 2 }], ['code', 'Employee code', 'text', { req: 1, mono: 1 }], ['clientId', 'Client attendance ID', 'text', { ph: 'if different', mono: 1 }],
    ['desig', 'Designation', 'desig', { req: 1 }], ['skill', 'Skill category', 'seg', { opts: SKILLS.map(x => [x, x.replace('-skilled', '').replace(' skilled', '')]), span: 2 }], ['doj', 'Date of joining', 'date', { req: 'join' }]] },
  stat: { t: 'Statutory IDs', d: 'For ECR, ESIC returns and registers', f: [['uan', 'UAN', 'digits', { len: 12, ph: '12 digits', span: 2 }], ['esicNo', 'ESIC IP number', 'digits', { len: 10, ph: '10 digits', span: 2 }]] },
  bank: { t: 'Bank account', d: 'Salary is paid to this account', f: [['acct', 'Account number', 'acct', { span: 2 }], ['acct2', 'Confirm account number', 'acct', { span: 2, noSave: 1 }], ['ifsc', 'IFSC', 'ifsc', { ph: 'SBIN0001234' }], ['bankName', 'Bank name', 'text', { hint: 'filled from IFSC' }], ['branch', 'Branch', 'text', { span: 2, ph: 'optional' }]] },
};
// ---- site-specific salary structure ----
const ENGINE_VARS = new Set(['PD', 'OTD', 'OTH', 'NH', 'WOT', 'ODI', 'LD', 'WD', 'TD', 'HRS', 'RATE', 'BASIC', 'DAILY', 'DRATE', 'MRATE', 'GROSS', 'PFW', 'ESIW', 'NET', 'ADV', 'LOAN', 'HELD', 'ELEC', 'GATEPASS', 'PENALTY', 'OTHDED', 'CANTEEN']);
function salarySpec(site, emp) {
  const comps = site.components.filter(c => !c.off); const codes = new Set(site.components.map(c => c.code));
  const usedBy = {}; const formulaOf = c => (emp && emp.formulas && emp.formulas[c.code] != null) ? emp.formulas[c.code] : c.formula;
  for (const c of comps) { const f = formulaOf(c); if (!f) continue; let ids = []; try { ids = E.compile(f).ids; } catch (e) { } ids.forEach(id => (usedBy[id] = usedBy[id] || []).push(c.label || c.code)); }
  const att = new Set(Object.keys(codesOf(site)).concat(['PD', 'OTD', 'OTH', 'NH', 'WOT', 'ODI']));
  const allF = comps.map(formulaOf).join(' ');
  const basicDaily = /BASIC\s*\*\s*(PD|TD|TOTAL)/i.test(allF) || (site.rateType === 'D');
  const dp = site.designationParams || {}; const dpKeys = new Set(Object.values(dp).flatMap(o => Object.keys(o)));
  const params = Object.keys(usedBy).filter(id => !codes.has(id) && !ENGINE_VARS.has(id) && ((site.params || {})[id] !== undefined || dpKeys.has(id))).map(id => ({ k: id, site: (site.params || {})[id], used: usedBy[id] }));
  const inputs = comps.filter(c => c.input).map(c => { const v = (c.formula || '').trim(); const key = /^[A-Z_][A-Z0-9_]*$/.test(v) && v !== c.code ? v : c.code; return { k: key, code: c.code, label: c.label || c.code, type: c.type }; }).filter(x => !['ADV', 'LOAN', 'HELD', 'IN_HELD', 'IN_ADV'].includes(x.k));
  const inputKeys = new Set(inputs.map(x => x.k));
  const extras = Object.keys(usedBy).filter(id => !/^IN_(HELD|ADV|LOAN)$/.test(id) && !codes.has(id) && !ENGINE_VARS.has(id) && !att.has(id) && !params.some(p => p.k === id) && !inputKeys.has(id)).map(id => ({ k: id, used: usedBy[id] }));
  return { comps, usedBy, basicDaily, usesBasic: !!usedBy.BASIC, usesRate: !!(usedBy.RATE || usedBy.DRATE || usedBy.MRATE), params, inputs, extras, dp };
}
const desigParamsFor = (site, desig) => { const dp = site.designationParams || {}; const k = Object.keys(dp).find(x => String(desig || '').trim().toUpperCase().replace(/\.$/, '') === x.toUpperCase()); return k ? dp[k] : {}; };
function salaryPreview(site, emp) {
  const wd = site.divisor && site.divisor.type === 'fixed' ? site.divisor.days : siteCalWD(site);
  const att = { PD: wd, OTD: 0, OTH: 0, NH: 0, WOT: 0, ODI: 0, WD: wd };
  const r = E.calcEmployee(site, emp, att, {}, { month: ym()[1], year: ym()[0], calendarWD: siteCalWD(site) }); return { r, wd };
}
const SAL_NICE = (k, used) => { const u = (used && used[0] ? String(used[0]) : '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/[.\s]+$/, '').trim();
  if (/P$|PCT|PERC/.test(k) && u) return `${u} %`; if (/RATE/.test(k) && u) return `${u} rate`; if (/FIX|AMT|AMOUNT/.test(k) && u) return `${u} (fixed)`; return u || k; };
const isPctKey = (k, v) => v != null && +v > 0 && +v < 1 && /P$|PCT|PERC/.test(k);
function payslipHTML(site, emp, compact) {
  let r, wd; try { ({ r, wd } = salaryPreview(site, emp)); } catch (e) { return `<div class="err" style="padding:16px">${esc(e.message)}</div>`; }
  const comps = site.components.filter(c => !c.off); const pay = Object.values(r.groups).reduce((a, b) => a + b, 0); const ctc = r.GROSS + pay + r.er.TOTAL;
  const rows = (type, base) => comps.filter(c => c.type === type && r.lines[c.code]).map(c => { const v = r.lines[c.code]; const w = base > 0 ? Math.max(0, Math.min(100, v / base * 100)) : 0;
    return `<div class="psr"><div class="psl"><span>${esc(c.label || c.code)}${emp.formulas && emp.formulas[c.code] != null ? ' <i class="psown">own formula</i>' : ''}</span><div class="psbar ${type}"><i style="width:${w}%"></i></div></div><b class="${v < 0 ? 'neg' : ''}">${inr(v)}</b></div>`; }).join('');
  const er = [['Employer PF (EPF + EPS)', r.er.EPF + r.er.EPS], ['EDLI + PF admin', r.er.EDLI + r.er.ADMIN], ['Employer ESIC', r.er.ESI], ['Employer LWF', r.er.LWF], ...Object.entries(r.erx || {}).map(([k, v]) => [(comps.find(c => c.code === k) || {}).label || k, v])].filter(x => x[1]);
  return `<div class="pshead"><div class="small">Monthly salary · full month · ${wd} days</div><div class="psnet"><span>Net pay</span><b>₹${inr(r.NET)}</b></div>
   <div class="pskpi"><div><span>Gross</span><b>₹${inr(r.GROSS)}</b></div><div><span>Deductions</span><b>₹${inr(r.DED)}</b></div><div><span>Cost to company</span><b>₹${inr(ctc)}</b></div></div></div>
   <div class="psbody"><div class="pss">Earnings <span>₹${inr(r.GROSS)}</span></div>${rows('E', r.GROSS) || '<div class="psr muted small">None</div>'}
   ${pay ? `<div class="pss">Paid separately <span>₹${inr(pay)}</span></div>${rows('X', r.GROSS)}` : ''}
   <div class="pss">Deductions <span>₹${inr(r.DED)}</span></div>${rows('D', r.GROSS) || '<div class="psr muted small">None</div>'}
   ${compact ? '' : `<div class="pss">Employer contributions <span>₹${inr(r.er.TOTAL)}</span></div>${er.map(([l, v]) => `<div class="psr"><div class="psl"><span>${l}</span></div><b>${inr(v)}</b></div>`).join('') || '<div class="psr muted small">None</div>'}`}</div>`;
}
function salaryPanelHTML(site, d, opts = {}) {
  const sp = salarySpec(site, d); const ex = d.extra || {}; const dpar = desigParamsFor(site, d.desig);
  const daily = (d.rateType || site.rateType) === 'D';
  const div = site.divisor && site.divisor.type === 'fixed' ? `${site.divisor.days}-day month` : 'calendar working days';
  const big = (key, label, val, unit, hint, req) => `<label class="cp"><span class="cpl">${label}${req ? ' <b>*</b>' : ''}</span><div class="cpin"><i>₹</i><input data-sal="${key}" inputmode="decimal" value="${esc(val ?? '')}" placeholder="0"><em>${unit}</em></div><span class="cph">${hint}</span></label>`;
  const rateRow = (key, label, code, def, defSrc, val, pct, used) => `<tr><td><div class="rtl">${esc(label)}</div><div class="rtc mono">${esc(code)}${used ? ` · ${esc(used)}` : ''}</div></td><td class="n rtd">${def != null && def !== '' ? (pct ? +(def * 100).toFixed(4) + '%' : '₹' + inr(def, 2).replace(/\.00$/, '')) : '<span class="muted">—</span>'}${defSrc ? `<div class="rtc">${defSrc}</div>` : ''}</td>
    <td class="n" style="width:170px"><div class="rin sm" style="width:150px;margin-left:auto">${pct ? '' : '<i>₹</i>'}<input data-sal="x:${esc(code)}" ${pct ? 'data-pct="1"' : ''} inputmode="decimal" value="${esc(val != null ? (pct ? +(val * 100).toFixed(4) : val) : '')}" placeholder="${def != null ? 'default' : ''}">${pct ? '<i>%</i>' : ''}</div></td></tr>`;
  const usedTxt = id => (sp.usedBy[id] || []).slice(0, 2).map(x => String(x).replace(/\s*\(.*?\)\s*/g, ' ').trim()).join(', ');
  return `<div class="salgrid"><div>
   <div class="card flush salcard">
    <div class="salhead"><span class="mcode lg">${site.state}</span><div class="grow"><b>${esc(site.name)}</b><span>${site.rateType === 'D' ? 'Daily-rated site' : 'Monthly-rated site'} · ${div}${site.esi === false ? ' · ESIC not applicable' : ''}</span></div><span class="pill p-pri">${sp.comps.filter(c => c.type === 'E').length} earnings · ${sp.comps.filter(c => c.type === 'D').length} deductions</span></div>
    <div class="salsec"><div class="salsh"><b>Core pay</b><span>The rates this site's formulas start from</span></div>
     <div class="rtype"><span class="cpl">Rate type</span><div class="seg">${[['', `Site default · ${site.rateType === 'D' ? 'daily' : 'monthly'}`], ['M', 'Monthly'], ['D', 'Daily']].map(([v, t]) => `<button type="button" class="${String(d.rateType || '') === v ? 'on' : ''}" data-salseg="rateType" data-v="${v}">${t}</button>`).join('')}</div></div>
     <div class="cpgrid">${big('rate', daily ? 'Gross rate' : 'Gross salary', d.rate, daily ? 'per day' : 'per month', sp.usesRate ? 'Used in ' + (usedTxt('RATE') || usedTxt('DRATE') || usedTxt('MRATE')) : 'Used for ESIC and PT eligibility', 1)}
      ${sp.usesBasic ? big('basic', 'Basic', d.basic, sp.basicDaily ? 'per day' : 'per month', 'Used in ' + usedTxt('BASIC') + ((sp.usedBy.BASIC || []).length > 2 ? ' and more' : ''), 0) : ''}</div>
     <div id="ef_iom" class="effrow" style="${opts.showEff ? '' : 'display:none'}"><label class="cpl" for="ef_eff">${opts.join ? 'Salary effective from' : 'Change effective from'}</label><input class="in" type="date" id="ef_eff" value="${esc(opts.eff || '')}" style="width:170px"><span class="cph">${opts.join ? 'date of joining if left blank' : 'the change is recorded in the employee history'}</span></div>
    </div>
    ${sp.params.length || sp.extras.length ? `<div class="salsec"><div class="salsh"><b>Site rates & allowances</b><span>Leave blank to use the site or designation value</span></div>
     <table class="tbl nostick rtbl2"><thead><tr><th>Item</th><th class="n">Default</th><th class="n">This employee</th></tr></thead><tbody>
     ${sp.params.map(pr => { const def = dpar[pr.k] ?? pr.site; const pc = isPctKey(pr.k, def); return rateRow(pr.k, SAL_NICE(pr.k, pr.used), pr.k, def, dpar[pr.k] != null ? `${esc(d.desig)} rate` : 'site rate', ex[pr.k], pc, ''); }).join('')}
     ${sp.extras.map(x => rateRow(x.k, SAL_NICE(x.k, x.used), x.k, null, '', ex[x.k], false, '')).join('')}</tbody></table></div>` : ''}
    ${sp.inputs.length ? `<div class="salsec"><div class="salsh"><b>Monthly inputs</b><span>Usual value — can be changed each month during attendance review</span></div>
     <table class="tbl nostick rtbl2"><tbody>${sp.inputs.map(x => rateRow(x.k, x.label, x.code, null, '', ex[x.k], false, x.type === 'D' ? 'deduction' : x.type === 'E' ? 'earning' : '')).join('')}</tbody></table></div>` : ''}
    <div class="salsec"><div class="salsh"><b>Statutory</b><span>Applicability at this site</span></div>
     <div class="statrow"><label class="sw"><input type="checkbox" data-sal="pf" ${d.pf !== false ? 'checked' : ''}><span></span>PF applicable</label>
      <div class="rtype" style="margin:0"><span class="cpl">ESIC</span><div class="seg">${[['', 'Auto · gross ≤ ₹21,000'], ['1', 'Covered'], ['0', 'Not covered']].map(([v, t]) => `<button type="button" class="${String(d.esi ?? '') === v ? 'on' : ''}" data-salseg="esi" data-v="${v}">${t}</button>`).join('')}</div></div></div></div>
   </div>
   ${d.formulas && Object.keys(d.formulas).length ? `<div class="card flush salcard" style="margin-top:16px"><div class="salsec" style="border:0"><div class="salsh"><b>Employee-specific formulas</b><span>Replace the site formula for this person only</span></div>
    <table class="tbl nostick rtbl2"><tbody>${Object.entries(d.formulas).map(([k, f]) => { const c = site.components.find(x => x.code === k); return `<tr><td style="width:190px"><div class="rtl">${esc(c ? c.label : k)}</div><div class="rtc mono">${k}</div></td><td><input class="in mono" style="width:100%;height:32px;font-size:12px" data-fo="${esc(k)}" value="${esc(f)}"><div class="rtc mono" style="margin-top:4px">Site formula: ${esc(c ? c.formula || 'statutory default' : 'not in this site')}</div></td><td style="width:84px" class="n"><button class="btn sm" data-fox="${esc(k)}">Remove</button></td></tr>`; }).join('')}</tbody></table></div></div>` : ''}
  </div>
  <div class="card flush salprev">${payslipHTML(site, d)}</div></div>`;
}

function openEmpForm(mode, sid, idx, tab) {
  const F = S.em; const base = mode === 'EDIT' ? JSON.parse(JSON.stringify(empsOf(sid)[idx])) : { status: 'ACTIVE', pf: true };
  if (mode === 'JOIN') { const nums = empsOf(sid).map(e => +e.code).filter(n => n > 0); base.code = nums.length ? String(Math.max(...nums) + 1) : ''; }
  base.acct2 = base.acct || ''; base.esi = base.esi === true ? '1' : base.esi === false ? '0' : '';
  base.extra = Object.assign({}, base.extra || {});
  F.form = { mode, sid, idx, d: base, orig: JSON.parse(JSON.stringify(base)), eff: '', rem: '', sec: 'personal', tab: tab || 'details' }; render(); window.scrollTo(0, 0);
}
function efCheck(k, v, d) {
  if (v == null || v === '') return '';
  switch (k) {
    case 'mobile': return /^[6-9]\d{9}$/.test(v) ? '' : 'Enter a 10-digit mobile number';
    case 'email': return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? '' : 'Not a valid email';
    case 'aadhaar': return /^\d{4}$/.test(v) ? '' : 'Only the last 4 digits';
    case 'pan': return /^[A-Z]{5}\d{4}[A-Z]$/.test(v) ? '' : 'Format: ABCDE1234F';
    case 'uan': return /^\d{12}$/.test(v) ? '' : 'UAN has 12 digits';
    case 'esicNo': return /^\d{10}$/.test(v) ? '' : 'ESIC IP number has 10 digits';
    case 'ifsc': return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v) ? '' : 'Format: 4 letters, 0, 6 characters';
    case 'acct': return /^\d{9,18}$/.test(v) ? '' : '9 to 18 digits';
    case 'acct2': return v === d.acct ? '' : 'Does not match the account number';
    case 'dob': { const a = (Date.now() - new Date(v)) / 31557600000; return a < 18 ? 'Under 18 years old' : a > 65 ? 'Over 65 years old' : ''; }
    case 'doj': return new Date(v) > new Date(Date.now() + 90 * 864e5) ? 'Date is far in the future' : '';
  }
  return '';
}
function empForm(p, F) {
  const Fm = F.form, d = Fm.d, sid = Fm.sid, st = S.sites[sid]; const join = Fm.mode === 'JOIN';
  const desigs = [...new Set(allEmps().map(x => x.e.desig).filter(Boolean).map(x => String(x).trim()))].sort();
  const fv = k => k === '__site' ? sid : d[k]; const isReq = o => o.req === 1 || (o.req === 'join' && join);
  const secState = key => { const fs = EF[key].f; const req = fs.filter(f => isReq(f[3]) && !fv(f[0])).length; const bad = fs.filter(f => efCheck(f[0], fv(f[0]), d)).length; const filled = fs.filter(f => !f[3].noSave && f[2] !== 'toggle' && fv(f[0]) != null && fv(f[0]) !== '').length; const tot = fs.filter(f => !f[3].noSave && f[2] !== 'toggle').length; return { req, bad, filled, tot }; };
  const tmp = Object.assign({}, d, { esi: d.esi === '0' ? false : d.esi === '1' ? true : undefined }); const pc = empPct(tmp), miss = empMissing(tmp);
  const SALK = ['rate', 'basic', 'desig', 'rateType', 'extra', 'formulas', 'pf', 'esi']; const clean = o => JSON.stringify(o == null ? '' : typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null).sort()) : String(o));
  const salDiff = () => !join && SALK.some(k => clean(d[k]) !== clean(Fm.orig[k])); const salChanged = salDiff();
  const salMissing = !(+d.rate > 0);
  const input = (k, kind, o) => {
    const v = fv(k) ?? ''; const err = efCheck(k, v, d); const cls = `in${o.mono ? ' mono' : ''}${err ? ' bad' : ''}`;
    let h;
    if (kind === 'seg') h = `<div class="seg fseg">${o.opts.map(([val, t]) => `<button type="button" class="${String(v) === String(val) ? 'on' : ''}" data-seg="${k}" data-v="${val}">${t}</button>`).join('')}</div>`;
    else if (kind === 'toggle') h = `<label class="sw" style="height:36px"><input type="checkbox" data-k="${k}" ${d[k] !== false ? 'checked' : ''}><span></span>${o.on}</label>`;
    else if (kind === 'area') h = `<textarea class="${cls}" data-k="${k}" rows="2" placeholder="${o.ph || 'House, street, village / town, district, state, PIN'}">${esc(v)}</textarea>`;
    else if (kind === 'select') h = `<select class="in" data-k="${k}"><option value="">—</option>${o.opts.map(x => `<option ${v === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
    else if (kind === 'site') h = `<select class="in" id="ef_site" ${join ? '' : 'disabled title="Use Transfer to move an employee to another site"'}>${siteList().map(x => `<option value="${x.id}" ${x.id === sid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`;
    else if (kind === 'desig') h = `<input class="${cls}" data-k="${k}" list="dl_desig" value="${esc(v)}" placeholder="Start typing"><datalist id="dl_desig">${desigs.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
    else if (kind === 'mobile') h = `<div class="rin ${err ? 'bad' : ''}"><i>+91</i><input data-k="${k}" inputmode="numeric" value="${esc(v)}" placeholder="98765 43210"></div>`;
    else if (kind === 'money') h = `<div class="rin"><i>₹</i><input data-k="${k}" inputmode="decimal" value="${esc(v)}" placeholder="0"></div>`;
    else h = `<input class="${cls}" data-k="${k}" type="${kind === 'date' ? 'date' : kind === 'email' ? 'email' : 'text'}" ${['digits', 'acct'].includes(kind) ? 'inputmode="numeric"' : ''} value="${esc(v)}" placeholder="${o.ph || ''}" autocomplete="off" ${kind === 'acct' && k === 'acct2' ? 'onpaste="return false"' : ''}>`;
    const hint = k === 'ifsc' && /^[A-Z]{4}/.test(v || '') ? (BANKS[v.slice(0, 4)] ? '✓ ' + BANKS[v.slice(0, 4)] : '') : (o.hint || '');
    return `<label class="ef" style="grid-column:span ${o.span || 1}"><span class="efl">${EF_LABEL(k)}${isReq(o) ? '<b>*</b>' : ''}</span>${h}<em class="${err ? 'e' : ''}" id="em_${k}">${err || hint}</em></label>`;
  };
  const EF_LABEL = k => { for (const g of Object.values(EF)) { const f = g.f.find(x => x[0] === k); if (f) return f[1]; } return k; };
  p.innerHTML = `<div class="efwrap">
   <div class="efnav"><div class="card flush">
    <div class="efwho"><div class="eav lg"><span>${esc(initials(d.name || (join ? 'New' : '?')))}</span></div><div><b>${esc(d.name || (join ? 'New employee' : ''))}</b><span>${esc(d.desig || '')}${d.code ? ' · ' + esc(d.code) : ''}</span></div></div>
    <div style="padding:0 16px 14px"><div class="small muted" style="margin-bottom:5px">Profile ${pc}% complete</div><div class="pbar lg"><i style="width:${pc}%;background:${pc === 100 ? 'var(--ok)' : pc >= 70 ? 'var(--pri)' : 'var(--warn)'}"></i></div></div>
    ${Object.entries(EF).map(([k, g]) => { const c = secState(k); return `<a class="efsec ${Fm.tab === 'details' && Fm.sec === k ? 'on' : ''}" data-go="${k}"><span class="efdot ${c.bad || c.req ? 'w' : c.filled === c.tot ? 'y' : ''}">${c.bad || c.req ? '!' : c.filled === c.tot ? '✓' : ''}</span><div class="grow"><b>${g.t}</b><span>${c.bad ? c.bad + ' to fix' : c.req ? c.req + ' required' : `${c.filled} of ${c.tot} filled`}</span></div></a>`; }).join('')}
    <a class="efsec ${Fm.tab === 'salary' ? 'on' : ''}" data-eftab="salary"><span class="efdot ${salMissing ? 'w' : 'y'}">${salMissing ? '!' : '✓'}</span><div class="grow"><b>Salary</b><span>${salMissing ? 'not set' : 'site: ' + esc(st.name.slice(0, 22))}</span></div></a>
   </div><div class="note small" id="ef_miss" style="margin-top:12px;${miss.length ? '' : 'display:none'}">Still missing: ${miss.join(', ')}</div></div>
   <div class="efmain">
    ${F.ret ? `<div class="note" style="margin-bottom:12px">Opened from <b>Process salary — ${esc(st.name)}</b>. Saving returns you to the attendance review.</div>` : ''}
    <div class="row" style="margin-bottom:12px"><div class="grow"><h2 style="margin:0;font-size:18px">${join ? 'New employee' : 'Edit employee'}</h2><div class="small muted">${join ? 'Personal details first — salary can be set now or later from the Salary tab.' : esc(st.name)}</div></div>
     <div class="seg eftabs"><button class="${Fm.tab === 'details' ? 'on' : ''}" data-eftab="details">Employee details</button><button class="${Fm.tab === 'salary' ? 'on' : ''}" data-eftab="salary">Salary at ${esc(st.name.length > 28 ? st.name.slice(0, 26) + '…' : st.name)}${salMissing ? ' <i class="sdot"></i>' : ''}</button></div></div>
    ${Fm.tab === 'details' ? Object.entries(EF).map(([k, g]) => `<div class="card efcard" id="sec_${k}"><div class="efh"><h3>${g.t}</h3><span class="small muted">${g.d}</span></div><div class="efgrid">${g.f.map(([fk, , kind, o]) => input(fk, kind, o)).join('')}</div></div>`).join('')
      + `<div class="card efcard salcta"><div class="grow"><b>Salary at ${esc(st.name)}</b><div class="small muted">${salMissing ? 'Not set yet — the salary inputs depend on this site’s components.' : `${(d.rateType || st.rateType) === 'D' ? 'Daily' : 'Monthly'} rate ₹${inr(d.rate, 2).replace(/\.00$/, '')}${d.basic != null && d.basic !== '' ? ` · basic ₹${inr(d.basic, 2).replace(/\.00$/, '')}` : ''}`}</div></div><button class="btn ${salMissing ? 'pri' : ''}" data-eftab="salary">${salMissing ? 'Set salary →' : 'View salary →'}</button></div>`
     : `<div id="salbox">${salaryPanelHTML(st, d, { eff: Fm.eff, showEff: salChanged || join, join })}</div>`}
   </div></div>
   <div class="msave show"><span class="small muted grow">${join ? `New joining at <b>${esc(st.name)}</b>` : `Editing <b>${esc(d.name || '')}</b>`} · <kbd>Ctrl</kbd>+<kbd>S</kbd> to save</span><button class="btn" id="ef_cancel">Cancel</button>${join ? '<button class="btn" id="ef_save2">Save & add another</button>' : ''}<button class="btn pri" id="ef_save">${join ? 'Save employee' : 'Save changes'}</button></div>`;
  const upd = () => { // light refresh of nav without losing focus
    const nav = p.querySelector('.efnav'); if (!nav) return;
    Object.keys(EF).forEach(k => { const c = secState(k); const a = nav.querySelector(`[data-go="${k}"]`); if (!a) return; const dot = a.querySelector('.efdot'); dot.className = 'efdot ' + (c.bad || c.req ? 'w' : c.filled === c.tot ? 'y' : ''); dot.textContent = c.bad || c.req ? '!' : c.filled === c.tot ? '✓' : ''; a.querySelector('.grow span').textContent = c.bad ? c.bad + ' to fix' : c.req ? c.req + ' required' : `${c.filled} of ${c.tot} filled`; });
    const t2 = Object.assign({}, d, { esi: d.esi === '0' ? false : d.esi === '1' ? true : undefined }); const pc2 = empPct(t2); const bar = nav.querySelector('.pbar i'); bar.style.width = pc2 + '%'; bar.style.background = pc2 === 100 ? 'var(--ok)' : pc2 >= 70 ? 'var(--pri)' : 'var(--warn)'; nav.querySelector('.pbar').previousElementSibling.textContent = `Profile ${pc2}% complete`; const mi = empMissing(t2), mb = $('#ef_miss'); if (mb) { mb.style.display = mi.length ? '' : 'none'; mb.textContent = 'Still missing: ' + mi.join(', '); }
    const w = nav.querySelector('.efwho'); w.querySelector('b').textContent = d.name || (join ? 'New employee' : ''); w.querySelector(':scope > div:last-child > span').textContent = (d.desig || '') + (d.code ? ' · ' + d.code : ''); w.querySelector('.eav span').textContent = initials(d.name || 'New');
  };
  const norm = (k, el) => { let v = el.value;
    if (['mobile', 'aadhaar', 'uan', 'esicNo', 'acct', 'acct2'].includes(k)) { v = v.replace(/\D/g, ''); if (k === 'mobile' && v.length > 10) v = v.replace(/^(91|0)/, '').slice(0, 10); const L = { aadhaar: 4, uan: 12, esicNo: 10 }[k]; if (L && v.length > L) v = k === 'aadhaar' ? v.slice(-4) : v.slice(0, L); }
    if (['pan', 'ifsc'].includes(k)) v = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (['rate', 'basic'].includes(k)) v = v.replace(/[^\d.]/g, '');
    if (v !== el.value) el.value = v; return v; };
  p.querySelectorAll('[data-k]').forEach(el => {
    const k = el.dataset.k;
    const on = () => { if (el.type === 'checkbox') d[k] = el.checked; else { const v = norm(k, el); d[k] = v; }
      const err = efCheck(k, d[k], d); const em = $('#em_' + k); const box = el.closest('.rin') || el;
      if (em && el.type !== 'checkbox') { const hint = k === 'ifsc' && BANKS[(d.ifsc || '').slice(0, 4)] ? '✓ ' + BANKS[d.ifsc.slice(0, 4)] : ''; em.textContent = document.activeElement === el && !['acct2'].includes(k) && err && String(d[k]).length < 4 ? '' : (err || hint); em.className = err && document.activeElement !== el ? 'e' : err ? 'e' : ''; box.classList.toggle('bad', !!err && document.activeElement !== el); }
      if (k === 'ifsc' && /^[A-Z]{4}/.test(d.ifsc) && BANKS[d.ifsc.slice(0, 4)] && !d.bankName) { d.bankName = BANKS[d.ifsc.slice(0, 4)]; const bn = p.querySelector('[data-k="bankName"]'); if (bn) bn.value = d.bankName; }
      if (k === 'acct') { const c2 = p.querySelector('[data-k="acct2"]'); if (c2 && c2.value) c2.dispatchEvent(new Event('blur')); }
      upd(); };
    el.addEventListener('input', on); el.addEventListener('change', on);
    el.addEventListener('blur', () => { const err = efCheck(k, d[k], d); const box = el.closest('.rin') || el; box.classList.toggle('bad', !!err); const em = $('#em_' + k); if (em && err) { em.textContent = err; em.className = 'e'; } if (el.dataset.cap === undefined && ['name', 'father', 'nominee'].includes(k) && d[k]) { d[k] = d[k].replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase()); el.value = d[k]; upd(); } });
    if (el.tagName !== 'TEXTAREA') el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const all = [...p.querySelectorAll('.efmain input:not([disabled]):not([type=checkbox]), .efmain select:not([disabled]), .efmain textarea')]; const n = all[all.indexOf(el) + 1]; if (n) n.focus(); } });
  });
  p.querySelectorAll('[data-seg]').forEach(b => b.onclick = () => { const k = b.dataset.seg; d[k] = b.dataset.v; b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); upd(); if (k === 'rateType' && !join) { const was = !!$('#ef_eff'); const now = ['rate', 'basic', 'desig', 'rateType'].some(q => String(d[q] ?? '') !== String(Fm.orig[q] ?? '')); if (was !== now) render(); } });
  // salary tab handlers
  const salRefresh = () => { const box = $('#salbox'); if (!box) return; const tmpEl = document.createElement('div'); tmpEl.innerHTML = salaryPanelHTML(S.sites[Fm.sid], d); const np = tmpEl.querySelector('.salprev'), op = box.querySelector('.salprev'); if (np && op) op.innerHTML = np.innerHTML; const sn = p.querySelector('.efsec[data-eftab="salary"]'); if (sn) { const ok = +d.rate > 0; const dot = sn.querySelector('.efdot'); dot.className = 'efdot ' + (ok ? 'y' : 'w'); dot.textContent = ok ? '✓' : '!'; sn.querySelector('.grow span').textContent = ok ? 'site: ' + S.sites[Fm.sid].name.slice(0, 22) : 'not set'; const td = p.querySelector('.eftabs .sdot'); if (td) td.style.display = ok ? 'none' : ''; }
    const ib = $('#ef_iom'); if (ib) ib.style.display = (salDiff() || join) ? '' : 'none'; };
  p.querySelectorAll('[data-sal]').forEach(el => { const k = el.dataset.sal; const on = () => {
      if (el.type === 'checkbox') d[k] = el.checked;
      else { let v = el.value.replace(/[^\d.]/g, ''); if (v !== el.value) el.value = v; if (k.startsWith('x:')) { const key = k.slice(2); if (v === '') delete d.extra[key]; else d.extra[key] = el.dataset.pct ? num(v) / 100 : num(v); } else d[k] = v; }
      salRefresh(); };
    el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => { if (el.type !== 'checkbox') { clearTimeout(el._t); el._t = setTimeout(on, 250); } else on(); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const all = [...p.querySelectorAll('#salbox input:not([type=checkbox])')]; const n = all[all.indexOf(el) + 1]; if (n) n.focus(); } }); });
  p.querySelectorAll('[data-salseg]').forEach(b => b.onclick = () => { d[b.dataset.salseg] = b.dataset.v; render(); });
  p.querySelectorAll('[data-fo]').forEach(el => el.addEventListener('change', () => { d.formulas[el.dataset.fo] = el.value.trim(); salRefresh(); }));
  p.querySelectorAll('[data-fox]').forEach(b => b.onclick = () => { delete d.formulas[b.dataset.fox]; render(); });
  const se = $('#ef_site'); if (se) se.onchange = () => { Fm.sid = se.value; const nums = empsOf(se.value).map(e => +e.code).filter(n => n > 0); if (!Fm.codeTouched) d.code = nums.length ? String(Math.max(...nums) + 1) : ''; render(); };
  const codeEl = p.querySelector('[data-k="code"]'); if (codeEl) { if (!join) codeEl.readOnly = true; codeEl.addEventListener('input', () => Fm.codeTouched = true); }
  const effEl = $('#ef_eff'); if (effEl) effEl.oninput = () => Fm.eff = effEl.value; 
  p.querySelectorAll('[data-eftab]').forEach(b => b.onclick = () => { Fm.tab = b.dataset.eftab; render(); window.scrollTo(0, 0); });
  p.querySelectorAll('[data-go]').forEach(a => a.onclick = () => { Fm.sec = a.dataset.go; if (Fm.tab !== 'details') { Fm.tab = 'details'; render(); const t0 = $('#sec_' + a.dataset.go); if (t0) window.scrollTo({ top: t0.getBoundingClientRect().top + window.scrollY - 90 }); return; } p.querySelectorAll('.efsec').forEach(x => x.classList.toggle('on', x === a)); const t = $('#sec_' + a.dataset.go); window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' }); });
  const backToRun = () => { if (!F.ret) return false; const r = F.ret; F.ret = null; F.form = null; F.open = null; go('process', { proc: r }); return true; };
  $('#ef_cancel').onclick = () => { if (backToRun()) return; const back = !join ? sid + '|' + Fm.orig.code : F.open; F.form = null; F.open = back; render(); };
  const save = async (again) => {
    const errs = []; for (const g of Object.values(EF)) for (const [k, l, , o] of g.f) { if (isReq(o) && !fv(k)) errs.push(l + ' is required'); const e2 = efCheck(k, fv(k), d); if (e2) errs.push(`${l}: ${e2}`); }
    const list = empsOf(Fm.sid);
    if (join && list.some(x => String(x.code) === String(d.code))) errs.push(`Employee code ${d.code} is already used at this site`);
    if (errs.length) { toast(errs[0] + (errs.length > 1 ? ` (+${errs.length - 1} more)` : '')); const bad = p.querySelector('.bad, .in.bad'); p.querySelectorAll('[data-k]').forEach(el => el.dispatchEvent(new Event('blur'))); const first = p.querySelector('.bad'); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    const out = JSON.parse(JSON.stringify(d)); delete out.acct2; out.esi = d.esi === '1' ? true : d.esi === '0' ? false : undefined; if (out.esi === undefined) delete out.esi;
    for (const k of ['rate', 'basic']) if (out[k] !== '' && out[k] != null) out[k] = num(out[k]); else delete out[k];
    for (const [k, v] of Object.entries(out)) if (v === '') delete out[k];
    if (out.extra) { for (const [k, v] of Object.entries(out.extra)) if (v === '' || v == null) delete out.extra[k]; if (!Object.keys(out.extra).length) delete out.extra; }
    if (out.formulas) { for (const [k, v] of Object.entries(out.formulas)) if (!v) delete out.formulas[k]; if (!Object.keys(out.formulas).length) delete out.formulas; }
    const salCh = salDiff(); let iomType = join ? 'JOIN' : salCh ? 'RATE' : 'EDIT';
    const payCh = join ? payDiff(null, out) : payDiff(Fm.orig, out); if (!join && Object.keys(payCh).length) await freezePay([Fm.sid]);
    if (join) { out.status = 'ACTIVE'; list.push(out); } else { const cur = list[Fm.idx]; Object.keys(cur).forEach(k => { if (!(k in out) && (EF_ALL.includes(k) || ['rate', 'basic', 'rateType', 'extra', 'formulas', 'esi'].includes(k))) delete cur[k]; }); Object.assign(cur, out); }
    await put('employees/' + Fm.sid, { list }); S.emps[Fm.sid] = Object.assign(S.emps[Fm.sid] || {}, { list });
    const xd = Object.keys(Object.assign({}, Fm.orig.extra, out.extra)).filter(k => clean((out.extra || {})[k]) !== clean((Fm.orig.extra || {})[k])).map(k => `${k} ${(Fm.orig.extra || {})[k] ?? '—'}→${(out.extra || {})[k] ?? '—'}`);
    const det = iomType === 'RATE' ? `Rate ₹${out.rate ?? '—'}, basic ${out.basic ?? '—'}, ${out.desig || ''}${Fm.orig.rate != null ? ` (was ₹${Fm.orig.rate}, basic ${Fm.orig.basic ?? '—'})` : ''}${xd.length ? '; ' + xd.join(', ') : ''}. ${''}` : '';
    if (Object.keys(payCh).length) await logRev(join ? 'JOIN' : 'EDIT', Fm.sid, out, payCh, { effDate: Fm.eff || (join ? out.doj || '' : ''), title: join ? 'Joining salary' : 'Salary changed in employee master' });
    if (false) await put('iom/' + Fm.sid + '_' + Date.now(), { siteId: Fm.sid, type: iomType, code: out.code, name: out.name, effective: Fm.eff || (join ? out.doj || '' : ''), details: det.trim(), at: new Date().toISOString() });
    toast(join ? `${out.name} added to ${S.sites[Fm.sid].name}` : 'Employee details saved');
    if (again) { openEmpForm('JOIN', Fm.sid); setTimeout(() => { const n = (payrollRoot() || document).querySelector('[data-k="name"]'); if (n) n.focus(); }, 50); return; }
    if (backToRun()) return;
    F.form = null; F.open = Fm.sid + '|' + out.code; render();
  };
  $('#ef_save').onclick = () => save(false); const s2 = $('#ef_save2'); if (s2) s2.onclick = () => save(true);
  document.onkeydown = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && S.view === 'employees' && S.em && S.em.form) { e.preventDefault(); save(false); } };
  if (join && !d.name) setTimeout(() => { const n = p.querySelector('[data-k="name"]'); if (n) n.focus(); }, 30);
}
const EF_ALL = Object.values(EF).flatMap(g => g.f.map(f => f[0]));
function exportEmpMaster(list) {
  const H = ['Site', 'Site ID', 'State', ...EMP_FIELDS.map(f => f[1]), 'PF applicable', 'ESIC', 'Status', 'Exit date', 'Exit reason', 'Profile complete %', 'Missing details'];
  const rows = list.map(({ e, st }) => [st.name, st.id, st.state, ...EMP_FIELDS.map(f => e[f[0]] ?? ''), e.pf === false ? 'N' : 'Y', e.esi === true ? 'Y' : e.esi === false ? 'N' : 'Auto', e.status === 'EXIT' ? 'Exited' : 'Active', e.exitDate || '', e.exitReason || '', empPct(e), empMissing(e).join(', ')]);
  saveFile(`Employee_Master_${new Date().toISOString().slice(0, 10)}.xlsx`, xlsxBytes([{ name: 'Employee master', rows: [H, ...rows], cols: [34, 18, 7, ...EMP_FIELDS.map(() => 15), 8, 7, 8, 11, 18, 9, 40] }]));
}
function importEmployees() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xls,.csv';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' }); const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    const hi = aoa.findIndex(r => r.some(c => /^site$/i.test(String(c).trim()))); if (hi < 0) { toast('No "Site" column found — use the import template'); return; }
    const H = aoa[hi].map(c => String(c).trim().toLowerCase()); const col = t => H.indexOf(t.toLowerCase());
    const byName = {}; siteList().forEach(st => { byName[st.name.trim().toLowerCase()] = st.id; byName[st.id.toLowerCase()] = st.id; });
    const plan = {}; const bad = []; let add = 0, upd = 0;
    for (const r of aoa.slice(hi + 1)) {
      if (!r.some(c => String(c).trim())) continue;
      const sid = byName[String(r[col('site')]).trim().toLowerCase()]; const code = String(r[col('Emp. code')] ?? '').trim();
      if (!sid || !code) { bad.push((r[col('Full name')] || code || '?') + (sid ? ' (no code)' : ' (site not found)')); continue; }
      const list = plan[sid] = plan[sid] || JSON.parse(JSON.stringify(empsOf(sid)));
      let e = list.find(x => String(x.code) === code); if (!e) { e = { code, status: 'ACTIVE' }; list.push(e); add++; } else upd++;
      for (const [k, t, ty] of EMP_FIELDS) { const j = col(t); if (j < 0) continue; const v = String(r[j]).trim(); if (v === '') continue; e[k] = ty === 'number' ? num(v) : (k === 'rateType' || k === 'sex') ? v.toUpperCase()[0] : (ty === 'date' && typeof r[j] === 'number') ? new Date(Math.round((r[j] - 25569) * 864e5)).toISOString().slice(0, 10) : v; }
      const jp = col('PF applicable (Y/N)'); if (jp >= 0 && String(r[jp]).trim()) e.pf = /^y/i.test(r[jp]);
      const je = col('ESIC (Y/N/blank=auto)'); if (je >= 0 && String(r[je]).trim()) e.esi = /^y/i.test(r[je]);
    }
    $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:560px"><h2>Bulk import — ${esc(f.name)}</h2>
     <div class="kpis" style="grid-template-columns:repeat(3,1fr);margin:12px 0"><div class="kpi"><div class="l">New employees</div><div class="v">${add}</div></div><div class="kpi"><div class="l">Updated</div><div class="v">${upd}</div></div><div class="kpi"><div class="l">Skipped</div><div class="v">${bad.length}</div></div></div>
     <p class="small muted">Matched on site + employee code. Blank cells leave existing details unchanged. ${Object.keys(plan).length} site${Object.keys(plan).length === 1 ? '' : 's'} affected.</p>
     ${bad.length ? `<div class="note warn small" style="max-height:120px;overflow:auto">Skipped: ${bad.slice(0, 40).map(esc).join(', ')}${bad.length > 40 ? '…' : ''}</div>` : ''}
     <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" id="imp_ok" ${add + upd ? '' : 'disabled'}>Import ${add + upd} employees</button></div></div></div>`;
    $('#imp_ok').onclick = async () => { for (const [sid, list] of Object.entries(plan)) { const before = Object.fromEntries(empsOf(sid).map(e => [String(e.code), e])); const rows = list.map(e => { const b0 = before[String(e.code)]; const ch = payDiff(b0 || null, e); return Object.keys(ch).length ? { code: String(e.code), name: e.name || '', desig: e.desig || '', ch } : null; }).filter(Boolean); if (rows.length) await freezePay([sid]); await put('employees/' + sid, { list }); S.emps[sid] = Object.assign(S.emps[sid] || {}, { list }); if (rows.length) await saveRev({ kind: 'EDIT', siteId: sid, title: 'Bulk import — ' + f.name, effective: S.month, status: 'APPLIED', createdAt: new Date().toISOString(), createdBy: who(), appliedAt: new Date().toISOString(), appliedBy: who(), rows }); } await put('iom/IMP_' + Date.now(), { siteId: '', type: 'IMPORT', code: '', name: f.name, effective: '', details: `${add} added, ${upd} updated`, at: new Date().toISOString() }); closeModal(); toast(`Imported: ${add} added, ${upd} updated`); render(); };
  };
  inp.click();
}
function empProfile(p, F) {
  const [sid, code] = F.open.split('|'); const st = S.sites[sid]; const emps = empsOf(sid); const idx = emps.findIndex(x => String(x.code) === code); const e = emps[idx];
  if (!st || !e) { F.open = null; return vEmployees(p); }
  const ms = empMissing(e), pc = empPct(e);
  const val = (k, ty) => { const v = e[k]; if (k === 'rateType' && !v) return (st.rateType === 'D' ? 'Daily' : 'Monthly') + ' <span class="muted small">(site default)</span>'; if (v == null || v === '') return '<span class="muted">—</span>'; if (ty === 'number') return inr(v, 2).replace(/\.00$/, ''); if (k === 'acct') return '<span class="mono">' + esc(v) + '</span>'; if (k === 'rateType') return v === 'D' ? 'Daily' : 'Monthly'; if (k === 'sex') return v === 'F' ? 'Female' : v === 'M' ? 'Male' : esc(v); return esc(v); };
  const hist = Object.values(S.runs).filter(r => r.siteId === sid && r.type === 'REG' && (r.att || []).some(a => String(a.code) === code)).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12).map(r => { const c = computeRun(st, r, r.month); const x = c.rows.find(y => String(y.emp.code) === code); return x ? { m: r.month, x, locked: r.status === 'LOCKED' } : null; }).filter(Boolean);
  const loans = Object.values(S.loans).filter(l => l.siteId === sid && String(l.empCode) === code);
  const held = Object.values(S.held).filter(h => h.siteId === sid && String(h.empCode) === code);
  const ioms = Object.values(S.ioms).filter(i => i.siteId === sid && String(i.code) === code).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  S.empSite = sid;
  p.innerHTML = `<div class="row" style="margin-bottom:12px"><button class="btn" id="pf_back">‹ All employees</button></div>
  <div class="card ephead"><div class="eav lg"><span>${esc(initials(e.name))}</span></div><div class="grow"><h2 style="margin:0;font-size:19px">${esc(e.name)}</h2>
   <div class="small muted" style="margin-top:3px"><span class="mono">${esc(e.code)}</span> · ${esc(e.desig || 'No designation')} · ${esc(st.name)} <span class="tag">${st.state}</span></div>
   <div class="row" style="gap:8px;margin-top:8px">${e.status === 'EXIT' ? `<span class="pill p-mute">Exited ${esc(e.exitDate || '')}</span>` : '<span class="pill p-ok">Active</span>'}${e.pf === false ? '<span class="pill p-mute">No PF</span>' : '<span class="pill p-pri">PF</span>'}${e.esi === false ? '<span class="pill p-mute">No ESIC</span>' : '<span class="pill p-pri">ESIC ' + (e.esi === true ? '' : 'auto') + '</span>'}${e.formulas && Object.keys(e.formulas).length ? `<span class="pill p-warn">${Object.keys(e.formulas).length} own formulas</span>` : ''}</div></div>
   <div style="width:210px"><div class="small muted" style="margin-bottom:5px">Profile ${pc}% complete</div><div class="pbar lg"><i style="width:${pc}%;background:${pc === 100 ? 'var(--ok)' : pc >= 70 ? 'var(--pri)' : 'var(--warn)'}"></i></div>${ms.length ? `<div class="small" style="margin-top:6px;color:var(--warn)">Missing: ${ms.join(', ')}</div>` : ''}</div>
   <div class="col" style="gap:6px;display:flex;flex-direction:column"><button class="btn pri" id="pf_edit">Edit details</button>${e.status !== 'EXIT' ? `<div class="row" style="gap:6px"><button class="btn sm" id="pf_rate">Change salary</button><button class="btn sm" id="pf_tr">Transfer</button><button class="btn sm" id="pf_exit">Exit</button></div>` : ''}</div></div>
  <div class="epgrid">${(() => { const card = ([t, fs]) =>  `<div class="card"><div class="eps">${t}</div><dl class="edl">${(t === 'Employment' ? [...fs, ['__site', 'Site']] : fs).map(([k, l, ty]) => `<dt>${l.replace(/ \(.*\)$/, '')}</dt><dd>${k === '__site' ? esc(st.name) : val(k, ty)}</dd>`).join('')}${t === 'Salary' && e.extra && Object.keys(e.extra).length ? `<dt>Extra rates</dt><dd class="mono small">${esc(Object.entries(e.extra).map(([a, b]) => a + '=' + b).join(', '))}</dd>` : ''}</dl></div>`; const sec = n => EMP_SECTIONS.find(x => x[0] === n); return card(sec('Personal')) + card(sec('Employment')) + `<div class="epcol">${card(sec('Statutory'))}${card(sec('Bank'))}</div>`; })()}</div>
  ${profSalary(st, e)}
  <div class="card flush"><div class="chead"><h2>Salary history</h2><span class="small muted">${hist.length ? 'last ' + hist.length + ' month' + (hist.length > 1 ? 's' : '') + ' at this site' : ''}</span></div>${hist.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Month</th><th class="n">Paid days</th><th class="n">OT</th><th class="n">Gross</th><th class="n">PF</th><th class="n">ESIC</th><th class="n">Deductions</th><th class="n">Net pay</th><th>Run</th></tr></thead><tbody>${hist.map(h => `<tr><td>${monthName(h.m)}</td><td class="n">${inr(h.x.att.PD, 1)}</td><td class="n">${inr((h.x.att.OTD || 0) + (h.x.att.OTH || 0), 1)}</td><td class="n">${inr(h.x.r.GROSS)}</td><td class="n">${inr(h.x.r.lines.PF || 0)}</td><td class="n">${inr(h.x.r.lines.ESI || 0)}</td><td class="n">${inr(h.x.r.DED)}</td><td class="n b">${inr(h.x.r.NET)}${h.x.r.heldFull ? ' <span class="pill p-warn">held</span>' : ''}</td><td>${h.locked ? '<span class="pill p-ok">Locked</span>' : '<span class="pill p-mute">Draft</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No salary processed for this employee yet.</div>'}</div>
  <div class="grid g2"><div class="card flush"><div class="chead"><h2>Loans & advances</h2></div>${loans.length ? `<table class="tbl"><thead><tr><th>Type</th><th>Given</th><th class="n">Amount</th><th class="n">EMI</th><th class="n">Balance</th></tr></thead><tbody>${loans.map(l => { const rec = (l.recovered || []).reduce((a, r) => a + r.amt, 0); return `<tr><td>${(LTYPE[l.type] || l.type)}</td><td class="small">${esc(l.given || '')}</td><td class="n">${inr(l.amount)}</td><td class="n">${inr(l.emi)}</td><td class="n b">${inr(l.amount - rec)}</td></tr>`; }).join('')}</tbody></table>` : '<div class="empty small">None</div>'}
   ${held.length ? `<div class="chead" style="border-top:1px solid var(--line2)"><h2>Held salary</h2></div><table class="tbl"><tbody>${held.map(h => `<tr><td>${monthName(h.month)}</td><td class="small">${esc(h.reason)}</td><td class="n">${inr(h.amount)}</td><td>${hStatus(h) === 'HELD' ? '<span class="pill p-warn">Held</span>' : '<span class="pill p-ok">Released</span>'}</td></tr>`).join('')}</tbody></table>` : ''}</div>
   <div class="card flush"><div class="chead"><div class="grow"><h2>Pay history</h2><div class="small muted">Minimum wage revisions, increments and every salary change</div></div>${e.status !== 'EXIT' ? '<button class="btn sm" id="pf_inc">Give increment</button>' : ''}</div><div style="padding:4px 20px 14px">${empTimeline(sid, e.code)}</div></div></div>`;
  $('#pf_back').onclick = () => { F.open = null; render(); };
  $('#pf_edit').onclick = () => openEmpForm('EDIT', sid, idx);
  const pinc = $('#pf_inc'); if (pinc) pinc.onclick = () => startIncrement(sid, [String(e.code)]);
  p.querySelectorAll('[data-rvo]').forEach(x => x.onclick = () => { S.rv = Object.assign(S.rv || {}, { mode: 'view', id: x.dataset.rvo, back: null }); go('revisions'); });
  const b = (id, fn) => { const x = $(id); if (x) x.onclick = fn; };
  b('#pf_sal', () => openEmpForm('EDIT', sid, idx, 'salary')); b('#pf_rate', () => openEmpForm('EDIT', sid, idx, 'salary')); b('#pf_exit', () => iomModal('EXIT', idx)); b('#pf_tr', () => transferOut(sid, idx));
}
function profSalary(st, e) {
  const sp = salarySpec(st, e); const ex = e.extra || {}; const dpar = desigParamsFor(st, e.desig); const daily = (e.rateType || st.rateType) === 'D';
  if (!(+e.rate > 0)) return `<div class="card salcta" style="margin-bottom:16px"><span class="bico" style="background:var(--warn)">!</span><div class="grow"><b>Salary at ${esc(st.name)} — not added</b><div class="small muted">Set the pay rates this site's components need. Salary cannot be processed for this employee until then.</div></div><button class="btn pri" id="pf_sal">Add salary →</button></div>`;
  const money = v => '₹' + inr(v, 2).replace(/\.00$/, '');
  const row = (l, v, tag) => `<div class="pir"><span>${l}</span><b>${v}${tag ? ` <i class="ptag ${tag[0]}">${tag[1]}</i>` : ''}</b></div>`;
  const items = [row(daily ? 'Gross rate (per day)' : 'Gross salary (per month)', money(e.rate)), ...(sp.usesBasic ? [row(sp.basicDaily ? 'Basic (per day)' : 'Basic (per month)', e.basic != null ? money(e.basic) : (st.params || {}).BASIC != null ? money(st.params.BASIC) : '—', e.basic == null ? ['s', 'site'] : null)] : []),
    ...sp.params.map(p2 => { const own = ex[p2.k] != null; const v = own ? ex[p2.k] : (dpar[p2.k] ?? p2.site); const pc = isPctKey(p2.k, v); return row(SAL_NICE(p2.k, p2.used), v == null ? '—' : pc ? +(v * 100).toFixed(4) + '%' : money(v), own ? ['o', 'own'] : dpar[p2.k] != null ? ['s', 'designation'] : ['s', 'site']); }),
    ...sp.extras.map(x => row(SAL_NICE(x.k, x.used), ex[x.k] != null ? money(ex[x.k]) : '<span class="flag">not set</span>')),
    ...sp.inputs.filter(x => ex[x.k]).map(x => row(x.label + ' (usual)', money(ex[x.k])))];
  return `<div class="card flush" style="margin-bottom:16px"><div class="chead"><div class="grow"><h2>Salary at ${esc(st.name)}</h2><div class="small muted">${daily ? 'Daily rated' : 'Monthly rated'} · inputs follow this site's salary components${e.formulas && Object.keys(e.formulas).length ? ` · ${Object.keys(e.formulas).length} employee-specific formulas` : ''}</div></div><button class="btn" id="pf_sal">Edit salary</button></div>
   <div class="psal"><div><div class="pis">Pay inputs</div>${items.join('')}<div class="pis" style="margin-top:16px">Statutory</div>${row('PF', e.pf === false ? 'Not applicable' : 'Applicable')}${row('ESIC', e.esi === true ? 'Covered' : e.esi === false ? 'Not covered' : 'Auto (gross ≤ ₹21,000)')}</div>
   <div class="pswrap">${payslipHTML(st, e, true)}</div></div></div>`;
}

function transferOut(sid, idx) {
  const e = empsOf(sid)[idx];
  $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:620px"><h2>Transfer — ${esc(e.name)}</h2><p class="small muted">From ${esc(S.sites[sid].name)}. The employee is marked exited here and added, with all details, to the new site.</p>
   <label class="f">To site<select class="in" id="to_s">${siteList().filter(x => x.id !== sid).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
   <div class="grid g3" style="margin-top:10px"><label class="f">New designation<input class="in" id="to_d" value="${esc(e.desig || '')}"></label><label class="f">New salary rate<input class="in" type="number" id="to_r" value="${e.rate ?? ''}"></label><label class="f">New basic<input class="in" type="number" step="0.01" id="to_b" value="${e.basic ?? ''}"></label></div>
   <div class="grid g3" style="margin-top:10px"><label class="f">Effective date<input class="in" type="date" id="to_e"></label></div>
   <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" id="to_ok">Transfer</button></div></div></div>`;
  $('#to_ok').onclick = async () => {
    const ts = $('#to_s').value, eff = $('#to_e').value, rem = ''; const fl = empsOf(sid); const src = fl[idx]; const tl = empsOf(ts).slice();
    if (tl.some(x => String(x.code) === String(src.code) && x.status !== 'EXIT')) { toast('That employee code is already active at the new site'); return; }
    const mv = JSON.parse(JSON.stringify(src)); delete mv.sample; delete mv.formulas; mv.status = 'ACTIVE'; delete mv.exitDate; delete mv.exitReason;
    if ($('#to_d').value) mv.desig = $('#to_d').value; if ($('#to_r').value) mv.rate = num($('#to_r').value); if ($('#to_b').value) mv.basic = num($('#to_b').value);
    await freezePay([sid]); src.status = 'EXIT'; src.exitDate = eff; src.exitReason = 'Transferred to ' + S.sites[ts].name;
    await put('employees/' + sid, { list: fl }); const nl = tl.filter(x => String(x.code) !== String(mv.code)).concat(mv); await put('employees/' + ts, { list: nl }); S.emps[ts] = Object.assign(S.emps[ts] || {}, { list: nl });
    await put('iom/' + ts + '_' + Date.now(), { siteId: ts, type: 'TRANSFER', code: mv.code, name: mv.name, effective: eff, details: `From ${S.sites[sid].name}. ${rem}`, at: new Date().toISOString() });
    await logRev('TRANSFER', ts, mv, payDiff(null, mv), { effDate: eff, title: `Transferred from ${S.sites[sid].name}`, from: sid });
    closeModal(); toast('Transferred to ' + S.sites[ts].name + ' — check the salary for the new site'); S.em.open = ts + '|' + mv.code; openEmpForm('EDIT', ts, nl.length - 1, 'salary');
  };
}

function iomModal(type, idx) {
  let sid = S.empSite; let site = S.sites[sid]; let emps = empsOf(sid); const e = idx != null ? JSON.parse(JSON.stringify(emps[idx])) : { status: 'ACTIVE' };
  const title = { JOIN: 'New joining', TRANSFER: 'Transfer in from another site', RATE: 'Rate change', EDIT: 'Edit employee', EXIT: 'Exit / separation' }[type];
  let fields = EMP_FIELDS; if (type === 'RATE') fields = EMP_FIELDS.filter(f => ['desig', 'rate', 'rateType', 'basic'].includes(f[0])); if (type === 'EXIT') fields = [];
  const others = type === 'TRANSFER' ? siteList().filter(s => s.id !== sid).flatMap(s => empsOf(s.id).filter(x => x.status !== 'EXIT').map(x => ({ s, x }))) : [];
  $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:860px"><h2>${title}${e.name ? ' — ' + esc(e.name) : ''}</h2>
  ${type === 'TRANSFER' ? `<label class="f">Employee to transfer<select class="in" id="tr_e">${others.map(o => `<option value="${o.s.id}|${o.x.code}">${o.x.code} · ${esc(o.x.name)} — ${esc(o.s.name)}</option>`).join('')}</select></label>
   <div class="grid g3" style="margin-top:10px"><label class="f">New designation<input class="in" id="tr_d"></label><label class="f">New salary rate<input class="in" id="tr_r" type="number"></label><label class="f">New basic<input class="in" id="tr_b" type="number" step="0.01"></label></div>` :
   `${type === 'JOIN' ? `<label class="f" style="margin-bottom:10px">Site<select class="in" id="j_site">${siteList().map(x => `<option value="${x.id}" ${x.id === sid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}
   ${(fields === EMP_FIELDS ? EMP_SECTIONS : [['', fields]]).map(([sec, fs]) => `${sec ? `<div class="eps" style="margin:12px 0 6px">${sec}</div>` : ''}<div class="grid g3">${fs.map(([k, t, ty]) => `<label class="f">${t}<input class="in" data-k="${k}" type="${ty || 'text'}" value="${esc(e[k] ?? '')}" ${type !== 'JOIN' && k === 'code' ? 'readonly' : ''}></label>`).join('')}</div>`).join('')}
   ${type === 'EDIT' || type === 'JOIN' ? `<div class="row" style="margin-top:10px"><label class="chk"><input type="checkbox" id="e_pf" ${e.pf !== false ? 'checked' : ''}> PF applicable</label>
     <label class="f" style="flex-direction:row;align-items:center;gap:6px">ESIC <select class="in" id="e_esi"><option value="auto" ${e.esi == null ? 'selected' : ''}>Auto (rate ≤ ₹21,000)</option><option value="1" ${e.esi === true ? 'selected' : ''}>Covered</option><option value="0" ${e.esi === false ? 'selected' : ''}>Not covered</option></select></label>
     <label class="f" style="flex-direction:row;align-items:center;gap:6px">Extra rates (e.g. TPTRATE=600)<input class="in mono" id="e_x" value="${esc(Object.entries(e.extra || {}).map(([a, b]) => a + '=' + b).join(', '))}"></label></div>` : ''}`}
  ${e.formulas && Object.keys(e.formulas).length && type === 'EDIT' ? `<details style="margin-top:10px"><summary>Employee-specific formulas (${Object.keys(e.formulas).length}) — as in the client sheet</summary><table class="tbl">${Object.entries(e.formulas).map(([k, f]) => `<tr><td class="mono">${esc(k)}</td><td class="mono">${esc(f)}</td></tr>`).join('')}</table><p class="small muted">These override the site formula for this person only. Clear them by editing the site setup or asking for a review.</p></details>` : ''}
  <div class="grid g3" style="margin-top:10px"><label class="f">Effective date<input class="in" type="date" id="i_eff"></label></div>
  <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" id="i_c">Cancel</button><button class="btn pri" id="i_ok">Save IOM</button></div></div></div>`;
  $('#i_c').onclick = () => closeModal();
  $('#i_ok').onclick = async () => {
    const eff = $('#i_eff').value, rem = ''; let details = rem;
    if (type === 'JOIN' && $('#j_site')) { sid = $('#j_site').value; site = S.sites[sid]; emps = empsOf(sid); }
    if (type === 'TRANSFER') {
      const [fs, fc] = $('#tr_e').value.split('|'); const fl = empsOf(fs); const src = fl.find(x => x.code === fc); if (!src) return;
      const moved = JSON.parse(JSON.stringify(src)); delete moved.sample; if ($('#tr_d').value) moved.desig = $('#tr_d').value; if ($('#tr_r').value) moved.rate = num($('#tr_r').value); if ($('#tr_b').value) moved.basic = num($('#tr_b').value);
      src.status = 'EXIT'; src.exitDate = eff; src.exitReason = 'Transferred to ' + site.name;
      await put('employees/' + fs, { list: fl }); await put('employees/' + sid, { list: emps.filter(x => x.code !== fc).concat(moved) });
      Object.assign(e, moved); details = `From ${S.sites[fs].name}. ${rem}`;
    } else {
      $('#modal').querySelectorAll('[data-k]').forEach(i => { const k = i.dataset.k; const v = i.value.trim(); if (v === '') { if (k !== 'code') delete e[k]; } else e[k] = i.type === 'number' ? num(v) : (k === 'rateType' || k === 'sex' ? v.toUpperCase().slice(0, 1) : v); });
      if (type === 'JOIN' && (!e.code || emps.some(x => x.code === e.code))) { toast('Enter a new, unique employee code'); return; }
      if ($('#e_pf')) { e.pf = $('#e_pf').checked; const es = $('#e_esi').value; if (es === 'auto') delete e.esi; else e.esi = es === '1'; const xs = $('#e_x').value.trim(); e.extra = {}; xs.split(',').forEach(p2 => { const [a, b] = p2.split('='); if (a && b) e.extra[a.trim().toUpperCase()] = num(b); }); }
      if (type === 'EXIT') { e.status = 'EXIT'; e.exitDate = eff; e.exitReason = rem; }
      if (type === 'RATE') details = `Rate ₹${e.rate}, basic ${e.basic ?? '—'}, ${e.desig}. ${rem}`;
      if (type === 'JOIN') { e.status = 'ACTIVE'; emps.push(e); } else emps[idx] = Object.assign(emps[idx], e);
      await put('employees/' + sid, { list: emps });
    }
    const id = `${sid}_${Date.now()}`; await put('iom/' + id, { siteId: sid, type, code: e.code, name: e.name, effective: eff, details, at: new Date().toISOString() });
    closeModal(); toast(title + ' saved'); if (type === 'JOIN' && S.em) S.em.open = sid + '|' + e.code; render();
  };
}

// ---------------- Loans, advances & held ----------------
const LTYPE = { LOAN: 'Loan', ADV: 'Salary advance', RECOVERY: 'Excess payment recovery' };
const XS_REASONS = ['Paid for days not worked', 'Wrong rate applied', 'OT / allowance paid by mistake', 'Paid twice', 'Other'];
function vLoans(p) {
  const F = S.lf || (S.lf = { t: '' });
  const all = Object.values(S.loans).sort((a, b) => (b.startMonth || '').localeCompare(a.startMonth || ''));
  const loans = all.filter(l => !F.t || l.type === F.t);
  const sn = id => (S.sites[id] || {}).name || id; const bal = l => l.amount - (l.recovered || []).reduce((s2, r) => s2 + r.amt, 0);
  const sumBal = t => all.filter(l => l.type === t).reduce((s2, l) => s2 + Math.max(0, bal(l)), 0);
  p.innerHTML = `<div class="kpis" style="grid-template-columns:repeat(3,1fr)">${['LOAN', 'ADV', 'RECOVERY'].map(t => `<div class="kpi"><div class="l">${{ LOAN: 'Loans', ADV: 'Salary advances', RECOVERY: 'Excess payment recoveries' }[t]}</div><div class="v">₹${inr(sumBal(t))}</div><div class="s">${all.filter(l => l.type === t && bal(l) > 0).length} open · balance to recover</div></div>`).join('')}</div>
  <div class="card flush"><div class="chead" style="gap:10px"><div class="seg">${[['', 'All'], ['LOAN', 'Loans'], ['ADV', 'Advances'], ['RECOVERY', 'Excess pay recoveries']].map(([k, t]) => `<button class="${F.t === k ? 'on' : ''}" data-lt="${k}">${t}</button>`).join('')}</div><span class="grow"></span><button class="btn" id="addr">+ Excess payment recovery</button><button class="btn pri" id="addl">+ Loan / advance</button></div>
  <p class="small muted" style="padding:0 20px">Each salary run deducts the month's instalment automatically and posts it here when the run is locked. Excess-payment recoveries are deducted after statutory deductions and kept within 50% of the month's wages; anything above carries forward.</p>
  ${loans.length ? `<div class="scroll"><table class="tbl nostick"><thead><tr><th>Employee</th><th>Site</th><th>Type</th><th>Details</th><th class="n">Amount</th><th class="n">Per month</th><th>From</th><th class="n">Recovered</th><th class="n">Balance</th><th></th></tr></thead><tbody>
  ${loans.map(l => { const rec = (l.recovered || []).reduce((s2, r) => s2 + r.amt, 0); return `<tr><td>${esc(l.empCode)} ${esc(l.name || '')}</td><td class="small">${esc(sn(l.siteId))}</td><td><span class="pill ${l.type === 'RECOVERY' ? 'p-warn' : 'p-pri'}">${LTYPE[l.type] || l.type}</span></td><td class="small">${l.type === 'RECOVERY' ? `${esc(l.reason || '')}${l.paidMonth ? ' · paid in ' + monthName(l.paidMonth) : ''}` : esc(l.purpose || l.given || '')}</td><td class="n">${inr(l.amount)}</td><td class="n">${inr(l.emi)}</td><td class="small">${l.startMonth ? monthName(l.startMonth) : ''}</td><td class="n">${inr(rec)}</td><td class="n b">${inr(l.amount - rec)}</td><td>${rec ? '' : `<button class="btn sm ghost danger" data-dl="${l._id}">Delete</button>`}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">Nothing here yet.</div>'}</div>`;
  p.querySelectorAll('[data-lt]').forEach(b => b.onclick = () => { F.t = b.dataset.lt; render(); });
  p.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => confirmModal('Delete this entry?', 'Nothing has been recovered against it yet.', () => del('loans/' + b.dataset.dl)));
  $('#addr').onclick = () => recoveryModal();
  $('#addl').onclick = () => {
    $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:560px"><h2>New loan / advance</h2>
    <div class="grid g2"><label class="f">Site${sitePicker('', () => { }, 'l_site').replace('min-width:320px', 'width:100%')}</label><label class="f">Employee code<input class="in" id="l_e"></label>
    <label class="f">Type<select class="in" id="l_t"><option value="LOAN">Loan (monthly EMI)</option><option value="ADV">Salary advance (recover next salary)</option></select></label><label class="f">Date given<input class="in" type="date" id="l_g"></label>
    <label class="f">Amount ₹<input class="in" type="number" id="l_a"></label><label class="f">EMI ₹ (advance: same as amount)<input class="in" type="number" id="l_m"></label>
    <label class="f">Recover from month<input class="in" type="month" id="l_s" value="${S.month}"></label><label class="f">Purpose<input class="in" id="l_p"></label></div>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" id="l_c">Cancel</button><button class="btn pri" id="l_ok">Save</button></div></div></div>`;
    $('#l_c').onclick = () => closeModal();
    $('#l_ok').onclick = async () => {
      const siteId = $('#l_site').value, code = $('#l_e').value.trim(); const e = empsOf(siteId).find(x => x.code === code);
      if (!e) { toast('Employee not found at that site'); return; }
      const amt = num($('#l_a').value); const typ = $('#l_t').value; const emi = typ === 'ADV' ? (num($('#l_m').value) || amt) : num($('#l_m').value);
      if (!amt || !emi) { toast('Enter amount and EMI'); return; }
      await put('loans/' + `${siteId}_${code}_${Date.now()}`, { siteId, empCode: code, name: e.name, type: typ, amount: amt, emi, startMonth: $('#l_s').value, given: $('#l_g').value, purpose: $('#l_p').value, recovered: [] });
      closeModal(); toast('Saved');
    };
  };
}
function recoveryModal(pre) {
  const P = Object.assign({ site: S.proc.site || (siteList()[0] || {}).id, code: '', month: '', reason: XS_REASONS[0], pd: '', otd: '', oth: '', amount: '', emi: '', start: S.month }, pre || {});
  const draw = () => {
    const emps = empsOf(P.site); const e = emps.find(x => String(x.code) === String(P.code));
    const locked = Object.values(S.runs).filter(r => r.siteId === P.site && r.type === 'REG' && r.status === 'LOCKED').map(r => r.month).sort().reverse();
    const run = P.month ? S.runs[runId(P.site, P.month)] : null; const a = run && e ? (run.att || []).find(x => String(x.code) === String(e.code)) : null;
    let calc = '';
    if (a && (P.pd !== '' || P.otd !== '' || P.oth !== '')) { try { const site = Object.assign({}, S.sites[P.site], run.snap ? { stat: null } : {}, run.snap || {}); const [y, m] = P.month.split('-').map(Number); const ctx = { month: m, year: y, calendarWD: siteCalWD(site, P.month) }; const ded = Object.assign({}, (run.ded || {})[a.code] || {}); delete ded.HOLD_ALL;
      const o = E.calcEmployee(site, e, a, ded, ctx); const a2 = Object.assign({}, a, P.pd !== '' ? { PD: +P.pd } : {}, P.otd !== '' ? { OTD: +P.otd } : {}, P.oth !== '' ? { OTH: +P.oth } : {}); const n = E.calcEmployee(site, e, a2, ded, ctx);
      const xs = Math.max(0, o.NET - n.NET); P.calc = xs; calc = `<div class="fetry" style="margin:8px 0 0">Paid ₹${inr(o.NET)} net (gross ₹${inr(o.GROSS)}) · should have been ₹${inr(n.NET)} (gross ₹${inr(n.GROSS)}) · <b>excess ₹${inr(xs)}</b><div class="small" style="margin-top:4px">PF ₹${inr((o.lines.PF || 0) - (n.lines.PF || 0))} and ESIC ₹${inr((o.lines.ESI || 0) - (n.lines.ESI || 0))} were deducted on the excess and stay filed; the employee received the net, so the net is recovered.</div></div><button class="btn sm" id="rc_use" style="margin-top:8px">Use ₹${inr(xs)} as the amount</button>`; } catch (x) { calc = `<div class="err small">${esc(x.message)}</div>`; } }
    $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:640px"><h2>Excess payment recovery</h2>
     <div class="grid g2"><label class="f">Site${sitePicker(P.site, () => { }, 'rc_site').replace('min-width:320px', 'width:100%')}</label><label class="f">Employee<select class="in" id="rc_e"><option value="">Choose…</option>${emps.map(x => `<option value="${esc(x.code)}" ${String(x.code) === String(P.code) ? 'selected' : ''}>${esc(x.code)} · ${esc(x.name)}</option>`).join('')}</select></label>
      <label class="f">Month it was overpaid<select class="in" id="rc_m"><option value="">Choose…</option>${locked.map(m => `<option value="${m}" ${P.month === m ? 'selected' : ''}>${monthName(m)}</option>`).join('')}</select></label><label class="f">Reason<select class="in" id="rc_r">${XS_REASONS.map(r => `<option ${P.reason === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label></div>
     ${a ? `<div class="efsub">Work out the excess — enter what it should have been</div><div class="grid g3"><label class="f">Paid days (was ${a.PD || 0})<input class="in" id="rc_pd" value="${esc(P.pd)}" placeholder="${a.PD || 0}"></label><label class="f">OT days (was ${a.OTD || 0})<input class="in" id="rc_otd" value="${esc(P.otd)}" placeholder="${a.OTD || 0}"></label><label class="f">OT hours (was ${a.OTH || 0})<input class="in" id="rc_oth" value="${esc(P.oth)}" placeholder="${a.OTH || 0}"></label></div>${calc}` : ''}
     <div class="efsub">Recovery</div><div class="grid g3"><label class="f">Amount to recover ₹<input class="in" id="rc_a" value="${esc(P.amount)}"></label><label class="f">Per month ₹ (blank = all at once)<input class="in" id="rc_i" value="${esc(P.emi)}"></label><label class="f">Start from<input class="in" type="month" id="rc_s" value="${P.start}"></label></div>
     <p class="small muted">Deducted from salary after PF / ESIC / PT, shown as “Excess pay recovery” on the salary sheet, and kept within 50% of the month's wages together with other deductions.</p>
     <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" id="rc_ok">Save recovery</button></div></div></div>`;
    const keep = () => { P.site = $('#rc_site').value; P.code = $('#rc_e').value; P.month = $('#rc_m').value; P.reason = $('#rc_r').value; P.amount = $('#rc_a').value; P.emi = $('#rc_i').value; P.start = $('#rc_s').value; ['pd', 'otd', 'oth'].forEach(k => { const el = $('#rc_' + k); if (el) P[k] = el.value; }); };
    ['rc_site', 'rc_e', 'rc_m'].forEach(id => { const el = $('#' + id); if (el) el.onchange = () => { keep(); if (id === 'rc_site') { P.code = ''; P.month = ''; } setTimeout(draw, 0); }; });
    ['rc_pd', 'rc_otd', 'rc_oth'].forEach(id => { const el = $('#' + id); if (el) el.onchange = () => { keep(); setTimeout(draw, 0); }; });
    const u = $('#rc_use'); if (u) u.onclick = () => { keep(); P.amount = String(P.calc); draw(); };
    $('#rc_ok').onclick = async () => { keep(); const emp = empsOf(P.site).find(x => String(x.code) === String(P.code)); const amt = num(P.amount); if (!emp) { toast('Choose the employee'); return; } if (!(amt > 0)) { toast('Enter the amount to recover'); return; }
      await put('loans/' + `${P.site}_${emp.code}_XS_${Date.now()}`, { siteId: P.site, empCode: emp.code, name: emp.name, type: 'RECOVERY', amount: amt, emi: num(P.emi) || amt, startMonth: P.start || S.month, paidMonth: P.month || '', reason: P.reason, recovered: [] });
      closeModal(); toast('Recovery saved — it is deducted from ' + monthName(P.start || S.month)); render(); };
  };
  draw();
}

// ---------------- Held salary ----------------
const hStatus = h => h.status || (h.releasedIn ? 'RELEASED' : 'HELD');
const dIN = d => d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
function vHeld(p) {
  const all = Object.values(S.held).map(h => Object.assign({ status: hStatus(h) }, h)).sort((a, b) => (b.month || '').localeCompare(a.month || '') || (a.siteName || '').localeCompare(b.siteName || ''));
  const f = S.heldF || (S.heldF = { st: 'HELD', m: '', q: '' });
  const pend = all.filter(h => h.status === 'HELD'), relM = all.filter(h => h.status === 'RELEASED' && h.release && (h.release.month === S.month));
  const heldM = all.filter(h => h.month === S.month);
  const sum = a => a.reduce((t, h) => t + (h.amount || 0), 0);
  const months = [...new Set(all.map(h => h.month))].sort().reverse();
  const oldest = pend.length ? pend.map(h => h.month).sort()[0] : null;
  const rows = all.filter(h => (f.st === 'ALL' || h.status === f.st) && (!f.m || h.month === f.m) && (!f.q || `${h.name} ${h.empCode} ${h.siteName}`.toLowerCase().includes(f.q.toLowerCase())));
  const byMonth = months.map(m => { const a = all.filter(h => h.month === m); return { m, n: a.length, amt: sum(a), full: a.filter(h => h.kind === 'FULL').length, rel: a.filter(h => h.status === 'RELEASED').length, relAmt: sum(a.filter(h => h.status === 'RELEASED')), pend: sum(a.filter(h => h.status === 'HELD')) }; });
  p.innerHTML = `
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
   <div class="kpi"><div class="l">Currently held</div><div class="v">${cr(sum(pend))}</div><div class="s">${pend.length} employee-month${pend.length === 1 ? '' : 's'} pending release</div></div>
   <div class="kpi"><div class="l">Held in ${monthName()}</div><div class="v">${cr(sum(heldM))}</div><div class="s">${heldM.length} employee${heldM.length === 1 ? '' : 's'} · ${heldM.filter(h => h.kind === 'FULL').length} in full</div></div>
   <div class="kpi"><div class="l">Released in ${monthName()}</div><div class="v">${cr(sum(relM))}</div><div class="s">${relM.length} release${relM.length === 1 ? '' : 's'}</div></div>
   <div class="kpi"><div class="l">Oldest pending</div><div class="v" style="font-size:18px">${oldest ? monthName(oldest) : '—'}</div><div class="s">${oldest ? 'held month' : 'nothing pending'}</div></div>
  </div>
  <div class="card flush"><div class="chead"><h2>Held salaries</h2><span class="grow"></span>
   <div class="seg" id="hseg">${[['HELD', 'Pending', pend.length], ['RELEASED', 'Released', all.length - pend.length], ['ALL', 'All', all.length]].map(([k, t, n]) => `<button data-st="${k}" class="${f.st === k ? 'on' : ''}">${t}<span>${n}</span></button>`).join('')}</div>
   <select class="in" id="hm"><option value="">All months</option>${months.map(m => `<option value="${m}" ${f.m === m ? 'selected' : ''}>${monthName(m)}</option>`).join('')}</select>
   <input class="in" id="hq" placeholder="Search name, code, site" value="${esc(f.q)}" style="width:200px">
   <button class="btn" id="hrep">Held report</button><button class="btn pri" id="hrel" disabled>Release selected</button></div>
  ${rows.length ? `<div class="scroll"><table class="tbl nostick" id="htbl"><thead><tr><th style="width:36px"><input type="checkbox" id="hall"></th><th>Held in</th><th>Employee</th><th>Site</th><th>Reason</th><th class="n">Gross</th><th class="n">Statutory deducted</th><th class="n">Held amount</th><th>Status</th></tr></thead><tbody>
  ${rows.map(h => `<tr><td>${h.status === 'HELD' ? `<input type="checkbox" data-sel="${h._id}">` : ''}</td><td>${monthName(h.month)}</td>
   <td><div class="siteline"><b>${esc(h.name || '')}</b><small>${esc(h.empCode)}${h.desig ? ' · ' + esc(h.desig) : ''}</small></div></td><td class="small" style="max-width:190px;overflow:hidden;text-overflow:ellipsis" title="${esc(h.siteName || '')}">${esc(h.siteName || (S.sites[h.siteId] || {}).name || h.siteId)}</td>
   <td>${h.kind === 'FULL' ? '<span class="tag">Full</span> ' : '<span class="tag">Part</span> '}${esc(h.reason || '')}</td>
   <td class="n">${h.gross != null ? inr(h.gross) : ''}</td><td class="n" title="PF ${inr(h.pf || 0)} · ESIC ${inr(h.esi || 0)} · PT ${inr(h.pt || 0)} · LWF ${inr(h.lwf || 0)}">${h.pf != null ? inr((h.pf || 0) + (h.esi || 0) + (h.pt || 0) + (h.lwf || 0)) : ''}<div class="small muted">PF ${inr(h.pf || 0)}${h.esi ? ' · ESIC ' + inr(h.esi) : ''}${h.pt ? ' · PT ' + inr(h.pt) : ''}</div></td>
   <td class="n b">${inr(h.amount)}</td>
   <td>${h.status === 'RELEASED' ? `<span class="pill p-ok" title="${esc((h.release || {}).ref || '')}">Released</span> <button class="btn sm ghost" data-undo="${h._id}" title="Undo release">Undo</button><div class="small muted">${dIN((h.release || {}).date)}${(h.release || {}).ref ? ' · ' + esc(h.release.ref) : ''}</div>` : `<span class="pill p-warn">Held</span> <button class="btn sm" data-rel="${h._id}">Release</button>`}</td></tr>`).join('')}
  </tbody><tfoot><tr><td></td><td colspan="6">${rows.length} record${rows.length === 1 ? '' : 's'}</td><td class="n">${inr(sum(rows))}</td><td></td></tr></tfoot></table></div>`
  : `<div class="empty">${all.length ? 'Nothing matches these filters.' : 'No held salary yet. Mark "Hold full salary" for an employee in Review & clean, or enter a Held amount; it appears here when the run is locked.'}</div>`}</div>
  <div class="grid g2">
   <div class="card flush"><div class="chead"><h2>Month by month</h2></div>${byMonth.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Held in</th><th class="n">Employees</th><th class="n">In full</th><th class="n">Held</th><th class="n">Released</th><th class="n">Still pending</th></tr></thead><tbody>
    ${byMonth.map(r => `<tr class="click" data-m="${r.m}"><td>${monthName(r.m)}</td><td class="n">${r.n}</td><td class="n">${r.full}</td><td class="n">${inr(r.amt)}</td><td class="n">${inr(r.relAmt)}<span class="muted"> · ${r.rel}</span></td><td class="n b">${inr(r.pend)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No months yet.</div>'}</div>
   <div class="card"><h2>Release advice for finance</h2><p class="small muted">Everything released in the chosen period, with bank details and the statutory deductions already made in the held month. A matching bank transfer file is included.</p>
    <div class="row"><label class="f">From<input class="in" type="date" id="rf" value="${S.month}-01"></label><label class="f">To<input class="in" type="date" id="rt" value="${new Date().toISOString().slice(0, 10)}"></label></div>
    <div class="row" style="margin-top:12px"><button class="btn pri" id="radv">Release advice (.xlsx)</button><button class="btn" id="rbank">Bank file for releases (.csv)</button></div>
    <p class="small muted" style="margin-top:10px">If finance uses a fixed template, send it over and the export will follow it column for column.</p></div>
  </div>`;
  p.querySelectorAll('#hseg button').forEach(b => b.onclick = () => { f.st = b.dataset.st; render(); });
  $('#hm').onchange = e => { f.m = e.target.value; render(); };
  let qt; $('#hq').oninput = e => { clearTimeout(qt); qt = setTimeout(() => { f.q = e.target.value; render(); const el = $('#hq'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 300); };
  p.querySelectorAll('tr.click[data-m]').forEach(tr => tr.onclick = () => { f.m = tr.dataset.m; f.st = 'ALL'; render(); });
  const selIds = () => [...p.querySelectorAll('[data-sel]:checked')].map(x => x.dataset.sel);
  const upd = () => { const b = $('#hrel'); if (b) { const n = selIds().length; b.disabled = !n; b.textContent = n ? `Release selected (${n})` : 'Release selected'; } };
  p.querySelectorAll('[data-sel]').forEach(c => c.onchange = upd);
  const ha = $('#hall'); if (ha) ha.onchange = () => { p.querySelectorAll('[data-sel]').forEach(c => c.checked = ha.checked); upd(); };
  $('#hrel').onclick = () => releaseModal(selIds());
  p.querySelectorAll('[data-rel]').forEach(b => b.onclick = () => releaseModal([b.dataset.rel]));
  p.querySelectorAll('[data-undo]').forEach(b => b.onclick = () => confirmModal('Undo this release?', 'The salary goes back to held and drops out of release advices.', async () => { const h = S.held[b.dataset.undo]; h.status = 'HELD'; h.release = null; await put('held/' + h._id, strip(h)); render(); }));
  $('#hrep').onclick = () => heldReport(rows.length ? rows : all);
  const inRange = () => { const a = $('#rf').value, b = $('#rt').value; return all.filter(h => h.status === 'RELEASED' && h.release && h.release.date >= a && h.release.date <= b); };
  $('#radv').onclick = () => { const r = inRange(); if (!r.length) { toast('No releases in that period'); return; } releaseAdvice(r, $('#rf').value, $('#rt').value); };
  $('#rbank').onclick = () => { const r = inRange().filter(h => (h.release.mode || 'NEFT') === 'NEFT'); if (!r.length) { toast('No bank-transfer releases in that period'); return; }
    const lines = ['Sr No,Beneficiary Name,Account Number,IFSC,Amount,Emp Code,Narration'].concat(r.map((h, i) => { const e = empsOf(h.siteId).find(x => x.code === h.empCode) || {}; return [i + 1, `"${(e.name || h.name).replace(/"/g, '')}"`, "'" + (e.acct || h.acct || ''), e.ifsc || h.ifsc || '', (h.amount || 0).toFixed(2), h.empCode, `"Held salary ${monthName(h.month)} released"`].join(','); }));
    saveFile(`Bank_HeldRelease_${$('#rf').value}_${$('#rt').value}.csv`, lines.join('\r\n')); };
}
function releaseModal(ids) {
  const list = ids.map(id => S.held[id]).filter(Boolean); if (!list.length) return;
  const tot = list.reduce((t, h) => t + (h.amount || 0), 0); const today = new Date().toISOString().slice(0, 10);
  $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:620px"><h2>Release held salary</h2>
  <p class="small muted">${list.length === 1 ? `${esc(list[0].name)} (${esc(list[0].empCode)}) · held for ${monthName(list[0].month)} · ${esc(list[0].reason || '')}` : `${list.length} held salaries`} · <b>₹${inr(tot)}</b></p>
  <div class="grid g2"><label class="f">Rejoined duty on<input class="in" type="date" id="r_join" value="${today}"></label><label class="f">Release date<input class="in" type="date" id="r_date" value="${today}"></label>
  <label class="f">Payment mode<select class="in" id="r_mode"><option value="NEFT">Bank transfer (NEFT)</option><option value="CHEQUE">Cheque</option><option value="CASH">Cash</option></select></label>
  <label class="f">Reference (UTR / cheque no.)<input class="in" id="r_ref"></label></div>
  <label class="f" style="margin-top:12px">Remarks<input class="in" id="r_rem" placeholder="e.g. rejoined after leave, documents received"></label>
  <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" id="r_c">Cancel</button><button class="btn pri" id="r_ok">Release ₹${inr(tot)}</button></div></div></div>`;
  $('#r_c').onclick = () => closeModal();
  $('#r_ok').onclick = async () => {
    const rel = { rejoined: $('#r_join').value, date: $('#r_date').value, month: $('#r_date').value.slice(0, 7), mode: $('#r_mode').value, ref: $('#r_ref').value.trim(), remarks: $('#r_rem').value.trim(), at: new Date().toISOString() };
    if (!rel.date) { toast('Enter the release date'); return; }
    for (const h of list) { h.status = 'RELEASED'; h.release = rel; await put('held/' + h._id, strip(h)); }
    closeModal(); toast(`Released ${list.length} held salar${list.length === 1 ? 'y' : 'ies'}`); render();
  };
}
function heldReport(list) {
  const rows = list.map(h => Object.assign({ status: hStatus(h) }, h)).sort((a, b) => (a.month || '').localeCompare(b.month || '') || (a.siteName || '').localeCompare(b.siteName || ''));
  const hdr = ['Sr. No.', 'Held in month', 'Site', 'Client', 'Emp. Code', 'Employee Name', 'Designation', 'Hold type', 'Reason', 'Paid days', 'Gross earning', 'PF', 'ESIC', 'PT', 'LWF', 'Other deductions', 'Salary held', 'Separate payouts held', 'Total held', 'Status', 'Rejoined on', 'Release date', 'Payment mode', 'Reference', 'Remarks'];
  const data = rows.map((h, i) => { const r = h.release || {}; const po = Object.values(h.payoutsHeld || {}).reduce((a, b) => a + b, 0);
    return [i + 1, monthName(h.month), h.siteName || h.siteId, h.client || '', h.empCode, h.name, h.desig || '', h.kind === 'FULL' ? 'Full salary' : 'Part', h.reason || '', h.paidDays ?? '', h.gross ?? '', h.pf ?? '', h.esi ?? '', h.pt ?? '', h.lwf ?? '', h.otherDed ?? '', h.salaryHeld ?? h.amount, po, h.amount, h.status === 'RELEASED' ? 'Released' : 'Held', dIN(r.rejoined), dIN(r.date), r.mode || '', r.ref || '', r.remarks || '']; });
  const T = j => data.reduce((t, r) => t + (+r[j] || 0), 0);
  const tot = hdr.map((h, j) => j === 5 ? 'TOTAL' : (j >= 10 && j <= 18) ? T(j) : '');
  const months = [...new Set(rows.map(h => h.month))].sort();
  const summ = months.map(m => { const a = rows.filter(h => h.month === m); const s2 = x => x.reduce((t, h) => t + (h.amount || 0), 0); return [monthName(m), a.length, a.filter(h => h.kind === 'FULL').length, s2(a), s2(a.filter(h => h.status === 'RELEASED')), s2(a.filter(h => h.status !== 'RELEASED'))]; });
  saveFile(`Held_Salary_Report_${new Date().toISOString().slice(0, 10)}.xlsx`, xlsxBytes([
    { name: 'Held salary', rows: [['Indus Fire Safety Private Limited'], ['Held salary register'], [`Generated ${dIN(new Date().toISOString().slice(0, 10))}`], [], hdr, ...data, tot], cols: [6, 14, 30, 24, 9, 26, 14, 10, 16, 8, 11, 8, 8, 6, 6, 9, 11, 11, 11, 9, 12, 12, 11, 14, 24] },
    { name: 'By month', rows: [['Held salary — month by month'], [], ['Held in', 'Employees', 'Held in full', 'Amount held', 'Released', 'Still pending'], ...summ], cols: [16, 10, 12, 14, 14, 14] }]));
}
function releaseAdvice(list, from, to) {
  const hdr = ['Sr. No.', 'Release date', 'Emp. Code', 'Employee Name', 'Designation', 'Site', 'Client', 'Salary held for month', 'Reason held', 'Rejoined on', 'Gross earning', 'PF deducted', 'ESIC deducted', 'PT + LWF deducted', 'Amount to release', 'Bank A/c No.', 'IFSC', 'Payment mode', 'UTR / Cheque No.', 'Remarks'];
  const data = list.sort((a, b) => (a.release.date || '').localeCompare(b.release.date || '')).map((h, i) => { const e = empsOf(h.siteId).find(x => x.code === h.empCode) || {}; const r = h.release;
    return [i + 1, dIN(r.date), h.empCode, h.name, h.desig || '', h.siteName || h.siteId, h.client || '', monthName(h.month), h.reason || '', dIN(r.rejoined), h.gross ?? '', h.pf ?? '', h.esi ?? '', (h.pt || 0) + (h.lwf || 0), h.amount, String(e.acct || h.acct || ''), e.ifsc || h.ifsc || '', { NEFT: 'Bank transfer', CHEQUE: 'Cheque', CASH: 'Cash', SALARY: 'With next salary' }[r.mode] || r.mode, r.ref || '', r.remarks || '']; });
  const tot = data.reduce((t, r) => t + (+r[14] || 0), 0);
  saveFile(`Held_Salary_Release_Advice_${from}_${to}.xlsx`, xlsxBytes([{ name: 'Release advice', rows: [['Indus Fire Safety Private Limited'], ['Release of held salary — advice to Finance'], [`Release period: ${dIN(from)} to ${dIN(to)}`], [], hdr, ...data, ['', '', '', 'TOTAL', '', '', '', '', '', '', '', '', '', '', tot], [], [], ['Prepared by (Payroll)', '', '', '', 'Checked by (HR)', '', '', '', 'Approved by', '', '', '', 'Paid by (Finance)']], cols: [6, 12, 9, 26, 14, 30, 24, 14, 16, 12, 11, 10, 10, 10, 13, 18, 13, 13, 16, 26] }]));
}

// ---------------- Reports ----------------
const monthsBetween = (a, b) => { const out = []; let [y, m] = a.split('-').map(Number); const [y2, m2] = b.split('-').map(Number); while (y < y2 || (y === y2 && m <= m2)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } if (out.length > 36) break; } return out; };
const fyOf = mo => { const [y, m] = mo.split('-').map(Number); const s0 = m >= 4 ? y : y - 1; return { from: `${s0}-04`, to: `${s0 + 1}-03`, label: `FY ${s0}-${String(s0 + 1).slice(2)}` }; };
const basicCodeOf = site => (site.components.find(c => c.type === 'E' && /^BASIC_E$|EARNED_BASIC|BASIC_EARN/.test(c.code)) || site.components.find(c => c.type === 'E' && /basic/i.test(c.label) && !/rate/i.test(c.label)) || {}).code;
const daCodeOf = site => (site.components.find(c => c.type === 'E' && (/^DA$|^D_A$/.test(c.code) || /dearness|\bD\.?A\b/i.test(c.label))) || {}).code;
const BONUS_MODES = { annual: 'Calculated yearly — bonus sheet', monthly: 'Paid every month in the salary', none: 'No bonus at this site' };
function bonusCfg(site) {
  const b = site.bonus || {}; const bc = basicCodeOf(site), dc = daCodeOf(site);
  const hasMonthly = site.components.some(c => c.type === 'E' && !c.off && /bonus/i.test(c.code + ' ' + c.label));
  return { mode: b.mode || (site.bonusMode === 'annual' ? 'annual' : null), guess: hasMonthly ? 'monthly' : 'annual', base: b.base || [bc, dc].filter(Boolean).join(' + ') || 'GROSS', pct: b.pct != null ? +b.pct : 8.33,
    cap: b.cap != null && b.cap !== '' ? +b.cap : null, capProrate: b.capProrate !== false, elig: b.elig || '', minDays: b.minDays != null && b.minDays !== '' ? +b.minDays : null,
    minAmt: b.minAmt != null && b.minAmt !== '' ? +b.minAmt : null, payMonth: b.payMonth || '', note: b.note || '' };
}
const paysBonusMonthly = site => (bonusCfg(site).mode || bonusCfg(site).guess) === 'monthly';
const bonusRuleText = cf => `${cf.pct}% of ${cf.base}${cf.cap != null ? `, capped at ₹${inr(cf.cap)}/month${cf.capProrate ? ' (pro-rata to days)' : ''}` : ''}${cf.elig ? `; eligible if ${cf.elig}` : ''}${cf.minDays != null ? `; min ${cf.minDays} days` : ''}${cf.minAmt != null ? `; minimum ₹${inr(cf.minAmt)}` : ''}`;
// bonus wages for one employee-month under a site's rule
function bonusMonth(site, cf, r) {
  const wd = r.att.WD || (site.divisor && site.divisor.type === 'fixed' ? site.divisor.days : 26) || 26;
  const v = Object.assign({}, site.params || {}, r.emp.extra || {}, { PD: 0, OTD: 0, OTH: 0, NH: 0, WOT: 0, ODI: 0 });
  for (const [k, x] of Object.entries(r.att)) if (typeof x === 'number') v[k] = x;
  Object.assign(v, r.r.lines, { WD: wd, GROSS: r.r.GROSS, NET: r.r.NET, RATE: +r.emp.rate || 0, BASIC: +(r.emp.basic != null ? r.emp.basic : (site.params || {}).BASIC) || 0 });
  v.DAILY = (r.emp.rateType || site.rateType) === 'D' ? 1 : 0; v.MRATE = v.DAILY ? v.RATE * wd : v.RATE; v.TD = v.PD + v.OTD + v.WOT;
  for (const c of site.components) if (v[c.code] === undefined) v[c.code] = 0;
  const base = Math.max(0, E.compile(cf.base).f(v));
  const cap = cf.cap == null ? Infinity : cf.capProrate ? cf.cap * Math.min(1, v.PD / wd) : cf.cap;
  let ok = 1; if (cf.elig) ok = E.compile(cf.elig).f(v) ? 1 : 0;
  return { earned: Math.round(base), bw: Math.round(Math.min(base, cap)), pd: v.PD, ok };
}

// one pass over runs for the chosen period and sites
function collectRuns(R) {
  const out = [];
  for (const sid of R.sites) { const site = S.sites[sid]; if (!site) continue;
    for (const mo of monthsBetween(R.from, R.to)) { const run = S.runs[runId(sid, mo)]; if (!run || !run.att || !run.att.length) continue; if (run.status !== 'LOCKED' && !R.drafts) continue;
      const c = computeRun(site, run, mo); out.push({ site, month: mo, run, c, draft: run.status !== 'LOCKED' }); } }
  return out;
}
const REPORTS = [
  ['wage', 'Total wage report', 'Headcount, paid days, gross, deductions, held and net pay — by site, by month and per employee.'],
  ['comp', 'Total compliance report', 'PF (EPF, EPS, EDLI, admin), ESIC, PT and LWF — employee and employer shares, by site, state and month, with UAN / IP per employee.'],
  ['bonus', 'Bonus calculation sheet', 'Yearly bonus for each site by the rule set in Site setup → Bonus: bonus wages month by month, eligibility, amount, and Form C.'],
  ['cost', 'Employer cost (CTC) report', 'Gross wages + separate payouts + employer PF, EDLI, admin, ESIC and LWF per site and month.'],
  ['att', 'Attendance summary', 'Paid days, OT days and hours, NH/PH and weekly-off worked per site and month.'],
  ['mom', 'Month-on-month variance', 'Headcount, gross and net by site for each month in the period, with change against the previous month.'],
  ['held', 'Held salary report', 'Every held salary with reason and release status (also on the Held salary page).'],
  ['loan', 'Loan & advance register', 'Loans and advances with recoveries and balance.'],
];
function vReports(p) {
  const fy = fyOf(S.month);
  const R = S.rep || (S.rep = { id: 'wage', from: S.month, to: S.month, siteMode: 'all', sites: [], drafts: true, pct: 8.33, ceil: 7000, minDays: 30, bFrom: fy.from, bTo: fy.to });
  const allIds = siteList().map(s => s.id);
  const bonusIds = siteList().filter(s => bonusCfg(s).mode === 'annual' && s.kind !== 'payout').map(s => s.id);
  const unsetN = siteList().filter(s => !bonusCfg(s).mode && s.kind !== 'payout').length;
  const pick = R.id === 'bonus' ? (R.siteMode === 'all' ? bonusIds : R.sites.filter(id => bonusIds.includes(id))) : (R.siteMode === 'all' ? allIds : R.sites);
  const q = Object.assign({}, R, { sites: pick, from: R.id === 'bonus' ? R.bFrom : R.from, to: R.id === 'bonus' ? R.bTo : R.to });
  const runs = ['held', 'loan'].includes(R.id) ? [] : collectRuns(q);
  const cur = REPORTS.find(r => r[0] === R.id);
  const pv = previewReport(R.id, q, runs);
  const siteChoices = R.id === 'bonus' ? bonusIds : allIds;
  p.innerHTML = `<div style="display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px;align-items:start">
   <div class="card flush" style="position:sticky;top:88px">${REPORTS.map(r => `<div class="repi ${R.id === r[0] ? 'on' : ''}" data-r="${r[0]}"><b>${r[1]}</b><span>${r[2]}</span></div>`).join('')}</div>
   <div>
    <div class="card"><div class="chead"><div class="grow"><h2>${cur[1]}</h2><div class="small muted">${cur[2]}</div></div><button class="btn pri" id="rdl">Download (.xlsx)</button></div>
     ${['held', 'loan'].includes(R.id) ? '' : `<div class="row" style="margin-top:14px;gap:14px;align-items:flex-end">
      ${R.id === 'bonus' ? `<label class="f">Accounting year<select class="in" id="r_fy">${[-1, 0, 1].map(k => { const [y] = fy.from.split('-').map(Number); const y0 = y + k; const v = `${y0}-04|${y0 + 1}-03`; return `<option value="${v}" ${R.bFrom === `${y0}-04` ? 'selected' : ''}>FY ${y0}-${String(y0 + 1).slice(2)} (Apr ${y0} – Mar ${y0 + 1})</option>`; }).join('')}</select></label>`
      : `<label class="f">From<input class="in" type="month" id="r_from" value="${R.from}"></label><label class="f">To<input class="in" type="month" id="r_to" value="${R.to}"></label>`}
      <label class="f">Sites<select class="in" id="r_sm"><option value="all" ${R.siteMode === 'all' ? 'selected' : ''}>${R.id === 'bonus' ? `All sites with yearly bonus (${bonusIds.length})` : `All sites (${allIds.length})`}</option><option value="pick" ${R.siteMode === 'pick' ? 'selected' : ''}>Choose sites…</option></select></label>
      <label class="chk small" style="height:34px"><input type="checkbox" id="r_dr" ${R.drafts ? 'checked' : ''}> Include runs not yet locked</label></div>
      ${R.siteMode === 'pick' ? `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px 18px;max-height:200px;overflow:auto;margin-top:12px;padding:10px;border:1px solid var(--line);border-radius:8px">${siteChoices.map(id => `<label class="chk small" style="min-width:0"><input type="checkbox" data-rs="${id}" ${R.sites.includes(id) ? 'checked' : ''}><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(S.sites[id].name)}</span></label>`).join('')}</div>` : ''}`}
     ${R.id === 'bonus' ? `<p class="small muted" style="margin:12px 0 0">Each site's bonus is calculated by the rule set in <b>Site setup → Bonus</b>: which wages, what %, any cap, eligibility and minimum days. Sites set to “paid every month” or “no bonus” are left out.${unsetN ? ` <a href="#" id="r_unset">${unsetN} site${unsetN > 1 ? 's have' : ' has'} no bonus rule yet</a>.` : ''}</p>` : ''}
    </div>
    ${pv}
   </div></div>`;
  p.querySelectorAll('.repi').forEach(el => el.onclick = () => { R.id = el.dataset.r; render(); });
  const bind = (id, fn) => { const el = $(id); if (el) el.onchange = () => { fn(el); render(); }; };
  bind('#r_from', el => R.from = el.value || R.from); bind('#r_to', el => R.to = el.value || R.to); bind('#r_sm', el => R.siteMode = el.value); bind('#r_dr', el => R.drafts = el.checked);
  bind('#r_fy', el => { const [a, b] = el.value.split('|'); R.bFrom = a; R.bTo = b; });
  p.querySelectorAll('[data-rs]').forEach(c => c.onchange = () => { R.sites = [...p.querySelectorAll('[data-rs]:checked')].map(x => x.dataset.rs); render(); });
  p.querySelectorAll('[data-bedit]').forEach(x => x.onclick = e => { e.preventDefault(); S.setup = Object.assign(S.setup || {}, { site: x.dataset.bedit, tab: 'bonus', draft: null }); go('setup'); });
  const un = $('#r_unset'); if (un) un.onclick = e => { e.preventDefault(); showUnsetBonus(); };
  $('#rdl').onclick = () => downloadReport(R.id, q, runs);
}
const noData = (q) => `<div class="card empty">No salary data for ${q.from === q.to ? monthName(q.from) : `${monthName(q.from)} to ${monthName(q.to)}`} in the chosen sites${q.drafts ? '' : ' (locked runs only — tick “Include runs not yet locked” to see work in progress)'}.</div>`;
function aggSite(runs) {
  const by = {};
  for (const x of runs) { const k = x.site.id; const a = by[k] = by[k] || { site: x.site, emps: new Set(), months: new Set(), pd: 0, gross: 0, ded: 0, net: 0, held: 0, pay: 0, PF: 0, ESI: 0, PT: 0, LWF: 0, er: { EPF: 0, EPS: 0, EDLI: 0, ADMIN: 0, ESI: 0, LWF: 0, TOTAL: 0 }, pfw: 0, epsw: 0, edliw: 0, esiw: 0, ot: 0, oth: 0, nh: 0, wot: 0, draft: false };
    a.months.add(x.month); if (x.draft) a.draft = true;
    for (const r of x.c.rows) { a.emps.add(r.emp.code); a.pd += r.att.PD || 0; a.ot += r.att.OTD || 0; a.oth += r.att.OTH || 0; a.nh += r.att.NH || 0; a.wot += r.att.WOT || 0;
      a.gross += r.r.GROSS; a.ded += r.r.DED; a.net += r.r.NET; a.held += (r.r.lines.HELD || 0) + (r.r.heldFull ? r.r.heldFull.payoutTotal : 0);
      a.pay += Object.values(r.r.groups).reduce((s, v) => s + v, 0); ['PF', 'ESI', 'PT', 'LWF'].forEach(k2 => a[k2] += r.r.lines[k2] || 0);
      Object.keys(a.er).forEach(k2 => a.er[k2] += r.r.er[k2] || 0); if (r.r.lines.PF > 0) { a.pfw += r.r.pfWages; a.epsw += r.r.epsWages; } if (r.r.lines.ESI > 0) a.esiw += r.r.ESIW; } }
  return Object.values(by).sort((a, b) => a.site.name.localeCompare(b.site.name));
}
function bonusRows(q, runs) {
  const months = monthsBetween(q.from, q.to); const by = {}; const errs = {};
  for (const x of runs) { const cf = bonusCfg(x.site);
    for (const r of x.c.rows) { const k = x.site.id + '|' + r.emp.code;
      const e = by[k] = by[k] || { site: x.site, cf, emp: r.emp, m: {}, days: 0, wages: 0, notElig: 0 };
      let bm; try { bm = bonusMonth(x.site, cf, r); } catch (err) { errs[x.site.id] = err.message; bm = { earned: 0, bw: 0, pd: r.att.PD || 0, ok: 1 }; }
      e.m[x.month] = Object.assign(bm, { draft: x.draft }); e.days += bm.pd; if (bm.ok) e.wages += bm.bw; else e.notElig++; } }
  const done = new Set(runs.map(x => x.month)).size >= months.length;
  return { months, full: done, errs, rows: Object.values(by).sort((a, b) => a.site.name.localeCompare(b.site.name) || String(a.emp.code).localeCompare(String(b.emp.code))).map(e => {
    const cf = e.cf; let why = '';
    if (cf.elig && e.notElig && !e.wages) why = `Not eligible (${cf.elig})`;
    else if (done && cf.minDays != null && e.days < cf.minDays) why = `Under ${cf.minDays} days`;
    let amt = why ? 0 : Math.round(e.wages * cf.pct / 100);
    if (!why && cf.minAmt != null && done && amt < cf.minAmt) amt = cf.minAmt;
    return Object.assign(e, { eligible: !why, why, amount: amt }); }) };
}
function previewReport(id, q, runs) {
  if (id === 'held') { const a = Object.values(S.held); const pend = a.filter(h => hStatus(h) === 'HELD'); return `<div class="card"><p>${a.length} held salary records · ₹${inr(pend.reduce((t, h) => t + h.amount, 0))} pending release. The download lists every record with reason, statutory deductions and release details.</p></div>`; }
  if (id === 'loan') { const a = Object.values(S.loans); return `<div class="card"><p>${a.length} loans and advances · balance ₹${inr(a.reduce((t, l) => t + l.amount - (l.recovered || []).reduce((x, r) => x + r.amt, 0), 0))}.</p></div>`; }
  if (id === 'bonus' && !q.sites.length) return `<div class="card empty">No site has a yearly bonus rule yet. Open <b>Site setup → Bonus</b> for each site and choose “Calculated yearly — bonus sheet”.</div>`;
  if (!runs.length) return noData(q);
  const per = q.from === q.to ? monthName(q.from) : `${monthName(q.from)} – ${monthName(q.to)}`;
  const draftN = runs.filter(x => x.draft).length; const dn = draftN ? `<span class="small muted"> · ${draftN} of ${runs.length} site-months not yet locked</span>` : '';
  if (id === 'bonus') {
    const B = bonusRows(q, runs); const el = B.rows.filter(r => r.eligible); const T = B.rows.reduce((t, r) => t + r.amount, 0);
    const bySite = {}; B.rows.forEach(r => { const a = bySite[r.site.id] = bySite[r.site.id] || { site: r.site, cf: r.cf, n: 0, el: 0, w: 0, amt: 0 }; a.n++; if (r.eligible) a.el++; a.w += r.eligible ? r.wages : 0; a.amt += r.amount; });
    const mInData = [...new Set(runs.map(x => x.month))];
    return `<div class="kpis" style="grid-template-columns:repeat(4,1fr)"><div class="kpi"><div class="l">Employees</div><div class="v">${B.rows.length}</div><div class="s">${el.length} eligible</div></div><div class="kpi"><div class="l">Bonus wages</div><div class="v">${cr(B.rows.reduce((t, r) => t + (r.eligible ? r.wages : 0), 0))}</div><div class="s">eligible employees</div></div><div class="kpi"><div class="l">Bonus payable</div><div class="v">${cr(T)}</div><div class="s">${Object.keys(bySite).length} sites</div></div><div class="kpi"><div class="l">Months with data</div><div class="v">${mInData.length} <span class="muted" style="font-size:15px;font-weight:500">/ ${B.months.length}</span></div><div class="s">${B.full ? 'full year' : 'provisional — minimum days and minimum bonus apply at year end'}</div></div></div>
     ${Object.keys(B.errs).length ? `<div class="note warn">Bonus rule could not be worked out for ${Object.entries(B.errs).map(([k, m]) => `<b>${esc(S.sites[k].name)}</b> (${esc(m)})`).join(', ')}. Fix the rule in Site setup → Bonus.</div>` : ''}
     <div class="card flush"><div class="chead"><h2>By site — ${fyOf(q.from).label}</h2>${dn}</div><div class="scroll"><table class="tbl rtbl"><thead><tr><th>Site</th><th>Bonus rule</th><th>Paid in</th><th class="n">Employees</th><th class="n">Eligible</th><th class="n">Bonus wages</th><th class="n">Bonus payable</th><th></th></tr></thead><tbody>
     ${Object.values(bySite).map(a => `<tr><td>${esc(a.site.name)}</td><td class="small" style="min-width:260px">${esc(bonusRuleText(a.cf))}</td><td class="small">${esc(a.cf.payMonth || '—')}</td><td class="n">${a.n}</td><td class="n">${a.el}</td><td class="n">${inr(a.w)}</td><td class="n b">${inr(a.amt)}</td><td><a href="#" data-bedit="${a.site.id}" class="small">Edit rule</a></td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3">Total</td><td class="n">${B.rows.length}</td><td class="n">${el.length}</td><td class="n">${inr(Object.values(bySite).reduce((t, a) => t + a.w, 0))}</td><td class="n">${inr(T)}</td><td></td></tr></tfoot></table></div></div>`;
  }
  const A = aggSite(runs); const T = k => A.reduce((t, a) => t + (typeof k === 'function' ? k(a) : a[k]), 0);
  if (id === 'wage') return `<div class="kpis" style="grid-template-columns:repeat(4,1fr)"><div class="kpi"><div class="l">Employees</div><div class="v">${inr(T(a => a.emps.size))}</div><div class="s">${A.length} sites</div></div><div class="kpi"><div class="l">Gross wages</div><div class="v">${cr(T('gross'))}</div><div class="s">${per}</div></div><div class="kpi"><div class="l">Deductions</div><div class="v">${cr(T('ded'))}</div><div class="s">incl. ₹${inr(T('held'))} held</div></div><div class="kpi"><div class="l">Net pay</div><div class="v">${cr(T('net'))}</div><div class="s">+ ${cr(T('pay'))} separate payouts</div></div></div>
   <div class="card flush"><div class="chead"><h2>By site — ${per}</h2>${dn}</div><div class="scroll"><table class="tbl rtbl"><thead><tr><th>Site</th><th class="n">Employees</th><th class="n">Paid days</th><th class="n">Gross</th><th class="n">PF</th><th class="n">ESIC</th><th class="n">PT + LWF</th><th class="n">Held</th><th class="n">Net pay</th><th class="n">Separate payouts</th></tr></thead><tbody>
   ${A.map(a => `<tr><td>${esc(a.site.name)}${a.draft ? ' <span class="tag">draft</span>' : ''}</td><td class="n">${a.emps.size}</td><td class="n">${inr(a.pd, 1)}</td><td class="n">${inr(a.gross)}</td><td class="n">${inr(a.PF)}</td><td class="n">${inr(a.ESI)}</td><td class="n">${inr(a.PT + a.LWF)}</td><td class="n">${a.held ? inr(a.held) : ''}</td><td class="n b">${inr(a.net)}</td><td class="n">${a.pay ? inr(a.pay) : ''}</td></tr>`).join('')}</tbody>
   <tfoot><tr><td>Total</td><td class="n">${inr(T(a => a.emps.size))}</td><td class="n">${inr(T('pd'), 1)}</td><td class="n">${inr(T('gross'))}</td><td class="n">${inr(T('PF'))}</td><td class="n">${inr(T('ESI'))}</td><td class="n">${inr(T(a => a.PT + a.LWF))}</td><td class="n">${inr(T('held'))}</td><td class="n">${inr(T('net'))}</td><td class="n">${inr(T('pay'))}</td></tr></tfoot></table></div></div>`;
  if (id === 'comp') { const pfT = T(a => a.PF + a.er.EPF + a.er.EPS + a.er.EDLI + a.er.ADMIN), esT = T(a => a.ESI + a.er.ESI);
    return `<div class="kpis" style="grid-template-columns:repeat(4,1fr)"><div class="kpi"><div class="l">PF remittance</div><div class="v">${cr(pfT)}</div><div class="s">employee ${cr(T('PF'))} · employer ${cr(T(a => a.er.EPF + a.er.EPS + a.er.EDLI + a.er.ADMIN))}</div></div><div class="kpi"><div class="l">ESIC remittance</div><div class="v">${cr(esT)}</div><div class="s">employee ${cr(T('ESI'))} · employer ${cr(T(a => a.er.ESI))}</div></div><div class="kpi"><div class="l">Professional tax</div><div class="v">${cr(T('PT'))}</div><div class="s">${per}</div></div><div class="kpi"><div class="l">LWF</div><div class="v">${cr(T(a => a.LWF + a.er.LWF))}</div><div class="s">employee + employer</div></div></div>
   <div class="card flush"><div class="chead"><h2>By site — ${per}</h2>${dn}</div><div class="scroll"><table class="tbl rtbl"><thead><tr><th>Site</th><th>State</th><th class="n">PF wages</th><th class="n">PF employee</th><th class="n">EPF employer</th><th class="n">EPS</th><th class="n">EDLI + admin</th><th class="n">ESIC wages</th><th class="n">ESIC ee + er</th><th class="n">PT</th><th class="n">LWF ee + er</th><th class="n">Total</th></tr></thead><tbody>
   ${A.map(a => `<tr><td>${esc(a.site.name)}${a.draft ? ' <span class="tag">draft</span>' : ''}</td><td><span class="tag">${a.site.state}</span></td><td class="n">${inr(a.pfw)}</td><td class="n">${inr(a.PF)}</td><td class="n">${inr(a.er.EPF)}</td><td class="n">${inr(a.er.EPS)}</td><td class="n">${inr(a.er.EDLI + a.er.ADMIN)}</td><td class="n">${inr(a.esiw)}</td><td class="n">${inr(a.ESI + a.er.ESI)}</td><td class="n">${inr(a.PT)}</td><td class="n">${inr(a.LWF + a.er.LWF)}</td><td class="n b">${inr(a.PF + a.er.EPF + a.er.EPS + a.er.EDLI + a.er.ADMIN + a.ESI + a.er.ESI + a.PT + a.LWF + a.er.LWF)}</td></tr>`).join('')}</tbody>
   <tfoot><tr><td colspan="2">Total</td><td class="n">${inr(T('pfw'))}</td><td class="n">${inr(T('PF'))}</td><td class="n">${inr(T(a => a.er.EPF))}</td><td class="n">${inr(T(a => a.er.EPS))}</td><td class="n">${inr(T(a => a.er.EDLI + a.er.ADMIN))}</td><td class="n">${inr(T('esiw'))}</td><td class="n">${inr(esT)}</td><td class="n">${inr(T('PT'))}</td><td class="n">${inr(T(a => a.LWF + a.er.LWF))}</td><td class="n">${inr(pfT + esT + T('PT') + T(a => a.LWF + a.er.LWF))}</td></tr></tfoot></table></div></div>`; }
  if (id === 'cost') return `<div class="card flush"><div class="chead"><h2>Employer cost — ${per}</h2>${dn}</div><div class="scroll"><table class="tbl rtbl"><thead><tr><th>Site</th><th class="n">Employees</th><th class="n">Gross wages</th><th class="n">Separate payouts</th><th class="n">Employer PF + EDLI + admin</th><th class="n">Employer ESIC</th><th class="n">Employer LWF</th><th class="n">Cost to company</th></tr></thead><tbody>
   ${A.map(a => `<tr><td>${esc(a.site.name)}</td><td class="n">${a.emps.size}</td><td class="n">${inr(a.gross)}</td><td class="n">${inr(a.pay)}</td><td class="n">${inr(a.er.EPF + a.er.EPS + a.er.EDLI + a.er.ADMIN)}</td><td class="n">${inr(a.er.ESI)}</td><td class="n">${inr(a.er.LWF)}</td><td class="n b">${inr(a.gross + a.pay + a.er.TOTAL)}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="n">${inr(T(a => a.emps.size))}</td><td class="n">${inr(T('gross'))}</td><td class="n">${inr(T('pay'))}</td><td class="n">${inr(T(a => a.er.EPF + a.er.EPS + a.er.EDLI + a.er.ADMIN))}</td><td class="n">${inr(T(a => a.er.ESI))}</td><td class="n">${inr(T(a => a.er.LWF))}</td><td class="n">${inr(T(a => a.gross + a.pay + a.er.TOTAL))}</td></tr></tfoot></table></div></div>`;
  if (id === 'att') return `<div class="card flush"><div class="chead"><h2>Attendance — ${per}</h2>${dn}</div><div class="scroll"><table class="tbl rtbl"><thead><tr><th>Site</th><th class="n">Employees</th><th class="n">Paid days</th><th class="n">Avg days / employee</th><th class="n">OT days</th><th class="n">OT hours</th><th class="n">NH / PH</th><th class="n">Weekly-off worked</th></tr></thead><tbody>
   ${A.map(a => `<tr><td>${esc(a.site.name)}</td><td class="n">${a.emps.size}</td><td class="n">${inr(a.pd, 1)}</td><td class="n">${inr(a.pd / Math.max(1, a.emps.size) / a.months.size, 1)}</td><td class="n">${inr(a.ot, 1)}</td><td class="n">${inr(a.oth, 1)}</td><td class="n">${inr(a.nh, 1)}</td><td class="n">${inr(a.wot, 1)}</td></tr>`).join('')}</tbody></table></div></div>`;
  if (id === 'mom') { const months = monthsBetween(q.from, q.to); const cell = {}; runs.forEach(x => { cell[x.site.id + '|' + x.month] = x.c.tot.GROSS; });
    const sites = [...new Set(runs.map(x => x.site.id))].map(i => S.sites[i]).sort((a, b) => a.name.localeCompare(b.name));
    return `<div class="card flush"><div class="chead"><h2>Gross wages by month</h2>${dn}</div><div class="scroll"><table class="tbl nostick"><thead><tr><th>Site</th>${months.map(m => `<th class="n">${monthName(m).replace(' 20', " '")}</th>`).join('')}<th class="n">Change vs previous</th></tr></thead><tbody>
    ${sites.map(st => { const v = months.map(m => cell[st.id + '|' + m]); const last = v.filter(x => x != null); const ch = last.length > 1 ? last[last.length - 1] - last[last.length - 2] : null;
      return `<tr><td>${esc(st.name)}</td>${v.map(x => `<td class="n">${x != null ? inr(x) : '<span class="muted">—</span>'}</td>`).join('')}<td class="n" style="color:${ch > 0 ? 'var(--ok)' : ch < 0 ? 'var(--bad)' : 'inherit'}">${ch != null ? (ch > 0 ? '+' : '') + inr(ch) : '<span class="muted">—</span>'}</td></tr>`; }).join('')}</tbody></table></div>${months.length < 2 ? '<p class="small muted" style="padding:0 20px 14px">Choose a period of two months or more to see the change.</p>' : ''}</div>`; }
  return '';
}
function downloadReport(id, q, runs) {
  if (id === 'held') return heldReport(Object.values(S.held));
  if (id === 'loan') return saveFile(`Loan_Advance_Register_${S.month}.xlsx`, xlsxBytes([{ name: 'Loans & advances', rows: [['Indus Fire Safety Private Limited — Register of loans & advances'], [], ['Site', 'Emp Code', 'Name', 'Type', 'Date given', 'Purpose', 'Amount', 'EMI', 'From month', 'Recovered', 'Balance', 'Recovery months'], ...Object.values(S.loans).map(l => { const rec = (l.recovered || []).reduce((s2, r) => s2 + r.amt, 0); return [(S.sites[l.siteId] || {}).name || l.siteId, l.empCode, l.name, (LTYPE[l.type] || l.type), l.given || '', l.purpose || '', l.amount, l.emi, l.startMonth, rec, l.amount - rec, (l.recovered || []).map(r => `${r.month}: ${r.amt}`).join('; ')]; })] }]));
  if (!runs.length) { toast('No salary data for this period and site selection'); return; }
  const per = q.from === q.to ? monthName(q.from) : `${monthName(q.from)} to ${monthName(q.to)}`;
  const head = t => [['Indus Fire Safety Private Limited'], [t], [`Period: ${per}${runs.some(x => x.draft) ? ' — includes runs not yet locked' : ''}`], []];
  const fn = t => `${t}_${q.from}${q.to !== q.from ? '_to_' + q.to : ''}.xlsx`;
  const sumRow = (rows, from, label = 'TOTAL', at = 0) => { const n = rows[0] ? rows[0].length : 0; return Array.from({ length: n }, (_, j) => j === at ? label : j >= from ? rows.reduce((t, r) => t + (+r[j] || 0), 0) : ''); };
  const A = aggSite(runs);
  if (id === 'wage') {
    const s1 = A.map(a => [a.site.name, a.site.client, E.STATE.NAMES[a.site.state] || a.site.state, a.emps.size, a.pd, a.gross, a.PF, a.ESI, a.PT, a.LWF, a.ded - a.PF - a.ESI - a.PT - a.LWF - a.held, a.held, a.ded, a.net, a.pay, a.draft ? 'Not locked' : 'Locked']);
    const s2 = runs.map(x => [monthName(x.month), x.site.name, x.c.rows.length, x.c.rows.reduce((t, r) => t + (r.att.PD || 0), 0), x.c.tot.GROSS, x.c.tot.DED, x.c.tot.NET, Object.values(x.c.tot.groups).reduce((t, v) => t + v, 0), x.draft ? 'Not locked' : 'Locked']);
    const s3 = runs.flatMap(x => x.c.rows.map(r => [monthName(x.month), x.site.name, r.emp.code, r.emp.name, r.emp.desig || '', r.att.PD, r.r.GROSS, r.r.lines.PF || 0, r.r.lines.ESI || 0, r.r.lines.PT || 0, r.r.lines.LWF || 0, (r.r.lines.HELD || 0), r.r.DED, r.r.NET, Object.values(r.r.groups).reduce((t, v) => t + v, 0), r.r.heldFull ? 'Held — ' + r.r.heldFull.reason : '']));
    return saveFile(fn('Total_Wage_Report'), xlsxBytes([
      { name: 'By site', rows: [...head('Total wage report — by site'), ['Site', 'Client', 'State', 'Employees', 'Paid days', 'Gross wages', 'PF', 'ESIC', 'PT', 'LWF', 'Other deductions', 'Held', 'Total deductions', 'Net pay', 'Separate payouts', 'Run status'], ...s1, sumRow(s1, 3)], cols: [38, 26, 14, 10, 10, 13, 11, 10, 9, 8, 12, 11, 13, 13, 13, 11] },
      { name: 'By month', rows: [...head('Total wage report — by month and site'), ['Month', 'Site', 'Employees', 'Paid days', 'Gross wages', 'Deductions', 'Net pay', 'Separate payouts', 'Run status'], ...s2, sumRow(s2, 2)], cols: [14, 38, 10, 10, 13, 12, 13, 13, 11] },
      { name: 'Employee detail', rows: [...head('Total wage report — employee detail'), ['Month', 'Site', 'Emp. Code', 'Employee Name', 'Designation', 'Paid days', 'Gross', 'PF', 'ESIC', 'PT', 'LWF', 'Held', 'Total deductions', 'Net pay', 'Separate payouts', 'Remarks'], ...s3, sumRow(s3, 5)], cols: [14, 34, 9, 26, 14, 9, 11, 9, 8, 7, 7, 10, 12, 11, 12, 22] }]));
  }
  if (id === 'comp') {
    const s1 = A.map(a => [a.site.name, E.STATE.NAMES[a.site.state] || a.site.state, a.pfw, a.epsw, a.PF, a.er.EPF, a.er.EPS, a.er.EDLI, a.er.ADMIN, a.PF + a.er.EPF + a.er.EPS + a.er.EDLI + a.er.ADMIN, a.esiw, a.ESI, a.er.ESI, a.ESI + a.er.ESI, a.PT, a.LWF, a.er.LWF]);
    const st = {}; A.forEach(a => { const k = a.site.state; const o = st[k] = st[k] || [E.STATE.NAMES[k] || k, 0, 0, 0, 0, 0, 0, 0]; o[1] += a.emps.size; o[2] += a.PF + a.er.EPF + a.er.EPS + a.er.EDLI + a.er.ADMIN; o[3] += a.ESI + a.er.ESI; o[4] += a.PT; o[5] += a.LWF; o[6] += a.er.LWF; o[7] += a.PF + a.er.EPF + a.er.EPS + a.er.EDLI + a.er.ADMIN + a.ESI + a.er.ESI + a.PT + a.LWF + a.er.LWF; });
    const s2 = Object.values(st);
    const s3 = runs.map(x => { const L = x.c.tot.lines; const er = k => x.c.rows.reduce((t, r) => t + r.r.er[k], 0); return [monthName(x.month), x.site.name, L.PF || 0, er('EPF'), er('EPS'), er('EDLI') + er('ADMIN'), L.ESI || 0, er('ESI'), L.PT || 0, (L.LWF || 0) + er('LWF')]; });
    const s4 = runs.flatMap(x => x.c.rows.map(r => [monthName(x.month), x.site.name, r.emp.code, r.emp.name, r.emp.uan || '', r.emp.esicNo || '', r.att.PD, r.r.GROSS, r.r.pfWages, r.r.epsWages, r.r.lines.PF || 0, r.r.er.EPF, r.r.er.EPS, r.r.er.EDLI, r.r.er.ADMIN, r.r.lines.ESI > 0 ? r.r.ESIW : 0, r.r.lines.ESI || 0, r.r.er.ESI, r.r.lines.PT || 0, r.r.lines.LWF || 0, r.r.er.LWF]));
    return saveFile(fn('Total_Compliance_Report'), xlsxBytes([
      { name: 'By site', rows: [...head('Total compliance report — by site'), ['Site', 'State', 'PF wages', 'EPS wages', 'PF employee 12%', 'EPF employer', 'EPS 8.33%', 'EDLI 0.5%', 'PF admin 0.5%', 'Total PF remittance', 'ESIC wages', 'ESIC employee 0.75%', 'ESIC employer 3.25%', 'Total ESIC', 'Professional tax', 'LWF employee', 'LWF employer'], ...s1, sumRow(s1, 2)], cols: [38, 14, 12, 12, 12, 12, 11, 10, 10, 13, 12, 12, 12, 12, 11, 10, 10] },
      { name: 'By state', rows: [...head('Total compliance report — by state'), ['State', 'Employees', 'PF remittance', 'ESIC remittance', 'Professional tax', 'LWF employee', 'LWF employer', 'Total'], ...s2, sumRow(s2, 1)], cols: [24, 10, 14, 14, 13, 12, 12, 14] },
      { name: 'By month', rows: [...head('Total compliance report — by month and site'), ['Month', 'Site', 'PF employee', 'EPF employer', 'EPS', 'EDLI + admin', 'ESIC employee', 'ESIC employer', 'PT', 'LWF (ee + er)'], ...s3, sumRow(s3, 2)], cols: [14, 38, 12, 12, 11, 12, 12, 12, 10, 12] },
      { name: 'Employee detail', rows: [...head('Total compliance report — employee detail'), ['Month', 'Site', 'Emp. Code', 'Name', 'UAN', 'ESIC IP no.', 'Paid days', 'Gross', 'PF wages', 'EPS wages', 'PF employee', 'EPF employer', 'EPS', 'EDLI', 'PF admin', 'ESIC wages', 'ESIC employee', 'ESIC employer', 'PT', 'LWF employee', 'LWF employer'], ...s4, sumRow(s4, 6)], cols: [14, 32, 9, 24, 14, 13, 8, 10, 10, 10, 10, 10, 9, 8, 8, 10, 10, 10, 7, 9, 9] }]));
  }
  if (id === 'bonus') {
    const B = bonusRows(q, runs); const ms = B.months; const fyL = fyOf(q.from).label;
    const nm = 5 + ms.length * 2;
    const hdr = ['Sr. No.', 'Site', 'Emp. Code', 'Employee Name', 'Designation', ...ms.flatMap(m => [`${monthName(m)} days`, `${monthName(m)} bonus wages`]), 'Total paid days', 'Total bonus wages', 'Bonus %', 'Eligible', 'Reason if not eligible', 'Bonus amount', 'Less: advance / puja bonus', 'Net bonus payable', 'Bank A/c', 'IFSC'];
    const data = B.rows.map((r, i) => [i + 1, r.site.name, r.emp.code, r.emp.name, r.emp.desig || '', ...ms.flatMap(m => r.m[m] ? [r.m[m].pd, r.m[m].ok ? r.m[m].bw : 0] : ['', '']), r.days, r.wages, r.cf.pct, r.eligible ? 'Yes' : 'No', r.why, r.amount, 0, r.amount, r.emp.acct || '', r.emp.ifsc || '']);
    const sumIdx = new Set([...Array.from({ length: ms.length * 2 + 2 }, (_, k) => 5 + k), nm + 5, nm + 6, nm + 7]);
    const tot = hdr.map((h, j) => j === 3 ? 'TOTAL' : sumIdx.has(j) ? data.reduce((t, r) => t + (+r[j] || 0), 0) : '');
    const bySite = {}; B.rows.forEach(r => { const a = bySite[r.site.id] = bySite[r.site.id] || [r.site.name, r.site.client, bonusRuleText(r.cf), r.cf.payMonth || '', 0, 0, 0, 0]; a[4]++; if (r.eligible) { a[5]++; a[6] += r.wages; } a[7] += r.amount; });
    const s2 = Object.values(bySite);
    const formC = B.rows.map((r, i) => [i + 1, r.site.name, r.emp.name, r.emp.father || '', r.eligible ? 'Yes' : 'No', r.days, r.wages, r.amount, 0, 0, 0, 0, 0, r.amount, '', '', '']);
    return saveFile(`Bonus_Calculation_${fyL.replace(/\s+/g, '_')}.xlsx`, xlsxBytes([
      { name: 'Bonus calculation', rows: [['Indus Fire Safety Private Limited'], [`Bonus calculation — ${fyL} (${monthName(q.from)} to ${monthName(q.to)})`], [`Calculated by each site's bonus rule (see the "By site" sheet)${B.full ? '' : ' · provisional, year in progress'}${runs.some(x => x.draft) ? ' · includes runs not yet locked' : ''}`], [], hdr, ...data, tot], cols: [6, 34, 9, 26, 14, ...ms.flatMap(() => [8, 11]), 10, 13, 8, 8, 24, 12, 12, 13, 18, 13] },
      { name: 'By site', rows: [['Bonus — by site'], [fyL + (B.full ? '' : ' — provisional, year in progress')], [], ['Site', 'Client', 'Bonus rule', 'Paid in', 'Employees', 'Eligible', 'Bonus wages', 'Bonus payable'], ...s2, sumRow(s2, 4)], cols: [38, 26, 60, 14, 10, 10, 14, 14] },
      { name: 'Form C', rows: [['FORM C'], ['Bonus paid to employees for the accounting year ending on 31 March ' + q.to.slice(0, 4)], ['Name of the establishment: Indus Fire Safety Private Limited'], [`Accounting year: ${monthName(q.from)} to ${monthName(q.to)}`], [], ['Sl. No.', 'Site', 'Name of the employee', "Father's name", 'Whether he has completed 15 years of age at the beginning of the accounting year', 'Total number of days worked in the year', 'Total salary or wage in respect of the accounting year', 'Amount of bonus payable', 'Puja bonus or other customary bonus paid during the accounting year', 'Interim bonus or bonus paid in advance', 'Amount of income-tax deducted', 'Deduction on account of financial loss, if any, caused by misconduct', 'Total sum deducted', 'Net amount payable', 'Amount actually paid', 'Date on which paid', 'Signature / thumb impression of the employee'], ...formC], cols: [6, 30, 26, 20, 14, 12, 14, 12, 14, 12, 10, 14, 10, 12, 12, 12, 16] }]));
  }
  if (id === 'cost') { const s1 = A.map(a => [a.site.name, a.emps.size, a.gross, a.pay, a.er.EPF, a.er.EPS, a.er.EDLI, a.er.ADMIN, a.er.ESI, a.er.LWF, a.er.TOTAL, a.gross + a.pay + a.er.TOTAL]);
    return saveFile(fn('Employer_Cost_Report'), xlsxBytes([{ name: 'Employer cost', rows: [...head('Employer cost (CTC) report'), ['Site', 'Employees', 'Gross wages', 'Separate payouts', 'Employer EPF', 'EPS', 'EDLI', 'PF admin', 'Employer ESIC', 'Employer LWF', 'Total employer contribution', 'Cost to company'], ...s1, sumRow(s1, 1)], cols: [38, 10, 13, 13, 12, 11, 9, 9, 12, 11, 14, 14] }])); }
  if (id === 'att') { const s1 = runs.map(x => { const R2 = x.c.rows; const t = k => R2.reduce((s2, r) => s2 + (r.att[k] || 0), 0); return [monthName(x.month), x.site.name, R2.length, t('PD'), t('OTD'), t('OTH'), t('NH'), t('WOT')]; });
    return saveFile(fn('Attendance_Summary'), xlsxBytes([{ name: 'Attendance', rows: [...head('Attendance summary'), ['Month', 'Site', 'Employees', 'Paid days', 'OT days', 'OT hours', 'NH / PH', 'Weekly-off worked'], ...s1, sumRow(s1, 2)], cols: [14, 38, 10, 10, 9, 9, 9, 12] }])); }
  if (id === 'mom') { const months = monthsBetween(q.from, q.to); const cell = {}; runs.forEach(x => cell[x.site.id + '|' + x.month] = x.c); const sites = [...new Set(runs.map(x => x.site.id))].map(i => S.sites[i]).sort((a, b) => a.name.localeCompare(b.name));
    const mk = (f) => sites.map(st => [st.name, ...months.map(m => cell[st.id + '|' + m] ? f(cell[st.id + '|' + m]) : '')]);
    const H = ['Site', ...months.map(m => monthName(m))];
    return saveFile(fn('Month_on_Month'), xlsxBytes([{ name: 'Gross', rows: [...head('Gross wages by month'), H, ...mk(c => c.tot.GROSS)] }, { name: 'Net', rows: [...head('Net pay by month'), H, ...mk(c => c.tot.NET)] }, { name: 'Headcount', rows: [...head('Headcount by month'), H, ...mk(c => c.rows.length)] }])); }
}

// ---------------- Registers & files ----------------
const REGS = [
  ['XIII', 'Form XIII — Register of workmen employed by contractor', 'CLRA'], ['XVI', 'Form XVI — Muster roll', 'CLRA'], ['XVII', 'Form XVII — Register of wages', 'CLRA'],
  ['XIX', 'Form XIX — Wage slips', 'CLRA'], ['XX', 'Form XX — Register of deductions for damage or loss', 'CLRA'], ['XXI', 'Form XXI — Register of fines', 'CLRA'],
  ['XXII', 'Form XXII — Register of advances', 'CLRA'], ['XXIII', 'Form XXIII — Register of overtime', 'CLRA'],
  ['CODE_I', 'Form I — Employee register', 'CODE'], ['CODE_IV', 'Form IV — Register of wages, overtime, advances, fines & deductions', 'CODE'], ['CODE_V', 'Form V — Wage slips', 'CODE'], ['CODE_IX', 'Form IX — Attendance register cum muster roll', 'CODE'],
];
// One report list per site and month drives everything: a single download, a site pack (ZIP) and a multi-site bundle.
// Locked months are built from the salary structure saved when they were locked, so an old month always comes out as it was paid.
// ---------------- Pay frozen at lock ----------------
// A locked month must always recalculate with the pay that was actually used, whatever the employee master says today.
const PAY_KEYS = ['rate', 'basic', 'rateType', 'desig', 'pf', 'esi', 'formulas', 'extra'];
function payOf(e) { const o = {}; for (const k of PAY_KEYS) if (e && e[k] != null && e[k] !== '') o[k] = JSON.parse(JSON.stringify(e[k])); return o; }
function empAt(run, e) {
  if (!e || !run || run.status !== 'LOCKED' || !run.pay) return e;
  const f = run.pay[e.code] || run.pay[String(e.code)]; if (!f) return e;
  const o = Object.assign({}, e); PAY_KEYS.forEach(k => delete o[k]); return Object.assign(o, JSON.parse(JSON.stringify(f)));
}
// locked months from before the freeze existed get today's master recorded once, before anything changes it
async function freezePay(sids) {
  const set = sids ? new Set(sids) : null; let n = 0;
  for (const r of Object.values(S.runs || {})) {
    if (r.status !== 'LOCKED' || r.pay || (set && !set.has(r.siteId))) continue;
    const by = Object.fromEntries(empsOf(r.siteId).map(e => [String(e.code), e])); const pay = {};
    for (const a of r.att || []) { const e = by[String(a.code)]; if (e && !a.skip) pay[e.code] = payOf(e); }
    r.pay = pay; const id = r._id || runId(r.siteId, r.month, r.type); if (await put('runs/' + id, strip(r))) n++;
  }
  return n;
}

// ---------------- Salary revisions: minimum wage, increments, master edits ----------------
// Every change to an employee's pay is a revision document: who, what (from → to), effective when, approved by whom.
const REV_KIND = { MINWAGE: ['Minimum wage', 'p-pri'], INCREMENT: ['Increment', 'p-ok'], EDIT: ['Master edit', 'p-mute'], JOIN: ['Joining', 'p-mute'], TRANSFER: ['Transfer', 'p-mute'], ARREAR: ['Arrear rates', 'p-warn'] };
const REV_STATUS = { DRAFT: ['Draft', 'p-mute'], SCHEDULED: ['Scheduled', 'p-warn'], APPLIED: ['Applied', 'p-ok'], REVERTED: ['Reverted', 'p-bad'] };
const INC_REASONS = ['Annual increment', 'Promotion', 'Client rate revision', 'Performance increment', 'Correction', 'Other'];
const who = () => (S.user && (S.user.name || S.user.email)) || 'User';
const revList = () => Object.values(S.revs || {});
const ymOf = d => (d || '').slice(0, 7);
function revField(site, k) {
  if (k === 'rate') return 'Gross rate'; if (k === 'basic') return 'Basic'; if (k === 'desig') return 'Designation'; if (k === 'rateType') return 'Rate type';
  if (k.startsWith('x:')) { const key = k.slice(2); try { const sp = site ? salarySpec(site, {}) : null; const f = sp && [...sp.params, ...sp.extras].find(x => x.k === key); return SAL_NICE(key, f ? f.used : []); } catch (e) { return key; } }
  return k;
}
const fv = (k, v) => v == null || v === '' ? '—' : (k === 'desig' || k === 'rateType') ? esc(String(v)) : '₹' + inr(v, 2).replace(/\.00$/, '');
const pctCh = (a, b) => (+a > 0 && b != null && !isNaN(+b)) ? ((+b - +a) / +a * 100) : null;
const empVal = (e, k) => k.startsWith('x:') ? (e.extra || {})[k.slice(2)] : e[k];
function setEmpVal(e, k, v) {
  if (k.startsWith('x:')) { const key = k.slice(2); e.extra = e.extra || {}; if (v == null || v === '') delete e.extra[key]; else e.extra[key] = v; if (!Object.keys(e.extra).length) delete e.extra; }
  else if (v == null || v === '') delete e[k]; else e[k] = v;
}
// monthly money effect of a row (for summaries): change in gross per month
function rowImpact(site, e, ch) {
  const r = ch.rate; if (!r) return 0; const daily = ((e && e.rateType) || site.rateType) === 'D';
  const days = site.divisor && site.divisor.type === 'fixed' ? +site.divisor.days || 26 : 26;
  return ((+r[1] || 0) - (+r[0] || 0)) * (daily ? days : 1);
}
function revSummary(R) {
  const site = S.sites[R.siteId] || {}; const emps = Object.fromEntries(empsOf(R.siteId).map(e => [String(e.code), e]));
  let imp = 0, bsum = 0, bn = 0, rsum = 0, rn = 0;
  for (const row of R.rows || []) {
    imp += rowImpact(site, emps[row.code] || {}, row.ch);
    if (row.ch.basic && row.ch.basic[0] != null) { bsum += (+row.ch.basic[1] || 0) - (+row.ch.basic[0] || 0); bn++; }
    if (row.ch.rate) { const p = pctCh(row.ch.rate[0], row.ch.rate[1]); if (p != null) { rsum += p; rn++; } }
  }
  return { n: (R.rows || []).length, imp: Math.round(imp), basicAvg: bn ? bsum / bn : null, ratePct: rn ? rsum / rn : null };
}
// write a revision for a single employee change made in the master (joins, edits, transfers)
async function logRev(kind, siteId, emp, ch, extra = {}) {
  if (!Object.keys(ch).length) return;
  const id = `${siteId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const doc = Object.assign({ kind, siteId, status: 'APPLIED', title: REV_KIND[kind][0], effective: extra.effDate ? ymOf(extra.effDate) : S.month, effDate: extra.effDate || '', createdAt: new Date().toISOString(), createdBy: who(), appliedAt: new Date().toISOString(), appliedBy: who(), rows: [{ code: String(emp.code), name: emp.name || '', desig: emp.desig || '', ch }] }, extra);
  delete doc.effDate0; if (await put('revisions/' + id, JSON.parse(JSON.stringify(doc)))) S.revs[id] = Object.assign({ _id: id }, doc);
}
function payDiff(a, b) {
  const ch = {}; const keys = ['rate', 'basic', 'rateType', 'desig'];
  for (const k of keys) { const x = a ? a[k] : null, y = b[k]; if (String(x ?? '') !== String(y ?? '')) ch[k] = [x ?? null, y ?? null]; }
  const xs = new Set([...Object.keys((a && a.extra) || {}), ...Object.keys(b.extra || {})]);
  for (const k of xs) { if (/^IN_/.test(k)) continue; const x = ((a && a.extra) || {})[k], y = (b.extra || {})[k]; if (String(x ?? '') !== String(y ?? '')) ch['x:' + k] = [x ?? null, y ?? null]; }
  return ch;
}

// apply / revert. The master is changed only here, and locked months are frozen first.
async function applyRevision(R) {
  await freezePay([R.siteId]);
  const list = empsOf(R.siteId); const by = Object.fromEntries(list.map(e => [String(e.code), e])); const moved = [];
  for (const row of R.rows) {
    const e = by[row.code]; if (!e) { moved.push(row.code); continue; }
    for (const [k, v] of Object.entries(row.ch)) { const cur = empVal(e, k); if (String(cur ?? '') !== String(v[0] ?? '')) v[0] = cur ?? null; setEmpVal(e, k, v[1]); }
  }
  if (!(await put('employees/' + R.siteId, { list }))) return false;
  S.emps[R.siteId] = Object.assign(S.emps[R.siteId] || {}, { list });
  if (R.siteParams && Object.keys(R.siteParams).length) {
    const d = S.siteDocs[R.siteId]; const params = Object.assign({}, d.params || {});
    for (const [k, v] of Object.entries(R.siteParams)) { v[0] = params[k] ?? null; params[k] = v[1]; }
    const doc = storeDoc(Object.assign({}, d, { params })); await put('sites/' + R.siteId, doc); S.siteDocs[R.siteId] = Object.assign({ _id: R.siteId }, doc); resolveAll();
  }
  R.status = 'APPLIED'; R.appliedAt = new Date().toISOString(); R.appliedBy = who(); if (moved.length) R.notFound = moved;
  return saveRev(R);
}
async function revertRevision(R) {
  await freezePay([R.siteId]);
  const list = empsOf(R.siteId); const by = Object.fromEntries(list.map(e => [String(e.code), e])); const skipped = [];
  for (const row of R.rows) {
    const e = by[row.code]; if (!e) continue;
    for (const [k, v] of Object.entries(row.ch)) { if (String(empVal(e, k) ?? '') === String(v[1] ?? '')) setEmpVal(e, k, v[0]); else skipped.push(`${row.code} ${revField(S.sites[R.siteId], k)}`); }
  }
  await put('employees/' + R.siteId, { list }); S.emps[R.siteId] = Object.assign(S.emps[R.siteId] || {}, { list });
  if (R.siteParams && Object.keys(R.siteParams).length) {
    const d = S.siteDocs[R.siteId]; const params = Object.assign({}, d.params || {});
    for (const [k, v] of Object.entries(R.siteParams)) if (String(params[k] ?? '') === String(v[1] ?? '')) { if (v[0] == null) delete params[k]; else params[k] = v[0]; }
    const doc = storeDoc(Object.assign({}, d, { params })); await put('sites/' + R.siteId, doc); S.siteDocs[R.siteId] = Object.assign({ _id: R.siteId }, doc); resolveAll();
  }
  R.status = 'REVERTED'; R.revertedAt = new Date().toISOString(); R.revertedBy = who(); if (skipped.length) R.revertSkipped = skipped;
  await saveRev(R); return skipped;
}
async function saveRev(R) {
  if (!R.id) R.id = `${R.siteId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const doc = JSON.parse(JSON.stringify(R)); delete doc._id; delete doc.id; doc.id = R.id;
  if (await put('revisions/' + R.id, doc)) { S.revs[R.id] = Object.assign({ _id: R.id }, doc); return true; } return false;
}
const lockedFrom = (sid, ym) => Object.values(S.runs).filter(r => r.siteId === sid && r.type === 'REG' && r.status === 'LOCKED' && r.month >= ym).map(r => r.month).sort();
const openBefore = (sid, ym) => Object.values(S.runs).filter(r => r.siteId === sid && r.type === 'REG' && r.status !== 'LOCKED' && (r.att || []).length && r.month < ym).map(r => r.month).sort();
const dueRevs = (sid, ym) => revList().filter(R => R.status === 'SCHEDULED' && (!sid || R.siteId === sid) && R.effective <= ym);

// ---------------- the tab ----------------
function vRevisions(p) {
  const V = S.rv = Object.assign({ mode: 'list', tab: 'log', site: '', kind: '', q: '', fy: '' }, S.rv || {});
  if (V.mode === 'mw') return revMinWage(p, V);
  if (V.mode === 'inc') return revIncrement(p, V);
  if (V.mode === 'view') return revView(p, V);
  const fyOf = d => { const [y, m] = (d || '').split('-').map(Number); if (!y) return ''; return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`; };
  const all = revList().sort((a, b) => (b.appliedAt || b.createdAt || '').localeCompare(a.appliedAt || a.createdAt || ''));
  const fys = [...new Set(all.map(r => fyOf(r.effective)).filter(Boolean))].sort().reverse();
  const curFY = fyOf(S.month); const inFY = all.filter(r => fyOf(r.effective) === curFY && r.status === 'APPLIED');
  const mwLast = all.find(r => r.kind === 'MINWAGE' && r.status === 'APPLIED');
  const pend = all.filter(r => r.status === 'DRAFT' || r.status === 'SCHEDULED');
  const due = dueRevs(null, S.month);
  const sites = siteList();
  const head = `<div class="rvhead"><div class="seg">${[['log', 'Revision log'], ['emp', 'Employee history']].map(([k, t]) => `<button data-rvt="${k}" class="${V.tab === k ? 'on' : ''}">${t}</button>`).join('')}</div><span class="grow"></span>
    <button class="btn" id="rv_inc">+ Increment</button><button class="btn pri" id="rv_mw">+ Minimum wage revision</button></div>
   ${due.length ? `<div class="note warn" style="margin-bottom:14px;display:flex;gap:12px;align-items:center"><div class="grow"><b>${due.length} scheduled revision${due.length === 1 ? '' : 's'} now due</b> — effective from ${[...new Set(due.map(r => monthName(r.effective)))].join(', ')} at ${[...new Set(due.map(r => (S.sites[r.siteId] || {}).name || r.siteId))].slice(0, 3).map(esc).join(', ')}${due.length > 3 ? '…' : ''}. Apply before processing that month's salary.</div><button class="btn sm pri" id="rv_due">Review</button></div>` : ''}
   <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
    <div class="kpi"><div class="l">Revisions applied · FY ${curFY}</div><div class="v">${inFY.filter(r => r.kind === 'MINWAGE' || r.kind === 'INCREMENT' || r.kind === 'ARREAR').length}</div><div class="s">${inFY.filter(r => r.kind === 'EDIT').length} single-employee edits</div></div>
    <div class="kpi"><div class="l">Employees revised · FY ${curFY}</div><div class="v">${inr(new Set(inFY.flatMap(r => (r.rows || []).map(x => r.siteId + '|' + x.code))).size)}</div><div class="s">across ${new Set(inFY.map(r => r.siteId)).size} sites</div></div>
    <div class="kpi"><div class="l">Awaiting approval</div><div class="v">${pend.length}</div><div class="s">${pend.filter(r => r.status === 'SCHEDULED').length} scheduled for a later month</div></div>
    <div class="kpi"><div class="l">Last minimum wage revision</div><div class="v" style="font-size:18px">${mwLast ? monthName(mwLast.effective) : '—'}</div><div class="s">${mwLast ? esc((E.STATE.NAMES[mwLast.state] || mwLast.state || '') + (mwLast.ref ? ' · ' + mwLast.ref : '')) : 'none recorded yet'}</div></div>
   </div>`;
  if (V.tab === 'emp') { p.innerHTML = head + revEmpHistory(V); bindRvHead(p, V); bindEmpHist(p, V); return; }
  const rows = all.filter(r => (!V.site || r.siteId === V.site) && (!V.kind || (V.kind === 'OTHER' ? !['MINWAGE', 'INCREMENT', 'EDIT'].includes(r.kind) : r.kind === V.kind)) && (!V.fy || fyOf(r.effective) === V.fy)
    && (!V.q || ((S.sites[r.siteId] || {}).name + ' ' + (r.title || '') + ' ' + (r.ref || '') + ' ' + (r.rows || []).map(x => x.code + ' ' + x.name).join(' ')).toLowerCase().includes(V.q.toLowerCase())));
  const shown = rows.slice(0, V.more ? 2000 : 200);
  p.innerHTML = head + `<div class="card rvf"><div><span class="efl">Site</span><select class="in" id="rv_site"><option value="">All sites</option>${sites.map(s => `<option value="${esc(s.id)}" ${V.site === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
     <div><span class="efl">Type</span><div class="seg" id="rv_kind">${[['', 'All'], ['MINWAGE', 'Minimum wage'], ['INCREMENT', 'Increments'], ['EDIT', 'Master edits'], ['OTHER', 'Other']].map(([k, t]) => `<button data-k="${k}" class="${V.kind === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
     <div><span class="efl">Financial year</span><select class="in" id="rv_fy"><option value="">All years</option>${fys.map(f => `<option ${V.fy === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
     <div><span class="efl">Search</span><input class="in" id="rv_q" placeholder="Employee code or name, reference" value="${esc(V.q)}"></div></div>
   <div class="card flush"><div class="chead"><div class="grow"><h2>${V.site ? esc((S.sites[V.site] || {}).name || '') + ' — salary revisions' : 'All salary revisions'}</h2><div class="small muted">Every change to an employee's pay, newest first. Open one to see each employee's old and new rates.</div></div>
     <span class="small muted">${rows.length} record${rows.length === 1 ? '' : 's'}</span><button class="btn sm" id="rv_xl" ${rows.length ? '' : 'disabled'}>Download</button></div>
    <div class="tw" style="max-height:620px;overflow:auto"><table class="tbl rvt"><thead><tr><th>Date</th><th>Site</th><th>Type</th><th>Revision</th><th>Effective</th><th class="n">Employees</th><th class="n">Change</th><th class="n">Gross / month</th><th>Status</th></tr></thead><tbody>
    ${shown.map(r => { const sm = revSummary(r); const st = REV_STATUS[r.status] || [r.status, 'p-mute']; const k = REV_KIND[r.kind] || [r.kind, 'p-mute'];
      const one = (r.rows || []).length === 1 ? r.rows[0] : null;
      const chg = sm.basicAvg != null ? `Basic ${sm.basicAvg >= 0 ? '+' : ''}₹${inr(sm.basicAvg, 2).replace(/\.00$/, '')}` : sm.ratePct != null ? `${sm.ratePct >= 0 ? '+' : ''}${sm.ratePct.toFixed(1)}%` : one ? Object.keys(one.ch).map(x => revField(S.sites[r.siteId], x)).join(', ') : '';
      return `<tr data-rv="${esc(r._id || r.id)}" class="rvrow"><td class="small">${dShort(r.appliedAt || r.createdAt)}<div class="muted">${esc(r.appliedBy || r.createdBy || '')}</div></td><td>${esc((S.sites[r.siteId] || {}).name || r.siteId)}</td>
       <td><span class="pill ${k[1]}">${k[0]}</span></td><td>${one && r.kind !== 'MINWAGE' && r.kind !== 'INCREMENT' ? `<b>${esc(one.name)}</b> <span class="mono small muted">${esc(one.code)}</span>` : `<b>${esc(r.title || k[0])}</b>`}${r.ref ? `<div class="small muted">${esc(r.ref)}</div>` : ''}${r.batch && r.kind === 'MINWAGE' ? `<div class="small muted">${esc(E.STATE.NAMES[r.state] || r.state || '')} notification · ${revList().filter(x => x.batch === r.batch).length} sites</div>` : ''}</td>
       <td>${r.effective ? monthName(r.effective) : '—'}</td><td class="n">${sm.n}</td><td class="n">${chg}</td><td class="n">${sm.imp ? (sm.imp > 0 ? '+' : '−') + '₹' + inr(Math.abs(sm.imp)) : '<span class="muted">—</span>'}</td><td><span class="pill ${st[1]}">${st[0]}</span></td></tr>`; }).join('') || `<tr><td colspan="9" class="empty">No salary revisions recorded${V.site || V.kind || V.q || V.fy ? ' for these filters' : ' yet. Use “Minimum wage revision” or “Increment” above — and every salary change made in the employee master is recorded here automatically'}.</td></tr>`}
    </tbody></table>${rows.length > shown.length ? `<div style="padding:12px;text-align:center"><button class="btn sm" id="rv_more">Show all ${rows.length}</button></div>` : ''}</div></div>`;
  bindRvHead(p, V);
  $('#rv_site').onchange = e => { V.site = e.target.value; render(); };
  $('#rv_fy').onchange = e => { V.fy = e.target.value; render(); };
  p.querySelectorAll('#rv_kind button').forEach(b => b.onclick = () => { V.kind = b.dataset.k; render(); });
  $('#rv_q').oninput = e => { V.q = e.target.value; clearTimeout(V._t); V._t = setTimeout(() => { const pos = e.target.selectionStart; render(); const q = $('#rv_q'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }, 250); };
  p.querySelectorAll('[data-rv]').forEach(tr => tr.onclick = () => { V.mode = 'view'; V.id = tr.dataset.rv; render(); window.scrollTo(0, 0); });
  const mo = $('#rv_more'); if (mo) mo.onclick = () => { V.more = true; render(); };
  $('#rv_xl').onclick = () => revLogXlsx(rows, V.site ? `Salary_Revisions_${V.site}` : 'Salary_Revisions_All');
}
function bindRvHead(p, V) {
  p.querySelectorAll('[data-rvt]').forEach(b => b.onclick = () => { V.tab = b.dataset.rvt; render(); });
  $('#rv_mw').onclick = () => { V.mode = 'mw'; V.draft = null; render(); window.scrollTo(0, 0); };
  $('#rv_inc').onclick = () => { V.mode = 'inc'; V.draft = null; render(); window.scrollTo(0, 0); };
  const d = $('#rv_due'); if (d) d.onclick = () => { V.tab = 'log'; V.kind = ''; V.site = ''; V.q = ''; const r = dueRevs(null, S.month)[0]; if (r) { V.mode = 'view'; V.id = r._id || r.id; } render(); };
}
function revLogXlsx(rows, name) {
  const out = [['Indus Fire Safety Private Limited'], ['Salary revision history'], [`Generated ${new Date().toLocaleString('en-IN')}`], [], ['Date', 'Site', 'Type', 'Revision', 'Reference', 'Effective from', 'Status', 'By', 'Emp. code', 'Name', 'Designation', 'Item', 'Old', 'New', 'Change %']];
  for (const r of rows) for (const x of r.rows || []) for (const [k, v] of Object.entries(x.ch)) { const pc = pctCh(v[0], v[1]); out.push([dShort(r.appliedAt || r.createdAt), (S.sites[r.siteId] || {}).name || r.siteId, (REV_KIND[r.kind] || [r.kind])[0], r.title || '', r.ref || '', r.effective ? monthName(r.effective) : '', (REV_STATUS[r.status] || [r.status])[0], r.appliedBy || r.createdBy || '', x.code, x.name, x.desig || '', revField(S.sites[r.siteId], k), v[0] ?? '', v[1] ?? '', pc == null ? '' : +pc.toFixed(2)]); }
  saveFile(name + '.xlsx', xlsxBytes([{ name: 'Revisions', rows: out, cols: [11, 30, 13, 26, 18, 13, 10, 14, 9, 24, 14, 22, 10, 10, 9] }]));
}

// ---- employee history ----
function empTimeline(sid, code) {
  const site = S.sites[sid];
  const ev = revList().filter(r => r.siteId === sid && (r.rows || []).some(x => String(x.code) === String(code)) && r.status !== 'DRAFT')
    .map(r => ({ r, row: r.rows.find(x => String(x.code) === String(code)) })).sort((a, b) => (b.r.effective || '').localeCompare(a.r.effective || '') || (b.r.appliedAt || b.r.createdAt || '').localeCompare(a.r.appliedAt || a.r.createdAt || ''));
  const old = Object.values(S.ioms || {}).filter(i => i.siteId === sid && String(i.code) === String(code) && i.details && !ev.some(x => Math.abs(new Date(x.r.createdAt) - new Date(i.at)) < 5000)).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  if (!ev.length && !old.length) return `<div class="empty small" style="padding:22px">No pay changes recorded for this employee yet.</div>`;
  return `<div class="rvtl">${ev.map(({ r, row }) => { const k = REV_KIND[r.kind] || [r.kind, 'p-mute']; const st = REV_STATUS[r.status];
    return `<div class="rvte ${r.status === 'REVERTED' ? 'rev' : ''} ${r.status === 'SCHEDULED' ? 'sch' : ''}"><i></i><div class="rvtd"><b>${r.effective ? monthName(r.effective) : dShort(r.createdAt)}</b><span>${dShort(r.appliedAt || r.createdAt)}</span></div>
     <div class="grow"><div class="row" style="gap:8px;flex-wrap:wrap"><span class="pill ${k[1]}">${k[0]}</span>${r.status !== 'APPLIED' ? `<span class="pill ${st[1]}">${st[0]}</span>` : ''}<b>${esc(r.title || '')}</b>${r.ref ? `<span class="small muted">${esc(r.ref)}</span>` : ''}</div>
      <div class="rvch">${Object.entries(row.ch).map(([f, v]) => { const pc = pctCh(v[0], v[1]); return `<span><em>${esc(revField(site, f))}</em> ${fv(f, v[0])} <b>→ ${fv(f, v[1])}</b>${pc != null && pc !== 0 ? ` <i class="${pc > 0 ? 'up' : 'dn'}">${pc > 0 ? '+' : ''}${pc.toFixed(1)}%</i>` : ''}</span>`; }).join('')}</div>
      <div class="small muted">${r.status === 'REVERTED' ? `Reverted ${dShort(r.revertedAt)} by ${esc(r.revertedBy || '')} · ` : ''}${r.appliedBy || r.createdBy ? 'By ' + esc(r.appliedBy || r.createdBy) : ''}</div></div>
     <button class="btn sm" data-rvo="${esc(r._id || r.id)}">Open</button></div>`; }).join('')}
   ${old.map(i => `<div class="rvte old"><i></i><div class="rvtd"><b>${i.effective ? monthName(i.effective.slice(0, 7)) : dShort(i.at)}</b><span>${dShort(i.at)}</span></div><div class="grow"><span class="pill p-mute">Earlier record</span> <span class="small">${esc(i.details)}</span></div></div>`).join('')}</div>`;
}
function revEmpHistory(V) {
  const sites = siteList(); const sid = V.hs || (sites[0] || {}).id; V.hs = sid;
  const emps = empsOf(sid).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const q = (V.hq || '').toLowerCase(); const list = emps.filter(e => !q || (e.name + ' ' + e.code + ' ' + (e.desig || '')).toLowerCase().includes(q));
  const cnt = {}; revList().filter(r => r.siteId === sid && r.status !== 'DRAFT').forEach(r => (r.rows || []).forEach(x => cnt[x.code] = (cnt[x.code] || 0) + 1));
  const e = emps.find(x => String(x.code) === String(V.he)) || null;
  return `<div class="rvemp"><div class="card flush rvel"><div style="padding:14px 14px 10px"><span class="efl">Site</span><select class="in" id="rh_site" style="width:100%">${sites.map(s => `<option value="${esc(s.id)}" ${s.id === sid ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
     <input class="in" id="rh_q" placeholder="Search employee" value="${esc(V.hq || '')}" style="width:100%;margin-top:8px"></div>
    <div class="rvell">${list.map(x => `<a data-he="${esc(x.code)}" class="${e && String(e.code) === String(x.code) ? 'on' : ''}"><span class="grow"><b>${esc(x.name)}</b><span class="small muted mono">${esc(x.code)} · ${esc(x.desig || '')}</span></span>${cnt[x.code] ? `<span class="pill p-pri">${cnt[x.code]}</span>` : ''}${x.status === 'EXIT' ? '<span class="pill p-mute">Exited</span>' : ''}</a>`).join('') || '<div class="empty small">No employees</div>'}</div></div>
   <div>${e ? `<div class="card ephead" style="margin-bottom:14px"><div class="eav"><span>${esc(initials(e.name))}</span></div><div class="grow"><h2 style="margin:0;font-size:17px">${esc(e.name)}</h2><div class="small muted"><span class="mono">${esc(e.code)}</span> · ${esc(e.desig || '')} · ${esc((S.sites[sid] || {}).name || '')}</div></div>
      <div class="rvnow"><span>Gross now</span><b>${fv('rate', e.rate)}</b><span>${((e.rateType || (S.sites[sid] || {}).rateType) === 'D') ? 'per day' : 'per month'}</span></div><div class="rvnow"><span>Basic now</span><b>${fv('basic', e.basic ?? ((S.sites[sid] || {}).params || {}).BASIC)}</b><span>${+(e.basic || 0) >= 2000 ? 'per month' : 'per day'}</span></div>
      ${e.status !== 'EXIT' ? `<button class="btn" id="rh_inc">Give increment</button>` : ''}<button class="btn" id="rh_xl">Download</button></div>
     <div class="card flush"><div class="chead"><h2>Pay history</h2><span class="small muted">every change, newest first</span></div><div style="padding:6px 20px 16px">${empTimeline(sid, e.code)}</div></div>`
    : `<div class="card empty">Pick an employee to see every change to their pay — minimum wage revisions, increments, joining rates and edits in the employee master.</div>`}</div></div>`;
}
function bindEmpHist(p, V) {
  $('#rh_site').onchange = e => { V.hs = e.target.value; V.he = null; render(); };
  $('#rh_q').oninput = e => { V.hq = e.target.value; clearTimeout(V._t); V._t = setTimeout(() => { const pos = e.target.selectionStart; render(); const q = $('#rh_q'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }, 200); };
  p.querySelectorAll('[data-he]').forEach(a => a.onclick = () => { V.he = a.dataset.he; render(); });
  p.querySelectorAll('[data-rvo]').forEach(b => b.onclick = () => { V.mode = 'view'; V.id = b.dataset.rvo; V.back = 'emp'; render(); window.scrollTo(0, 0); });
  const inc = $('#rh_inc'); if (inc) inc.onclick = () => startIncrement(V.hs, [V.he]);
  const xl = $('#rh_xl'); if (xl) xl.onclick = () => revLogXlsx(revList().filter(r => r.siteId === V.hs && (r.rows || []).some(x => String(x.code) === String(V.he))).map(r => Object.assign({}, r, { rows: r.rows.filter(x => String(x.code) === String(V.he)) })), `Pay_History_${V.hs}_${V.he}`);
}
function startIncrement(sid, codes) { const V = S.rv = Object.assign(S.rv || {}, { mode: 'inc', draft: null, preset: { sid, codes } }); go('revisions'); window.scrollTo(0, 0); }

// ---- minimum wage revision: one notification, many sites ----
function revMinWage(p, V) {
  const sites = siteList(); const states = [...new Set(sites.map(s => s.state).filter(Boolean))].sort();
  const D = V.draft = V.draft || { state: states[0], ref: '', refDate: '', effDate: `${S.month}-01`, sites: null, rates: {}, all: '', onlyRaise: true, gross: 'same', round: 1, monthlyDays: 26, siteBasic: true, excl: {} };
  const inState = sites.filter(s => s.state === D.state); if (!D.sites) D.sites = inState.map(s => s.id);
  const chosen = inState.filter(s => D.sites.includes(s.id));
  // designations across the chosen sites with the current daily basic (employees with a monthly basic are converted)
  const desig = {};
  for (const s of chosen) for (const e of empsOf(s.id)) { if (e.status === 'EXIT') continue; const b = e.basic ?? (s.params || {}).BASIC; if (b == null) continue; const k = e.desig || '(no designation)'; const d = desig[k] = desig[k] || { n: 0, min: Infinity, max: 0 }; const day = +b >= 2000 ? +b / D.monthlyDays : +b; d.n++; d.min = Math.min(d.min, day); d.max = Math.max(d.max, day); }
  const dk = Object.keys(desig).sort((a, b) => desig[b].n - desig[a].n);
  const plan = mwPlan(D, chosen);
  const tot = plan.reduce((t, x) => ({ n: t.n + x.rows.length, above: t.above + x.above, imp: t.imp + x.imp, sites: t.sites + (x.rows.length ? 1 : 0) }), { n: 0, above: 0, imp: 0, sites: 0 });
  const effYm = ymOf(D.effDate);
  const locked = chosen.filter(s => lockedFrom(s.id, effYm).length);
  p.innerHTML = `<div class="row" style="margin-bottom:12px"><button class="btn" id="mw_back">‹ Salary revisions</button><span class="grow"></span><span class="small muted">New minimum wage revision</span></div>
  <div class="card"><div class="gsh"><b>1 · Notification</b><span>The state's revised minimum wage and when it takes effect</span></div>
   <div class="efgrid g4c">
    <label class="ef"><span class="efl">State</span><select class="in" id="mw_state">${states.map(k => `<option value="${k}" ${D.state === k ? 'selected' : ''}>${esc(E.STATE.NAMES[k] || k)}</option>`).join('')}</select><em>${inState.length} site${inState.length === 1 ? '' : 's'}</em></label>
    <label class="ef"><span class="efl">Notification no.</span><input class="in" id="mw_ref" value="${esc(D.ref)}" placeholder="e.g. KH/MW/2026/1234"><em></em></label>
    <label class="ef"><span class="efl">Notification date</span><input class="in" type="date" id="mw_rd" value="${esc(D.refDate)}"><em></em></label>
    <label class="ef"><span class="efl">Effective from</span><input class="in" type="date" id="mw_eff" value="${esc(D.effDate)}"><em>pay changes from ${monthName(effYm)}</em></label></div></div>
  <div class="card"><div class="gsh"><b>2 · Sites</b><span>Sites in ${esc(E.STATE.NAMES[D.state] || D.state)} that follow this notification</span><span class="grow"></span><a href="#" id="mw_sa" class="small">Select all</a><a href="#" id="mw_sn" class="small" style="margin-left:12px">Clear</a></div>
   <div class="mwsites">${inState.map(s => { const n = empsOf(s.id).filter(e => e.status !== 'EXIT').length; return `<label class="mwsite ${D.sites.includes(s.id) ? 'on' : ''}"><input type="checkbox" data-mws="${esc(s.id)}" ${D.sites.includes(s.id) ? 'checked' : ''}><span class="grow"><b>${esc(s.name)}</b><span>${n} employees · ${s.rateType === 'D' ? 'daily rated' : 'monthly rated'}</span></span></label>`; }).join('') || '<div class="empty small">No sites in this state</div>'}</div></div>
  <div class="card"><div class="gsh"><b>3 · New basic rate per day</b><span>Usually the new minimum wage for each category. Enter per designation, or one rate for all.</span></div>
   <div class="row" style="gap:10px;margin-bottom:12px"><span class="small">Same rate for every designation</span><div class="rin" style="width:130px"><i>₹</i><input id="mw_all" value="${esc(D.all)}" inputmode="decimal" placeholder="per day"></div><button class="btn sm" id="mw_fill">Fill all</button></div>
   <table class="tbl nostick mwt"><thead><tr><th>Designation</th><th class="n">Employees</th><th class="n">Basic per day now</th><th class="n" style="width:170px">New basic per day</th></tr></thead><tbody>
   ${dk.map(k => { const d = desig[k]; const rng = d.min === d.max ? '₹' + inr(d.min, 2).replace(/\.00$/, '') : `₹${inr(d.min, 2).replace(/\.00$/, '')} – ₹${inr(d.max, 2).replace(/\.00$/, '')}`; return `<tr><td><b>${esc(k)}</b></td><td class="n">${d.n}</td><td class="n">${rng}</td><td class="n"><div class="rin sm" style="width:140px;margin-left:auto"><i>₹</i><input data-mwr="${esc(k)}" value="${esc(D.rates[k] ?? '')}" inputmode="decimal" placeholder="no change"></div></td></tr>`; }).join('') || '<tr><td colspan="4" class="empty">Choose at least one site</td></tr>'}</tbody></table>
   <div class="mwopt">
    <label class="sw"><input type="checkbox" id="mw_raise" ${D.onlyRaise ? 'checked' : ''}><span></span><b>Only raise</b> — leave anyone already above the new rate as they are</label>
    <label class="ef" style="margin:0"><span class="efl">Gross rate</span><select class="in" id="mw_gross"><option value="same" ${D.gross === 'same' ? 'selected' : ''}>Raise by the same amount as basic</option><option value="keep" ${D.gross === 'keep' ? 'selected' : ''}>Keep gross unchanged (other allowances absorb it)</option></select><em>${D.gross === 'keep' ? 'Check sites with a balancing allowance — it shrinks by the basic increase' : 'Daily rated: + increase per day. Monthly rated: + increase × days below'}</em></label>
    <label class="ef" style="margin:0"><span class="efl">Days for monthly figures</span><input class="in" id="mw_days" value="${D.monthlyDays}" inputmode="numeric" style="width:90px"><em>monthly basic = day rate × these days</em></label>
    <label class="ef" style="margin:0"><span class="efl">Round to</span><select class="in" id="mw_round">${[[0.01, 'Paise'], [1, '₹1'], [10, '₹10']].map(([v, t]) => `<option value="${v}" ${+D.round === v ? 'selected' : ''}>${t}</option>`).join('')}</select><em></em></label>
   </div></div>
  <div class="card flush"><div class="chead"><div class="grow"><b style="font-size:14px">4 · Preview</b><div class="small muted">${tot.n ? `${tot.n} employee${tot.n === 1 ? '' : 's'} at ${tot.sites} site${tot.sites === 1 ? '' : 's'} get a new rate${tot.above ? ` · ${tot.above} already above the new rate, unchanged` : ''}` : 'Enter new rates above to see who changes'}</div></div>
    ${tot.imp ? `<div class="rvimp"><span>Gross wages</span><b>+₹${inr(tot.imp)}</b><span>per month</span></div>` : ''}</div>
   ${plan.filter(x => x.rows.length || x.above).map(x => `<details class="mwp" ${V.open === x.site.id ? 'open' : ''} data-mwo="${esc(x.site.id)}"><summary><b class="grow">${esc(x.site.name)}</b><span class="small muted">${x.rows.length} change${x.rows.length === 1 ? '' : 's'}${x.above ? ` · ${x.above} above` : ''}${x.siteParam ? ' · site basic rate' : ''}</span><span class="small">${x.imp ? '+₹' + inr(x.imp) + '/month' : ''}</span></summary>
     <div class="tw" style="max-height:360px;overflow:auto"><table class="tbl nostick"><thead><tr><th style="width:30px"></th><th>Code</th><th>Name</th><th>Designation</th><th class="n">Basic</th><th class="n">New basic</th><th class="n">Gross</th><th class="n">New gross</th></tr></thead><tbody>
     ${x.rows.map(r => `<tr class="${D.excl[x.site.id + '|' + r.code] ? 'mwx' : ''}"><td><input type="checkbox" data-mwx="${esc(x.site.id + '|' + r.code)}" ${D.excl[x.site.id + '|' + r.code] ? '' : 'checked'} title="Include"></td><td class="mono">${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.desig)}</td><td class="n">${fv('basic', r.ch.basic[0])}</td><td class="n"><b>${fv('basic', r.ch.basic[1])}</b></td><td class="n">${r.ch.rate ? fv('rate', r.ch.rate[0]) : '<span class="muted">—</span>'}</td><td class="n">${r.ch.rate ? '<b>' + fv('rate', r.ch.rate[1]) + '</b>' : '<span class="muted">unchanged</span>'}</td></tr>`).join('')}
     ${x.siteParam ? `<tr><td></td><td colspan="3"><b>Site basic rate</b> <span class="small muted">used by employees without their own basic</span></td><td class="n">${fv('basic', x.siteParam[0])}</td><td class="n"><b>${fv('basic', x.siteParam[1])}</b></td><td colspan="2"></td></tr>` : ''}</tbody></table></div></details>`).join('')}
   ${locked.length && tot.n ? `<div class="note warn" style="margin:12px 20px">The effective date is back-dated: ${locked.map(s => `${esc(s.name)} (${lockedFrom(s.id, effYm).map(monthName).join(', ')})`).slice(0, 4).join('; ')}${locked.length > 4 ? '…' : ''} already locked at old rates. Once applied, open each site's revision to prepare its arrear sheet with PF and ESIC arrears.</div>` : ''}
   <div class="rvfoot"><span class="small muted grow">${effYm > S.month ? `Effective ${monthName(effYm)} is after ${monthName(S.month)} — it will be saved as <b>scheduled</b> and applied when that month comes.` : 'Applying updates the employee master now; locked months keep the rates they were paid at.'}</span>
    <button class="btn" id="mw_draft" ${tot.n ? '' : 'disabled'}>Save as draft</button><button class="btn pri" id="mw_go" ${tot.n ? '' : 'disabled'}>${effYm > S.month ? 'Schedule' : 'Apply'} for ${tot.sites} site${tot.sites === 1 ? '' : 's'}</button></div></div>`;
  const rd = () => { D.ref = $('#mw_ref').value.trim(); D.refDate = $('#mw_rd').value; D.effDate = $('#mw_eff').value || D.effDate; D.all = $('#mw_all').value; D.onlyRaise = $('#mw_raise').checked; D.gross = $('#mw_gross').value; D.monthlyDays = +$('#mw_days').value || 26; D.round = +$('#mw_round').value;
    p.querySelectorAll('[data-mwr]').forEach(i => { const v = i.value.replace(/[^\d.]/g, ''); if (v) D.rates[i.dataset.mwr] = +v; else delete D.rates[i.dataset.mwr]; }); };
  const re = () => { rd(); const y = window.scrollY; render(); window.scrollTo(0, y); };
  $('#mw_back').onclick = () => { V.mode = 'list'; render(); };
  $('#mw_state').onchange = e => { rd(); D.state = e.target.value; D.sites = null; D.rates = {}; render(); };
  ['#mw_eff', '#mw_raise', '#mw_gross', '#mw_days', '#mw_round'].forEach(s => { const el = $(s); el.onchange = re; });
  p.querySelectorAll('[data-mwr]').forEach(i => i.onchange = re);
  p.querySelectorAll('[data-mws]').forEach(c => c.onchange = () => { rd(); D.sites = c.checked ? [...new Set([...D.sites, c.dataset.mws])] : D.sites.filter(x => x !== c.dataset.mws); const y = window.scrollY; render(); window.scrollTo(0, y); });
  $('#mw_sa').onclick = e => { e.preventDefault(); rd(); D.sites = inState.map(s => s.id); render(); }; $('#mw_sn').onclick = e => { e.preventDefault(); rd(); D.sites = []; render(); };
  $('#mw_fill').onclick = () => { rd(); const v = +D.all.replace(/[^\d.]/g, ''); if (!v) { toast('Enter the new basic per day'); return; } dk.forEach(k => D.rates[k] = v); const y = window.scrollY; render(); window.scrollTo(0, y); };
  p.querySelectorAll('[data-mwx]').forEach(c => c.onchange = () => { rd(); if (c.checked) delete D.excl[c.dataset.mwx]; else D.excl[c.dataset.mwx] = 1; const y = window.scrollY; render(); window.scrollTo(0, y); });
  p.querySelectorAll('[data-mwo]').forEach(d => d.ontoggle = () => { if (d.open) V.open = d.dataset.mwo; else if (V.open === d.dataset.mwo) V.open = null; });
  const save = async (mode) => {
    rd(); const ym = ymOf(D.effDate); const status = mode === 'DRAFT' ? 'DRAFT' : ym > S.month ? 'SCHEDULED' : 'APPLIED';
    const pl = mwPlan(D, inState.filter(s => D.sites.includes(s.id))).filter(x => x.rows.length || x.siteParam); if (!pl.length) return;
    const batch = 'MW_' + Date.now(); let ok = 0;
    for (const x of pl) {
      const R = { kind: 'MINWAGE', siteId: x.site.id, batch, state: D.state, title: `Minimum wage revision — ${E.STATE.NAMES[D.state] || D.state}`, ref: D.ref + (D.refDate ? ` dt. ${new Date(D.refDate).toLocaleDateString('en-IN')}` : ''), effective: ym, effDate: D.effDate,
        rule: { rates: D.rates, onlyRaise: D.onlyRaise, gross: D.gross, monthlyDays: D.monthlyDays, round: D.round }, rows: x.rows.map(r => ({ code: r.code, name: r.name, desig: r.desig, ch: r.ch })), siteParams: x.siteParam ? { BASIC: x.siteParam } : undefined,
        status: 'DRAFT', createdAt: new Date().toISOString(), createdBy: who() };
      if (status === 'APPLIED') { if (await applyRevision(R)) ok++; } else { R.status = status; if (await saveRev(R)) ok++; }
    }
    toast(`${status === 'APPLIED' ? 'Applied' : status === 'SCHEDULED' ? 'Scheduled' : 'Saved as draft'} for ${ok} site${ok === 1 ? '' : 's'}`);
    V.mode = 'list'; V.kind = 'MINWAGE'; V.draft = null; render();
  };
  $('#mw_draft').onclick = () => save('DRAFT');
  $('#mw_go').onclick = () => { rd(); const ym = ymOf(D.effDate); const ob = chosen.flatMap(s => openBefore(s.id, ym).map(m => `${s.name} (${monthName(m)})`));
    confirmModal(ym > S.month ? 'Schedule this minimum wage revision?' : 'Apply this minimum wage revision?', `${tot.n} employees at ${tot.sites} sites get the new basic${D.gross === 'same' ? ' and gross' : ''} from ${monthName(ym)}.${ob.length ? ` Unlocked salary runs before ${monthName(ym)} — ${ob.slice(0, 3).join(', ')}${ob.length > 3 ? '…' : ''} — would also use the new rates; lock them first.` : ''} Every change is recorded in the history and can be reverted.`, () => save('GO')); };
}
function mwPlan(D, chosen) {
  const rnd = v => { const r = +D.round || 1; return Math.round(Math.round(v / r) * r * 100) / 100; };
  return chosen.map(site => {
    const rows = []; let above = 0, imp = 0; const days = +D.monthlyDays || 26;
    for (const e of empsOf(site.id)) {
      if (e.status === 'EXIT' || e.basic == null) continue; const nd = D.rates[e.desig || '(no designation)']; if (!nd) continue;
      const monthly = +e.basic >= 2000; const newB = rnd(monthly ? nd * days : nd); const oldB = +e.basic;
      if (D.onlyRaise && oldB >= newB) { above++; continue; } if (oldB === newB) continue;
      if (D.excl[site.id + '|' + e.code]) continue;
      const ch = { basic: [oldB, newB] };
      if (D.gross === 'same' && +e.rate > 0) { const daily = (e.rateType || site.rateType) === 'D'; const diffDay = (newB - oldB) / (monthly ? days : 1); const inc = daily ? diffDay : diffDay * days; ch.rate = [+e.rate, rnd(+e.rate + inc)]; }
      rows.push({ code: String(e.code), name: e.name, desig: e.desig || '', ch }); imp += rowImpact(site, e, ch);
    }
    let siteParam = null; const sb = (site.params || {}).BASIC;
    if (D.siteBasic && sb != null) { const vals = Object.values(D.rates); const nd = vals.length ? Math.max(...vals) : null; if (nd) { const nb = rnd(+sb >= 2000 ? nd * days : nd); if (!(D.onlyRaise && +sb >= nb) && +sb !== nb) siteParam = [+sb, nb]; } }
    return { site, rows, above, imp: Math.round(imp), siteParam };
  });
}

// ---- increment: one site; everyone, some designations, or chosen employees ----
function revIncrement(p, V) {
  const sites = siteList(); const pre = V.preset; V.preset = null;
  const D = V.draft = V.draft || { sid: (pre && pre.sid) || V.site || (sites[0] || {}).id, reason: INC_REASONS[pre && pre.codes && pre.codes.length === 1 ? 0 : 0], ref: '', effDate: `${S.month}-01`, scope: pre && pre.codes ? 'codes' : 'all', desigs: [], codes: (pre && pre.codes) || [], changes: [{ f: 'rate', mode: 'pct', val: '' }], round: 1, over: {}, q: '' };
  const site = S.sites[D.sid]; if (!site) { p.innerHTML = '<div class="card empty">No sites</div>'; return; }
  const emps = empsOf(D.sid).filter(e => e.status !== 'EXIT'); const desigs = [...new Set(emps.map(e => e.desig).filter(Boolean))].sort();
  let sp = { params: [], extras: [] }; try { sp = salarySpec(site, {}); } catch (e) { }
  const fields = [['rate', 'Gross rate'], ['basic', 'Basic'], ...sp.params.map(x => ['x:' + x.k, SAL_NICE(x.k, x.used)]), ...sp.extras.map(x => ['x:' + x.k, SAL_NICE(x.k, x.used)])];
  const plan = incPlan(D, site, emps); const effYm = ymOf(D.effDate); const lk = lockedFrom(D.sid, effYm);
  const imp = plan.reduce((t, r) => t + rowImpact(site, emps.find(e => String(e.code) === r.code) || {}, r.ch), 0);
  const q = (D.q || '').toLowerCase();
  p.innerHTML = `<div class="row" style="margin-bottom:12px"><button class="btn" id="in_back">‹ Salary revisions</button><span class="grow"></span><span class="small muted">New increment</span></div>
  <div class="card"><div class="gsh"><b>1 · Increment</b><span>Where, why and from when</span></div>
   <div class="efgrid g4c">
    <label class="ef"><span class="efl">Site</span><select class="in" id="in_site">${sites.map(s => `<option value="${esc(s.id)}" ${s.id === D.sid ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select><em>${emps.length} active employees</em></label>
    <label class="ef"><span class="efl">Reason</span><select class="in" id="in_reason">${INC_REASONS.map(r => `<option ${D.reason === r ? 'selected' : ''}>${r}</option>`).join('')}</select><em></em></label>
    <label class="ef"><span class="efl">Reference</span><input class="in" id="in_ref" value="${esc(D.ref)}" placeholder="Letter / client order no."><em></em></label>
    <label class="ef"><span class="efl">Effective from</span><input class="in" type="date" id="in_eff" value="${esc(D.effDate)}"><em>pay changes from ${monthName(effYm)}</em></label></div></div>
  <div class="card"><div class="gsh"><b>2 · Employees</b><span>Whole site, some designations, or chosen people</span></div>
   <div class="seg" id="in_scope" style="margin-bottom:12px">${[['all', `Whole site (${emps.length})`], ['desig', 'By designation'], ['codes', `Chosen employees${D.codes.length ? ' (' + D.codes.length + ')' : ''}`]].map(([k, t]) => `<button data-sc="${k}" class="${D.scope === k ? 'on' : ''}">${t}</button>`).join('')}</div>
   ${D.scope === 'desig' ? `<div class="mchips">${desigs.map(d => `<button type="button" class="mchip ${D.desigs.includes(d) ? 'on' : ''}" style="width:auto;padding:5px 10px" data-ds="${esc(d)}">${esc(d)} <span class="muted">${emps.filter(e => e.desig === d).length}</span></button>`).join('')}</div>` : ''}
   ${D.scope === 'codes' ? `<input class="in" id="in_q" placeholder="Search name or code" value="${esc(D.q)}" style="width:280px;margin-bottom:8px"><div class="inpick">${emps.filter(e => !q || (e.name + ' ' + e.code + ' ' + (e.desig || '')).toLowerCase().includes(q)).map(e => `<label class="chk small"><input type="checkbox" data-ec="${esc(e.code)}" ${D.codes.includes(String(e.code)) ? 'checked' : ''}> <span class="mono">${esc(e.code)}</span> ${esc(e.name)} <span class="muted">${esc(e.desig || '')}</span></label>`).join('')}</div>` : ''}</div>
  <div class="card"><div class="gsh"><b>3 · What changes</b><span>Add a line for each rate that changes</span></div>
   ${D.changes.map((c, i) => `<div class="inch"><select class="in" data-cf="${i}">${fields.map(([k, t]) => `<option value="${esc(k)}" ${c.f === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
     <select class="in" data-cm="${i}" style="width:170px">${[['pct', 'Increase by %'], ['add', 'Increase by ₹'], ['set', 'Set to ₹']].map(([v, t]) => `<option value="${v}" ${c.mode === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
     <div class="rin" style="width:140px">${c.mode === 'pct' ? '' : '<i>₹</i>'}<input data-cv="${i}" value="${esc(c.val)}" inputmode="decimal" placeholder="${c.mode === 'pct' ? '%' : 'amount'}"></div>${D.changes.length > 1 ? `<button class="xbtn" data-cx="${i}" title="Remove">×</button>` : ''}</div>`).join('')}
   <div class="row" style="gap:14px;margin-top:8px"><button class="btn sm" id="in_add">+ Another rate</button><span class="grow"></span><label class="small">Round to <select class="in sm" id="in_round" style="width:90px">${[[0.01, 'Paise'], [1, '₹1'], [10, '₹10']].map(([v, t]) => `<option value="${v}" ${+D.round === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div></div>
  <div class="card flush"><div class="chead"><div class="grow"><b style="font-size:14px">4 · Preview</b><div class="small muted">${plan.length ? `${plan.length} employee${plan.length === 1 ? '' : 's'} · type in “New” to adjust anyone individually` : 'Choose employees and enter the increase to see the new rates'}</div></div>${imp ? `<div class="rvimp"><span>Gross wages</span><b>${imp > 0 ? '+' : '−'}₹${inr(Math.abs(Math.round(imp)))}</b><span>per month</span></div>` : ''}</div>
   ${plan.length ? `<div class="tw" style="max-height:440px;overflow:auto"><table class="tbl nostick"><thead><tr><th>Code</th><th>Name</th><th>Designation</th>${D.changes.map(c => `<th class="n">${esc((fields.find(f => f[0] === c.f) || [0, c.f])[1])} now</th><th class="n">New</th>`).join('')}</tr></thead><tbody>
    ${plan.map(r => `<tr><td class="mono">${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.desig)}</td>${D.changes.map(c => { const v = r.ch[c.f]; return v ? `<td class="n">${fv(c.f, v[0])}</td><td class="n"><div class="rin sm" style="width:118px;margin-left:auto"><i>₹</i><input data-ov="${esc(r.code + '|' + c.f)}" value="${v[1] ?? ''}" inputmode="decimal"></div>${pctCh(v[0], v[1]) != null ? `<div class="small ${pctCh(v[0], v[1]) >= 0 ? 'up' : 'dn'}">${pctCh(v[0], v[1]) >= 0 ? '+' : ''}${pctCh(v[0], v[1]).toFixed(1)}%</div>` : ''}</td>` : '<td class="n muted">—</td><td></td>'; }).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
   ${lk.length && plan.length ? `<div class="note warn" style="margin:12px 20px">Back-dated: ${lk.map(monthName).join(', ')} already locked at old rates. After applying, use “Prepare arrear sheet” on this revision to pay the difference with PF and ESIC arrears.</div>` : ''}
   <div class="rvfoot"><span class="small muted grow">${effYm > S.month ? `Effective ${monthName(effYm)} is after ${monthName(S.month)} — it will be saved as <b>scheduled</b>.` : 'Applying updates the employee master; locked months keep the rates they were paid at.'}</span>
    <button class="btn" id="in_draft" ${plan.length ? '' : 'disabled'}>Save as draft</button><button class="btn pri" id="in_go" ${plan.length ? '' : 'disabled'}>${effYm > S.month ? 'Schedule' : 'Apply'} increment</button></div></div>`;
  const rd = () => { D.reason = $('#in_reason').value; D.ref = $('#in_ref').value.trim(); D.effDate = $('#in_eff').value || D.effDate; D.round = +$('#in_round').value;
    D.changes.forEach((c, i) => { c.f = p.querySelector(`[data-cf="${i}"]`).value; c.mode = p.querySelector(`[data-cm="${i}"]`).value; c.val = p.querySelector(`[data-cv="${i}"]`).value.replace(/[^\d.\-]/g, ''); });
    p.querySelectorAll('[data-ov]').forEach(i => { const [code, f] = i.dataset.ov.split('|'); const r = plan.find(x => x.code === code); const v = i.value.replace(/[^\d.]/g, ''); if (r && r.ch[f] && v !== '' && +v !== +r.auto[f]) D.over[i.dataset.ov] = +v; else if (r && r.ch[f] && +v === +r.auto[f]) delete D.over[i.dataset.ov]; }); };
  const re = () => { rd(); const y = window.scrollY; render(); window.scrollTo(0, y); };
  $('#in_back').onclick = () => { V.mode = V.back === 'emp' ? 'list' : 'list'; render(); };
  $('#in_site').onchange = e => { D.sid = e.target.value; D.codes = []; D.desigs = []; D.over = {}; render(); };
  ['#in_eff', '#in_round'].forEach(s => $(s).onchange = re);
  p.querySelectorAll('[data-cf],[data-cm],[data-cv]').forEach(el => el.onchange = re);
  p.querySelectorAll('[data-ov]').forEach(el => el.onchange = re);
  p.querySelectorAll('[data-sc]').forEach(b => b.onclick = () => { rd(); D.scope = b.dataset.sc; render(); });
  p.querySelectorAll('[data-ds]').forEach(b => b.onclick = () => { rd(); const d = b.dataset.ds; D.desigs = D.desigs.includes(d) ? D.desigs.filter(x => x !== d) : [...D.desigs, d]; const y = window.scrollY; render(); window.scrollTo(0, y); });
  p.querySelectorAll('[data-ec]').forEach(c => c.onchange = () => { rd(); D.codes = c.checked ? [...new Set([...D.codes, c.dataset.ec])] : D.codes.filter(x => x !== c.dataset.ec); const y = window.scrollY; render(); window.scrollTo(0, y); });
  const iq = $('#in_q'); if (iq) iq.oninput = e => { D.q = e.target.value; clearTimeout(V._t); V._t = setTimeout(() => { rd(); const pos = e.target.selectionStart; render(); const x = $('#in_q'); if (x) { x.focus(); x.setSelectionRange(pos, pos); } }, 200); };
  $('#in_add').onclick = () => { rd(); D.changes.push({ f: 'basic', mode: 'pct', val: '' }); render(); };
  p.querySelectorAll('[data-cx]').forEach(b => b.onclick = () => { rd(); D.changes.splice(+b.dataset.cx, 1); render(); });
  const save = async (mode) => {
    rd(); const pl = incPlan(D, site, emps); if (!pl.length) return; const ym = ymOf(D.effDate); const status = mode === 'DRAFT' ? 'DRAFT' : ym > S.month ? 'SCHEDULED' : 'APPLIED';
    const R = { kind: 'INCREMENT', siteId: D.sid, title: D.reason + (pl.length === 1 ? ` — ${pl[0].name}` : ''), ref: D.ref, effective: ym, effDate: D.effDate, rule: { scope: D.scope, desigs: D.desigs, changes: D.changes, round: D.round }, rows: pl.map(r => ({ code: r.code, name: r.name, desig: r.desig, ch: r.ch })), status: 'DRAFT', createdAt: new Date().toISOString(), createdBy: who() };
    let ok; if (status === 'APPLIED') ok = await applyRevision(R); else { R.status = status; ok = await saveRev(R); }
    if (!ok) return; toast(status === 'APPLIED' ? `Increment applied to ${pl.length} employee${pl.length === 1 ? '' : 's'}` : status === 'SCHEDULED' ? 'Increment scheduled' : 'Draft saved');
    V.draft = null; V.mode = 'view'; V.id = R.id; render(); window.scrollTo(0, 0);
  };
  $('#in_draft').onclick = () => save('DRAFT');
  $('#in_go').onclick = () => { rd(); const ym = ymOf(D.effDate); const ob = openBefore(D.sid, ym); confirmModal(ym > S.month ? 'Schedule this increment?' : 'Apply this increment?', `${plan.length} employee${plan.length === 1 ? '' : 's'} at ${site.name}, effective ${monthName(ym)}.${ob.length ? ` The unlocked ${ob.map(monthName).join(', ')} salary would also use the new rates — lock it first.` : ''}`, () => save('GO')); };
}
function incPlan(D, site, emps) {
  const rnd = v => { const r = +D.round || 1; return Math.round(Math.round(v / r) * r * 100) / 100; };
  const scope = emps.filter(e => D.scope === 'all' || (D.scope === 'desig' ? D.desigs.includes(e.desig) : D.codes.includes(String(e.code))));
  const ch0 = D.changes.filter(c => c.val !== '' && !isNaN(+c.val));
  if (!ch0.length) return [];
  const out = [];
  for (const e of scope) {
    const ch = {}, auto = {};
    for (const c of ch0) {
      let cur = empVal(e, c.f); if (cur == null && c.f.startsWith('x:')) { const k = c.f.slice(2); cur = (desigParamsFor(site, e.desig) || {})[k] ?? (site.params || {})[k]; }
      if (cur == null && c.mode !== 'set') continue;
      const n = c.mode === 'set' ? +c.val : c.mode === 'add' ? (+cur || 0) + +c.val : (+cur || 0) * (1 + +c.val / 100);
      const nv = rnd(n); auto[c.f] = nv; const ov = D.over[String(e.code) + '|' + c.f];
      const fin = ov != null ? ov : nv; if (String(fin) === String(empVal(e, c.f) ?? '')) continue;
      ch[c.f] = [empVal(e, c.f) ?? null, fin];
    }
    if (Object.keys(ch).length) out.push({ code: String(e.code), name: e.name, desig: e.desig || '', ch, auto });
  }
  return out;
}

// ---- one revision ----
function revView(p, V) {
  const R = S.revs[V.id]; if (!R) { V.mode = 'list'; return vRevisions(p); }
  const site = S.sites[R.siteId] || { name: R.siteId, params: {} }; const k = REV_KIND[R.kind] || [R.kind, 'p-mute']; const st = REV_STATUS[R.status] || [R.status, 'p-mute']; const sm = revSummary(R);
  const fields = [...new Set((R.rows || []).flatMap(r => Object.keys(r.ch)))];
  const lk = R.effective ? lockedFrom(R.siteId, R.effective) : [];
  const arr = R.arrearId && S.arrears[R.arrearId];
  const later = R.status === 'APPLIED' ? revList().filter(x => x !== R && x.siteId === R.siteId && x.status === 'APPLIED' && (x.appliedAt || '') > (R.appliedAt || '') && (x.rows || []).some(r => (R.rows || []).some(y => y.code === r.code && Object.keys(r.ch).some(f => f in y.ch)))) : [];
  const batch = R.batch ? revList().filter(x => x.batch === R.batch) : [];
  p.innerHTML = `<div class="row" style="margin-bottom:12px"><button class="btn" id="rv_back">‹ ${V.back === 'emp' ? 'Employee history' : 'Salary revisions'}</button><span class="grow"></span>
    <button class="btn" id="rv_dl">Download statement</button>
    ${R.status === 'DRAFT' ? '<button class="btn danger" id="rv_del">Delete draft</button>' : ''}${R.status === 'SCHEDULED' ? '<button class="btn" id="rv_unsch">Back to draft</button>' : ''}
    ${R.status === 'APPLIED' && (R.kind === 'MINWAGE' || R.kind === 'INCREMENT' || R.kind === 'EDIT') ? `<button class="btn" id="rv_rev">Revert</button>` : ''}
    ${R.status === 'DRAFT' || R.status === 'SCHEDULED' ? `<button class="btn pri" id="rv_apply">Apply now</button>` : ''}</div>
  <div class="card rvhd"><div class="grow"><div class="row" style="gap:8px"><span class="pill ${k[1]}">${k[0]}</span><span class="pill ${st[1]}">${st[0]}</span></div>
    <h2 style="margin:8px 0 4px;font-size:19px">${esc(R.title || k[0])}</h2><div class="small muted">${esc(site.name)}${R.ref ? ' · ' + esc(R.ref) : ''}</div></div>
   <div class="rvmeta"><div><span>Effective from</span><b>${R.effective ? monthName(R.effective) : '—'}</b></div><div><span>Employees</span><b>${sm.n}</b></div><div><span>Gross wages</span><b>${sm.imp ? (sm.imp > 0 ? '+' : '−') + '₹' + inr(Math.abs(sm.imp)) + '/mo' : '—'}</b></div>
    <div><span>${R.status === 'APPLIED' || R.status === 'REVERTED' ? 'Applied' : 'Created'}</span><b>${dShort(R.appliedAt || R.createdAt)}</b><em>${esc(R.appliedBy || R.createdBy || '')}</em></div>${R.status === 'REVERTED' ? `<div><span>Reverted</span><b>${dShort(R.revertedAt)}</b><em>${esc(R.revertedBy || '')}</em></div>` : ''}</div></div>
  ${R.status === 'SCHEDULED' && R.effective <= S.month ? `<div class="note warn">This revision is due — effective ${monthName(R.effective)}. Apply it before processing that month's salary.</div>` : ''}
  ${R.status === 'APPLIED' && lk.length && !R.arrearId && (R.kind === 'MINWAGE' || R.kind === 'INCREMENT') ? `<div class="note warn" style="display:flex;gap:12px;align-items:center"><div class="grow"><b>Back-dated:</b> ${lk.map(monthName).join(', ')} ${lk.length === 1 ? 'was' : 'were'} locked at the old rates. Prepare the arrear sheet to pay the difference with PF and ESIC arrears.</div><button class="btn pri sm" id="rv_arr">Prepare arrear sheet</button></div>` : ''}
  ${arr ? `<div class="note" style="display:flex;gap:12px;align-items:center"><div class="grow">Arrear sheet ${arr.status === 'PAID' ? 'paid' : arr.status === 'APPROVED' ? 'approved' : 'in draft'} for ${monthName(arr.from)}${arr.to !== arr.from ? ' – ' + monthName(arr.to) : ''}${arr.rows ? ` · ${arr.rows.length} employees` : ''}.</div><button class="btn sm" id="rv_arro">Open arrear sheet</button></div>` : ''}
  ${later.length ? `<div class="note">Later revisions changed some of the same rates (${later.map(x => esc(x.title || '')).slice(0, 2).join(', ')}). Reverting this one only resets rates nobody has changed since.</div>` : ''}
  ${R.revertSkipped && R.revertSkipped.length ? `<div class="note warn">Not reverted because they had changed again: ${esc(R.revertSkipped.slice(0, 8).join(', '))}${R.revertSkipped.length > 8 ? '…' : ''}</div>` : ''}
  ${R.notFound && R.notFound.length ? `<div class="note warn">Not in the employee master any more, so not changed: ${esc(R.notFound.join(', '))}</div>` : ''}
  ${batch.length > 1 ? `<div class="card" style="padding:12px 16px"><div class="small"><b>Same notification at ${batch.length} sites:</b> ${batch.map(x => `<a data-rvb="${esc(x._id || x.id)}" class="rvlink ${x === R ? 'on' : ''}">${esc((S.sites[x.siteId] || {}).name || x.siteId)}</a>`).join(' · ')}</div></div>` : ''}
  <div class="card flush"><div class="chead"><h2>Employees</h2><span class="small muted">old → new</span></div>
   <div class="tw" style="max-height:620px;overflow:auto"><table class="tbl nostick"><thead><tr><th>Code</th><th>Name</th><th>Designation</th>${fields.map(f => `<th class="n">${esc(revField(site, f))}</th><th class="n">New</th><th class="n">Change</th>`).join('')}</tr></thead><tbody>
   ${(R.rows || []).map(r => `<tr><td class="mono">${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.desig || '')}</td>${fields.map(f => { const v = r.ch[f]; if (!v) return '<td></td><td></td><td></td>'; const pc = pctCh(v[0], v[1]); const d = (f === 'desig' || f === 'rateType') ? '' : (+v[1] || 0) - (+v[0] || 0); return `<td class="n">${fv(f, v[0])}</td><td class="n"><b>${fv(f, v[1])}</b></td><td class="n small ${d > 0 ? 'up' : d < 0 ? 'dn' : ''}">${d === '' ? '' : (d > 0 ? '+' : '') + inr(d, 2).replace(/\.00$/, '')}${pc != null && d !== '' ? ` (${pc.toFixed(1)}%)` : ''}</td>`; }).join('')}</tr>`).join('')}
   ${R.siteParams ? Object.entries(R.siteParams).map(([kk, v]) => `<tr><td></td><td colspan="2"><b>Site rate ${esc(kk)}</b> <span class="small muted">for employees without their own</span></td><td class="n">${fv('x', v[0])}</td><td class="n"><b>${fv('x', v[1])}</b></td><td></td>${fields.slice(1).map(() => '<td></td><td></td><td></td>').join('')}</tr>`).join('') : ''}
   </tbody></table></div></div>`;
  $('#rv_back').onclick = () => { V.mode = 'list'; if (V.back === 'emp') V.tab = 'emp'; V.back = null; render(); };
  $('#rv_dl').onclick = () => revLogXlsx([R], `Revision_${R.siteId}_${R.effective || ''}`);
  p.querySelectorAll('[data-rvb]').forEach(a => a.onclick = () => { V.id = a.dataset.rvb; render(); });
  const b = (id, fn) => { const x = $(id); if (x) x.onclick = fn; };
  b('#rv_del', () => confirmModal('Delete this draft?', 'Nothing has been applied from it.', async () => { await del('revisions/' + V.id); delete S.revs[V.id]; V.mode = 'list'; render(); }));
  b('#rv_unsch', async () => { R.status = 'DRAFT'; await saveRev(R); render(); });
  b('#rv_apply', () => { const ob = openBefore(R.siteId, R.effective); confirmModal('Apply this revision now?', `${sm.n} employee${sm.n === 1 ? '' : 's'} at ${site.name} get the new rates in the employee master.${R.effective > S.month ? ` It is effective ${monthName(R.effective)} — salary processed before then would use the new rates too.` : ''}${ob.length ? ` Unlocked ${ob.map(monthName).join(', ')} would also use them — lock it first.` : ''}`, async () => { if (await applyRevision(R)) toast('Revision applied'); render(); }); });
  b('#rv_rev', () => confirmModal('Revert this revision?', 'Each employee goes back to the old rate, unless the rate has been changed again since. Locked months are not affected. The revision stays in the history, marked reverted.', async () => { const sk = await revertRevision(R); toast(sk.length ? `Reverted · ${sk.length} rate${sk.length === 1 ? '' : 's'} skipped (changed since)` : 'Reverted'); render(); }));
  b('#rv_arr', () => prepareArrears(R));
  b('#rv_arro', () => { S.arr = Object.assign({}, S.arrears[R.arrearId]); S.proc = { site: R.siteId, step: 1, type: 'ARR' }; go('process'); });
}
// a back-dated revision becomes an arrear sheet: locked months recalculated with each employee's revised rates
function prepareArrears(R) {
  const lk = lockedFrom(R.siteId, R.effective); if (!lk.length) { toast('No locked months after the effective date'); return; }
  const revRows = {}; for (const r of R.rows) { const o = {}; for (const [f, v] of Object.entries(r.ch)) o[f] = v[1]; revRows[r.code] = o; }
  S.arr = { siteId: R.siteId, id: null, status: 'DRAFT', from: lk[0], to: lk[lk.length - 1], reason: R.kind === 'MINWAGE' ? 'Minimum wage revision' : 'Salary increment', scope: 'codes', desigs: [], codes: R.rows.map(r => r.code),
    rate: { mode: 'set', val: '' }, basic: { mode: 'set', val: '' }, params: R.siteParams ? Object.fromEntries(Object.entries(R.siteParams).map(([k, v]) => [k, v[1]])) : {}, includePT: false, payMode: 'SALARY', payMonth: S.month, applyForward: false, rows: null,
    revId: R._id || R.id, revTitle: R.title, revRows };
  S.proc = { site: R.siteId, step: 1, type: 'ARR' }; go('process'); window.scrollTo(0, 0);
}


const RF_CAT = [['salary', 'Salary & payment'], ['reg', 'Statutory registers'], ['stat', 'PF, ESIC, PT & LWF'], ['other', 'Other records']];
const RF_PICK = [
  ['salary', 'Salary sheet', k => k === 'salary'], ['bank', 'Bank transfer files', k => k === 'bank' || k.startsWith('bank_')], ['slips', 'Payslips', k => k === 'slips'],
  ['reg', 'Statutory registers', k => k.startsWith('reg_')], ['ecr', 'PF ECR', k => k === 'ecr'], ['esic', 'ESIC contribution', k => k === 'esic'],
  ['ptlwf', 'PT & LWF summary', k => k === 'ptlwf'], ['ercost', 'Employer contribution statement', k => k === 'ercost'],
  ['held', 'Held salary register', k => k === 'held'], ['loan', 'Loan & recovery register', k => k === 'loan'], ['arr', 'Arrear sheets', k => k.startsWith('arr_')]];
const rfSafe = s => String(s).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);

function withMonth(month, fn) {
  const m0 = S.month, t0 = S.proc.type; S.month = month; S.proc.type = 'REG';
  try { return fn(); } finally { S.month = m0; S.proc.type = t0; }
}
// run a generator but keep the file it makes instead of downloading it (saveFile pushes here synchronously)
function captureFiles(fn) {
  S.capture = []; S.captureNotes = [];
  try { fn(); return { files: S.capture, notes: S.captureNotes }; } finally { S.capture = null; S.captureNotes = null; }
}

function rfStatus(sid, month) {
  const run = S.runs[runId(sid, month)];
  if (!run || !run.att || !run.att.length) return { k: 'NONE', t: 'Not processed', c: 'p-mute', run: null };
  if (run.status === 'LOCKED') return { k: 'LOCKED', t: 'Locked', c: 'p-ok', run, at: run.lockedAt };
  return { k: 'DRAFT', t: run.attFinalAt ? 'Salary in progress' : 'Attendance in progress', c: 'p-warn', run, at: run.updatedAt };
}
function rfPack(sid, month) {
  const base = S.sites[sid]; const st = rfStatus(sid, month); if (!base || !st.run) return null;
  const run = st.run; const site = run.status === 'LOCKED' && run.snap ? Object.assign({}, base, { stat: null }, run.snap) : base;
  const c = withMonth(month, () => computeRun(site, run, month));
  return { site, run, c, month, locked: run.status === 'LOCKED' };
}
function rfReports(k, opts = {}) {
  const { site, month } = k; const own = site.registerSet === 'CODE' ? 'CODE' : 'CLRA';
  const sets = opts.both ? [own, own === 'CODE' ? 'CLRA' : 'CODE'] : [own];
  const groups = [...new Set(sheetCols(site).filter(x => x.type === 'X').map(x => x.group))];
  const held = Object.values(S.held || {}).filter(h => h.siteId === site.id && h.month === month);
  const loans = Object.values(S.loans || {}).filter(l => l.siteId === site.id && l.startMonth <= month);
  const arrs = Object.values(S.arrears || {}).filter(a => a.siteId === site.id && (a.payMonth === month || a.paidIn === month) && (a.status === 'APPROVED' || a.status === 'PAID') && (a.rows || []).length);
  const slipForm = own === 'CODE' ? 'Form V' : 'Form XIX';
  const L = [
    { key: 'salary', cat: 'salary', name: 'Salary sheet', sub: groups.length ? `with ${groups.join(', ')} sheet${groups.length > 1 ? 's' : ''}` : 'all employees, earnings and deductions', fmt: 'XLSX', file: 'Salary_Sheet', build: () => downloadSalarySheet(site, k.run, k.c) },
    { key: 'bank', cat: 'salary', name: 'Bank transfer file — salary', sub: 'net pay to each account', fmt: 'CSV', file: 'Bank_Salary', build: () => bankFile(site, k.c, null) },
    ...groups.map(g => ({ key: 'bank_' + g, cat: 'salary', name: `Bank transfer file — ${g}`, sub: 'paid separately from salary', fmt: 'CSV', file: 'Bank_' + rfSafe(g), build: () => bankFile(site, k.c, g) })),
    { key: 'slips', cat: 'salary', name: 'Payslips', sub: `${slipForm} wage slips, one per page`, fmt: 'HTML', file: 'Payslips', build: () => payslips([{ site, c: k.c }]) },
    ...sets.flatMap(set => REGS.filter(r => r[2] === set && r[0] !== 'XIX' && r[0] !== 'CODE_V').map(r => ({ key: 'reg_' + r[0], cat: 'reg', form: r[1].split(' — ')[0], name: r[1].split(' — ')[1], sub: set === own ? '' : (set === 'CODE' ? 'Labour Code format' : 'CLRA format'), fmt: 'XLSX', file: rfSafe(r[1].split(' — ')[0]) + (set === 'CODE' ? '_Code' : ''), build: () => downloadRegister(r[0], [k]) }))),
    { key: 'ecr', cat: 'stat', name: 'PF ECR', sub: 'EPFO electronic challan upload', fmt: 'TXT', file: 'PF_ECR', build: () => ecrFile([k]) },
    { key: 'esic', cat: 'stat', name: 'ESIC monthly contribution', sub: 'ESIC portal upload', fmt: 'XLSX', file: 'ESIC_Contribution', build: () => esicFile([k]) },
    { key: 'ptlwf', cat: 'stat', name: 'PT & LWF summary', sub: E.STATE.NAMES[site.state] || site.state || '', fmt: 'XLSX', file: 'PT_LWF', build: () => ptlwf([k]) },
    { key: 'ercost', cat: 'stat', name: 'Employer contribution statement', sub: 'EPF, EPS, EDLI, admin, ESIC, LWF', fmt: 'XLSX', file: 'Employer_Contributions', build: () => erCost([k]) },
    { key: 'held', cat: 'other', name: 'Held salary register', sub: held.length ? `${held.length} employee${held.length === 1 ? '' : 's'} held this month` : 'none held this month', fmt: 'XLSX', file: 'Held_Salary', empty: !held.length, build: () => heldReport(held) },
    { key: 'loan', cat: 'other', name: 'Loan, advance & recovery register', sub: loans.length ? `${loans.length} open or past record${loans.length === 1 ? '' : 's'}` : 'no loans at this site', fmt: 'XLSX', file: 'Loan_Register', empty: !loans.length, build: () => loanRegister(loans, site, month) },
    ...arrs.map(a => ({ key: 'arr_' + a.id, cat: 'other', name: `Arrear sheet — ${a.reason || 'arrears'}`, sub: `${monthName(a.from)}${a.to !== a.from ? ' to ' + monthName(a.to) : ''}, paid with this salary`, fmt: 'XLSX', file: 'Arrear_Sheet_' + rfSafe(a.from + (a.to !== a.from ? '_' + a.to : '')), build: () => arrearSheetXlsx(site, a, 'Arrears') }))];
  return L;
}
function loanRegister(loans, site, month) {
  const rows = loans.map((l, i) => { const rec = (l.recovered || []).filter(r => !month || r.month <= month); const done = rec.reduce((s2, r) => s2 + r.amt, 0); const thisM = rec.filter(r => r.month === month).reduce((s2, r) => s2 + r.amt, 0);
    return [i + 1, l.empCode, l.name, (LTYPE[l.type] || l.type), l.given || '', l.purpose || '', l.amount, l.emi || '', l.startMonth, thisM, done, l.amount - done, rec.map(r => `${r.month}: ${r.amt}`).join('; ')]; });
  const T = j => rows.reduce((t, r) => t + (+r[j] || 0), 0);
  saveFile('Loan_Register.xlsx', xlsxBytes([{ name: 'Loans & recoveries', rows: [['Indus Fire Safety Private Limited'], [`Register of loans, advances & recoveries — ${site.name}`], [`Position as at ${monthName(month)}`], [], ['Sr. No.', 'Emp. Code', 'Name', 'Type', 'Date given', 'Purpose', 'Amount', 'EMI', 'Recovery from', `Recovered in ${monthName(month)}`, 'Recovered to date', 'Balance', 'Recovery history'], ...rows, ['', '', 'TOTAL', '', '', '', T(6), '', '', T(9), T(10), T(11), '']], cols: [6, 9, 26, 14, 11, 18, 10, 8, 11, 14, 14, 10, 40] }]));
}
// build one report into a file {name, data}; the name says site, month and report, and is marked DRAFT for a run not yet locked
function rfBuild(rep, k) {
  const out = captureFiles(() => withMonth(k.month, () => rep.build()));
  if (!out.files.length) throw new Error('no file was produced');
  const f = out.files[0]; const ext = (f.filename.match(/\.[a-z0-9]+$/i) || ['.xlsx'])[0];
  return { name: `${k.locked ? '' : 'DRAFT_'}${rep.file}_${rfSafe(k.site.id)}_${k.month}${ext}`, data: f.data, notes: out.notes };
}

// ---- ZIP (stored; xlsx files are already compressed) ----
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipBytes(files) {
  const enc = new TextEncoder(); const parts = [], cen = []; let off = 0;
  const d = new Date(); const dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  for (const f of files) {
    const nm = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : (f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data)), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(10, tm, true); h.setUint16(12, dt, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(12, tm, true); c.setUint16(14, dt, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    cen.push(new Uint8Array(c.buffer), nm); off += 30 + nm.length + data.length;
  }
  const cs = cen.reduce((s, a) => s + a.length, 0); const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
  const all = [...parts, ...cen, new Uint8Array(e.buffer)]; const out = new Uint8Array(all.reduce((s, a) => s + a.length, 0)); let p = 0; for (const a of all) { out.set(a, p); p += a.length; } return out;
}

// ---- progress for long jobs (many sites) ----
function rfProgress(title) {
  // its own layer, so an open site panel stays open underneath
  const el = document.createElement('div'); el.className = 'modal-bg'; el.style.zIndex = 60;
  el.innerHTML = `<div class="modal" style="max-width:440px"><h2 style="margin-top:0">${esc(title)}</h2><div class="rfbar"><i style="width:0%"></i></div><div class="small muted" style="margin-top:8px">Starting…</div></div>`;
  (payrollRoot() || document.body).appendChild(el); const bar = el.querySelector('.rfbar i'), txt = el.querySelector('.small');
  return { set: (i, n, t) => { bar.style.width = Math.round(100 * i / Math.max(1, n)) + '%'; txt.textContent = t; }, done: () => el.remove() };
}
const tick = () => new Promise(r => setTimeout(r, 0));
const rfManifest = (title, rows, errs) => [title, `Generated ${new Date().toLocaleString('en-IN')}${S.user && S.user.name ? ' by ' + S.user.name : ''}`, '', ...rows, ...(errs.length ? ['', 'Not generated:', ...errs] : [])].join('\r\n');

// Download several reports for many sites: one ZIP with a folder per site
async function rfZip(sids, month, pick, opts = {}) {
  const P = rfProgress(sids.length > 1 ? `Preparing ${sids.length} site packs` : 'Preparing site pack');
  const files = [], log = [], errs = []; let i = 0;
  try {
    for (const sid of sids) {
      i++; const site0 = S.sites[sid]; P.set(i - 1, sids.length, `${site0 ? site0.name : sid} (${i} of ${sids.length})`); await tick();
      let k; try { k = rfPack(sid, month); } catch (e) { errs.push(`${sid}: ${e.message}`); continue; }
      if (!k) { errs.push(`${site0 ? site0.name : sid}: no salary processed for ${monthName(month)}`); continue; }
      const folder = sids.length > 1 ? `${rfSafe(k.site.name)}_${rfSafe(sid).slice(0, 20)}/` : '';
      const reps = rfReports(k, opts).filter(r => pick(r.key) && !(r.empty && opts.skipEmpty !== false));
      for (const r of reps) { try { const f = rfBuild(r, k); files.push({ name: folder + f.name, data: f.data }); log.push(`${k.site.name}\t${r.form ? r.form + ' — ' : ''}${r.name}\t${f.name}${k.locked ? '' : '\t(draft — run not locked)'}`); } catch (e) { errs.push(`${k.site.name} — ${r.name}: ${e.message}`); } }
    }
    P.set(sids.length, sids.length, 'Packing the ZIP…'); await tick();
    if (!files.length) { P.done(); toast(errs[0] || 'Nothing to download'); return; }
    files.push({ name: '_Contents.txt', data: rfManifest(`Indus Fire Safety — salary & compliance files — ${monthName(month)}`, log, errs) });
    const nm = sids.length === 1 ? `Files_${rfSafe(S.sites[sids[0]].id)}_${month}.zip` : `Files_${sids.length}_sites_${month}.zip`;
    P.done(); await saveFile(nm, zipBytes(files));
    toast(`${files.length - 1} file${files.length === 2 ? '' : 's'} in the ZIP${errs.length ? ` · ${errs.length} not generated (see _Contents.txt)` : ''}`);
  } catch (e) { P.done(); toast('Could not prepare the files: ' + e.message); }
}
// Combined across sites: one file per report covering every selected site (as the PF/ESIC portals and the bank need)
async function rfCombined(kind, sids, month) {
  const packs = []; for (const sid of sids) { const k = rfPack(sid, month); if (k) packs.push(k); }
  if (!packs.length) { toast('None of the selected sites has salary processed for ' + monthName(month)); return; }
  const anyDraft = packs.some(k => !k.locked);
  const run = {
    ecr: () => ecrFile(packs), esic: () => esicFile(packs), ptlwf: () => ptlwf(packs), ercost: () => erCost(packs),
    bank: () => bankFile({ id: 'Sites' }, { rows: packs.flatMap(k => k.c.rows) }, null), slips: () => payslips(packs.map(k => ({ site: k.site, c: k.c }))),
  }[kind] || (() => downloadRegister(kind.replace(/^reg_/, ''), packs));
  const out = captureFiles(() => withMonth(month, run));
  if (!out.files.length) { toast('Nothing was produced'); return; }
  const f = out.files[0]; const ext = (f.filename.match(/\.[a-z0-9]+$/i) || ['.xlsx'])[0];
  const base = f.filename.replace(/\.[a-z0-9]+$/i, '').replace(/_\d{4}-\d{2}.*$/, '').replace(/_(All|Sites)$/, '');
  await saveFile(`${anyDraft ? 'DRAFT_' : ''}${base}_${packs.length}_sites_${month}${ext}`, f.data);
  if (out.notes.length) toast(out.notes[0]);
}

// ---- the tab ----
function rfMonths() {
  const s = new Set([S.month]); Object.values(S.runs || {}).forEach(r => { if (r.month && r.type === 'REG' && r.att && r.att.length) s.add(r.month); });
  const now = new Date(); for (let i = 0; i < 12; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); s.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  return [...s].sort().reverse();
}
const shiftMonth = (m, n) => { const [y, mm] = m.split('-').map(Number); const d = new Date(y, mm - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const dShort = iso => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

function vCompliance(p) {
  const C = S.comp = Object.assign({ q: '', st: '', f: 'ALL', sel: [], both: false }, S.comp || {});
  if (!Array.isArray(C.sel)) C.sel = [];
  const month = S.month; const sites = siteList();
  const rows = sites.map(s => { const st = rfStatus(s.id, month); const sm = st.run && st.run.summary; return { s, st, heads: sm ? sm.heads : (st.run ? st.run.att.filter(a => !a.skip).length : 0), net: st.k === 'LOCKED' && sm ? sm.net : null, gross: st.k === 'LOCKED' && sm ? sm.gross : null }; });
  const cnt = k => rows.filter(r => r.st.k === k).length;
  const states = [...new Set(sites.map(s => s.state).filter(Boolean))].sort();
  const ord = { LOCKED: 0, DRAFT: 1, NONE: 2 }; rows.sort((a, b) => ord[a.st.k] - ord[b.st.k] || String(a.s.name).localeCompare(String(b.s.name)));
  const vis = rows.filter(r => (C.f === 'ALL' || r.st.k === C.f) && (!C.st || r.s.state === C.st) && (!C.q || (r.s.name + ' ' + (r.s.client || '') + ' ' + r.s.id).toLowerCase().includes(C.q.toLowerCase())));
  C.sel = C.sel.filter(id => rows.some(r => r.s.id === id && r.st.k !== 'NONE'));
  const lockedNet = rows.filter(r => r.net != null).reduce((t, r) => t + r.net, 0), lockedHeads = rows.filter(r => r.st.k === 'LOCKED').reduce((t, r) => t + r.heads, 0);
  const months = rfMonths();
  p.innerHTML = `
  <div class="card rftool">
   <div class="rfper"><span class="efl">Salary month</span><div class="row" style="gap:6px"><button class="btn sm" id="rfprev" title="Previous month">‹</button>
    <select class="in" id="rfm" style="width:240px">${months.map(m => { const n = sites.filter(s => rfStatus(s.id, m).k === 'LOCKED').length; return `<option value="${m}" ${m === month ? 'selected' : ''}>${monthName(m)}${n ? ` · ${n} locked` : ''}</option>`; }).join('')}</select>
    <button class="btn sm" id="rfnext" title="Next month">›</button></div></div>
   <div class="rfsearch"><span class="efl">Find a site</span><input class="in" id="rfq" placeholder="Site, client or code" value="${esc(C.q)}"></div>
   <div><span class="efl">State</span><select class="in" id="rfst"><option value="">All states</option>${states.map(k => `<option value="${k}" ${C.st === k ? 'selected' : ''}>${esc(E.STATE.NAMES[k] || k)}</option>`).join('')}</select></div>
   <div><span class="efl">Status</span><div class="seg" id="rff">${[['ALL', 'All', rows.length], ['LOCKED', 'Locked', cnt('LOCKED')], ['DRAFT', 'In progress', cnt('DRAFT')], ['NONE', 'Not processed', cnt('NONE')]].map(([k, t, n]) => `<button data-f="${k}" class="${C.f === k ? 'on' : ''}">${t}<span>${n}</span></button>`).join('')}</div></div>
  </div>
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
   <div class="kpi"><div class="l">Salary locked</div><div class="v">${cnt('LOCKED')} <span class="muted" style="font-size:15px;font-weight:500">of ${rows.length} sites</span></div><div class="rfmeter"><i style="width:${Math.round(100 * cnt('LOCKED') / Math.max(1, rows.length))}%"></i></div></div>
   <div class="kpi"><div class="l">In progress</div><div class="v">${cnt('DRAFT')}</div><div class="s">files are marked DRAFT until locked</div></div>
   <div class="kpi"><div class="l">Employees paid</div><div class="v">${inr(lockedHeads)}</div><div class="s">at locked sites</div></div>
   <div class="kpi"><div class="l">Net wages locked</div><div class="v">₹${inr(lockedNet)}</div><div class="s">${monthName(month)}</div></div>
  </div>
  <div class="card flush">
   <div class="chead"><div class="grow"><h2>Sites — ${monthName(month)}</h2><div class="small muted">Open a site to download any file on its own, or tick sites to download their files together.</div></div><span class="small muted">${vis.length} shown</span></div>
   <div class="tw rftw"><table class="tbl rft"><thead><tr><th style="width:34px"><input type="checkbox" id="rfall" title="Select all shown sites with salary data"></th><th>Site</th><th>State</th><th class="n">Employees</th><th class="n">Net wages</th><th>Status</th><th style="width:230px"></th></tr></thead><tbody>
   ${vis.map(r => { const dis = r.st.k === 'NONE'; return `<tr class="${dis ? 'rfoff' : ''}"><td><input type="checkbox" data-rs="${esc(r.s.id)}" ${dis ? 'disabled' : ''} ${C.sel.includes(r.s.id) ? 'checked' : ''}></td>
     <td><a class="rfname" data-open="${esc(r.s.id)}">${esc(r.s.name)}</a><div class="small muted">${esc(r.s.client || '')}</div></td><td><span class="mcode">${esc(r.s.state || '')}</span></td>
     <td class="n">${r.heads ? inr(r.heads) : '<span class="muted">—</span>'}</td><td class="n">${r.net != null ? '₹' + inr(r.net) : '<span class="muted">—</span>'}</td>
     <td><span class="pill ${r.st.c}">${r.st.t}</span>${r.st.at ? `<div class="small muted" style="margin-top:3px">${r.st.k === 'LOCKED' ? 'on ' : 'updated '}${dShort(r.st.at)}</div>` : ''}</td>
     <td class="n">${dis ? `<button class="btn sm" data-proc="${esc(r.s.id)}">Process salary</button>` : `<button class="btn sm" data-open="${esc(r.s.id)}">View files</button> <button class="btn sm pri" data-zip="${esc(r.s.id)}" title="All files for this site in one ZIP">Download all</button>`}</td></tr>`; }).join('') || `<tr><td colspan="7" class="empty">No sites match these filters.</td></tr>`}
   </tbody></table></div>
  </div>
  <div class="grid g2" style="margin-top:16px">
   <div class="card"><h2>Company-wide registers</h2><p class="small muted" style="margin-top:-4px">Not tied to one month.</p><div class="rflist">
    <div class="rfi"><div class="grow"><b>Loan, advance & recovery register</b><span>All sites, every loan and its recoveries</span></div><span class="tag">XLSX</span><button class="btn sm" id="rfloan">Download</button></div>
    <div class="rfi"><div class="grow"><b>Held salary register</b><span>All sites and months, held and released</span></div><span class="tag">XLSX</span><button class="btn sm" id="rfheld">Download</button></div></div></div>
   <div class="card"><h2>How files are made</h2><ul class="small rfhow"><li>A locked month uses the salary structure and statutory pattern saved when it was locked, so files for an old month match what was paid.</li><li>Files for a month not yet locked are named <b>DRAFT_…</b> and registers carry a draft note.</li><li>Registers follow each site's format (CLRA or Labour Code); a site's panel can add the other set.</li><li>Every ZIP has a <b>_Contents.txt</b> listing each file and anything that could not be made.</li></ul></div>
  </div>
  <div class="rfbulk ${C.sel.length ? 'show' : ''}" id="rfbulk"><span class="pill p-pri" id="rfbn">${C.sel.length} site${C.sel.length === 1 ? '' : 's'} selected</span><span class="small muted grow" id="rfbi"></span>
   <button class="btn" id="rfclr">Clear</button><button class="btn" id="rfcomb">Combined files…</button><button class="btn pri" id="rfbz">Download site packs…</button></div>`;

  const setMonth = m => { S.month = m; const mi = $('#month'); if (mi) mi.value = m; C.sel = []; render(); };
  $('#rfm').onchange = e => setMonth(e.target.value);
  $('#rfprev').onclick = () => setMonth(shiftMonth(month, -1)); $('#rfnext').onclick = () => setMonth(shiftMonth(month, 1));
  $('#rfq').oninput = e => { C.q = e.target.value; clearTimeout(C._t); C._t = setTimeout(() => { const pos = e.target.selectionStart; render(); const q = $('#rfq'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }, 200); };
  $('#rfst').onchange = e => { C.st = e.target.value; render(); };
  p.querySelectorAll('#rff button').forEach(b => b.onclick = () => { C.f = b.dataset.f; render(); });
  const bulkInfo = () => { const sel = C.sel.map(id => rfStatus(id, month)); const d = sel.filter(x => x.k === 'DRAFT').length;
    $('#rfbn').textContent = `${C.sel.length} site${C.sel.length === 1 ? '' : 's'} selected`; $('#rfbi').textContent = d ? `${d} not locked yet — their files will be marked DRAFT` : 'All locked';
    $('#rfbulk').classList.toggle('show', C.sel.length > 0); const all = $('#rfall'); const en = [...p.querySelectorAll('[data-rs]:not(:disabled)')]; if (all) { all.checked = en.length > 0 && en.every(x => x.checked); all.indeterminate = !all.checked && en.some(x => x.checked); } };
  p.querySelectorAll('[data-rs]').forEach(c => c.onchange = () => { const id = c.dataset.rs; C.sel = c.checked ? [...new Set([...C.sel, id])] : C.sel.filter(x => x !== id); bulkInfo(); });
  $('#rfall').onchange = e => { p.querySelectorAll('[data-rs]:not(:disabled)').forEach(c => { c.checked = e.target.checked; const id = c.dataset.rs; C.sel = c.checked ? [...new Set([...C.sel, id])] : C.sel.filter(x => x !== id); }); bulkInfo(); };
  bulkInfo();
  p.querySelectorAll('[data-open]').forEach(b => b.onclick = () => rfDrawer(b.dataset.open, month));
  p.querySelectorAll('[data-zip]').forEach(b => b.onclick = () => rfZip([b.dataset.zip], month, () => true, { both: false }));
  p.querySelectorAll('[data-proc]').forEach(b => b.onclick = () => { S.proc = { site: b.dataset.proc, step: 1, type: 'REG' }; go('process'); });
  $('#rfclr').onclick = () => { C.sel = []; render(); };
  $('#rfbz').onclick = () => rfPickModal(C.sel.slice(), month);
  $('#rfcomb').onclick = () => rfCombModal(C.sel.slice(), month);
  $('#rfloan').onclick = () => downloadReport('loan', {}, []);
  $('#rfheld').onclick = () => heldReport(Object.values(S.held || {}));
}

// one site: every file for the chosen month, each on its own or together
function rfDrawer(sid, month) {
  const C = S.comp; const site = S.sites[sid]; if (!site) return;
  const st = rfStatus(sid, month); const k = st.run ? rfPack(sid, month) : null;
  const reps = k ? rfReports(k, { both: C.both }) : [];
  C.dsel = C.dsel && C.dsel.sid === sid && C.dsel.month === month ? C.dsel : { sid, month, keys: reps.filter(r => !r.empty).map(r => r.key) };
  const strip = Array.from({ length: 12 }, (_, i) => shiftMonth(month, i - 9));
  const sup = S.runs[runId(sid, month, 'SUP')];
  const own = site.registerSet === 'CODE' ? 'Labour Code' : 'CLRA', other = own === 'CLRA' ? 'Labour Code' : 'CLRA';
  $('#modal').innerHTML = `<div class="rfbg" id="rfbg"><aside class="rfdr" role="dialog" aria-label="Files for ${esc(site.name)}">
   <div class="rfdh"><div class="grow" style="min-width:0"><div class="small muted">${esc(site.client || '')} · ${esc(E.STATE.NAMES[site.state] || site.state || '')}</div><h2 style="margin:2px 0 0;font-size:17px">${esc(site.name)}</h2></div><button class="xbtn" id="rfx" title="Close">×</button></div>
   <div class="rfms">${strip.map(m => { const s2 = rfStatus(sid, m); return `<button class="rfmc ${m === month ? 'on' : ''} ${s2.k.toLowerCase()}" data-m="${m}" title="${monthName(m)} — ${s2.t}"><i></i>${MON3[+m.slice(5) - 1]}<span>${m.slice(2, 4)}</span></button>`; }).join('')}</div>
   <div class="rfdb">
    ${!k ? `<div class="rfempty"><b>No salary processed for ${monthName(month)}</b><p class="small muted">Attendance has not been loaded for this site and month, so there are no files yet. Pick another month above, or process this month first.</p><button class="btn pri" id="rfgo">Process ${monthName(month)}</button></div>` : `
    <div class="rfsum"><span class="pill ${st.c}">${st.t}</span><span>${st.k === 'LOCKED' ? `Locked ${dShort(st.at)}` : 'Not locked — files will be marked DRAFT'}</span><span class="grow"></span><span><b>${inr(k.c.rows.length)}</b> employees</span><span>Net <b>₹${inr(k.c.tot.NET)}</b></span></div>
    ${sup ? `<div class="note" style="margin:0 0 12px">A supplementary run exists for this month. Its files are in Process salary → Supplementary.</div>` : ''}
    ${(k.run._errors || []).length ? `<div class="note warn" style="margin:0 0 12px">${k.run._errors.length} employee${k.run._errors.length === 1 ? '' : 's'} could not be calculated and are left out of the files: ${esc(k.run._errors.slice(0, 3).join('; '))}${k.run._errors.length > 3 ? '…' : ''}</div>` : ''}
    ${RF_CAT.map(([cat, ct]) => { const rs = reps.filter(r => r.cat === cat); if (!rs.length) return ''; return `<div class="rfcat"><div class="rfch"><b>${ct}</b>${cat === 'reg' ? `<label class="chk small"><input type="checkbox" id="rfboth" ${C.both ? 'checked' : ''}> Add ${other} forms too</label>` : ''}</div>
      ${rs.map(r => `<div class="rfi ${r.empty ? 'dim' : ''}"><input type="checkbox" data-rk="${esc(r.key)}" ${C.dsel.keys.includes(r.key) ? 'checked' : ''}><div class="grow" style="min-width:0">${r.form ? `<span class="rfform">${esc(r.form)}</span>` : ''}<b>${esc(r.name)}</b>${r.sub ? `<span>${esc(r.sub)}</span>` : ''}</div><span class="tag">${r.fmt}</span><button class="btn sm" data-dl="${esc(r.key)}" title="Download this file">Download</button></div>`).join('')}</div>`; }).join('')}
    <p class="small muted" style="margin:6px 2px 0">Registers are in ${own} format, as set in Site setup.</p>`}
   </div>
   ${k ? `<div class="rfdf"><label class="chk small"><input type="checkbox" id="rfsa"> Select all</label><span class="small muted grow" id="rfsn"></span><button class="btn" id="rfzs">Download selected</button><button class="btn pri" id="rfza">Download all (ZIP)</button></div>` : ''}
  </aside></div>`;
  const close = () => closeModal();
  $('#rfx').onclick = close; $('#rfbg').onclick = e => { if (e.target.id === 'rfbg') close(); };
  document.onkeydown = e => { if (e.key === 'Escape' && $('#rfbg')) { close(); document.onkeydown = null; } };
  $('#modal').querySelectorAll('[data-m]').forEach(b => b.onclick = () => rfDrawer(sid, b.dataset.m));
  const g = $('#rfgo'); if (g) g.onclick = () => { closeModal(); S.month = month; const mi = $('#month'); if (mi) mi.value = month; S.proc = { site: sid, step: 1, type: 'REG' }; go('process'); };
  if (!k) return;
  const keysSel = () => C.dsel.keys;
  const foot = () => { const n = keysSel().length; $('#rfsn').textContent = `${n} of ${reps.length} selected`; $('#rfzs').disabled = !n; $('#rfzs').textContent = n === 1 ? 'Download selected' : `Download selected (ZIP)`; const sa = $('#rfsa'); sa.checked = n === reps.length; sa.indeterminate = n > 0 && n < reps.length; };
  $('#modal').querySelectorAll('[data-rk]').forEach(c => c.onchange = () => { C.dsel.keys = c.checked ? [...new Set([...keysSel(), c.dataset.rk])] : keysSel().filter(x => x !== c.dataset.rk); foot(); });
  $('#rfsa').onchange = e => { C.dsel.keys = e.target.checked ? reps.map(r => r.key) : []; $('#modal').querySelectorAll('[data-rk]').forEach(c => c.checked = e.target.checked); foot(); };
  foot();
  const bo = $('#rfboth'); if (bo) bo.onchange = () => { C.both = bo.checked; C.dsel = null; rfDrawer(sid, month); };
  $('#modal').querySelectorAll('[data-dl]').forEach(b => b.onclick = async () => {
    const r = reps.find(x => x.key === b.dataset.dl); b.disabled = true; const t0 = b.textContent; b.textContent = 'Preparing…';
    try { const f = rfBuild(r, k); await saveFile(f.name, f.data); if (f.notes.length) toast(f.notes[0]); } catch (e) { toast(`${r.name}: ${e.message}`); }
    b.disabled = false; b.textContent = t0;
  });
  $('#rfzs').onclick = async () => { const ks = keysSel(); if (ks.length === 1) { const r = reps.find(x => x.key === ks[0]); try { const f = rfBuild(r, k); await saveFile(f.name, f.data); } catch (e) { toast(`${r.name}: ${e.message}`); } return; } rfZip([sid], month, key => ks.includes(key), { both: C.both, skipEmpty: false }); };
  $('#rfza').onclick = () => rfZip([sid], month, () => true, { both: C.both });
}

// many sites: choose which reports go into each site's folder
function rfPickModal(sids, month) {
  const C = S.comp; C.pick = C.pick || RF_PICK.map(x => x[0]);
  const st = sids.map(id => rfStatus(id, month)); const d = st.filter(x => x.k === 'DRAFT').length;
  $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:560px"><h2 style="margin-top:0">Download site packs — ${monthName(month)}</h2>
   <p class="small muted" style="margin-top:-6px">${sids.length} site${sids.length === 1 ? '' : 's'}. One ZIP with a folder per site, holding the files you tick below.${d ? ` ${d} site${d === 1 ? ' is' : 's are'} not locked yet; their files are marked DRAFT.` : ''}</p>
   <div class="rfpick">${RF_PICK.map(([k, t]) => `<label class="chk"><input type="checkbox" data-pk="${k}" ${C.pick.includes(k) ? 'checked' : ''}> ${t}</label>`).join('')}</div>
   <div class="row small" style="gap:14px;margin:6px 0 14px"><a href="#" id="rpa">Select all</a><a href="#" id="rpn">Clear</a><a href="#" id="rpc">Compliance only</a><span class="grow"></span><label class="chk"><input type="checkbox" id="rpb" ${C.both ? 'checked' : ''}> Both register formats</label></div>
   <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" id="rpx">Cancel</button><button class="btn pri" id="rpg">Download ZIP</button></div></div></div>`;
  const sync = () => { C.pick = [...$('#modal').querySelectorAll('[data-pk]:checked')].map(x => x.dataset.pk); $('#rpg').disabled = !C.pick.length; };
  $('#modal').querySelectorAll('[data-pk]').forEach(c => c.onchange = sync);
  const setAll = ks => { $('#modal').querySelectorAll('[data-pk]').forEach(c => c.checked = ks.includes(c.dataset.pk)); sync(); };
  $('#rpa').onclick = e => { e.preventDefault(); setAll(RF_PICK.map(x => x[0])); }; $('#rpn').onclick = e => { e.preventDefault(); setAll([]); };
  $('#rpc').onclick = e => { e.preventDefault(); setAll(['reg', 'ecr', 'esic', 'ptlwf', 'ercost']); };
  $('#rpx').onclick = () => closeModal(); sync();
  $('#rpg').onclick = () => { C.both = $('#rpb').checked; const preds = RF_PICK.filter(x => C.pick.includes(x[0])).map(x => x[2]); closeModal(); rfZip(sids, month, key => preds.some(f => f(key)), { both: C.both }); };
}
// many sites: one file per report covering all of them
function rfCombModal(sids, month) {
  const sets = [...new Set(sids.map(id => (S.sites[id] || {}).registerSet === 'CODE' ? 'CODE' : 'CLRA'))];
  const regs = REGS.filter(r => sets.includes(r[2]) && r[0] !== 'XIX' && r[0] !== 'CODE_V');
  const item = (k, t, s, f) => `<div class="rfi"><div class="grow"><b>${t}</b><span>${s}</span></div><span class="tag">${f}</span><button class="btn sm" data-cb="${k}">Download</button></div>`;
  $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:640px"><div class="row"><h2 class="grow" style="margin:0">Combined files — ${monthName(month)}</h2><button class="xbtn" id="rcx">×</button></div>
   <p class="small muted">One file covering all ${sids.length} selected site${sids.length === 1 ? '' : 's'} — for a single ECR or ESIC upload, one bank batch, or one register workbook with a sheet per site.</p>
   <div class="rfcat"><div class="rfch"><b>Portal uploads & payment</b></div>${item('ecr', 'PF ECR', 'all members in one EPFO upload file', 'TXT')}${item('esic', 'ESIC monthly contribution', 'one upload file', 'XLSX')}${item('bank', 'Bank transfer file — salary', 'one batch for all sites', 'CSV')}${item('slips', 'Payslips', 'all sites, one per page', 'HTML')}</div>
   <div class="rfcat"><div class="rfch"><b>Summaries</b></div>${item('ptlwf', 'PT & LWF summary', 'by state, with detail', 'XLSX')}${item('ercost', 'Employer contribution statement', 'one row per site', 'XLSX')}</div>
   <div class="rfcat"><div class="rfch"><b>Statutory registers</b><span class="small muted">a sheet per site</span></div>${regs.map(r => item('reg_' + r[0], r[1].split(' — ')[1], r[1].split(' — ')[0] + (sets.length > 1 ? (r[2] === 'CODE' ? ' · Labour Code sites' : ' · CLRA sites') : ''), 'XLSX')).join('')}</div>
  </div></div>`;
  $('#rcx').onclick = () => closeModal();
  $('#modal').querySelectorAll('[data-cb]').forEach(b => b.onclick = async () => {
    const kind = b.dataset.cb; let ids = sids;
    if (kind.startsWith('reg_')) { const set = (REGS.find(r => 'reg_' + r[0] === kind) || [])[2]; ids = sids.filter(id => ((S.sites[id] || {}).registerSet === 'CODE' ? 'CODE' : 'CLRA') === set); }
    b.disabled = true; b.textContent = 'Preparing…'; try { await rfCombined(kind, ids, month); } catch (e) { toast('Could not prepare: ' + e.message); } b.disabled = false; b.textContent = 'Download';
  });
}

function regHeader(site, form, title, rule) {
  return [[form], [title], rule ? [rule] : [], ['Name and address of contractor:', 'Indus Fire Safety Private Limited, Indus House, Block No-501, Opp. GSFC Main Gate, Dashrath, Vadodara'],
    ['Nature and location of work:', `${site.work || 'Fire & safety services'} — ${site.address || site.name}`], ['Name and address of establishment / principal employer:', `${site.client}, ${site.name}`],
    ['Wage period:', `Monthly — ${monthName()}`], []];
}
function downloadRegister(key, packs) {
  const reg = REGS.find(r => r[0] === key); const sheets = [];
  if (key === 'XIX' || key === 'CODE_V') { payslips(packs.map(p2 => ({ site: Object.assign({}, p2.site, { registerSet: key === 'CODE_V' ? 'CODE' : 'CLRA' }), c: p2.c }))); return; }
  for (const { site, run, c } of packs) {
    const draft = run.status !== 'LOCKED' ? ' (DRAFT — run not locked)' : '';
    const comps = sheetCols(site); const E_ = comps.filter(x => x.type === 'E'); const D_ = comps.filter(x => x.type === 'D');
    const basicC = ['BASIC_E']; const otC = E_.filter(x => /^OT|PH|NH/.test(x.code) && /OT/.test(x.code)).map(x => x.code);
    const sum = (x, ks) => ks.reduce((s, k) => s + (x.r.lines[k] || 0), 0);
    let hdr, rows, title = reg[1] + draft, rule = '';
    const [y, m] = ym(); const nd = new Date(y, m, 0).getDate();
    switch (key) {
      case 'XIII': rule = '[See Rule 75 of the Contract Labour (Regulation & Abolition) Central Rules, 1971]';
        hdr = ['Sl. No.', 'Name and surname of workman', 'Age and sex', "Father's / husband's name", 'Nature of employment / designation', 'Permanent home address', 'Local address', 'Date of commencement of employment', 'Signature or thumb impression', 'Date of termination', 'Reasons for termination', 'Remarks'];
        rows = empsOf(site.id).map((e, i) => [i + 1, e.name, `${e.dob ? Math.floor((Date.now() - new Date(e.dob)) / 3.156e10) : ''} ${e.sex || ''}`.trim(), e.father || '', e.desig || '', e.address || '', '', e.doj || '', '', e.exitDate || '', e.exitReason || '', e.code]); break;
      case 'XVI': case 'CODE_IX': rule = key === 'XVI' ? '[See Rule 78(1)(a)(i)]' : '[Code on Wages / OSH Code (Central) Rules, 2026]';
        hdr = ['Sl. No.', 'Emp. code', 'Name of workman', "Father's / husband's name", 'Sex', 'Designation', ...Array.from({ length: nd }, (_, i) => String(i + 1)), 'Paid days', 'OT days', 'OT hours', 'NH/PH', 'Remarks'];
        rows = c.rows.map((x, i) => [i + 1, x.emp.code, x.emp.name, x.emp.father || '', x.emp.sex || '', x.emp.desig || '', ...Array.from({ length: nd }, (_, d) => (x.att.days || [])[d] || ''), x.att.PD, x.att.OTD || 0, x.att.OTH || 0, x.att.NH || 0, x.att.days ? '' : 'Monthly totals received from site']); break;
      case 'XVII': rule = '[See Rule 78(1)(a)(i)]';
        hdr = ['Sl. No.', 'Name of workman', 'Serial no. in register of workmen', 'Designation / nature of work done', 'No. of days worked', 'Units of work done', 'Daily rate of wages / piece rate', 'Basic wages', 'Dearness allowance', 'Overtime', 'Other cash payments (nature to be indicated)', 'Total', 'Deductions, if any (indicate nature)', 'Net amount paid', 'Signature / thumb impression of workman', 'Initials of contractor or representative'];
        rows = c.rows.map((x, i) => { const other = E_.filter(k => !basicC.includes(k.code) && !otC.includes(k.code)); return [i + 1, x.emp.name, x.emp.code, x.emp.desig || '', x.att.PD, '', (x.emp.rateType || site.rateType) === 'D' ? x.emp.rate : Math.round(x.emp.rate / (x.att.WD || site.divisor.days || 26) * 100) / 100, sum(x, basicC), 0, sum(x, otC), other.filter(k => x.r.lines[k.code]).map(k => `${k.label}: ${x.r.lines[k.code]}`).join('; ') + ` = ${sum(x, other.map(k => k.code))}`, x.r.GROSS, D_.filter(k => x.r.lines[k.code]).map(k => `${k.label}: ${x.r.lines[k.code]}`).join('; ') + ` = ${x.r.DED}`, x.r.NET, '', '']; }); break;
      case 'XX': rule = '[See Rule 78(1)(a)(ii)]';
        hdr = ['Sl. No.', 'Name of workman', "Father's / husband's name", 'Designation / nature of employment', 'Particulars of damage or loss', 'Date of damage or loss', 'Whether workman showed cause against deduction', 'Name of person in whose presence explanation was heard', 'Amount of deduction imposed', 'No. of instalments', 'Date of recovery — first instalment', 'Date of recovery — last instalment', 'Remarks'];
        rows = c.rows.filter(x => x.ded.DAMAGE > 0).map((x, i) => [i + 1, x.emp.name, x.emp.father || '', x.emp.desig || '', '', '', '', '', x.ded.DAMAGE, 1, monthName(), monthName(), '']); if (!rows.length) rows = [['', 'NIL — no deductions for damage or loss during the wage period']]; break;
      case 'XXI': rule = '[See Rule 78(1)(a)(ii)]';
        hdr = ['Sl. No.', 'Name of workman', "Father's / husband's name", 'Designation / nature of employment', 'Act / omission for which fine imposed', 'Date of offence', 'Whether workman showed cause against fine', 'Name of person in whose presence explanation was heard', 'Wage periods and wages payable', 'Amount of fine imposed', 'Date on which fine realised', 'Remarks'];
        rows = c.rows.filter(x => (x.r.lines.PENALTY || 0) > 0).map((x, i) => [i + 1, x.emp.name, x.emp.father || '', x.emp.desig || '', '', '', '', '', `${monthName()} — ₹${x.r.GROSS}`, x.r.lines.PENALTY, monthName(), '']); if (!rows.length) rows = [['', 'NIL — no fines during the wage period']]; break;
      case 'XXII': rule = '[See Rule 78(1)(a)(ii)]';
        hdr = ['Sl. No.', 'Name of workman', "Father's / husband's name", 'Designation / nature of employment', 'Wage period and wages payable', 'Date and amount of advance given', 'Purpose(s) for which advance made', 'No. of instalments by which advance to be repaid', 'Date and amount of each instalment repaid', 'Date on which last instalment was repaid', 'Remarks'];
        rows = c.rows.filter(x => (x.r.lines.LOAN || 0) + (x.r.lines.ADV || 0) > 0).map((x, i) => { const ls = Object.values(S.loans).filter(l => l.siteId === site.id && l.empCode === x.emp.code); return [i + 1, x.emp.name, x.emp.father || '', x.emp.desig || '', `${monthName()} — ₹${x.r.GROSS}`, ls.map(l => `${l.given || l.startMonth}: ₹${l.amount}`).join('; '), ls.map(l => l.purpose || (l.type === 'ADV' ? 'Salary advance' : 'Loan')).join('; '), ls.map(l => Math.ceil(l.amount / l.emi)).join('; '), `${monthName()}: ₹${(x.r.lines.LOAN || 0) + (x.r.lines.ADV || 0)}`, '', '']; }); if (!rows.length) rows = [['', 'NIL — no advances recovered during the wage period']]; break;
      case 'XXIII': rule = '[See Rule 78(1)(a)(iii)]';
        hdr = ['Sl. No.', 'Name of workman', "Father's / husband's name", 'Sex', 'Designation / nature of employment', 'Dates on which overtime worked', 'Total overtime worked or production in case of piece-rated', 'Normal rate of wages', 'Overtime rate of wages', 'Overtime earnings', 'Date on which overtime wages paid', 'Remarks'];
        rows = c.rows.filter(x => (x.att.OTD || 0) + (x.att.OTH || 0) > 0).map((x, i) => { const ot = sum(x, otC) + Object.entries(x.r.groups).filter(([g]) => /OT/.test(g)).reduce((s, [, v]) => s + v, 0); return [i + 1, x.emp.name, x.emp.father || '', x.emp.sex || '', x.emp.desig || '', '', x.att.OTD ? `${x.att.OTD} days` : `${x.att.OTH} hours`, x.emp.rate, '', ot, '', '']; }); if (!rows.length) rows = [['', 'NIL — no overtime during the wage period']]; break;
      case 'CODE_I': rule = '[Code on Wages / OSH Code (Central) Rules, 2026]';
        hdr = ['Sl. No.', 'Employee code', 'Name', 'Sex', "Father's / spouse's name", 'Date of birth', 'Nationality', 'Education level', 'Date of joining', 'Designation', 'Category (skill)', 'Type of employment', 'Mobile', 'UAN', 'PAN', 'ESIC IP no.', 'LWF no.', 'Aadhaar (masked)', 'Bank A/c no.', 'IFSC', 'Present address', 'Permanent address', 'Service book no.', 'Date of exit', 'Reason for exit', 'Remarks'];
        rows = empsOf(site.id).map((e, i) => [i + 1, e.code, e.name, e.sex || '', e.father || '', e.dob || '', 'Indian', '', e.doj || '', e.desig || '', e.skill || '', 'Contract', e.mobile || '', e.uan || '', '', e.esicNo || '', '', e.aadhaar ? 'XXXX-XXXX-' + String(e.aadhaar).slice(-4) : '', e.acct || '', e.ifsc || '', '', e.address || '', '', e.exitDate || '', e.exitReason || '', '']); break;
      case 'CODE_IV': rule = '[Code on Wages (Central) Rules, 2026]';
        hdr = ['Sl. No.', 'Emp. code', 'Name', 'Designation', 'Rate of wages', 'Days worked', 'OT days / hours', ...E_.map(k => k.label), 'Gross wages', ...D_.map(k => k.label), 'Total deductions', 'Net wages paid', 'Date of payment', 'Bank transaction ref.'];
        rows = c.rows.map((x, i) => [i + 1, x.emp.code, x.emp.name, x.emp.desig || '', x.emp.rate, x.att.PD, `${x.att.OTD || 0} / ${x.att.OTH || 0}`, ...E_.map(k => x.r.lines[k.code] || 0), x.r.GROSS, ...D_.map(k => x.r.lines[k.code] || 0), x.r.DED, x.r.NET, '', '']); break;
    }
    const head = regHeader(site, reg[1].split(' — ')[0], title, rule);
    sheets.push({ name: site.id, rows: [...head, hdr, ...rows], cols: hdr.map((h, j) => j === 1 || j === 2 ? 26 : Math.min(18, Math.max(6, String(h).length / 2))) });
  }
  saveFile(`${reg[1].split(' — ')[0].replace(/\s+/g, '_')}_${S.month}.xlsx`, xlsxBytes(sheets));
}
function ecrFile(packs) {
  const lines = [], miss = [];
  for (const { site, c } of packs) for (const x of c.rows) {
    if (!(x.r.lines.PF > 0)) continue; if (!x.emp.uan) { miss.push(`${x.emp.code} ${x.emp.name} (${site.id})`); continue; }
    const ncp = Math.max(0, Math.round((x.att.WD || site.divisor.days || 26) - x.att.PD));
    lines.push([x.emp.uan, x.emp.name.toUpperCase(), Math.round(x.r.GROSS), x.r.pfWages, x.r.epsWages, x.r.edliWages != null ? x.r.edliWages : x.r.epsWages, x.r.lines.PF, x.r.er.EPS, x.r.er.EPF, ncp, 0].join('#~#'));
  }
  const txt = (miss.length ? `# ${miss.length} employees with PF but no UAN — not included: ${miss.join('; ')}\n# Remove these comment lines before uploading to EPFO.\n` : '') + lines.join('\n');
  saveFile(`PF_ECR_${S.month}.txt`, txt || '# No PF members');
}
function esicFile(packs) {
  const rows = [], miss = [];
  for (const { site, c } of packs) for (const x of c.rows) {
    if (!(x.r.lines.ESI > 0)) continue; if (!x.emp.esicNo) miss.push([x.emp.code, x.emp.name, site.name]);
    rows.push([x.emp.esicNo || '', x.emp.name, Math.round(x.att.PD), Math.round(x.r.ESIW), x.att.PD ? '' : 0, '']);
  }
  const sheets = [{ name: 'ESIC upload', rows: [['IP Number (10 digits)', 'IP Name (only alphabets and space)', 'No of Days for which wages paid/payable during the month', 'Total Monthly Wages', 'Reason Code for Zero workings days', 'Last Working Day'], ...rows], cols: [16, 30, 14, 14, 12, 14] }];
  if (miss.length) sheets.push({ name: 'Missing IP numbers', rows: [['Emp Code', 'Name', 'Site'], ...miss] });
  saveFile(`ESIC_${S.month}.xlsx`, xlsxBytes(sheets));
}
function ptlwf(packs) {
  const byState = {};
  for (const { site, c } of packs) for (const x of c.rows) { const s = byState[site.state] = byState[site.state] || { pt: 0, ptN: 0, lwf: 0, lwfEr: 0, n: 0 }; s.n++; if (x.r.lines.PT) { s.pt += x.r.lines.PT; s.ptN++; } s.lwf += x.r.lines.LWF || 0; s.lwfEr += x.r.er.LWF || 0; }
  const rows = Object.entries(byState).map(([k, v]) => [E.STATE.NAMES[k] || k, v.n, v.ptN, v.pt, v.lwf, v.lwfEr, v.lwf + v.lwfEr]);
  const det = packs.flatMap(({ site, c }) => c.rows.filter(x => x.r.lines.PT || x.r.lines.LWF).map(x => [E.STATE.NAMES[site.state], site.name, x.emp.code, x.emp.name, x.r.GROSS, x.r.lines.PT || 0, x.r.lines.LWF || 0, x.r.er.LWF || 0]));
  saveFile(`PT_LWF_${S.month}.xlsx`, xlsxBytes([{ name: 'Summary', rows: [[`PT & LWF — ${monthName()}`], [], ['State', 'Employees', 'PT deducted from', 'PT amount', 'LWF employee', 'LWF employer', 'LWF total'], ...rows] }, { name: 'Detail', rows: [['State', 'Site', 'Emp Code', 'Name', 'Gross', 'PT', 'LWF (employee)', 'LWF (employer)'], ...det] }]));
}
function erCost(packs) {
  const rows = packs.map(({ site, c }) => { const s = k => c.rows.reduce((a, x) => a + x.r.er[k], 0); return [site.name, c.rows.length, c.tot.GROSS, c.tot.lines.PF || 0, s('EPF'), s('EPS'), s('EDLI'), s('ADMIN'), c.tot.lines.ESI || 0, s('ESI'), s('LWF'), c.tot.er, c.tot.GROSS + c.tot.er + Object.values(c.tot.groups).reduce((a, b) => a + b, 0)]; });
  saveFile(`Employer_Cost_${S.month}.xlsx`, xlsxBytes([{ name: 'Employer cost', rows: [[`Employer statutory cost — ${monthName()}`], [], ['Site', 'Employees', 'Gross wages', 'PF (employee)', 'Employer EPF', 'EPS', 'EDLI', 'PF admin', 'ESIC (employee)', 'ESIC (employer)', 'LWF (employer)', 'Total employer contribution', 'Total cost to company (incl. separate payouts)'], ...rows], cols: [40, 10, 12, 12, 12, 12, 10, 10, 12, 12, 12, 14, 16] }]));
}

// ---------------- Statutory masters ----------------
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STAT_FIELDS = [
  ['PF', 'Provident Fund', [['PF_EE', 'Employee share', '%'], ['EPF_ER', 'Employer EPF (A/c 1)', '%'], ['EPS_ER', 'Employer EPS (A/c 10)', '%'], ['EDLI', 'EDLI (A/c 21)', '%'], ['PF_ADMIN', 'Admin charges (A/c 2)', '%']]],
  ['ESI', 'Employees’ State Insurance', [['ESI_EE', 'Employee share', '%'], ['ESI_ER', 'Employer share', '%']]]];
function patPill(site, sid) {
  const run = (S.runs || {})[runId(sid, S.month, 'REG')]; const st0 = run && run.status === 'LOCKED' && run.snap ? Object.assign({}, site, { stat: null }, run.snap) : site;
  const [y, m] = S.month.split('-').map(Number); const t = E.statFor(st0, y, m); const nw = !!st0.stat;
  return `<span class="pill ${nw ? 'p-ok' : 'p-mute'}" title="Statutory pattern for ${monthName()} — PF wage ceiling and ESIC coverage limit" style="margin-right:6px">${nw ? 'New' : 'Old'} pattern · PF ₹${inr(t.PF_CEIL)} · ESIC ₹${inr(t.ESI_CEIL)}</span>`;
}
function patternsCard(D, M) {
  const P = D.PATTERNS, n = P.NEW, docs = Object.values(S.siteDocs || {}).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const eff = d => (d.statPattern === 'OLD' || d.statPattern === 'NEW') ? d.statPattern : P.DEFAULT;
  const cnt = k => docs.filter(d => eff(d) === k).length, pinned = k => docs.filter(d => d.statPattern === k).length, follow = docs.filter(d => d.statPattern !== 'OLD' && d.statPattern !== 'NEW').length;
  const L = pfLiterals(); const savedDef = patCfg().DEFAULT;
  const num_ = (k, v, w) => `<div class="rin"><i>₹</i><input data-pn="${k}" value="${v}" ${w ? `style="width:${w}px"` : ''}></div>`;
  const sel_ = (k, opts, cur) => `<select class="in" data-pn="${k}">${opts.map(([v, t]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const q = (M.pq || '').toLowerCase();
  return `<div class="card flush" style="margin-bottom:16px" id="patcard"><div class="chead"><div class="grow"><h2>Statutory patterns</h2><div class="small muted">Each site works on the old or the new PF / ESIC ceilings. Sites on “Follow default” all move together when the default changes.</div></div><span class="pill ${P.DEFAULT === 'NEW' ? 'p-ok' : 'p-mute'}">Default: ${PAT_NAME[P.DEFAULT]}</span></div>
   <div class="patg">
    <div class="patc ${P.DEFAULT === 'OLD' ? 'def' : ''}"><div class="path"><b>Old pattern</b><span class="pill p-mute">${cnt('OLD')} site${cnt('OLD') === 1 ? '' : 's'}</span></div>
     <label class="mrl"><span>PF wage ceiling</span><div class="rin"><i>₹</i><input data-old="PF_CEIL" value="${D.STAT.PF_CEIL}"></div></label>
     <label class="mrl"><span>EPS / EDLI wage ceiling</span><span class="muted">same as PF</span></label>
     <label class="mrl"><span>ESIC coverage limit</span><div class="rin"><i>₹</i><input data-old="ESI_CEIL" value="${D.STAT.ESI_CEIL}"></div></label>
     <label class="mrl"><span>ESIC limit tested on</span><span class="muted">Monthly gross rate</span></label></div>
    <div class="patc ${P.DEFAULT === 'NEW' ? 'def' : ''}"><div class="path"><b>New pattern</b><span class="pill p-ok">${cnt('NEW')} site${cnt('NEW') === 1 ? '' : 's'}</span></div>
     <label class="mrl"><span>PF wage ceiling</span>${num_('PF_CEIL', n.PF_CEIL)}</label>
     <label class="mrl"><span>EPS / EDLI wage ceiling</span>${num_('EPS_CEIL', n.EPS_CEIL)}</label>
     <label class="mrl"><span>PF ceiling effective from</span><input class="in" type="date" data-pn="PF_FROM" value="${n.PF_FROM || ''}"></label>
     <label class="mrl"><span>In the month it starts</span>${sel_('SPLIT', [['DAYS', 'Split by days'], ['NEW', 'Whole month on new'], ['OLD', 'Whole month on old']], n.SPLIT)}</label>
     <label class="mrl"><span>ESIC coverage limit</span>${num_('ESI_CEIL', n.ESI_CEIL)}</label>
     <label class="mrl"><span>ESIC limit tested on</span>${sel_('ESI_TEST', Object.entries(ESI_TEST_T), n.ESI_TEST)}</label>
     <label class="mrl"><span>ESIC limit effective from</span><input class="in" type="date" data-pn="ESI_FROM" value="${n.ESI_FROM || ''}"></label>
     <div class="small muted" style="margin-top:6px">${patSplitNote(n)}</div></div>
   </div>
   <div class="patd"><div class="grow"><b>Default for sites</b><div class="small muted">${follow} site${follow === 1 ? '' : 's'} follow the default · ${pinned('OLD')} set to Old · ${pinned('NEW')} set to New</div></div>
    <div class="seg">${['OLD', 'NEW'].map(k => `<button class="${P.DEFAULT === k ? 'on' : ''}" data-pdef="${k}">${PAT_NAME[k]}</button>`).join('')}</div></div>
   ${P.DEFAULT !== savedDef ? `<div class="note warn" style="margin:0 20px 14px">After you save, <b>${follow}</b> site${follow === 1 ? '' : 's'} on “Follow default” move to the ${PAT_NAME[P.DEFAULT].toLowerCase()} from the next salary run. Sites set to a pattern stay as they are; locked months never change.</div>` : ''}
   ${L.n ? `<div class="note warn" style="margin:0 20px 14px;display:flex;gap:12px;align-items:center"><div class="grow"><b>${L.n} PF formula${L.n === 1 ? '' : 's'} at ${L.sites.size} site${L.sites.size === 1 ? '' : 's'} have ₹15,000 written in</b>, so they stay on ₹15,000 even on the new pattern. Change them to use the site's PF ceiling. Sites on the old pattern calculate exactly the same.</div><button class="btn pri sm" id="pffix">Make them follow the pattern</button></div>` : ''}
   <details class="patl" ${M.popen ? 'open' : ''}><summary>Site-wise pattern <span class="muted small">— set a site to Old or New here or in Site setup → General</span></summary>
    <div style="padding:0 20px 10px"><input class="in" id="pq" placeholder="Search site" value="${esc(M.pq || '')}" style="width:260px;margin-bottom:8px"></div>
    <div class="tw" style="max-height:340px;overflow:auto"><table class="tbl nostick"><thead><tr><th>Site</th><th>State</th><th>Setting</th><th>Works on</th></tr></thead><tbody>
    ${docs.filter(d => !q || String(d.name).toLowerCase().includes(q)).map(d => { const sid = d.id || d._id; const e = eff(d); return `<tr><td>${esc(d.name)}${L.sites.has(sid) ? ' <span class="pill p-warn" title="PF formula has ₹15,000 written in">fixed ₹15,000</span>' : ''}</td><td>${esc(d.state || '')}</td><td><select class="in sm" data-psite="${esc(sid)}">${[['', `Follow default (${PAT_NAME[P.DEFAULT].split(' ')[0]})`], ['OLD', 'Old pattern'], ['NEW', 'New pattern']].map(([v, t]) => `<option value="${v}" ${(d.statPattern || '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></td><td><span class="pill ${e === 'NEW' ? 'p-ok' : 'p-mute'}">${PAT_NAME[e]}</span></td></tr>`; }).join('')}</tbody></table></div></details>
  </div>`;
}
function patSplitNote(n) {
  if (!n.PF_FROM) return 'Applies from the first salary month on this pattern.';
  const [y, m, d] = n.PF_FROM.split('-').map(Number); if (!y || d <= 1) return `New PF ceiling applies from ${monthName(n.PF_FROM.slice(0, 7))}.`;
  const st = E.statFor({ stat: Object.assign({ PF_PREV: E.STAT.PF_CEIL }, n) }, y, m);
  return n.SPLIT === 'DAYS' ? `${monthName(n.PF_FROM.slice(0, 7))}: days 1–${d - 1} on ₹${inr(E.STAT.PF_CEIL)}, days ${d}–${new Date(y, m, 0).getDate()} on ₹${inr(n.PF_CEIL)} → PF ceiling ₹${inr(st.PF_CEIL)} for the month.` : `${monthName(n.PF_FROM.slice(0, 7))} is worked out fully on the ${n.SPLIT === 'NEW' ? 'new' : 'old'} ceiling.`;
}
function bindPatterns(p, D, M, dirty) {
  const P = D.PATTERNS;
  p.querySelectorAll('[data-old]').forEach(i => i.oninput = () => { D.STAT[i.dataset.old] = num(i.value); dirty(); });
  p.querySelectorAll('[data-pn]').forEach(i => { const k = i.dataset.pn; const isNum = /CEIL$/.test(k); i[i.tagName === 'SELECT' || i.type === 'date' ? 'onchange' : 'oninput'] = () => { P.NEW[k] = isNum ? num(i.value) : i.value; dirty(); if (!isNum) { const el = p.querySelector('#patcard .patc:nth-child(2) .small.muted'); if (el) el.textContent = patSplitNote(P.NEW); } }; });
  p.querySelectorAll('[data-pdef]').forEach(b => b.onclick = () => { if (P.DEFAULT === b.dataset.pdef) return; P.DEFAULT = b.dataset.pdef; M.dirty = true; render(); });
  const fx = p.querySelector('#pffix'); if (fx) fx.onclick = () => fixPFLiterals(fx);
  const det = p.querySelector('.patl'); if (det) det.ontoggle = () => M.popen = det.open;
  const pq = p.querySelector('#pq'); if (pq) pq.oninput = () => { M.pq = pq.value; const qq = pq.value.toLowerCase(); p.querySelectorAll('[data-psite]').forEach(sl => { const tr = sl.closest('tr'); tr.style.display = !qq || tr.cells[0].textContent.toLowerCase().includes(qq) ? '' : 'none'; }); };
  p.querySelectorAll('[data-psite]').forEach(sl => sl.onchange = async () => {
    const d = S.siteDocs[sl.dataset.psite]; if (!d) return; const prev = d.statPattern;
    if (sl.value) d.statPattern = sl.value; else delete d.statPattern;
    if (await put('sites/' + sl.dataset.psite, storeDoc(d))) { resolveAll(); toast(`${d.name}: ${sl.value ? PAT_NAME[sl.value] : 'follows the default'}`); render(); } else { if (prev) d.statPattern = prev; else delete d.statPattern; render(); }
  });
}
function vMasters(p) {
  const N = E.STATE.NAMES;
  if (!S.mst || !S.mst.draft) S.mst = Object.assign(S.mst || { st: 'GJ', q: '' }, { draft: { PT: JSON.parse(JSON.stringify(E.STATE.PT, (k, v) => v === Infinity ? 1e12 : v)), LWF: JSON.parse(JSON.stringify(E.STATE.LWF)), STAT: Object.assign({}, E.STAT), PATTERNS: JSON.parse(JSON.stringify(patCfg())) }, dirty: false });
  const M = S.mst, D = M.draft;
  const sitesIn = k => siteList().filter(s => s.state === k);
  const states = Object.keys(N).sort((a, b) => sitesIn(b).length - sitesIn(a).length || N[a].localeCompare(N[b]));
  if (!N[M.st]) M.st = states[0];
  const ptN = states.filter(k => D.PT[k]).length, lwfN = states.filter(k => D.LWF[k]).length;
  const covered = siteList().filter(s => N[s.state]).length;
  const saved = S.masters && S.masters.savedAt ? new Date(S.masters.savedAt) : null;
  p.innerHTML = `
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
   <div class="kpi"><div class="l">States in master</div><div class="v">${states.length}</div><div class="s">${states.filter(k => sitesIn(k).length).length} with active sites</div></div>
   <div class="kpi"><div class="l">Professional tax</div><div class="v">${ptN} <span class="muted" style="font-size:15px;font-weight:500">states</span></div><div class="s">${states.length - ptN} states do not levy PT</div></div>
   <div class="kpi"><div class="l">Labour welfare fund</div><div class="v">${lwfN} <span class="muted" style="font-size:15px;font-weight:500">states</span></div><div class="s">${states.length - lwfN} without LWF</div></div>
   <div class="kpi"><div class="l">Last updated</div><div class="v" style="font-size:17px;margin-top:9px">${saved ? saved.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not yet saved'}</div><div class="s">${saved ? (S.masters.savedBy ? esc(S.masters.savedBy) + ' · ' : '') + saved.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'starting values in use'}</div></div>
  </div>
  <div class="card flush" style="margin-bottom:16px"><div class="chead"><div class="grow"><h2>Central rates</h2><div class="small muted">Apply to every site. Change only when a notification revises them.</div></div><span class="pill p-pri">All states</span></div>
   <div class="ratewrap">${STAT_FIELDS.map(([g, t, fs]) => `<div class="rgrp"><div class="rgh"><span class="rgi">${g}</span><b>${t}</b></div><div class="rgrid">${fs.map(([k, l, u]) => `<label class="rt"><span>${l}</span><div class="rin"><input data-stat="${k}" value="${u === '%' ? +(D.STAT[k] * 100).toFixed(4) : D.STAT[k]}">${u === '%' ? '<i>%</i>' : ''}</div>${u === '₹' ? '<em>per month</em>' : ''}</label>`).join('')}</div></div>`).join('')}</div></div>
  ${patternsCard(D, M)}
  <div class="mst">
   <div class="card flush mlist"><div class="mlh"><input class="in" id="mq" placeholder="Search state" value="${esc(M.q)}"></div>
    <div class="mrows">${states.filter(k => !M.q || N[k].toLowerCase().includes(M.q.toLowerCase()) || k.toLowerCase() === M.q.toLowerCase()).map(k => { const n = sitesIn(k).length; return `<div class="mrow ${M.st === k ? 'on' : ''}" data-st="${k}"><span class="mcode">${k}</span><div class="grow" style="min-width:0"><b>${N[k]}</b><span>${n ? n + ' site' + (n > 1 ? 's' : '') : 'No sites'}</span></div><span class="mdots"><i class="${D.PT[k] ? 'y' : ''}" title="Professional tax">PT</i><i class="${D.LWF[k] ? 'y' : ''}" title="Labour welfare fund">LWF</i></span></div>`; }).join('')}</div></div>
   <div id="mdet"></div>
  </div>
  <div class="msave ${M.dirty ? 'show' : ''}" id="mbar"><span class="pill p-warn">Unsaved changes</span><span class="small muted grow">Saved masters are used by every site in the state from the next salary run.</span><button class="btn" id="mdisc">Discard</button><button class="btn pri" id="msave">Save masters</button></div>`;
  const dirty = () => { M.dirty = true; $('#mbar').classList.add('show'); };
  p.querySelectorAll('[data-stat]').forEach(i => i.oninput = () => { const k = i.dataset.stat; const f = STAT_FIELDS.flatMap(g => g[2]).find(x => x[0] === k); D.STAT[k] = f[2] === '%' ? num(i.value) / 100 : num(i.value); dirty(); });
  bindPatterns(p, D, M, dirty);
  p.querySelectorAll('.mrow').forEach(r => r.onclick = () => { M.st = r.dataset.st; p.querySelectorAll('.mrow').forEach(x => x.classList.toggle('on', x === r)); drawDet(); });
  $('#mq').oninput = e => { M.q = e.target.value; p.querySelectorAll('.mrow').forEach(r => { const k = r.dataset.st; r.style.display = !M.q || N[k].toLowerCase().includes(M.q.toLowerCase()) ? '' : 'none'; }); };
  const refreshRow = k => { const r = p.querySelector(`.mrow[data-st="${k}"]`); if (r) { const d = r.querySelectorAll('.mdots i'); d[0].className = D.PT[k] ? 'y' : ''; d[1].className = D.LWF[k] ? 'y' : ''; } };
  function drawDet() {
    const k = M.st, pt = D.PT[k], lw = D.LWF[k], st = sitesIn(k), box = $('#mdet');
    const slabs = pt ? pt.slabs : [];
    const ptCalc = (g, mo, sex) => { if (!pt) return 0; if (pt.femaleExemptUpTo && sex === 'F' && g <= pt.femaleExemptUpTo) return 0; if (pt.halfYearly && mo !== 9 && mo !== 3) return 0; let a = 0; for (const [u, x] of pt.slabs) if (g <= u) { a = x; break; } if (pt.febAmount && mo === 2 && a === Math.max(...pt.slabs.map(s => s[1]))) a = pt.febAmount; return a; };
    const yearPT = g => MON3.reduce((t, _, i) => t + ptCalc(g, i + 1, 'M'), 0);
    box.innerHTML = `<div class="card flush">
     <div class="mdh"><span class="mcode lg">${k}</span><div class="grow"><h2 style="margin:0">${N[k]}</h2><div class="small muted">${st.length ? `${st.length} site${st.length > 1 ? 's' : ''} use these rates` : 'No sites in this state yet'}</div></div>${pt ? '<span class="pill p-ok">PT levied</span>' : '<span class="pill p-mute">No PT</span>'} ${lw ? '<span class="pill p-ok">LWF applicable</span>' : '<span class="pill p-mute">No LWF</span>'}</div>
     <div class="msec"><div class="msh"><div class="grow"><h3>Professional tax</h3><div class="small muted">Monthly slab on gross wages of the month</div></div><label class="sw"><input type="checkbox" id="pt_on" ${pt ? 'checked' : ''}><span></span>Levied</label></div>
      ${pt ? `<div class="mcols"><div><table class="tbl nostick slab"><thead><tr><th>Gross from</th><th>Gross up to</th><th class="n">PT per month</th><th></th></tr></thead><tbody>
       ${slabs.map((sl, i) => { const from = i ? slabs[i - 1][0] + 1 : 0; const last = i === slabs.length - 1; return `<tr><td class="mono muted">₹${inr(from)}</td><td>${last ? '<span class="muted">and above</span>' : `<div class="rin sm"><i>₹</i><input data-su="${i}" value="${sl[0]}"></div>`}</td><td class="n"><div class="rin sm" style="margin-left:auto"><i>₹</i><input data-sa="${i}" value="${sl[1]}"></div></td><td class="n">${slabs.length > 1 ? `<button class="xbtn" data-sx="${i}" title="Remove slab">×</button>` : ''}</td></tr>`; }).join('')}</tbody></table>
       <button class="btn sm" id="pt_add" style="margin-top:8px">+ Add slab</button></div>
       <div class="mrules"><div class="mrt">State rules</div>
        <label class="mrl"><span>Different amount in February</span><div class="rin sm"><i>₹</i><input id="pt_feb" value="${pt.febAmount || ''}" placeholder="—"></div></label>
        <label class="mrl"><span>Women exempt up to gross</span><div class="rin sm"><i>₹</i><input id="pt_fem" value="${pt.femaleExemptUpTo || ''}" placeholder="—"></div></label>
        <label class="mrl"><span>Half-yearly (deduct in Sep & Mar)</span><label class="sw"><input type="checkbox" id="pt_hy" ${pt.halfYearly ? 'checked' : ''}><span></span></label></label>
        <div class="mcalc"><div class="mrt">Check</div><div class="row" style="gap:8px"><span class="small">Gross</span><div class="rin sm"><i>₹</i><input id="pt_g" value="${M.g || 20000}"></div></div><div id="pt_out" class="small" style="margin-top:8px"></div></div>
       </div></div>` : `<div class="mempty">${N[k]} does not levy professional tax. Turn on “Levied” to add slabs.</div>`}</div>
     <div class="msec"><div class="msh"><div class="grow"><h3>Labour welfare fund</h3><div class="small muted">Fixed contribution, deducted in the months selected</div></div><label class="sw"><input type="checkbox" id="lw_on" ${lw ? 'checked' : ''}><span></span>Applicable</label></div>
      ${lw ? `<div class="mrt" style="margin-bottom:8px">Deduction months</div><div class="mchips">${MON3.map((m, i) => `<button class="mchip ${lw.months.includes(i + 1) ? 'on' : ''}" data-mo="${i + 1}">${m}</button>`).join('')}</div>
       <div class="lwg"><label class="rt"><span>Employee share</span><div class="rin"><i>₹</i><input id="lw_ee" value="${lw.ee}"></div><em>per deduction</em></label><label class="rt"><span>Employer share</span><div class="rin"><i>₹</i><input id="lw_er" value="${lw.er}"></div><em>per deduction</em></label>
        <div class="rt sum"><span>Per employee per year</span><b id="lw_y"></b><em id="lw_y2"></em></div></div>` : `<div class="mempty">No labour welfare fund in ${N[k]}. Turn on “Applicable” if the state has one.</div>`}</div>
     <div class="msec"><div class="msh"><h3>Sites in ${N[k]}</h3></div>${st.length ? `<div class="mchips">${st.map(s2 => `<span class="tag" style="font-size:12px;padding:3px 8px">${esc(s2.name)}</span>`).join('')}</div>` : '<div class="small muted">None</div>'}</div>
    </div>`;
    const calc = () => { const o = $('#pt_out'); if (!o) return; const g = num($('#pt_g').value); M.g = g; o.innerHTML = `PT <b>₹${inr(ptCalc(g, 4, 'M'))}</b> a month${pt.febAmount ? ` · February <b>₹${inr(ptCalc(g, 2, 'M'))}</b>` : ''}${pt.halfYearly ? ` · deducted in Sep & Mar: <b>₹${inr(ptCalc(g, 9, 'M'))}</b> each` : ''}${pt.femaleExemptUpTo ? ` · women: <b>₹${inr(ptCalc(g, 4, 'F'))}</b>` : ''}<br><span class="muted">Year total ₹${inr(yearPT(g))}</span>`; };
    const lwy = () => { const y = $('#lw_y'); if (!y) return; y.textContent = `₹${inr(lw.ee * lw.months.length)} + ₹${inr(lw.er * lw.months.length)}`; $('#lw_y2').textContent = `employee + employer, ${lw.months.length} deduction${lw.months.length === 1 ? '' : 's'}`; };
    calc(); lwy();
    const set = (sel, fn) => { const el = box.querySelector(sel); if (el) el.oninput = () => { fn(el); dirty(); calc(); lwy(); }; };
    box.querySelectorAll('[data-su]').forEach(i => i.oninput = () => { slabs[+i.dataset.su][0] = num(i.value); dirty(); calc(); });
    box.querySelectorAll('[data-su]').forEach(i => i.onchange = () => drawDet());
    box.querySelectorAll('[data-sa]').forEach(i => i.oninput = () => { slabs[+i.dataset.sa][1] = num(i.value); dirty(); calc(); });
    box.querySelectorAll('[data-sx]').forEach(b2 => b2.onclick = () => { slabs.splice(+b2.dataset.sx, 1); slabs[slabs.length - 1][0] = 1e12; dirty(); drawDet(); });
    const add = $('#pt_add'); if (add) add.onclick = () => { const n = slabs.length; const prev = n > 1 ? slabs[n - 2][0] : 0; slabs.splice(n - 1, 0, [prev + 5000, slabs[n - 1][1]]); dirty(); drawDet(); };
    set('#pt_feb', el => { if (el.value === '') delete pt.febAmount; else pt.febAmount = num(el.value); });
    set('#pt_fem', el => { if (el.value === '') delete pt.femaleExemptUpTo; else pt.femaleExemptUpTo = num(el.value); });
    const hy = $('#pt_hy'); if (hy) hy.onchange = () => { if (hy.checked) pt.halfYearly = true; else delete pt.halfYearly; dirty(); calc(); };
    const pg = $('#pt_g'); if (pg) pg.oninput = calc;
    $('#pt_on').onchange = e => { D.PT[k] = e.target.checked ? { slabs: [[10000, 0], [1e12, 200]] } : null; dirty(); refreshRow(k); drawDet(); };
    $('#lw_on').onchange = e => { D.LWF[k] = e.target.checked ? { months: [6, 12], ee: 0, er: 0 } : null; dirty(); refreshRow(k); drawDet(); };
    box.querySelectorAll('[data-mo]').forEach(b2 => b2.onclick = () => { const m = +b2.dataset.mo; lw.months = lw.months.includes(m) ? lw.months.filter(x => x !== m) : [...lw.months, m].sort((a, b) => a - b); b2.classList.toggle('on'); dirty(); lwy(); });
    set('#lw_ee', el => lw.ee = num(el.value)); set('#lw_er', el => lw.er = num(el.value));
  }
  drawDet();
  $('#mdisc').onclick = () => { M.draft = null; M.dirty = false; render(); };
  $('#msave').onclick = async () => {
    for (const [k, t] of Object.entries(D.PT)) if (t) { t.slabs.sort((a, b) => a[0] - b[0]); for (let i = 1; i < t.slabs.length; i++) if (t.slabs[i][0] <= t.slabs[i - 1][0]) { toast(`${N[k]}: PT slab limits must go up`); M.st = k; drawDet(); return; } }
    const who = (S.user && (S.user.name || S.user.email)) || '';
    const doc = { PT: D.PT, LWF: D.LWF, STAT: D.STAT, PATTERNS: D.PATTERNS, savedAt: new Date().toISOString(), savedBy: who };
    if (await put('masters/statutory', doc)) { S.masters = JSON.parse(JSON.stringify(doc)); applyMasters(); M.draft = null; M.dirty = false; toast('Statutory masters saved'); render(); }
  };
}

// ---------------- boot ----------------
function __indusPayrollBoot(opts) {
  opts = opts || {};
  if (opts.user) S.user = opts.user;
  if (opts.view && NAV.some(function (n) { return n[0] === opts.view; })) S.view = opts.view;
  if (opts.attendanceSites !== undefined) {
    S.attSitesLoaded = true;
    S.attSites = Array.isArray(opts.attendanceSites) ? opts.attendanceSites.slice() : [];
    if (S.ready && !S.noAccess) syncAttendanceSites(S.attSites);
  }
  if (!S.proc.siteMode) S.proc.siteMode = 'pick';
  if (!S._monthSet) {
    var now = new Date();
    S.month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    S._monthSet = true;
  }
  var monthEl = $('#month');
  if (monthEl) {
    if (monthEl.value !== S.month) monthEl.value = S.month;
    if (!monthEl._bound) {
      monthEl._bound = true;
      monthEl.onchange = function (e) { S.month = e.target.value || S.month; render(); };
    }
  }
  render();
  if (!S._connected) { S._connected = true; connect(); }
}
window.__indusPayrollBoot = __indusPayrollBoot;
window.__indusPayrollBuild = 8;
window.__indusPayrollSetView = function (v) {
  if (!v || v === S.view || !NAV.some(function (n) { return n[0] === v; })) return;
  S.view = v;
  // Drop site picks that are hidden by Attendance Fire/Safety filter when entering Process salary
  if (v === 'process' && Array.isArray(S.proc.sites) && S.proc.sites.length) {
    const ok = new Set(processSiteList().map((s) => s.id));
    S.proc.sites = S.proc.sites.map(String).filter((id) => ok.has(id));
    if (S.proc.site && !ok.has(String(S.proc.site))) S.proc.site = S.proc.sites[0] || null;
  }
  render();
};
if (!window.__indusPayrollSiteTypeBound) {
  window.__indusPayrollSiteTypeBound = true;
  window.addEventListener('storage', (ev) => {
    if (ev.key !== 'hr_selected_site_type') return;
    if (S.ready) softRender();
  });
}
window.__indusPayrollSetAttendanceSites = function (rows) {
  S.attSitesLoaded = true;
  S.attSites = Array.isArray(rows) ? rows.slice() : [];
  // Drop selections that no longer exist in Attendance / Site Master
  if (Array.isArray(S.proc.sites) && S.proc.sites.length) {
    const ok = new Set(processSiteList().map((s) => s.id));
    S.proc.sites = S.proc.sites.map(String).filter((id) => ok.has(id));
    if (S.proc.site && !ok.has(String(S.proc.site))) S.proc.site = S.proc.sites[0] || null;
  }
  if (S.ready && !S.noAccess) syncAttendanceSites(S.attSites);
  else if (S.ready) softRender();
};
