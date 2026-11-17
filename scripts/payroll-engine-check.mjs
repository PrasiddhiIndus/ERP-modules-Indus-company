/**
 * Checks the payroll rule engine against the statutory rules it must keep.
 * Run: node scripts/payroll-engine-check.mjs
 */
import fs from "fs";
import vm from "vm";

const ctx = { console, Math, Date, Object, Set, Map, WeakMap, Error, isFinite, parseFloat, String, Number };
ctx.global = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("src/pages/hr/payroll/indus/runtime/engine.js", "utf8"), ctx);
const E = ctx.PayEngine;
const errors = [];
const eq = (name, got, want) => {
  if (got !== want) errors.push(`${name}: got ${got}, want ${want}`);
};

const site = {
  state: "GJ",
  esi: true,
  rateType: "M",
  rounding: "rupee",
  divisor: { type: "fixed", days: 26 },
  params: {},
  components: [
    { code: "BASIC_E", type: "E", formula: "RATE/WD*PD", pf: true, esi: true },
    { code: "PF", type: "D", formula: null },
    { code: "ESI", type: "D", formula: null },
    { code: "PT", type: "D", formula: null },
    { code: "LWF", type: "D", formula: null },
  ],
};

function pay(emp, att, month, year = 2026, extraSite = site) {
  return E.calcEmployee(extraSite, emp, att, {}, { month, year, calendarWD: 26 });
}

const high = pay({ code: "1", rate: 26000, pf: true, sex: "M" }, { PD: 26 }, 6);
eq("PF ceiling 12% of 15000", high.lines.PF, 1800);
eq("ESI off above 21000", high.lines.ESI, 0);
eq("GJ PT above 11999", high.lines.PT, 200);
eq("GJ LWF in June", high.lines.LWF, 6);
eq("net high", high.NET, 26000 - 1800 - 200 - 6);
eq("EPS", high.er.EPS, Math.round(15000 * 0.0833));
eq("employer EPF is employee PF minus EPS", high.er.EPF, 1800 - high.er.EPS);
eq("EDLI", high.er.EDLI, Math.round(15000 * 0.005));
eq("PF admin", high.er.ADMIN, Math.round(15000 * 0.005));

const april = pay({ code: "1", rate: 26000, pf: true, sex: "M" }, { PD: 26 }, 4);
eq("GJ LWF not in April", april.lines.LWF, 0);

const edge = pay({ code: "2", rate: 11999, pf: true, sex: "M" }, { PD: 26 }, 6);
eq("GJ PT zero at 11999", edge.lines.PT, 0);
const over = pay({ code: "3", rate: 12000, pf: true, sex: "M" }, { PD: 26 }, 6);
eq("GJ PT 200 at 12000", over.lines.PT, 200);

const covered = pay({ code: "4", rate: 20000, pf: true, sex: "M" }, { PD: 26 }, 4);
eq("ESI 0.75% of wages", covered.lines.ESI, Math.round(20000 * 0.0075));
eq("employer ESI ceil 3.25%", covered.er.ESI, Math.ceil(20000 * 0.0325));

const noPf = pay({ code: "5", rate: 20000, pf: false, sex: "M" }, { PD: 26 }, 4);
eq("PF zero when employee pf is false", noPf.lines.PF, 0);
eq("employer PF zero when employee PF is zero", noPf.er.EPF + noPf.er.EPS + noPf.er.EDLI + noPf.er.ADMIN, 0);

const mh = { ...site, state: "MH" };
eq("MH women exempt", E.calcEmployee(mh, { code: "6", rate: 20000, pf: true, sex: "F" }, { PD: 26 }, {}, { month: 2, year: 2026 }).lines.PT, 0);
eq("MH February top slab", E.calcEmployee(mh, { code: "7", rate: 20000, pf: true, sex: "M" }, { PD: 26 }, {}, { month: 2, year: 2026 }).lines.PT, 300);
eq("MH April top slab", E.calcEmployee(mh, { code: "8", rate: 20000, pf: true, sex: "M" }, { PD: 26 }, {}, { month: 4, year: 2026 }).lines.PT, 200);

const tn = { ...site, state: "TN" };
eq("TN not deducted in April", E.calcEmployee(tn, { code: "9", rate: 20000, pf: false, sex: "M" }, { PD: 26 }, {}, { month: 4, year: 2026 }).lines.PT, 0);
eq("TN deducted in September", E.calcEmployee(tn, { code: "9", rate: 20000, pf: false, sex: "M" }, { PD: 26 }, {}, { month: 9, year: 2026 }).lines.PT, 208);

const zero = pay({ code: "z", rate: 26000, pf: true }, { PD: 26, WD: 0 }, 4);
eq("divide by zero is 0", zero.lines.BASIC_E, 0);

const splitSite = {
  ...site,
  stat: { key: "NEW", PF_CEIL: 25000, ESI_CEIL: 42000, ESI_TEST: "PFW", ESI_FROM: "2026-10-01", PF_FROM: "2026-09-17", SPLIT: "DAYS", PF_PREV: 15000 },
};
const neu = E.calcEmployee(splitSite, { code: "n", rate: 30000, pf: true, sex: "M" }, { PD: 26 }, {}, { month: 10, year: 2026 });
eq("new pattern PF ceiling 25000", neu.lines.PF, 3000);
eq("new pattern ESI tested on PF wages under 42000", neu.lines.ESI, Math.round(30000 * 0.0075));

const codeSite = {
  ...site,
  labourCode50: true,
  components: [
    { code: "BASIC_E", type: "E", formula: "RATE*0.4", pf: true, esi: true },
    { code: "HRA", type: "E", formula: "RATE*0.6", pf: false, esi: true },
    { code: "PF", type: "D", formula: null },
    { code: "ESI", type: "D", formula: null },
    { code: "PT", type: "D", formula: null },
    { code: "LWF", type: "D", formula: null },
  ],
};
const add = E.calcEmployee(codeSite, { code: "c", rate: 20000, pf: true, sex: "M" }, { PD: 26 }, {}, { month: 4, year: 2026 });
eq("labour code 50% add-back", add.codeWagesAddBack, 2000);

console.log(errors.length ? `ERRORS ${JSON.stringify(errors, null, 2)}` : "ERRORS []");
process.exit(errors.length ? 1 : 0);
