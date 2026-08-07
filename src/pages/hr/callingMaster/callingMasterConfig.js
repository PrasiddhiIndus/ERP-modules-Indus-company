import { Briefcase, Building2, PhoneCall, UserRound } from "lucide-react";

export const CALLING_MASTER_ROUTE = "calling-master";
export const CALLING_MASTER_DROPDOWNS_EVENT = "hr-calling-master-dropdowns-updated";
export const CALLING_MASTER_RECORDS_EVENT = "hr-calling-master-records-updated";

export const CALLING_PIPELINE_TABS = [
  { key: "Calling", label: "Calling" },
  { key: "Shortlisted", label: "Shortlisted" },
  { key: "Selected", label: "Selected" },
];

/** Fixed pre-joining checklist — not editable by HR. */
export const JOINING_CHECKLIST_ITEMS = [
  { key: "aadhaar", label: "Aadhaar" },
  { key: "pan", label: "PAN" },
  { key: "photo", label: "Photo" },
  { key: "bankDetails", label: "Bank details" },
  { key: "educationCertificates", label: "Education certificates" },
  { key: "policeVerification", label: "Police verification" },
];

export const DEFAULT_IOM_DEPARTMENTS = ["IT", "Admin", "Payroll", "Site", "Accounts"];

export const OFFER_RESPONSE_STATUSES = ["Generated", "Accepted", "Declined", "Expired"];
export const JOINING_WORKFLOW_STATUSES = ["Pending", "Joined", "No-show"];
export const DEFAULT_OFFER_EXPIRY_DAYS = 7;

/** Empty checklist item: received flag + optional uploaded file metadata. */
export function emptyJoiningChecklistItem() {
  return { received: false, file: null };
}

export function emptyJoiningChecklist() {
  return JOINING_CHECKLIST_ITEMS.reduce((acc, item) => {
    acc[item.key] = emptyJoiningChecklistItem();
    return acc;
  }, {});
}

/** Normalize one uploaded checklist document (R2 metadata). */
export function normalizeJoiningChecklistFile(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const path = value.trim();
    if (!path) return null;
    return {
      filePath: path,
      objectKey: path,
      fileName: path.slice(path.lastIndexOf("/") + 1) || path,
      contentType: "",
      bucket: "indus-erp-uploads",
      uploadedAt: "",
    };
  }
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const filePath = String(value.filePath || value.objectKey || "").trim();
  if (!filePath) return null;
  return {
    filePath,
    objectKey: String(value.objectKey || filePath).trim(),
    fileName: String(value.fileName || filePath.slice(filePath.lastIndexOf("/") + 1) || "file").trim(),
    contentType: String(value.contentType || "").trim(),
    bucket: String(value.bucket || "indus-erp-uploads").trim(),
    uploadedAt: String(value.uploadedAt || "").trim(),
  };
}

/**
 * Normalize one checklist entry.
 * Supports legacy boolean values and richer `{ received, file }` objects.
 */
export function normalizeJoiningChecklistItem(value) {
  if (value === true || value === false) {
    return { received: value, file: null };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyJoiningChecklistItem();
  }

  const nestedFile = normalizeJoiningChecklistFile(value.file || value.attachment);
  const topLevelFile =
    !nestedFile && (value.filePath || value.objectKey)
      ? normalizeJoiningChecklistFile(value)
      : null;
  const file = nestedFile || topLevelFile;

  const received =
    value.received != null
      ? Boolean(value.received)
      : Boolean(file);

  return { received, file };
}

export function normalizeJoiningChecklist(value) {
  const base = emptyJoiningChecklist();
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = {};
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  JOINING_CHECKLIST_ITEMS.forEach((item) => {
    base[item.key] = normalizeJoiningChecklistItem(raw[item.key]);
  });
  return base;
}

export function isChecklistItemReceived(item) {
  return normalizeJoiningChecklistItem(item).received === true;
}

export function getChecklistItemFile(item) {
  return normalizeJoiningChecklistItem(item).file;
}

export function countJoiningChecklistDone(checklist) {
  const normalized = normalizeJoiningChecklist(checklist);
  return JOINING_CHECKLIST_ITEMS.filter((item) => normalized[item.key].received).length;
}

export function isJoiningChecklistComplete(checklist) {
  const normalized = normalizeJoiningChecklist(checklist);
  return JOINING_CHECKLIST_ITEMS.every((item) => normalized[item.key].received === true);
}

