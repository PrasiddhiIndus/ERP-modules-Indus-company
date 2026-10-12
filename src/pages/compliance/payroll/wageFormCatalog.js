const SHEET_KEY = "indus-wage-code-sheets-v1";
const PACK_KEY = "indus-wage-code-packs-v1";

const wageHeader = [
  { key: "establishment", label: "Name of the Establishment" },
  { key: "employer", label: "Name of the Employer" },
  { key: "owner", label: "Name of the Owner" },
  { key: "panTan", label: "PAN/TAN of the Employer" },
  { key: "lin", label: "Labour Identification Number (LIN)", wide: true },
];

export const WAGE_FORMS = {
  "form-i": {
    id: "form-i",
    button: "Form 1",
    title: "FORM-I",
    rule: "(see rule-17 and 42(1), (2) and (3))",
    name: "Register of Wages, Overtime, Fine, Deduction for damage and Loss",
    note: "Signature is not required if the register is maintained electronically.",
    header: wageHeader,
    columns: [
      ["sr", "Sr. No. in Employee Register"],
      ["name", "Name of the employee"],
      ["designation", "Designation / Department"],
      ["duration", "Duration of Payment of Wages (Monthly/Fortnightly/Weekly/Daily/Piece rated)"],
      ["period", "Wage Period From-To"],
      ["days", "Total no. of days worked during the period"],
      ["otHours", "Total overtime (hours worked or production in case of piece workers)"],
      ["basic", "Rates of wages — Basic"],
      ["da", "Rates of wages — DA"],
      ["allowances", "Rates of wages — Allowances"],
      ["otEarning", "Overtime earning"],
      ["fineNature", "Nature of acts and omissions for which fine imposed with date"],
      ["fineAmount", "Amount of fine imposed"],
      ["damage", "Damage or loss caused to the employer by neglect or default of the employee"],
      ["deduction", "Amount of deduction from wages"],
      ["wagesPaid", "Total amount of wages paid"],
      ["payDate", "Date of Payment"],
      ["attDate", "Attendance — Date"],
      ["attSign", "Attendance — Signature"],
    ].map(([key, label]) => ({ key, label })),
  },
  "form-iv": {
    id: "form-iv",
    button: "Form 2",
    title: "FORM II",
    rule: "(see rule 42(3))",
    name: "EMPLOYEE REGISTER",
    note: "Category is Highly Skilled / Skilled / Semi skilled / Unskilled. Specimen signature is not required if the employee register is maintained electronically.",
    header: wageHeader,
    columns: [
      ["sr", "Sr. No."],
      ["code", "Employee Code"],
      ["name", "Name"],
      ["surname", "Surname"],
      ["gender", "Gender"],
      ["fatherSpouse", "Father's / Spouse Name"],
      ["dob", "Date of Birth"],
      ["nationality", "Nationality"],
      ["education", "Education Level"],
      ["doj", "Date of Joining"],
      ["designation", "Designation"],
      ["category", "Category (HS/S/SS/US)"],
      ["employmentType", "Type of Employment"],
      ["mobile", "Mobile No."],
      ["uan", "UAN"],
      ["pan", "PAN"],
      ["esic", "ESIC IP No."],
      ["aadhaar", "AADHAAR"],
      ["account", "Bank A/c Number"],
      ["bank", "Bank"],
      ["ifsc", "Branch (IFSC)"],
      ["presentAddress", "Present Address"],
      ["permanentAddress", "Permanent Address"],
      ["serviceBook", "Service Book No."],
      ["exitDate", "Date of Exit"],
      ["exitReason", "Reason for Exit"],
      ["identification", "Mark of Identification"],
      ["photo", "Photo"],
      ["signature", "Specimen Signature/Thumb Impression"],
      ["remarks", "Remarks"],
    ].map(([key, label]) => ({ key, label })),
  },
  "form-v": {
    id: "form-v",
    button: "Form 3",
    title: "FORM III",
    rule: "(see rule 43)",
    name: "WAGE SLIP",
    note: "Each row is one wage slip. Employer / Pay-in-charge signature is the last column.",
    header: [
      { key: "issueDate", label: "Date of issue" },
      { key: "establishment", label: "Name of the Establishment" },
      { key: "address", label: "Address", wide: true },
      { key: "period", label: "Period" },
    ],
    columns: [
      ["name", "1. Name of employee"],
      ["fatherSpouse", "2. Father's / Spouse name"],
      ["designation", "3. Designation"],
      ["uan", "4. UAN"],
      ["account", "5. Bank Account No."],
      ["wagePeriod", "6. Wage period"],
      ["basic", "7. Rate of wages — Basic"],
      ["da", "7. Rate of wages — D.A."],
      ["allowances", "7. Rate of wages — Other allowances"],
      ["attendance", "8. Total attendance / unit of work done"],
      ["ot", "9. Overtime wages"],
      ["gross", "10. Gross wages payable"],
      ["pf", "11. Total deductions — PF"],
      ["esi", "11. Total deductions — ESI"],
      ["otherDed", "11. Total deductions — Others"],
      ["net", "12. Net wages paid"],
      ["signature", "Employer / Pay-in-charge signature"],
    ].map(([key, label]) => ({ key, label })),
  },
};

export const WAGE_FORM_LIST = ["form-i", "form-iv", "form-v"].map((id) => WAGE_FORMS[id]);

export function blankWageRow(form) {
  return Object.fromEntries(form.columns.map((column) => [column.key, ""]));
}

export function emptyWageHeader(form) {
  return Object.fromEntries(form.header.map((field) => [field.key, ""]));
}

export function listWageSheets() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SHEET_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getWageSheet(id) {
  return listWageSheets().find((sheet) => sheet.id === id) || null;
}

export function saveWageSheet(sheet) {
  const all = listWageSheets();
  const next = { ...sheet, savedAt: new Date().toISOString() };
  const index = all.findIndex((item) => item.id === next.id);
  if (index >= 0) all[index] = next;
  else all.unshift(next);
  localStorage.setItem(SHEET_KEY, JSON.stringify(all));
  return next;
}

export function deleteWageSheet(id) {
  localStorage.setItem(
    SHEET_KEY,
    JSON.stringify(listWageSheets().filter((sheet) => sheet.id !== id))
  );
}

export function newWageId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `wage-${Date.now()}`;
}

export function createWagePack() {
  const forms = {};
  WAGE_FORM_LIST.forEach((form) => {
    forms[form.id] = {
      header: emptyWageHeader(form),
      rows: [blankWageRow(form)],
    };
  });
  return { id: newWageId(), forms };
}

export function listWagePacks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PACK_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWagePack(pack) {
  const all = listWagePacks();
  const next = { ...pack, savedAt: new Date().toISOString() };
  const index = all.findIndex((item) => item.id === next.id);
  if (index >= 0) all[index] = next;
  else all.unshift(next);
  localStorage.setItem(PACK_KEY, JSON.stringify(all));
  return next;
}

export function deleteWagePack(id) {
  localStorage.setItem(PACK_KEY, JSON.stringify(listWagePacks().filter((pack) => pack.id !== id)));
}
