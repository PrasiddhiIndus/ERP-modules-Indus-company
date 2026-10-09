export const MONTHS = ["2026-07", "2026-08", "2026-09", "2026-10"];
export const PAYSLIP_COMPANY = "Indus Fire Safety Pvt Ltd";

export function monthLabel(month) {
  const date = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return month;
  return date.toLocaleString("en-IN", { month: "short", year: "numeric" });
}

export function formatInr(value) {
  return `₹${Math.round(Number(value) || 0).toLocaleString("en-IN")}`;
}

function hashSeed(text) {
  let hash = 7;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

export function attendanceFor(employee, month) {
  const hash = hashSeed(`${employee.id}${month}`);
  const leave = hash % 3;
  const absent = (hash >> 3) % 4 === 0 ? 1 : 0;
  const weekOff = 4;
  const present = 30 - leave - absent - weekOff;
  return {
    lv: leave,
    ab: absent,
    wo: weekOff,
    pr: present,
    ot: (hash % 17) + (employee.shift === "Night" ? 4 : 0),
    ng: employee.shift === "Night" ? present : hash % 4,
  };
}

export function evalFormula(formula, scope) {
  const expression = String(formula || "").trim();
  if (!expression) throw new Error("Formula is empty");
  if (!/^[\w\s+\-*/().,?<>=:]+$/.test(expression)) {
    throw new Error("Formula has unsupported characters");
  }
  if (/\b(constructor|prototype|window|document|globalThis|Function|eval|import|this)\b/i.test(expression)) {
    throw new Error("Formula is not allowed");
  }
  const keys = Object.keys(scope);
  const fn = new Function(...keys, "min", "max", "round", `return (${expression})`);
  const value = fn(...keys.map((key) => scope[key]), Math.min, Math.max, Math.round);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Formula did not return a number");
  }
  return value;
}

export function formulaScope(state, extra = {}) {
  const scope = {
    RATE: 1,
    PAYDAYS: 1,
    OTHRS: 1,
    NIGHTS: 1,
    FINES: 1,
    GROSS: 1,
    ...extra,
  };
  state.comps.forEach((component) => {
    if (scope[component.c] == null) scope[component.c] = 1;
  });
  return scope;
}

export function validateFormula(state, formula, extra = {}) {
  evalFormula(formula, formulaScope(state, extra));
}

export function componentName(state, siteId, code) {
  return state.cfg[siteId]?.names?.[code] || state.comps.find((item) => item.c === code)?.n || code;
}

export function componentFormula(state, siteId, code) {
  return state.cfg[siteId]?.fm?.[code] || state.comps.find((item) => item.c === code)?.f || "0";
}

export function siteName(state, siteId) {
  return state.sites.find((site) => site.id === siteId)?.name || "";
}

export function calcEmployee(state, employee, month, rate) {
  const attendance = attendanceFor(employee, month);
  const config = state.cfg[employee.site] || { inc: [], names: {}, fm: {} };
  const scope = {
    RATE: rate || employee.basic,
    PAYDAYS: attendance.pr + attendance.lv + attendance.wo,
    OTHRS: attendance.ot,
    NIGHTS: attendance.ng,
    FINES: employee.fine || 0,
    GROSS: 0,
  };
  state.comps.forEach((component) => {
    scope[component.c] = 0;
  });

  const active = state.comps.filter((component) => component.fx || config.inc.includes(component.c));
  const lines = [];
  let gross = 0;
  let deductions = 0;
  let overtime = 0;

  for (const type of ["E", "D"]) {
    for (const component of active.filter((item) => item.t === type)) {
      if (type === "D" && !scope.GROSS) scope.GROSS = gross;
      let amount = 0;
      try {
        amount = Math.max(0, Math.round(evalFormula(componentFormula(state, employee.site, component.c), scope)));
      } catch {
        amount = 0;
      }
      scope[component.c] = amount;
      lines.push({
        c: component.c,
        n: componentName(state, employee.site, component.c),
        t: type,
        v: amount,
      });
      if (type === "E") gross += amount;
      else deductions += amount;
      if (component.c === "OT") overtime = amount;
    }
  }

  return { a: attendance, lines, gross, ded: deductions, net: gross - deductions, ot: overtime };
}

export function siteRows(state, month, siteId) {
  const paid = state.paid[month]?.[siteId];
  if (paid) return paid.rows;
  return state.emps
    .filter((employee) => employee.site === siteId)
    .map((employee) => ({
      e: { id: employee.id, name: employee.name, desig: employee.desig },
      c: calcEmployee(state, employee, month),
    }));
}

export function siteTotals(state, month, siteId) {
  const paid = state.paid[month]?.[siteId];
  const rows = siteRows(state, month, siteId);
  const sum = (key) => rows.reduce((total, row) => total + (row.c[key] || 0), 0);
  return {
    n: rows.length,
    gross: sum("gross"),
    net: sum("net"),
    ot: sum("ot"),
    ded: sum("ded"),
    paid: Boolean(paid),
    date: paid?.date || "",
    rows,
  };
}

export function processSites(state, month, siteIds) {
  const monthPaid = { ...(state.paid[month] || {}) };
  const date = new Date().toISOString().slice(0, 10);
  siteIds.forEach((siteId) => {
    monthPaid[siteId] = {
      date,
      rows: state.emps
        .filter((employee) => employee.site === siteId)
        .map((employee) => ({
          e: { id: employee.id, name: employee.name, desig: employee.desig },
          c: calcEmployee(state, employee, month),
        })),
    };
  });
  return { ...state, paid: { ...state.paid, [month]: monthPaid } };
}

