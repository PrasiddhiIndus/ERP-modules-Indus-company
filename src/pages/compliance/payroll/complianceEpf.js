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

  // Age 58+: EPS wages stay 0 unless caller already set a manual override to keep (still 0 for pension-ineligible)
  let epsWages;
  if (age58Plus) {
    epsWages =
      employee.epsWagesOverride != null && employee.epsWagesOverride !== ""
        ? Math.max(0, Number(employee.epsWagesOverride) || 0)
        : 0;
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
      if (Number(row.epsWages) !== 0 && !row.epsWagesManual) {
        messages.push("Age 58+ — EPS wages should be 0 (pension not eligible).");
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

/** Apply derived EPF fields onto a row (keeps manual EPS when flagged). */
export function applyEpfDerived(row) {
  const calc = calculateEPFChallan({
    epfWages: row.epfWages,
    age: row.age,
    epsWagesOverride: row.epsWagesManual ? row.epsWages : row.age58Plus ? 0 : null,
  });
  return {
    ...row,
    epsWages: row.epsWagesManual ? Number(row.epsWages) || 0 : calc.epsWages,
    edliWages: calc.edliWages,
    epfContn: calc.epfContn,
    epsContnAmt: calc.epsContnAmt,
    epfBalance: calc.epfBalance,
    age58Plus: calc.age58Plus,
  };
}
