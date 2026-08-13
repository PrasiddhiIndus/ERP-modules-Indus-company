/**
 * Excel export for Site Employee IOM — one sheet, grouped by site name.
 */
import * as XLSX from "xlsx";

const HEADERS = [
  "Site Name",
  "Employee Code",
  "Employee Name",
  "Designation",
  "Salary",
  "Father's Name",
  "Bank Name",
  "Bank Account No",
  "IFSC",
  "Date of Birth",
  "Date of Joining",
  "Rotation Type",
  "Remarks",
  "Contact Number",
  "Aadhaar",
  "PAN",
  "UAN",
  "PF Number",
  "Event Date",
  "Status",
];

function cell(value) {
  if (value == null || value === "") return "";
  return value;
}

/**
 * @param {Array<object>} entries - mapped site IOM entries
 * @param {{ fromDate?: string, toDate?: string }} [meta]
 */
export function downloadSiteIomExcel(entries, meta = {}) {
  const rows = [...(entries || [])].sort((a, b) => {
    const siteCmp = String(a.siteName || "").localeCompare(String(b.siteName || ""), undefined, {
      sensitivity: "base",
    });
    if (siteCmp !== 0) return siteCmp;
    const dateCmp = String(a.eventDate || "").localeCompare(String(b.eventDate || ""));
    if (dateCmp !== 0) return dateCmp;
    return String(a.employeeName || "").localeCompare(String(b.employeeName || ""), undefined, {
      sensitivity: "base",
    });
  });

  const aoa = [
    HEADERS,
    ...rows.map((row) => [
      cell(row.siteName),
      cell(row.employeeCode),
      cell(row.employeeName),
      cell(row.designation),
      cell(row.salaryAmount),
      cell(row.fatherName),
      cell(row.bankName),
      cell(row.bankAccountNo),
      cell(row.ifscCode),
      cell(row.dateOfBirth),
      cell(row.dateOfJoining),
      cell(row.rotationType),
      cell(row.remarks),
      cell(row.contactNumber),
      cell(row.aadhaarNo),
      cell(row.panNo),
      cell(row.uanNo),
      cell(row.pfNo),
      cell(row.eventDate),
      cell(row.entryStatus),
    ]),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = HEADERS.map((h) => ({ wch: Math.max(12, h.length + 2) }));

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Site IOM");

  const from = meta.fromDate || "all";
  const to = meta.toDate || "all";
  const fileName = `Site-Employee-IOM_${from}_to_${to}.xlsx`;
  XLSX.writeFile(book, fileName);
  return fileName;
}

const RECRUITMENT_HEADERS = ["IOM Ref", ...HEADERS];

/**
 * Excel export for recruitment Calling Master IOM (same columns as Site IOM, plus reference).
 * @param {Array<object>} entries
 */
export function downloadRecruitmentIomExcel(entries) {
  const rows = [...(entries || [])].sort((a, b) => {
    const siteCmp = String(a.siteName || "").localeCompare(String(b.siteName || ""), undefined, {
      sensitivity: "base",
    });
    if (siteCmp !== 0) return siteCmp;
    const dateCmp = String(a.eventDate || "").localeCompare(String(b.eventDate || ""));
    if (dateCmp !== 0) return dateCmp;
    return String(a.employeeName || "").localeCompare(String(b.employeeName || ""), undefined, {
      sensitivity: "base",
    });
  });

  const aoa = [
    RECRUITMENT_HEADERS,
    ...rows.map((row) => [
      cell(row.iomReferenceNo),
      cell(row.siteName),
      cell(row.employeeCode),
      cell(row.employeeName),
      cell(row.designation),
      cell(row.salaryAmount),
      cell(row.fatherName),
      cell(row.bankName),
      cell(row.bankAccountNo),
      cell(row.ifscCode),
      cell(row.dateOfBirth),
      cell(row.dateOfJoining),
      cell(row.rotationType || "New"),
      cell(row.remarks),
      cell(row.contactNumber),
      cell(row.aadhaarNo),
      cell(row.panNo),
      cell(row.uanNo),
      cell(row.pfNo),
      cell(row.eventDate),
      cell(row.entryStatus),
    ]),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = RECRUITMENT_HEADERS.map((h) => ({ wch: Math.max(12, h.length + 2) }));

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "IOM");

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `HR-IOM_${stamp}.xlsx`;
  XLSX.writeFile(book, fileName);
  return fileName;
}
