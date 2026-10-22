/**
 * Axis bank payment format — maps processed salary lines into bank columns.
 */

/** Company debit account (Axis) — fixed on every row. */
export const DEFAULT_DEBIT_ACCOUNT_NO = "920030061304640";

/** Savings account type code for Axis upload format. */
export const DEFAULT_RECEIVER_ACCOUNT_TYPE = "10";

const AXIS_IFSC_PREFIXES = ["UTIB"];

export function isAxisBank({ ifsc = "", bankName = "" } = {}) {
  const code = String(ifsc || "")
    .trim()
    .toUpperCase();
  if (AXIS_IFSC_PREFIXES.some((p) => code.startsWith(p))) return true;
  const name = String(bankName || "")
    .trim()
    .toLowerCase();
  return /\baxis\b/.test(name);
}

/** Payment Method Name: I = Axis (same bank), N = other bank. */
export function paymentMethodName(source) {
  return isAxisBank(source) ? "I" : "N";
}

export const BANK_FORMAT_HEADERS = [
  "Payment Method Name",
  "Payment Amount (Request)",
  "Activation Date",
  "Beneficiary Name (Request)",
  "Beneficiary Account No",
  "blank",
  "Email body",
  "Debit Account No",
  "CRN No.",
  "Receiver IFSC Code",
  "Receiver Account Type",
];

/**
 * Map one processed salary line → bank format row.
 * @param {object} line salary month line
 * @param {object} defaults optional fields (debit is always company fixed unless overridden)
 */
export function mapSalaryLineToBankRow(line, defaults = {}) {
  const ifsc = String(line.ifsc || line.ifsc_code || "").trim().toUpperCase();
  const bankName = String(line.bank_name || line.bankName || "").trim();
  const snap =
    line.source_snapshot_json && typeof line.source_snapshot_json === "object"
      ? line.source_snapshot_json
      : {};
  const accountNo = String(
    line.account_no || line.bank_account_no || snap.account_no || ""
  ).trim();
  const resolvedIfsc = ifsc || String(snap.ifsc || "").trim().toUpperCase();
  const net =
    line.net_salary ??
    line.net_payable ??
    line.netPayable ??
    line.bank_amount ??
    0;
  const amount = Math.round(Number(net) || 0);
  const debit =
    String(defaults.debitAccountNo || DEFAULT_DEBIT_ACCOUNT_NO).trim() ||
    DEFAULT_DEBIT_ACCOUNT_NO;

  return {
    id: line.id || `emp_${line.employee_master_id || line.employee_code || cryptoRandomId()}`,
    salaryLineId: line.id || null,
    employeeMasterId:
      line.employee_master_id != null ? String(line.employee_master_id) : "",
    employeeCode: line.employee_code || line.employeeCode || "",
    bankName: bankName || (isAxisBank({ ifsc: resolvedIfsc }) ? "Axis Bank" : ""),
    paymentMethod: paymentMethodName({ ifsc: resolvedIfsc, bankName }),
    paymentAmount: amount,
    activationDate: defaults.activationDate || line.activation_date || "",
    beneficiaryName: String(
      line.employee_name || line.full_name || line.name || ""
    ).trim(),
    beneficiaryAccountNo: accountNo,
    blank: "",
    emailBody: defaults.emailBody ?? line.email_body ?? "",
    debitAccountNo: debit,
    crnNo: defaults.crnNo ?? line.crn_no ?? "",
    receiverIfsc: resolvedIfsc,
    receiverAccountType:
      String(defaults.receiverAccountType || DEFAULT_RECEIVER_ACCOUNT_TYPE).trim() ||
      DEFAULT_RECEIVER_ACCOUNT_TYPE,
  };
}

function cryptoRandomId() {
  return `bf_${Math.random().toString(36).slice(2, 10)}`;
}

/** Build bank rows from processed salary lines (company debit + account type 10). */
export function buildBankRowsFromSalaryLines(lines = [], defaults = {}) {
  return (lines || []).map((line) =>
    mapSalaryLineToBankRow(line, {
      debitAccountNo: DEFAULT_DEBIT_ACCOUNT_NO,
      receiverAccountType: DEFAULT_RECEIVER_ACCOUNT_TYPE,
      ...defaults,
    })
  );
}

/**
 * Prefer saved edits when present; refresh salary-sourced fields from live process
 * for employees still on the sheet; drop people no longer processed; add new ones.
 */
export function mergeSavedWithSalary(salaryRows = [], savedRows = []) {
  const byEmp = new Map();
  for (const r of savedRows || []) {
    const key = String(r.employeeMasterId || r.employeeCode || r.id || "");
    if (key) byEmp.set(key, r);
  }

  const merged = (salaryRows || []).map((sal) => {
    const key = String(sal.employeeMasterId || sal.employeeCode || sal.id || "");
    const saved = key ? byEmp.get(key) : null;
    if (!saved) return sal;
    return {
      ...sal,
      // Salary-sourced (always from process)
      paymentMethod: sal.paymentMethod,
      paymentAmount: sal.paymentAmount,
      beneficiaryName: sal.beneficiaryName,
      beneficiaryAccountNo: sal.beneficiaryAccountNo,
      receiverIfsc: sal.receiverIfsc,
      debitAccountNo: DEFAULT_DEBIT_ACCOUNT_NO,
      salaryLineId: sal.salaryLineId,
      employeeMasterId: sal.employeeMasterId,
      employeeCode: sal.employeeCode,
      // User edits from DB
      activationDate: saved.activationDate ?? sal.activationDate,
      blank: saved.blank ?? sal.blank,
      emailBody: saved.emailBody ?? sal.emailBody,
      crnNo: saved.crnNo ?? sal.crnNo,
      receiverAccountType:
        saved.receiverAccountType || DEFAULT_RECEIVER_ACCOUNT_TYPE,
      id: saved.id || sal.id,
    };
  });

  return merged;
}

export function bankRowToExportArray(row) {
  return [
    row.paymentMethod,
    row.paymentAmount,
    row.activationDate || "",
    row.beneficiaryName,
    row.beneficiaryAccountNo,
    row.blank || "",
    row.emailBody || "",
    row.debitAccountNo || DEFAULT_DEBIT_ACCOUNT_NO,
    row.crnNo || "",
    row.receiverIfsc || "",
    row.receiverAccountType || DEFAULT_RECEIVER_ACCOUNT_TYPE,
  ];
}

export function formatInr(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-IN");
}
