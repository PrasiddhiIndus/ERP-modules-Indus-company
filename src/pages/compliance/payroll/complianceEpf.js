/**
 * EPF challan calculation + validation helpers.
 */

/** Standard half-up round to integer. */
export function roundHalfUp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

export function ageFromDob(dob, asOfDate = new Date()) {
  if (!dob) return null;
  const d = new Date(String(dob).slice(0, 10));
  if (Number.isNaN(d.getTime())) return null;
  const asOf = asOfDate instanceof Date ? asOfDate : new Date(asOfDate);
  let age = asOf.getFullYear() - d.getFullYear();
  const m = asOf.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < d.getDate())) age -= 1;
  return age;
}

/**
 * Pure EPF challan calc for one employee.
 * Does not mutate UAN, name, gross, EPF wages, NCP, refund — only derived fields.
 * @param {{ epfWages: number, age?: number|null, epsWagesOverride?: number|null }} employee
 */
export function calculateEPFChallan(employee = {}) {
  const epfWages = Math.max(0, Number(employee.epfWages) || 0);
  const age = employee.age == null || employee.age === "" ? null : Number(employee.age);
  const age58Plus = age != null && Number.isFinite(age) && age >= 58;

  // Age 58+: pension is not eligible, so EPS wages stay 0 even if an amount was typed.
  let epsWages;
  if (age58Plus) {
    epsWages = 0;
  } else if (employee.epsWagesOverride != null && employee.epsWagesOverride !== "") {
    epsWages = Math.max(0, Number(employee.epsWagesOverride) || 0);
  } else {
    epsWages = epfWages > 15000 ? 15000 : epfWages;
  }

  const edliWages =
    epsWages !== 0 ? epsWages : epfWages > 15000 ? 15000 : epfWages;

  const epfContn = roundHalfUp((epfWages * 12) / 100);
  const epsContnAmt = roundHalfUp((epsWages * 8.33) / 100);
  const epfBalance = epfContn - epsContnAmt;

  return {
    epsWages,
    edliWages,
    epfContn,
    epsContnAmt,
    epfBalance,
    age58Plus,
  };
}

function digitsOnly(v) {
  return String(v || "").replace(/\D/g, "");
}

/**
 * Validate EPF rows before download.
 * @returns {{ ok: boolean, errors: Array<{ rowIndex: number, employeeName: string, uan: string, messages: string[] }> }}
 */
export function validateEpfRows(rows = []) {
  const errors = [];
  const uanSeen = new Map();

  rows.forEach((row, idx) => {
    const messages = [];
    const uan = digitsOnly(row.uan);
    const name = String(row.name || "").trim();
    const gross = Number(row.grossWages);
    const epfWages = Number(row.epfWages);

    if (!uan) messages.push("UAN is missing.");
    else if (uan.length !== 12) messages.push(`UAN must be 12 digits (got ${uan.length}).`);

    if (!name) messages.push("Employee name is missing.");

    if (!Number.isFinite(gross) || gross < 0) messages.push("Gross wages must be a valid amount.");
    if (!Number.isFinite(epfWages) || epfWages < 0) messages.push("EPF wages must be a valid amount.");
    if (Number.isFinite(gross) && Number.isFinite(epfWages) && epfWages > gross) {
      messages.push("EPF wages cannot be higher than gross wages.");
    }
    const ncp = Number(row.ncpDays);
    if (Number.isFinite(ncp) && ncp > 31) {
      messages.push("NCP days cannot be more than 31.");
    }

    if (uan) {
      if (uanSeen.has(uan)) {
        messages.push(`Duplicate UAN — also used by row ${uanSeen.get(uan) + 1}.`);
      } else {
        uanSeen.set(uan, idx);
      }
    }

    const calc = calculateEPFChallan({
      epfWages,
      age: row.age,
      epsWagesOverride: row.epsWagesManual ? row.epsWages : null,
    });
    if (row.age58Plus || calc.age58Plus) {
      const epsShown = row.epsWagesManual ? Number(row.epsWages) : calc.epsWages;
      if (epsShown !== 0) {
        messages.push("Age 58 or above — EPS wages must be 0. Pension is not eligible.");
      }
    }

    if (messages.length) {
      errors.push({
        rowIndex: idx,
        employeeName: name || "—",
        uan: uan || "—",
        employeeCode: row.employeeCode || "",
        messages,
      });
    }
  });

  return { ok: errors.length === 0, errors };
}

/** Column totals for the challan review grid (same idea as SUM on the sheet). */
export function sumEpfTotals(rows = []) {
  const keys = [
    "grossWages",
    "epfWages",
    "epsWages",
    "edliWages",
    "epfContn",
    "epsContnAmt",
    "epfBalance",
    "ncpDays",
    "refundOfAdvance",
    "presentDays",
  ];
  const totals = {};
  for (const key of keys) totals[key] = 0;
  for (const row of rows) {
    for (const key of keys) totals[key] += Number(row?.[key]) || 0;
  }
  return totals;
}

/** Apply derived EPF fields onto a row. A typed EPS amount is kept only under age 58. */
export function applyEpfDerived(row) {
  const ageNum = row.age === "" || row.age == null ? null : Number(row.age);
  const senior = ageNum != null && Number.isFinite(ageNum) && ageNum >= 58;
  const calc = calculateEPFChallan({
    epfWages: row.epfWages,
    age: row.age,
    epsWagesOverride: senior ? null : row.epsWagesManual ? row.epsWages : null,
  });
  return {
    ...row,
    epsWages: !senior && row.epsWagesManual ? Number(row.epsWages) || 0 : calc.epsWages,
    edliWages: calc.edliWages,
    epfContn: calc.epfContn,
    epsContnAmt: calc.epsContnAmt,
    epfBalance: calc.epfBalance,
    age58Plus: calc.age58Plus,
  };
}