function buildEmployees(sites) {
  const rows = [
    ["Rajesh Patel", "s1", "Fire Officer", 22000, "Day", "Sunday", "12h · 6 on / 1 off"],
    ["Amit Solanki", "s1", "Fireman", 18500, "Night", "Wednesday", "12h · 6 on / 1 off"],
    ["Vikram Rathod", "s1", "Safety Supervisor", 24000, "Day", "Sunday", "8h · 6 on / 1 off"],
    ["Sanjay Parmar", "s1", "Fireman", 16000, "Night", "Monday", "12h · 6 on / 1 off"],
    ["Kiran Desai", "s2", "Fire Officer", 21000, "Day", "Tuesday", "9h · 6 on / 1 off"],
    ["Mahesh Chauhan", "s2", "Safety Steward", 14500, "Day", "Sunday", "9h · 6 on / 1 off"],
    ["Jignesh Shah", "s2", "Fireman", 15500, "Night", "Thursday", "12h · 6 on / 1 off"],
    ["Pooja Vyas", "s2", "Safety Steward", 14000, "Day", "Sunday", "8h · 6 on / 1 off"],
    ["Dinesh Makwana", "s3", "Fireman", 17000, "Night", "Friday", "12h · 6 on / 1 off"],
    ["Harsh Trivedi", "s3", "Safety Supervisor", 26000, "Day", "Sunday", "8h · 6 on / 1 off"],
    ["Nilesh Gohil", "s3", "Fireman", 16500, "Day", "Saturday", "12h · 6 on / 1 off"],
    ["Bhavesh Joshi", "s3", "Fire Officer", 23000, "Night", "Sunday", "12h · 6 on / 1 off"],
  ];

  return rows.map((row, index) => {
    const site = sites.find((item) => item.id === row[1]);
    const otherSite = sites[row[1] === "s1" ? 0 : 1];
    return {
      id: `FS${101 + index}`,
      name: row[0],
      site: row[1],
      desig: row[2],
      basic: row[3],
      shift: row[4],
      wo: row[5],
      pat: row[6],
      joined: `2023-0${(index % 9) + 1}-10`,
      warns: index % 5 === 3 ? [{ d: "2026-08-14", r: "Late reporting on duty", fine: 300 }] : [],
      tr: index % 4 === 1 ? [{ d: "2025-11-01", from: "Dahej Refinery Plant", to: otherSite?.name || site?.name }] : [],
      fine: index % 5 === 3 ? 300 : 0,
      cl: 12,
      sl: 7,
    };
  });
}

export function createSeedState() {
  const sites = [
    { id: "s1", name: "Dahej Refinery Plant", client: "Petrochem Ltd", loc: "Dahej" },
    { id: "s2", name: "Vadodara Metro Mall", client: "Metro Retail", loc: "Vadodara" },
    { id: "s3", name: "Bharuch Chemical Park", client: "ChemPark Pvt Ltd", loc: "Bharuch" },
  ];
  const comps = [
    { c: "BASIC", n: "Basic Pay", t: "E", fx: 1, f: "RATE*PAYDAYS/30" },
    { c: "HRA", n: "HRA", t: "E", fx: 1, f: "BASIC*0.4" },
    { c: "CONV", n: "Conveyance", t: "E", f: "1200*PAYDAYS/30" },
    { c: "NIGHT", n: "Night Shift Allowance", t: "E", f: "NIGHTS*150" },
    { c: "UNI", n: "Uniform Allowance", t: "E", f: "500" },
    { c: "SITE", n: "Site Hazard Allowance", t: "E", f: "800*PAYDAYS/30" },
    { c: "OT", n: "Overtime", t: "E", fx: 1, f: "OTHRS*(RATE/30/8)*2" },
    { c: "PF", n: "Provident Fund (Emp)", t: "D", fx: 1, f: "min(BASIC,15000)*0.12" },
    { c: "ESI", n: "ESI (Emp)", t: "D", f: "GROSS<=21000?GROSS*0.0075:0" },
    { c: "PT", n: "Professional Tax", t: "D", fx: 1, f: "GROSS>=12000?200:0" },
    { c: "FINE", n: "Warning Fine / Advance", t: "D", f: "FINES" },
  ];
  const cfg = {
    s1: {
      inc: ["CONV", "NIGHT", "SITE", "ESI"],
      names: { SITE: "Refinery Hazard Pay" },
      fm: { OT: "OTHRS*(RATE/30/8)*2.5" },
    },
    s2: { inc: ["CONV", "UNI", "ESI", "FINE"], names: {}, fm: {} },
    s3: { inc: ["NIGHT", "SITE"], names: { BASIC: "Basic Salary" }, fm: {} },
  };
  const emps = buildEmployees(sites);
  const rev = [
    { emp: "FS102", date: "2026-07-01", old: 17000, nw: 18500, reason: "Annual increment", by: "HR Admin" },
  ];

  let state = { sites, comps, cfg, emps, rev, paid: {} };
  state = processSites(state, "2026-07", ["s1", "s2", "s3"]);
  state = processSites(state, "2026-08", ["s1", "s2", "s3"]);
  state = processSites(state, "2026-09", ["s1", "s2"]);
  return state;
}
