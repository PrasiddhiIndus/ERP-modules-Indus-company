/**
 * Axis bank payment upload format — maps salary-process lines into bank columns.
 * Yellow columns come from salary process; all cells remain editable on the sheet.
 */

/** Company debit account used when paying salaries (Axis Bank, Indus). */
export const DEFAULT_DEBIT_ACCOUNT_NO = "920030061304640";

/** Axis IFSC bank code (real Axis codes start with UTIB). */
const AXIS_IFSC_PREFIXES = ["UTIB"];

/** True when employee bank is Axis (intrabank → Payment Method "I"). */
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

/** Payment Method Name: I = Axis (same bank), N = other bank (NEFT/RTGS). */
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

/** Columns filled from salary process (still editable on the sheet). */
export const SALARY_SOURCED_KEYS = new Set([
  "paymentAmount",
  "beneficiaryName",
  "beneficiaryAccountNo",
  "receiverIfsc",
]);

/**
 * Map one salary-process line + optional defaults → bank format row.
 * @param {object} line salary sheet line
 * @param {object} defaults optional fields applied when mapping
 */
export function mapSalaryLineToBankRow(line, defaults = {}) {
  const ifsc = String(line.ifsc || line.ifsc_code || "").trim().toUpperCase();
  const bankName = String(line.bank_name || line.bankName || "").trim();
  const net =
    line.net_salary ??
    line.net_payable ??
    line.netPayable ??
    line.payment_amount ??
    0;
  const amount = Math.round(Number(net) || 0);

  return {
    id: line.id || line.employee_code || line.employeeCode || cryptoRandomId(),
    employeeCode: line.employee_code || line.employeeCode || "",
    bankName: bankName || (isAxisBank({ ifsc }) ? "Axis Bank" : ""),
    paymentMethod: paymentMethodName({ ifsc, bankName }),
    paymentAmount: amount,
    activationDate: defaults.activationDate || line.activation_date || "",
    beneficiaryName: String(line.employee_name || line.full_name || line.name || "").trim(),
    beneficiaryAccountNo: String(line.account_no || line.bank_account_no || "").trim(),
    blank: "",
    emailBody: defaults.emailBody ?? line.email_body ?? "",
    debitAccountNo: defaults.debitAccountNo || DEFAULT_DEBIT_ACCOUNT_NO,
    crnNo: defaults.crnNo ?? line.crn_no ?? "",
    receiverIfsc: ifsc,
    receiverAccountType: defaults.receiverAccountType || "10",
  };
}

function cryptoRandomId() {
  return `bf_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Demo salary-process employees (mix of Axis + other banks) for layout preview.
 */
export const DEMO_SALARY_LINES = [
  {
    id: "demo_1",
    employee_code: "IFSPL0012",
    employee_name: "Rahul Raj R",
    account_no: "5010023489123",
    ifsc: "HDFC0001234",
    bank_name: "HDFC Bank",
    net_salary: 41100,
  },
  {
    id: "demo_2",
    employee_code: "IFSPL0045",
    employee_name: "Priya Sharma",
    account_no: "9182736450123",
    ifsc: "UTIB0000217",
    bank_name: "Axis Bank",
    net_salary: 34000,
  },
  {
    id: "demo_3",
    employee_code: "IFSPL0078",
    employee_name: "Amit Patel",
    account_no: "1122334455667",
    ifsc: "ICIC0000789",
    bank_name: "ICICI Bank",
    net_salary: 25800,
  },
  {
    id: "demo_4",
    employee_code: "IFSPL0091",
    employee_name: "Sneha Nair",
    account_no: "7788990011223",
    ifsc: "UTIB0005566",
    bank_name: "Axis Bank",
    net_salary: 39900,
  },
  {
    id: "demo_5",
    employee_code: "IFSPL0188",
    employee_name: "Kavitha Reddy",
    account_no: "5566778899001",
    ifsc: "SBIN0000456",
    bank_name: "State Bank of India",
    net_salary: 49200,
  },
];

export function buildDemoBankRows(defaults = {}) {
  return DEMO_SALARY_LINES.map((line) => mapSalaryLineToBankRow(line, defaults));
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
    row.debitAccountNo || "",
    row.crnNo || "",
    row.receiverIfsc || "",
    row.receiverAccountType || "10",
  ];
}

export function formatInr(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-IN");
}