/** Empty recruitment IOM form — same column set as Site Employee IOM. */
export function emptyRecruitmentIomEntry(overrides = {}) {
  return {
    rotationType: "New",
    eventDate: "",
    siteId: "",
    siteName: "",
    siteCode: "",
    employeeCode: "",
    employeeName: "",
    designation: "",
    salaryAmount: "",
    fatherName: "",
    bankAccountNo: "",
    ifscCode: "",
    bankName: "",
    dateOfBirth: "",
    dateOfJoining: "",
    remarks: "",
    contactNumber: "",
    aadhaarNo: "",
    panNo: "",
    uanNo: "",
    pfNo: "",
    ...overrides,
  };
}

export function normalizeRecruitmentIomEntry(value) {
  const base = emptyRecruitmentIomEntry();
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = {};
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  return emptyRecruitmentIomEntry({
    rotationType: "New",
    eventDate: String(raw.eventDate || "").slice(0, 10),
    siteId: raw.siteId == null || raw.siteId === "" ? "" : String(raw.siteId),
    siteName: String(raw.siteName || "").trim(),
    siteCode: String(raw.siteCode || "").trim().toUpperCase(),
    employeeCode: String(raw.employeeCode || "").trim(),
    employeeName: String(raw.employeeName || "").trim(),
    designation: String(raw.designation || "").trim(),
    salaryAmount: raw.salaryAmount == null ? "" : String(raw.salaryAmount),
    fatherName: String(raw.fatherName || "").trim(),
    bankAccountNo: String(raw.bankAccountNo || "").trim(),
    ifscCode: String(raw.ifscCode || "").trim().toUpperCase(),
    bankName: String(raw.bankName || "").trim(),
    dateOfBirth: String(raw.dateOfBirth || "").slice(0, 10),
    dateOfJoining: String(raw.dateOfJoining || "").slice(0, 10),
    remarks: String(raw.remarks || "").trim(),
    contactNumber: String(raw.contactNumber || "").trim(),
    aadhaarNo: String(raw.aadhaarNo || "").trim(),
    panNo: String(raw.panNo || "").trim().toUpperCase(),
    uanNo: String(raw.uanNo || "").trim(),
    pfNo: String(raw.pfNo || "").trim(),
  });
}

export function isIomConfirmed(row) {
  const status = String(row?.iomStatus ?? row?.iom_status ?? "").trim();
  return status === "Issued";
}

/** UI label: Open (editable) vs Confirmed (locked). */
export function iomEntryStatusLabel(row) {
  return isIomConfirmed(row) ? "Confirmed" : "Open";
}

/**
 * Prefill recruitment IOM from candidate + site master match.
 * Prefers saved open-entry fields; otherwise builds from candidate details.
 * @param {object} candidate
 * @param {Array<{ id: number|string, site_name?: string, siteName?: string }>} sites
 */
export function buildRecruitmentIomEntryFromCandidate(candidate, sites = []) {
  const saved = normalizeRecruitmentIomEntry(candidate?.iomEntryPayload);
  const hasSaved = Boolean(candidate?.iomEntrySaved);

  const siteLabel = String(
    (hasSaved && saved.siteName) || candidate?.siteFullName || candidate?.siteSuitable || ""
  ).trim();

  let siteId = hasSaved ? saved.siteId : "";
  let siteName = siteLabel;
  if (!siteId && siteLabel && Array.isArray(sites)) {
    const match = sites.find(
      (s) =>
        String(s.site_name || s.siteName || "")
          .trim()
          .toLowerCase() === siteLabel.toLowerCase()
    );
    if (match) {
      siteId = String(match.id);
      siteName = String(match.site_name || match.siteName || siteLabel).trim();
    }
  } else if (siteId && Array.isArray(sites)) {
    const match = sites.find((s) => String(s.id) === String(siteId));
    if (match) siteName = String(match.site_name || match.siteName || siteName).trim();
  }

  const joining =
    candidate?.actualJoiningDate || candidate?.joiningDate || new Date().toISOString().slice(0, 10);

  if (hasSaved) {
    return normalizeRecruitmentIomEntry({
      ...saved,
      rotationType: "New",
      siteId: siteId || saved.siteId,
      siteName: siteName || saved.siteName,
      siteCode: saved.siteCode || candidate?.siteCode || "",
      employeeCode: saved.employeeCode || candidate?.employeeCode || "",
      employeeName: saved.employeeName || candidate?.candidateName || "",
    });
  }

  return emptyRecruitmentIomEntry({
    rotationType: "New",
    eventDate: joining,
    siteId,
    siteName,
    siteCode: candidate?.siteCode || "",
    employeeCode: candidate?.employeeCode || "",
    employeeName: candidate?.candidateName || "",
    designation: candidate?.designation || "",
    salaryAmount: candidate?.salaryGross == null ? "" : String(candidate.salaryGross),
    fatherName: candidate?.fatherName || "",
    dateOfJoining: joining,
    contactNumber: candidate?.phoneNumber || "",
    remarks: candidate?.offerReferenceNo
      ? `Recruitment offer ${candidate.offerReferenceNo}`
      : "",
  });
}

