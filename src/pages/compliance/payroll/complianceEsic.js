/**
 * ESIC return row validation helpers.
 */

function digitsOnly(v) {
  return String(v || "").replace(/\D/g, "");
}

/** IP name: letters and spaces only (ESIC portal rule). */
export function sanitizeIpName(name) {
  return String(name || "")
    .replace(/[^A-Za-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isValidIpName(name) {
  const s = String(name || "").trim();
  if (!s) return false;
  return /^[A-Za-z]+(?: [A-Za-z]+)*$/.test(s);
}

export function isValidIpNumber(ip) {
  const d = digitsOnly(ip);
  return d.length === 10;
}

/**
 * @returns {{ ok: boolean, errors: Array<{ rowIndex: number, employeeName: string, ipNumber: string, messages: string[] }> }}
 */
export function validateEsicRows(rows = []) {
  const errors = [];
  const ipSeen = new Map();

  rows.forEach((row, idx) => {
    const messages = [];
    const ip = digitsOnly(row.ipNumber);
    const name = String(row.ipName || "").trim();
    const days = Number(row.daysPaid);
    const wages = Number(row.monthlyWages);
    const reason = String(row.reasonCode ?? "").trim();
    const lastDay = String(row.lastWorkingDay || "").trim();

    if (!ip) messages.push("ESIC IP number is missing.");
    else if (ip.length !== 10) messages.push(`IP number must be exactly 10 digits (got ${ip.length}).`);

    if (!name) messages.push("IP name is missing.");
    else if (!isValidIpName(name)) {
      messages.push("IP name must contain only alphabets and spaces.");
    }

    if (!Number.isFinite(days) || days < 0 || days > 31) {
      messages.push("Days paid must be between 0 and 31.");
    }

    if (!Number.isFinite(wages) || wages < 0) {
      messages.push("Monthly wages must be a valid amount.");
    }

    if (days === 0) {
      if (reason === "" || !/^\d+$/.test(reason)) {
        messages.push("Zero working days — enter a numeric reason code (use 0 if none).");
      }
    }

    if (lastDay) {
      if (!/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(lastDay)) {
        messages.push("Last working day must be DD/MM/YYYY or DD-MM-YYYY.");
      }
    }

    if (ip) {
      if (ipSeen.has(ip)) {
        messages.push(`Duplicate IP number — also used by row ${ipSeen.get(ip) + 1}.`);
      } else {
        ipSeen.set(ip, idx);
      }
    }

    if (messages.length) {
      errors.push({
        rowIndex: idx,
        employeeName: name || "—",
        ipNumber: ip || "—",
        employeeCode: row.employeeCode || "",
        messages,
      });
    }
  });

  return { ok: errors.length === 0, errors };
}
