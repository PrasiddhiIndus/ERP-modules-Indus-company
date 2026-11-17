/* Indus Payroll rule engine — shared by the prototype and the verifier.
   A site = parameters + an ordered list of components. Each component has a formula
   written in a small, Excel-like language that can use attendance, employee and
   earlier component values. */
(function (root) {
  const STATE = {
    // Professional Tax monthly slabs: [upToGross, amount]; null = not levied. Editable in Masters.
    PT: {
      GJ: { slabs: [[11999, 0], [Infinity, 200]] },
      MH: { slabs: [[7500, 0], [10000, 175], [Infinity, 200]], febAmount: 300, femaleExemptUpTo: 25000 },
      KA: { slabs: [[24999, 0], [Infinity, 200]] },
      AP: { slabs: [[15000, 0], [20000, 150], [Infinity, 200]] },
      TG: { slabs: [[15000, 0], [20000, 150], [Infinity, 200]] },
      MP: { slabs: [[18750, 0], [25000, 125], [33333, 167], [Infinity, 208]] },
      WB: { slabs: [[10000, 0], [15000, 110], [25000, 130], [40000, 150], [Infinity, 200]] },
      OD: { slabs: [[13304, 0], [25000, 125], [Infinity, 200]] },
      JH: { slabs: [[25000, 0], [41666, 100], [66666, 150], [83333, 175], [Infinity, 208]] },
      TN: { halfYearly: true, slabs: [[3500, 0], [5000, 22.5], [7500, 52.5], [10000, 115], [12500, 171], [Infinity, 208]] },
      UP: null, RJ: null, DL: null, HR: null, KL: null, PB: null,
    },
    // Labour Welfare Fund: months deducted (1-12), employee & employer share. Editable in Masters.
    LWF: {
      GJ: { months: [6, 12], ee: 6, er: 12 },
      MH: { months: [6, 12], ee: 25, er: 75 },
      MP: { months: [6, 12], ee: 10, er: 30 },
      KA: { months: [12], ee: 50, er: 100 },
      TN: { months: [12], ee: 20, er: 40 },
      AP: { months: [12], ee: 30, er: 70 },
      WB: { months: [6, 12], ee: 3, er: 15 },
      OD: { months: [6, 12], ee: 10, er: 20 },
      PB: { months: [6, 12], ee: 5, er: 20 }, KL: { months: [12], ee: 20, er: 20 }, CG: { months: [6, 12], ee: 15, er: 45 }, TG: { months: [12], ee: 2, er: 5 },
      UP: null, RJ: null, JH: null, DN: null,
    },
    NAMES: { GJ: 'Gujarat', MH: 'Maharashtra', UP: 'Uttar Pradesh', MP: 'Madhya Pradesh', TN: 'Tamil Nadu', KA: 'Karnataka', AP: 'Andhra Pradesh', TG: 'Telangana', RJ: 'Rajasthan', OD: 'Odisha', WB: 'West Bengal', JH: 'Jharkhand', DL: 'Delhi', HR: 'Haryana', KL: 'Kerala', PB: 'Punjab' },
  };

  const STAT = { PF_CEIL: 15000, PF_EE: 0.12, EPF_ER: 0.0367, EPS_ER: 0.0833, EDLI: 0.005, PF_ADMIN: 0.005, ESI_EE: 0.0075, ESI_ER: 0.0325, ESI_CEIL: 21000 };

  function ptFor(state, gross, month, sex) {
    const t = STATE.PT[state]; if (!t) return 0;
    if (t.femaleExemptUpTo && sex === 'F' && gross <= t.femaleExemptUpTo) return 0;
    if (t.halfYearly && month !== 9 && month !== 3) return 0; // TN: deduct in Sep & Mar
    let amt = 0; for (const [upto, a] of t.slabs) { if (gross <= upto) { amt = a; break; } }
    if (t.febAmount && month === 2 && amt > 0 && amt === Math.max(...t.slabs.map(s => s[1]))) amt = t.febAmount;
    return amt;
  }
  function lwfFor(state, month) { const t = STATE.LWF[state]; return t && t.months.includes(month) ? t.ee : 0; }
  function lwfErFor(state, month) { const t = STATE.LWF[state]; return t && t.months.includes(month) ? t.er : 0; }

  // ---- formula compiler: a small Excel-like expression parser (no eval) ----
  const cache = {};
  function tokenize(src) {
    const t = []; let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) { let j = i; while (j < src.length && /[0-9.eE]/.test(src[j])) j++; t.push({ k: 'n', v: parseFloat(src.slice(i, j)) }); i = j; continue; }
      if (/[A-Za-z_]/.test(c)) { let j = i; while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++; t.push({ k: 'id', v: src.slice(i, j) }); i = j; continue; }
      const two = src.slice(i, i + 2);
      if (['<=', '>=', '==', '!=', '<>', '&&', '||'].includes(two)) { t.push({ k: 'op', v: two === '<>' ? '!=' : two === '==' ? '=' : two }); i += 2; continue; }
      if ('+-*/^(),<>=%'.includes(c)) { t.push({ k: 'op', v: c }); i++; continue; }
      throw new Error('Unexpected character "' + c + '"');
    }
    return t;
  }
  const FNS = {
    R: a => Math.round((+a[0] || 0) + 1e-9), ROUND: a => { const d = a[1] || 0; return Math.round(a[0] * 10 ** d + 1e-9) / 10 ** d; },
    MIN: a => Math.min(...a), MAX: a => Math.max(...a), CEIL: a => Math.ceil(a[0]), FLOOR: a => Math.floor(a[0]), ABS: a => Math.abs(a[0]),
  };
  function compile(expr) {
    if (cache[expr]) return cache[expr];
    const toks = tokenize(String(expr).replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)').replace(/\(\s*,/g, '(0,').replace(/,\s*,/g, ',0,').replace(/,\s*\)/g, ',0)')); let p = 0; const ids = new Set();
    const peek = () => toks[p], eat = v => { const t = toks[p]; if (!t || (v && t.v !== v)) throw new Error('Expected ' + (v || 'value') + (t ? ' near "' + t.v + '"' : ' at end')); p++; return t; };
    const isOp = (...vs) => toks[p] && toks[p].k === 'op' && vs.includes(toks[p].v) || (toks[p] && toks[p].k === 'id' && vs.includes(toks[p].v.toUpperCase()));
    function or() { let l = and(); while (isOp('||', 'OR')) { p++; const a = l, b = and(); l = v => (a(v) || b(v)) ? 1 : 0; } return l; }
    function and() { let l = cmp(); while (isOp('&&', 'AND')) { p++; const a = l, b = cmp(); l = v => (a(v) && b(v)) ? 1 : 0; } return l; }
    function cmp() { let l = add(); while (isOp('<', '>', '<=', '>=', '=', '!=')) { const o = eat().v; const a = l, b = add();
      l = { '<': v => +(a(v) < b(v)), '>': v => +(a(v) > b(v)), '<=': v => +(a(v) <= b(v)), '>=': v => +(a(v) >= b(v)), '=': v => +(a(v) === b(v)), '!=': v => +(a(v) !== b(v)) }[o]; } return l; }
    function add() { let l = mul(); while (isOp('+', '-')) { const o = eat().v; const a = l, b = mul(); l = o === '+' ? v => a(v) + b(v) : v => a(v) - b(v); } return l; }
    function mul() { let l = pow(); while (isOp('*', '/', '%')) { const o = eat().v; const a = l, b = pow(); l = o === '*' ? v => a(v) * b(v) : o === '/' ? v => { const d = b(v); return d ? a(v) / d : 0; } : v => a(v) * b(v) / 100; } return l; }
    function pow() { const l = unary(); if (isOp('^')) { p++; const r = pow(); return v => Math.pow(l(v), r(v)); } return l; }
    function unary() { if (isOp('-')) { p++; const a = unary(); return v => -a(v); } if (isOp('+')) { p++; return unary(); } return atom(); }
    function atom() {
      const t = peek(); if (!t) throw new Error('Formula ends too early');
      if (t.k === 'n') { p++; return () => t.v; }
      if (t.k === 'op' && t.v === '(') { p++; const e = or(); eat(')'); return e; }
      if (t.k === 'id') {
        p++; const name = t.v;
        if (peek() && peek().v === '(') {
          p++; const args = []; if (peek() && peek().v !== ')') { args.push(or()); while (peek() && peek().v === ',') { p++; args.push(or()); } } eat(')');
          const U = name.toUpperCase();
          if (U === 'IF') { if (args.length < 2) throw new Error('IF needs (condition, then, else)'); const [c, a, b] = args; return v => c(v) ? a(v) : (b ? b(v) : 0); }
          const f = FNS[U]; if (!f) throw new Error('Unknown function ' + name);
          return v => f(args.map(a => a(v)));
        }
        ids.add(name);
        return v => { const x = v[name]; if (x === undefined) throw new Error('Unknown name ' + name); return typeof x === 'number' ? x : (+x || 0); };
      }
      throw new Error('Unexpected "' + t.v + '"');
    }
    const fn = or(); if (p < toks.length) throw new Error('Unexpected "' + toks[p].v + '"');
    cache[expr] = { f: fn, ids: [...ids] };
    return cache[expr];
  }
  function fnScope() { return {}; }

  /* Calculate one employee for one site/month.
     site: config; emp: master row; att: attendance totals; ded: one-off deductions; ctx: {month, year} */
  /* Statutory pattern for a site and month. site.stat (set from the site's pattern) may change the PF wage
     ceiling (with a date it takes effect from, split by days in that month), the EPS ceiling, and the ESIC
     coverage limit and what it is tested on. Without site.stat the central rates apply unchanged. */
  function statFor(site, year, month) {
    const p = site && site.stat; if (!p) return STAT;
    const o = Object.assign({}, STAT);
    const ym = year * 100 + month;
    const seg = (newV, oldV, from, mode) => {
      if (newV == null) return oldV;
      if (!from) return newV;
      const [fy, fm, fd] = String(from).split('-').map(Number); const fym = fy * 100 + fm;
      if (ym < fym) return oldV; if (ym > fym || fd <= 1) return newV;
      if (mode === 'NEW') return newV; if (mode === 'OLD') return oldV;
      const dim = new Date(fy, fm, 0).getDate(); const before = fd - 1;
      return Math.round((oldV * before + newV * (dim - before)) / dim);
    };
    o.PF_CEIL = seg(p.PF_CEIL, p.PF_PREV != null ? p.PF_PREV : STAT.PF_CEIL, p.PF_FROM, p.SPLIT);
    o.EPS_CEIL = seg(p.EPS_CEIL != null ? p.EPS_CEIL : p.PF_CEIL, p.PF_PREV != null ? p.PF_PREV : STAT.PF_CEIL, p.PF_FROM, p.SPLIT);
    const esiOn = !p.ESI_FROM || ym >= (+p.ESI_FROM.slice(0, 4)) * 100 + (+p.ESI_FROM.slice(5, 7));
    if (esiOn && p.ESI_CEIL != null) { o.ESI_CEIL = p.ESI_CEIL; o.ESI_TEST = p.ESI_TEST || 'RATE'; }
    o.pattern = p.key || 'CUSTOM';
    return o;
  }

  function calcEmployee(site, emp, att, ded, ctx) {
    const P = site.params || {};
    const ST = statFor(site, ctx.year, ctx.month);
    const month = ctx.month;
    const v = Object.assign(fnScope(), P);
    // attendance & period
    v.WD = att.WD != null ? att.WD : (site.divisor.type === 'fixed' ? site.divisor.days : ctx.calendarWD);
    v.PD = +att.PD || 0; v.OTD = +att.OTD || 0; v.OTH = +att.OTH || 0; v.NH = +att.NH || 0;
    v.WOT = +att.WOT || 0; v.ODI = +att.ODI || 0; v.LD = +att.LD || 0;
    v.HRS = P.HRS || 8;
    v.PFCEIL = ST.PF_CEIL; v.ESICEIL = ST.ESI_CEIL;     // the site's statutory ceilings, usable in formulas
    // any other attendance figure a site defines (e.g. OT in NH days, OD OT) becomes a formula name too
    for (const [k, x] of Object.entries(att)) if (v[k] === undefined && typeof x === 'number') v[k] = x;
    // employee
    v.RATE = +emp.rate || 0; v.BASIC = +(emp.basic != null ? emp.basic : P.BASIC) || 0;
    v.DAILY = (emp.rateType || site.rateType) === 'D' ? 1 : 0;
    v.DRATE = v.DAILY ? v.RATE : v.RATE / v.WD;          // gross per day
    v.MRATE = v.DAILY ? v.RATE * v.WD : v.RATE;            // gross per month (for ESI/PT eligibility)
    v.TD = v.PD + v.OTD + v.WOT;                            // total duty
    // designation-level parameter overrides (e.g. HRA 30% for DCPO, 10% for FM), then employee-level
    const dp = site.designationParams || {};
    const dkey = Object.keys(dp).find(k => String(emp.desig || '').trim().toUpperCase().replace(/\.$/, '') === k.toUpperCase());
    if (dkey) Object.assign(v, dp[dkey]);
    Object.assign(v, emp.extra || {});
    // one-off deductions
    const dd = Object.assign({ ADV: 0, LOAN: 0, HELD: 0, ELEC: 0, GATEPASS: 0, PENALTY: 0, OTHDED: 0, CANTEEN: 0 }, ded || {});
    Object.assign(v, dd);
    // monthly inputs a site defines (e.g. HRA typed each month, held release) default to 0 when not entered
    for (const c of site.components) if (c.input && v[c.code] === undefined) v[c.code] = 0;
    for (const [k] of (site.attFields || [])) if (v[k] === undefined) v[k] = 0;

    const rnd = site.rounding === 'none' ? (x => x) : (x => Math.round((+x || 0) + 1e-9));
    const out = { lines: {}, groups: {} };
    let PFW = 0, ESIW = 0, GROSS = 0, DED = 0;
    const sepPF = {}, sepESI = {};
    // evaluate in dependency order (a formula may use a column defined further right);
    // PF/ESI/PT also wait for every component that feeds PF wages, ESIC wages or gross.
    const ordered = evalOrder(site, emp.formulas);
    for (const c of ordered) {
      if (c.off) continue;
      let val;
      if (c.code === 'PF') {
        v.PFW = PFW;
        const fo = emp.formulas && emp.formulas.PF; val = (fo != null || c.formula) ? compile(fo != null ? fo : c.formula).f(v) : ST.PF_EE * Math.min(ST.PF_CEIL, PFW);
        if (emp.pf === false) val = 0;
      } else if (c.code === 'ESI') {
        v.ESIW = ESIW;
        // coverage is decided per employee (continues through the contribution period); default = monthly rate within ceiling
        const tested = ST.ESI_TEST === 'ESIW' ? ESIW : ST.ESI_TEST === 'PFW' ? PFW : v.MRATE;
        // on a site with a raised limit, an employee marked "no ESIC" only because pay was above the old limit is tested again
        const offByOldLimit = emp.esi === false && ST.ESI_TEST && v.MRATE > STAT.ESI_CEIL;
        const elig = site.esi !== false && (emp.esi === true || ((emp.esi !== false || offByOldLimit) && tested <= ST.ESI_CEIL));
        const fo = emp.formulas && emp.formulas.ESI; val = elig ? ((fo != null || c.formula) ? compile(fo != null ? fo : c.formula).f(v) : ST.ESI_EE * ESIW) : 0;
      } else if (c.code === 'PT') {
        v.GROSS = GROSS;
        const fo = emp.formulas && emp.formulas.PT; val = (fo != null || c.formula) ? compile(fo != null ? fo : c.formula).f(v) : ptFor(site.state, GROSS, month, emp.sex);
      } else if (c.code === 'LWF') {
        const fo = emp.formulas && emp.formulas.LWF; val = (fo != null || c.formula) ? compile(fo != null ? fo : c.formula).f(v) : lwfFor(site.state, month);
      } else {
        v.GROSS = GROSS; v.PFW = PFW; v.ESIW = ESIW;
        val = compile((emp.formulas && emp.formulas[c.code] != null) ? emp.formulas[c.code] : c.formula).f(v);
      }
      val = c.type === 'C' ? (+val || 0) : rnd(val);
      if (!isFinite(val)) val = 0;
      v[c.code] = val; out.lines[c.code] = val;
      if (c.type === 'E') { GROSS += val; if (c.pf) PFW += val; if (c.esi) ESIW += val; }
      if (c.type === 'X') { const g = c.group || c.code; out.groups[g] = (out.groups[g] || 0) + val; if (c.esi) ESIW += val; }
      if (c.type === 'D') DED += val;
      if (c.type === 'R') { out.erx = out.erx || {}; out.erx[c.code] = val; }
    }
    // Labour Code 50% wage test (per-site switch): excluded allowances above 50% of total remuneration added to PF wages
    if (site.labourCode50) {
      const excluded = site.components.filter(c => c.type === 'E' && !c.pf && !c.off).reduce((s, c) => s + (out.lines[c.code] || 0), 0);
      const addBack = Math.max(0, excluded - 0.5 * GROSS);
      out.codeWagesAddBack = Math.round(addBack);
    }
    out.GROSS = GROSS; out.DED = DED; out.NET = Math.round(GROSS - DED);
    out.PFW = PFW; out.ESIW = ESIW;
    // employer contributions
    const pfWagesEr = out.lines.PF > 0 ? Math.round(out.lines.PF / ST.PF_EE) : 0;
    const pfBase = Math.min(ST.EPS_CEIL || ST.PF_CEIL, pfWagesEr);
    const edliBase = Math.min(ST.PF_CEIL, pfWagesEr);
    out.er = {
      EPS: Math.round(pfBase * ST.EPS_ER),
      EPF: (out.lines.PF || 0) - Math.round(pfBase * ST.EPS_ER),
      EDLI: Math.round(edliBase * ST.EDLI),
      ADMIN: Math.round(pfWagesEr * ST.PF_ADMIN),
      ESI: out.lines.ESI > 0 ? Math.ceil(ESIW * ST.ESI_ER) : 0,
      LWF: out.lines.LWF > 0 ? lwfErFor(site.state, month) : 0,
    };
    out.er.TOTAL = out.er.EPS + out.er.EPF + out.er.EDLI + out.er.ADMIN + out.er.ESI + out.er.LWF;
    // employer contributions a site defines itself (e.g. gratuity or bonus provision) — cost only, never in gross or net
    if (out.erx) { out.er.EXTRA = Object.values(out.erx).reduce((t, x) => t + x, 0); out.er.TOTAL += out.er.EXTRA; }
    out.pfWages = pfWagesEr; out.epsWages = pfBase; out.edliWages = edliBase; out.stat = { pf: ST.PF_CEIL, eps: ST.EPS_CEIL || ST.PF_CEIL, esi: ST.ESI_CEIL, pattern: ST.pattern || 'CENTRAL' };
    return out;
  }

  const ORDER = new WeakMap();
  function evalOrder(site, over) {
    const sig = site.components.map(c => c.code + ':' + (c.off ? 0 : 1) + ':' + c.type + ':' + (c.pf ? 1 : 0) + (c.esi ? 1 : 0) + ':' + ((over && over[c.code] != null) ? over[c.code] : (c.formula || ''))).join('|');
    const memo = ORDER.get(site) || {}; if (!ORDER.has(site)) ORDER.set(site, memo);
    if (memo[sig]) return memo[sig];
    const comps = site.components.filter(c => !c.off); const byCode = {}; comps.forEach(c => byCode[c.code] = c);
    const STATDEF = { PF: ['PFW'], ESI: ['ESIW'], PT: ['GROSS'], LWF: [] };
    const deps = new Map();
    for (const c of comps) {
      let ids = [];
      const fx = (over && over[c.code] != null) ? over[c.code] : c.formula;
      if (fx) { try { ids = compile(fx).ids; } catch (e) { ids = []; } } else if (STATDEF[c.code]) ids = STATDEF[c.code];
      const d = new Set();
      for (const id of ids) {
        if (byCode[id] && id !== c.code) d.add(id);
        if (id === 'PFW') comps.filter(x => x.type === 'E' && x.pf).forEach(x => d.add(x.code));
        if (id === 'ESIW') comps.filter(x => (x.type === 'E' || x.type === 'X') && x.esi).forEach(x => d.add(x.code));
        if (id === 'GROSS') comps.filter(x => x.type === 'E').forEach(x => d.add(x.code));
      }
      d.delete(c.code); deps.set(c.code, d);
    }
    const out = [], state = {};
    const visit = (code, stack) => { if (state[code] === 2) return; if (state[code] === 1) throw new Error('Circular formula: ' + stack.concat(code).join(' → ')); state[code] = 1; for (const d of deps.get(code)) visit(d, stack.concat(code)); state[code] = 2; out.push(byCode[code]); };
    for (const c of comps) visit(c.code, []);
    memo[sig] = out;
    return out;
  }

  function calendarWorkingDays(year, month, weeklyOff = [0]) {
    const n = new Date(year, month, 0).getDate(); let c = 0;
    for (let d = 1; d <= n; d++) if (!weeklyOff.includes(new Date(year, month - 1, d).getDay())) c++;
    return c;
  }

  const api = { calcEmployee, statFor, compile, ptFor, lwfFor, STATE, STAT, calendarWorkingDays };
  if (typeof module !== 'undefined') module.exports = api; else root.PayEngine = api;
})(this);