/** Payload to persist when opening an IOM entry after checklist completion. */
export function seedOpenIomEntryPayload(candidate, sites = []) {
  return buildRecruitmentIomEntryFromCandidate(
    { ...candidate, iomEntrySaved: false, iomEntryPayload: {} },
    sites
  );
}

export function normalizeIomDepartments(value) {
  let list = value;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = String(list)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  if (!Array.isArray(list) || !list.length) return [...DEFAULT_IOM_DEPARTMENTS];
  const cleaned = [...new Set(list.map((d) => String(d || "").trim()).filter(Boolean))];
  return cleaned.length ? cleaned : [...DEFAULT_IOM_DEPARTMENTS];
}

/** StatusChip severity for post-offer journey labels. */
export function journeyStatusSeverity(status) {
  const value = String(status || "").trim();
  if (["Accepted", "Joined", "Issued", "Confirmed", "Converted", "Generated", "Open"].includes(value)) return "info";
  if (["Pending", "Not Generated", "Awaiting response"].includes(value)) return "warning";
  if (["Declined", "Expired", "No-show"].includes(value)) return "critical";
  return "warning";
}

export const CALLING_MASTER_FILTER_KEYS = [
  "callDate",
  "callingBy",
  "homeState",
  "workingState",
  "fireCourse",
  "industryWorked",
  "siteSuitable",
  "currentlyWorking",
];

export const CALLING_MASTER_SEARCH_KEYS = [
  "phoneNumber",
  "candidateName",
  "company",
  "designation",
];

/** Dropdown masters managed on the Dropdown Master page and consumed live by Calling Master. */
export const CALLING_DROPDOWN_MASTERS = [
  {
    key: "callingBy",
    label: "Calling By",
    description: "Full names from Employee Master (Human Resource & Human Resource-Safety)",
    source: "employee_master",
  },
  { key: "cvSubmitted", label: "CV Submitted", description: "Whether the candidate shared a CV", source: "manual" },
  { key: "academicQualification", label: "Academic Qualification", description: "Education levels used in screening", source: "manual" },
  { key: "fireCourse", label: "Fire Course", description: "Fire / safety course options", source: "manual" },
  { key: "homeState", label: "Home State", description: "Candidate home states", source: "manual" },
  { key: "currentlyWorking", label: "Currently Working", description: "Employment status options", source: "manual" },
  { key: "designation", label: "Designation", description: "Candidate designation / role options", source: "manual" },
  { key: "workingState", label: "Working State", description: "States where candidates currently work", source: "manual" },
  { key: "industryWorked", label: "Industry Worked", description: "Industries for candidate experience", source: "manual" },
  { key: "hmvLmv", label: "HMV / LMV", description: "Driving license categories", source: "manual" },
  {
    key: "siteSuitable",
    label: "Site Suitable",
    description: "Site names from public Sites master",
    source: "sites",
  },
];

export const CALLING_BY_DEPARTMENTS = ["Human Resource", "Human Resource-Safety"];

