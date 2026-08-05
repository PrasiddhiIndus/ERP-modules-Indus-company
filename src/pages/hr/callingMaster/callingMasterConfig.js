import { Briefcase, Building2, PhoneCall, UserRound } from "lucide-react";

export const CALLING_MASTER_ROUTE = "calling-master";
export const CALLING_MASTER_DROPDOWNS_EVENT = "hr-calling-master-dropdowns-updated";
export const CALLING_MASTER_RECORDS_EVENT = "hr-calling-master-records-updated";

export const CALLING_PIPELINE_TABS = [
  { key: "Calling", label: "Calling" },
  { key: "Shortlisted", label: "Shortlisted" },
  { key: "Selected", label: "Selected" },
];

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
