/* Salary structure layer.
   Component master  : what a component IS (name, type, PF/ESIC wage defaults).
   Formula master    : reusable formulas. [CODE] = a component (by master code), {NAME} = a parameter set per site.
   Site mapping      : site.structure = rows {comp, code, label, formulaId | expr | 'STAT' | 'INPUT', params, pf, esi, group, off}
   resolve()         : turns a site's mapping into the plain components list the engine calculates. */
(function (root) {
  const TYPES = { E: 'Earning', X: 'Paid separately', D: 'Deduction', R: 'Employer contribution', C: 'Working figure' };
  const SYSTEM_VARS = { PD: 'Paid days', WD: 'Working days', OTD: 'OT days', OTH: 'OT hours', NH: 'NH/PH days', WOT: 'Week-off worked', ODI: 'Special duty days', LD: 'Leave days', TD: 'Total duty', HRS: 'Shift hours', RATE: 'Gross rate', BASIC: 'Basic rate', DRATE: 'Day rate', MRATE: 'Monthly rate', DAILY: 'Daily-rated (1/0)', GROSS: 'Gross', PFW: 'PF wages', ESIW: 'ESIC wages', NET: 'Net', PFCEIL: 'PF wage ceiling', ESICEIL: 'ESIC limit' };
  const STAT_CODES = ['PF', 'ESI', 'PT', 'LWF'];
  const SYSTEM_COMPONENTS = [
    { code: 'PF', name: 'Provident Fund (employee)', type: 'D', system: 'stat', desc: '12% of PF wages up to the ceiling — statutory rule' },
    { code: 'ESI', name: 'ESIC (employee)', type: 'D', system: 'stat', desc: '0.75% of ESIC wages when covered — statutory rule' },
    { code: 'PT', name: 'Professional tax', type: 'D', system: 'stat', desc: 'State slab from Statutory masters' },
    { code: 'LWF', name: 'Labour welfare fund (employee)', type: 'D', system: 'stat', desc: 'State amount in the deduction months' },
    { code: 'ER_EPF', name: 'Employer EPF (A/c 1)', type: 'R', system: 'auto', desc: 'Employer PF less EPS — automatic' },
    { code: 'ER_EPS', name: 'Employer EPS (A/c 10)', type: 'R', system: 'auto', desc: '8.33% of EPS wages — automatic' },
    { code: 'ER_EDLI', name: 'EDLI (A/c 21)', type: 'R', system: 'auto', desc: '0.5% of EPS wages — automatic' },
    { code: 'ER_ADMIN', name: 'PF admin charges (A/c 2)', type: 'R', system: 'auto', desc: '0.5% of PF wages — automatic' },
    { code: 'ER_ESI', name: 'Employer ESIC', type: 'R', system: 'auto', desc: '3.25% of ESIC wages — automatic' },
    { code: 'ER_LWF', name: 'Employer LWF', type: 'R', system: 'auto', desc: 'State employer share — automatic' },
  ];
  // concept rules used to group the imported sites' columns into master components
  const RULES = [
    [/number|\bno\.?$|\buan\b|ip no|remark|sign|\bbank\b|^from$|o\.c/, 'INFO', 'Information column'],
    [/held/, 'HELD', 'Held amount'],
    [/total duty|no of duties|^duty$|paid days|p days|working days|total days|उपस्थिति/, 'DUTY_DAYS', 'Duty / paid days'],
    [/^(?!.*amount).*(pf.*(wage|limit)|pf basic|wage limit)/, 'PF_WAGES', 'PF wages'], [/esi.*wage/, 'ESI_WAGES', 'ESIC wages'],
    [/^(pf|p\.f)|provident|\bpf\b/, 'PF', 'Provident Fund (employee)'], [/esi/, 'ESI', 'ESIC (employee)'], [/p\.? ?tax|prof.*tax|ptax/, 'PT', 'Professional tax'], [/lwf|welfare/, 'LWF', 'Labour welfare fund (employee)'],
    [/adv/, 'ADV', 'Salary advance'], [/loan/, 'LOAN', 'Loan EMI'], [/elec/, 'ELEC', 'Electricity'], [/mess|canteenmess/, 'MESS', 'Mess / canteen'], [/penalt|fine/, 'PENALTY', 'Penalty'], [/gate ?pass/, 'GATEPASS', 'Gate pass'],
    [/excess/, 'RECOVERY', 'Excess payment recovery'], [/academy/, 'ACADEMY', 'Academy fees'],
    [/total ded/, 'TOTAL_DED', 'Total deductions'], [/\bnet\b|netpay/, 'NET_PAY', 'Net pay'],
    [/^(gross|total earning|total$)/, 'GROSS_PAY', 'Gross salary'],
    [/basic rate|basic per day/, 'BASIC_RATE', 'Basic rate (working figure)'],
    [/bonus/, 'BONUS', 'Bonus'], [/gratuity/, 'GRATUITY', 'Gratuity'], [/lta|leave travel/, 'LTA', 'Leave travel allowance'],
    [/leave|\bpl\b|\bsl\b|\bcl\b|paid leave/, 'LEAVE', 'Leave wages'],
    [/o\.? ?t\b|o\.t\.|overtime|over time|\bot\b|extra hrs|retention|o\.d o\.t/, 'OT', 'Overtime'],
    [/\bnh|\bph\b|^ph|nph|national|festival|holiday/, 'NHPH', 'NH / PH wages'],
    [/h\.?r\.?a|house rent/, 'HRA', 'House rent allowance'],
    [/\brate\b|per day/, 'RATE_FIG', 'Rate (working figure)'],
    [/basic|baisc|bsic/, 'BASIC', 'Basic (earned)'], [/\bd\.?a\.?\b|dearness/, 'DA', 'Dearness allowance'],
    [/conv|transport|tpt/, 'CONV', 'Conveyance'], [/wash/, 'WASH', 'Washing allowance'], [/food/, 'FOOD', 'Food allowance'], [/medical/, 'MEDICAL', 'Medical allowance'],
    [/fire risk/, 'FIRE_RISK', 'Fire risk allowance'], [/canteen/, 'CANTEEN', 'Canteen allowance'], [/attendance|full-duty|incentive|performance/, 'INCENTIVE', 'Incentive'],
    [/hard living/, 'HARDSHIP', 'Hard living allowance'], [/voucher|vypt/, 'VOUCHER', 'Voucher payment'],
    [/c\.? ?off|w[\.\/]? ?off|week off|^wo\b|w\.o|offs|^off/, 'WEEKOFF', 'Weekly-off / comp-off'],
    [/defray|supplementary|additional|special|spl|sepecial|other|amount$/, 'OTHER', 'Other / special allowance'],
  ];
  const TSUF = { E: '', X: '_SEP', C: '_FIG', D: '_DED', R: '_ER' };
  const TNAME = { E: '', X: ' (paid separately)', C: ' (working figure)', D: ' (deduction)', R: ' (employer)' };
  const NUM_RE = /(?<![A-Za-z_0-9.])(\d+\.\d+|\d+|\.\d+)(?![A-Za-z_0-9.])/g;
  const ID_RE = /[A-Za-z_][A-Za-z0-9_]*/g;
  const norm = f => String(f == null ? '' : f).replace(/\s+/g, '').replace(/^\+/, '');
  const fmtNum = v => { const n = +v; if (!isFinite(n)) return '0'; return String(+n.toFixed(10)); };

  function conceptOf(c) {
    const l = String(c.label || c.code).toLowerCase().replace(/[_]/g, ' ').replace(/\(separate[^)]*\)/, '').trim();
    if (STAT_CODES.includes(c.code) && c.type === 'D') return [c.code, SYSTEM_COMPONENTS.find(x => x.code === c.code).name];
    for (const [re, k, n] of RULES) if (re.test(l)) return [k, n];
    const k = String(c.code).toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 24);
    return [k, String(c.label || c.code).replace(/\s*[@(].*$/, '').trim() || k];
  }
  const masterKey = (concept, type, preferType) => concept + (type === preferType ? '' : TSUF[type] || '_' + type);

  // Template a site formula: component codes → [MASTER], numbers → #
  function templateOf(expr, codeToMaster, uniqueCodes) {
    let e = norm(expr);
    const nums = [];
    e = e.replace(NUM_RE, m => { nums.push(m); return '\u0001'; });
    e = e.replace(ID_RE, id => (codeToMaster[id] && uniqueCodes.has(id)) ? '[' + codeToMaster[id] + ']' : id);
    return { tpl: e, nums };
  }

  /* ---- build masters from existing site setups (one-off migration) ---- */
  function buildMasters(sites, existing) {
    const compMaster = {}; (existing && existing.components || []).forEach(c => compMaster[c.code] = Object.assign({}, c));
    SYSTEM_COMPONENTS.forEach(c => { if (!compMaster[c.code]) compMaster[c.code] = Object.assign({ pf: false, esi: false }, c); });
    // pass 1: concept + type counts, to decide which type keeps the plain key
    const ctype = {};
    for (const s of sites) for (const c of s.components || []) { const [k] = conceptOf(c); ctype[k] = ctype[k] || {}; ctype[k][c.type] = (ctype[k][c.type] || 0) + 1; }
    const prefer = k => { const t = ctype[k] || {}; return Object.keys(t).sort((a, b) => t[b] - t[a])[0]; };
    const votes = {};
    const siteMaps = {};
    for (const s of sites) {
      const map = {};
      for (const c of s.components || []) {
        const [k, n] = conceptOf(c);
        const mk = (STAT_CODES.includes(c.code) && c.type === 'D') ? c.code : masterKey(k, c.type, prefer(k));
        map[c.code] = mk;
        if (!compMaster[mk]) compMaster[mk] = { code: mk, name: n + (mk === k ? '' : TNAME[c.type] || ''), type: c.type, pf: false, esi: false, desc: '' };
        const v = votes[mk] = votes[mk] || { pf: 0, esi: 0, n: 0, labels: {} }; v.n++; if (c.pf) v.pf++; if (c.esi) v.esi++; v.labels[c.label] = (v.labels[c.label] || 0) + 1;
      }
      siteMaps[s.id] = map;
    }
    for (const [mk, v] of Object.entries(votes)) { const m = compMaster[mk]; if (m.system) continue; if (!(existing && (existing.components || []).some(x => x.code === mk))) { m.pf = v.pf * 2 > v.n; m.esi = v.esi * 2 > v.n; } m.seen = Object.keys(v.labels).sort((a, b) => v.labels[b] - v.labels[a]).slice(0, 6); }
    // formula templates
    const groups = {};
    for (const s of sites) {
      const map = siteMaps[s.id]; const cnt = {}; Object.values(map).forEach(m => cnt[m] = (cnt[m] || 0) + 1);
      const uniq = new Set(Object.keys(map).filter(code => cnt[map[code]] === 1));
      for (const c of s.components || []) {
        if (c.input || c.formula == null || (STAT_CODES.includes(c.code) && !c.formula)) continue;
        const { tpl, nums } = templateOf(c.formula, map, uniq);
        const g = groups[tpl] = groups[tpl] || { tpl, uses: [], sites: new Set() };
        g.uses.push({ site: s.id, code: c.code, master: map[c.code], nums }); g.sites.add(s.id);
      }
    }
    const formulas = {}; (existing && existing.formulas || []).forEach(f => formulas[f.id] = Object.assign({}, f));
    const byTpl = {};
    for (const f of Object.values(formulas)) if (f._tpl) byTpl[f._tpl] = f.id;
    let n = Object.keys(formulas).length;
    for (const g of Object.values(groups)) {
      if (g.sites.size < 2 || byTpl[g.tpl]) continue;
      const slots = (g.tpl.match(/\u0001/g) || []).length;
      const params = []; const inlineVals = [];
      for (let i = 0; i < slots; i++) {
        const vals = new Set(g.uses.map(u => u.nums[i]));
        if (vals.size === 1) { inlineVals.push([...vals][0]); continue; }
        const nums = g.uses.map(u => +u.nums[i]); const after = g.tpl.split('\u0001')[i + 1] || '';
        let base = nums.every(x => x > 0 && x < 1) ? 'PCT' : /^\/100/.test(after) ? 'PCT' : nums.every(x => x >= 1 && x <= 4) ? 'FACTOR' : /^\/(WD|26|30)/.test(after) || /^\/[A-Z]/.test(after) ? 'AMT' : 'VALUE';
        let k = base, j = 2; while (params.some(p => p.k === k)) k = base + j++;
        const freq = {}; nums.forEach(x => freq[x] = (freq[x] || 0) + 1); const def = +Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0];
        params.push({ k, slot: i, label: base === 'PCT' ? 'Percentage' : base === 'FACTOR' ? 'Multiplier' : base === 'AMT' ? 'Amount (₹)' : 'Value', unit: base === 'PCT' ? (nums.every(x => x < 1) ? 'fraction' : 'percent') : base === 'AMT' ? 'rupees' : '', def });
        inlineVals.push(null);
      }
      let si = 0; const expr = g.tpl.replace(/\u0001/g, () => { const i = si++; const p = params.find(x => x.slot === i); return p ? '{' + p.k + '}' : inlineVals[i]; });
      // a value divided by 100 is a percentage
      let expr2 = expr; params.forEach(p => { if (new RegExp('\\{' + p.k + '\\}/100(?![0-9.])').test(expr2) && !/^PCT/.test(p.k)) { let k = 'PCT', j = 2; while (params.some(x => x.k === k)) k = 'PCT' + j++; expr2 = expr2.split('{' + p.k + '}').join('{' + k + '}'); p.k = k; p.label = 'Percentage'; p.unit = 'percent'; } });
      const mc = {}; g.uses.forEach(u => mc[u.master] = (mc[u.master] || 0) + 1); const top = Object.keys(mc).sort((a, b) => mc[b] - mc[a])[0];
      const id = 'F' + String(++n).padStart(3, '0');
      formulas[id] = { id, name: '', expr: expr2, params: params.map(({ slot, ...p }) => p), for: top, desc: '', _tpl: g.tpl };
      byTpl[g.tpl] = id;
    }
    // names
    const cm = compMaster;
    for (const f of Object.values(formulas)) if (!f.name) f.name = (cm[f.for] ? cm[f.for].name : 'Formula') + ' — ' + pretty(f.expr, cm);
    return { components: Object.values(compMaster), formulas: Object.values(formulas), siteMaps, byTpl };
  }

  /* ---- convert one legacy site (components[]) into a structure mapping ---- */
  function mapSite(site, masters) {
    const cmList = masters.components, fl = masters.formulas;
    const byTpl = {}; fl.forEach(f => { if (f._tpl) byTpl[f._tpl] = f; });
    const map = {}; const cmCodes = new Set(cmList.map(c => c.code));
    const ctype = {}; for (const c of cmList) ctype[c.code] = c.type;
    for (const c of site.components || []) {
      const [k] = conceptOf(c);
      let mk = (STAT_CODES.includes(c.code) && c.type === 'D') ? c.code : [k, k + (TSUF[c.type] || '')].find(x => cmCodes.has(x) && ctype[x] === c.type);
      if (!mk) mk = cmList.find(m => m.type === c.type && m.code.startsWith(k)) ? cmList.find(m => m.type === c.type && m.code.startsWith(k)).code : null;
      map[c.code] = mk || ('?' + c.code);
    }
    const cnt = {}; Object.values(map).forEach(m => cnt[m] = (cnt[m] || 0) + 1);
    const uniq = new Set(Object.keys(map).filter(code => cnt[map[code]] === 1));
    const rows = (site.components || []).map(c => {
      const m = cmList.find(x => x.code === map[c.code]);
      const row = { comp: m ? m.code : null, code: c.code };
      if (!m || (c.label && c.label !== m.name)) row.label = c.label;
      if (!m) row.type = c.type;
      if (m && !!c.pf !== !!m.pf) row.pf = !!c.pf; if (m && !!c.esi !== !!m.esi) row.esi = !!c.esi;
      if (!m) { row.pf = !!c.pf; row.esi = !!c.esi; }
      if (c.group) row.group = c.group; if (c.off) row.off = true;
      if (c.input) { row.formula = 'INPUT'; if (c.formula && c.formula !== c.code) row.expr = c.formula; }
      else if (STAT_CODES.includes(c.code) && c.type === 'D' && !c.formula) row.formula = 'STAT';
      else if (c.formula == null) { row.formula = 'EXPR'; row.expr = null; }
      else {
        const { tpl, nums } = templateOf(c.formula, map, uniq);
        const f = byTpl[tpl];
        if (f) {
          // read the parameter values back out of this site's numbers
          const slots = []; let si = 0; f.expr.replace(/\{([A-Z0-9_]+)\}|(?<![A-Za-z_0-9.])(\d+\.\d+|\d+|\.\d+)(?![A-Za-z_0-9.])/g, (mm, pk) => { slots.push(pk || null); si++; return mm; });
          const params = {}; let ok = slots.length === nums.length;
          slots.forEach((pk, i) => { if (pk) params[pk] = +nums[i]; });
          if (ok) { row.formula = f.id; if (Object.keys(params).length) row.params = params; }
          else { row.formula = 'EXPR'; row.expr = c.formula; }
        } else { row.formula = 'EXPR'; row.expr = c.formula; }
      }
      return row;
    });
    return rows;
  }

  /* ---- resolve a site's mapping into engine components ---- */
  function resolve(site, masters) {
    if (!Array.isArray(site.structure)) return site.components || [];
    const cm = {}; (masters.components || []).forEach(c => cm[c.code] = c);
    const fm = {}; (masters.formulas || []).forEach(f => fm[f.id] = f);
    const siteCodeOf = {}; for (const r of site.structure) if (r.comp && !r.off && siteCodeOf[r.comp] == null) siteCodeOf[r.comp] = r.code || r.comp;
    for (const r of site.structure) if (r.comp && siteCodeOf[r.comp] == null) siteCodeOf[r.comp] = r.code || r.comp;
    return site.structure.map(r => {
      const m = cm[r.comp] || {};
      const c = { code: r.code || r.comp, label: r.label || m.name || r.code, type: r.type || m.type || 'E' };
      const pf = r.pf != null ? r.pf : m.pf, esi = r.esi != null ? r.esi : m.esi;
      if (pf) c.pf = true; if (esi) c.esi = true; if (r.group) c.group = r.group; if (r.off) c.off = true;
      if (r.formula === 'INPUT') { c.input = true; c.formula = r.expr || c.code; }
      else if (r.formula === 'STAT') c.formula = null;
      else if (r.formula === 'EXPR' || !r.formula) c.formula = r.expr == null ? null : r.expr;
      else { const f = fm[r.formula]; c.formula = f ? fill(f, r.params || {}, siteCodeOf) : '0'; if (!f) c.missing = r.formula; }
      return c;
    });
  }
  function fill(f, params, siteCodeOf) {
    return f.expr.replace(/\[([A-Z0-9_]+)\]/g, (mm, k) => siteCodeOf[k] || k).replace(/\{([A-Z0-9_]+)\}/g, (mm, k) => { const p = (f.params || []).find(x => x.k === k); const v = params[k] != null && params[k] !== '' ? params[k] : (p ? p.def : 0); return fmtNum(v); });
  }
  function pretty(expr, cm) {
    const toks = []; const keep = t => { toks.push(t); return '\u0002' + (toks.length - 1) + '\u0003'; };
    let e = String(expr || '').replace(/\[([A-Z0-9_]+)\]/g, (mm, k) => keep(cm && cm[k] ? cm[k].name : k)).replace(/\{([A-Z0-9_]+)\}/g, (mm, k) => keep(k)).replace(/\b([A-Z][A-Z0-9_]*)\b/g, (mm, k) => SYSTEM_VARS[k] ? keep(SYSTEM_VARS[k]) : mm);
    e = e.replace(/\*/g, ' × ').replace(/\//g, ' ÷ ').replace(/([+\-])/g, ' $1 ').replace(/,/g, ', ').replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').trim();
    return e.replace(/\u0002(\d+)\u0003/g, (mm, i) => toks[+i]);
  }
  // identifiers a formula needs from the site (rates), apart from components, params and system variables
  function formulaNeeds(expr) {
    const out = { comps: [], params: [], rates: [] };
    String(expr || '').replace(/\[([A-Z0-9_]+)\]/g, (m, k) => { if (!out.comps.includes(k)) out.comps.push(k); return ''; })
      .replace(/\{([A-Z0-9_]+)\}/g, (m, k) => { if (!out.params.includes(k)) out.params.push(k); return ''; })
      .replace(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g, (m, k) => { if (!SYSTEM_VARS[k] && !['R', 'ROUND', 'MIN', 'MAX', 'IF', 'CEIL', 'FLOOR', 'ABS', 'AND', 'OR', 'NOT'].includes(k.toUpperCase()) && !out.rates.includes(k)) out.rates.push(k); return m; });
    return out;
  }

  /* ---- merge formulas that calculate the same thing (e.g. BASIC*PD and PD*BASIC) ----
     Two formulas are the same when they give the same result for many random inputs.
     compile = the engine's formula compiler. Returns { formulas, remap: {oldId: keptId}, custom: n rows moved to a master formula }. */
  function mergeEquivalent(masters, siteDocs, compile) {
    const rnd = (() => { let x = 1234567; return () => { x = (x * 48271) % 2147483647; return x / 2147483647; }; })();
    const trials = Array.from({ length: 16 }, () => ({}));
    const valOf = (t, k) => (trials[t][k] != null ? trials[t][k] : (trials[t][k] = rnd() < 0.25 ? 0 : Math.round(Math.exp(rnd() * Math.log(250000)) * 7) / 7));
    const sig = expr => { try { const ids = new Set(); const e = String(expr).replace(/\[([A-Z0-9_]+)\]/g, (m, k) => { ids.add('C__' + k); return 'C__' + k; }).replace(/\{([A-Z0-9_]+)\}/g, (m, k) => { ids.add('P__' + k); return 'P__' + k; });
        const f = compile(e); (f.ids || []).forEach(i => ids.add(i)); return trials.map((_, t) => { const v = {}; ids.forEach(i => v[i] = valOf(t, i)); const r = f.f(v); return isFinite(r) ? Math.round(r * 1e6) / 1e6 : 'x'; }).join('|') + '#' + [...ids].filter(i => i.startsWith('P__')).sort().join(','); } catch (e) { return null; } };
    const use = {}; for (const d of siteDocs) for (const r of d.structure || []) if (r.formula && /^F/.test(r.formula)) use[r.formula] = (use[r.formula] || 0) + 1;
    const groups = {}; for (const f of masters.formulas) { const k = sig(f.expr); if (!k) continue; (groups[k] = groups[k] || []).push(f); }
    const remap = {}; const keep = [];
    for (const g of Object.values(groups)) { g.sort((a, b) => (use[b.id] || 0) - (use[a.id] || 0) || a.id.localeCompare(b.id)); keep.push(g[0]); g.slice(1).forEach(f => remap[f.id] = g[0].id); }
    for (const f of masters.formulas) if (!sig(f.expr)) keep.push(f);
    const kept = masters.formulas.filter(f => keep.includes(f));
    const bySig = {}; for (const f of kept) { if ((f.params || []).length) continue; const k = sig(f.expr); if (k && !bySig[k]) bySig[k] = f.id; }
    let custom = 0, moved = 0;
    for (const d of siteDocs) {
      if (!Array.isArray(d.structure)) continue;
      const cnt = {}; d.structure.forEach(r => { if (r.comp) cnt[r.comp] = (cnt[r.comp] || 0) + 1; });
      const codeToComp = {}; d.structure.forEach(r => { if (r.comp && cnt[r.comp] === 1) codeToComp[r.code || r.comp] = r.comp; });
      for (const r of d.structure) {
        if (r.formula && remap[r.formula]) { r.formula = remap[r.formula]; moved++; }
        else if (r.formula === 'EXPR' && r.expr) {
          const e = norm(r.expr).replace(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g, (m, k) => codeToComp[k] && k !== (r.code || r.comp) ? '[' + codeToComp[k] + ']' : m);
          const k = sig(e); if (k && bySig[k]) { r.formula = bySig[k]; delete r.expr; custom++; }
        }
      }
    }
    return { formulas: kept, remap, custom, moved };
  }
  const VERSION = 2;
  const api = { VERSION, mergeEquivalent, TYPES, SYSTEM_VARS, SYSTEM_COMPONENTS, STAT_CODES, buildMasters, mapSite, resolve, fill, pretty, formulaNeeds, conceptOf, norm };
  if (typeof module !== 'undefined') module.exports = api; else root.STRUCT = api;
})(typeof window !== 'undefined' ? window : globalThis);