export function isLinkedDropdownMaster(key) {
  const master = CALLING_DROPDOWN_MASTERS.find((item) => item.key === key);
  return master?.source === "employee_master" || master?.source === "sites";
}
export const CALLING_MASTER_FIELDS = [
  {
    section: "Call Details",
    icon: PhoneCall,
    fields: [
      { key: "callDate", label: "Date", type: "date", required: true },
      { key: "callingBy", label: "Calling By", type: "select", optionsKey: "callingBy", placeholder: "Select caller" },
      { key: "candidateName", label: "Candidate Name", type: "text", required: true, placeholder: "Enter candidate name" },
      { key: "phoneNumber", label: "Mobile Number", type: "tel", required: true, maxLength: 10, placeholder: "Enter mobile number" },
      { key: "cvSubmitted", label: "CV Submitted", type: "select", optionsKey: "cvSubmitted", placeholder: "Select status" },
    ],
  },
  {
    section: "Profile",
    icon: UserRound,
    fields: [
      { key: "academicQualification", label: "Academic Qualification", type: "select", optionsKey: "academicQualification", placeholder: "Select qualification" },
      { key: "fireCourse", label: "Fire Course", type: "select", optionsKey: "fireCourse", placeholder: "Select course" },
      { key: "yearCompleted", label: "Year Completed", type: "number", placeholder: "e.g. 2019" },
      { key: "heightCm", label: "Height (cm)", type: "number", placeholder: "Enter height" },
      { key: "weightKg", label: "Weight (kg)", type: "number", placeholder: "Enter weight" },
      { key: "homeState", label: "Home State", type: "select", optionsKey: "homeState", placeholder: "Select state" },
      { key: "homeTown", label: "Home Town", type: "text", placeholder: "Enter home town" },
    ],
  },
  {
    section: "Current Employment",
    icon: Briefcase,
    fields: [
      { key: "currentlyWorking", label: "Currently Working", type: "select", optionsKey: "currentlyWorking", placeholder: "Select status" },
      { key: "designation", label: "Designation", type: "select", optionsKey: "designation", placeholder: "Select designation" },
      { key: "company", label: "Company", type: "text", placeholder: "Enter company" },
      { key: "workingState", label: "Working State", type: "select", optionsKey: "workingState", placeholder: "Select working state" },
      { key: "contractor", label: "Contractor", type: "text", placeholder: "Enter contractor name" },
      { key: "industryWorked", label: "Industry Worked", type: "select", optionsKey: "industryWorked", placeholder: "Select industry" },
      { key: "totalExperience", label: "Total Experience (years)", type: "number", placeholder: "Enter total experience" },
    ],
  },
  {
    section: "Compensation & Suitability",
    icon: Building2,
    fields: [
      { key: "salaryGross", label: "Salary Gross", type: "number", placeholder: "Enter salary" },
      { key: "facilitiesProvided", label: "Facilities Provided", type: "text", placeholder: "Accommodation / PF / ESIC etc." },
      { key: "hmvLmv", label: "HMV / LMV", type: "select", optionsKey: "hmvLmv", placeholder: "Select license type" },
      { key: "drivingLicenseYear", label: "Year of Issue", type: "number", placeholder: "e.g. 2018" },
      { key: "siteSuitable", label: "Site Suitable", type: "select", optionsKey: "siteSuitable", placeholder: "Select site" },
      { key: "remarks", label: "Remarks", type: "textarea", placeholder: "Add call notes / recruiter remarks", fullWidth: true },
    ],
  },
];

export const CALLING_MASTER_TABLE_COLUMNS = [
  { key: "callDate", label: "Date", widthClassName: "min-w-[110px]" },
  { key: "callingBy", label: "Calling By", widthClassName: "min-w-[120px]" },
  { key: "candidateName", label: "Candidate Name", widthClassName: "min-w-[180px]" },
  { key: "phoneNumber", label: "Mobile Number", widthClassName: "min-w-[130px]" },
  { key: "cvSubmitted", label: "CV Submitted", widthClassName: "min-w-[110px]" },
  { key: "academicQualification", label: "Academic Qualification", widthClassName: "min-w-[160px]" },
  { key: "fireCourse", label: "Fire Course", widthClassName: "min-w-[150px]" },
  { key: "yearCompleted", label: "Year Completed", widthClassName: "min-w-[120px]" },
  { key: "heightCm", label: "Height", widthClassName: "min-w-[90px]" },
  { key: "weightKg", label: "Weight", widthClassName: "min-w-[90px]" },
  { key: "homeState", label: "Home State", widthClassName: "min-w-[130px]" },
  { key: "homeTown", label: "Home Town", widthClassName: "min-w-[140px]" },
  { key: "currentlyWorking", label: "Currently Working", widthClassName: "min-w-[140px]" },
  { key: "designation", label: "Designation", widthClassName: "min-w-[150px]" },
  { key: "company", label: "Company", widthClassName: "min-w-[170px]" },
  { key: "workingState", label: "Working State", widthClassName: "min-w-[130px]" },
  { key: "contractor", label: "Contractor", widthClassName: "min-w-[140px]" },
  { key: "industryWorked", label: "Industry Worked", widthClassName: "min-w-[150px]" },
  { key: "salaryGross", label: "Salary Gross", widthClassName: "min-w-[120px]" },
  { key: "facilitiesProvided", label: "Facilities Provided", widthClassName: "min-w-[180px]" },
  { key: "totalExperience", label: "Total Experience", widthClassName: "min-w-[130px]" },
  { key: "hmvLmv", label: "HMV / LMV", widthClassName: "min-w-[110px]" },
  { key: "drivingLicenseYear", label: "Year of Issue", widthClassName: "min-w-[110px]" },
  { key: "remarks", label: "Remarks", widthClassName: "min-w-[220px]" },
  { key: "siteSuitable", label: "Site Suitable", widthClassName: "min-w-[130px]" },
  { key: "attachments", label: "Files", widthClassName: "min-w-[120px]" },
];

export const CALLING_MASTER_EXPORT_HEADERS = CALLING_MASTER_TABLE_COLUMNS.map((column) => ({
  key: column.key,
  label: column.label,
}));
