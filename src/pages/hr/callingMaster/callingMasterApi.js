import { supabase } from "../../../lib/supabase";
import { CALLING_BY_DEPARTMENTS, CALLING_DROPDOWN_MASTERS } from "./callingMasterConfig";

const CANDIDATES_TABLE = "hr_calling_candidates";
const DROPDOWN_MASTERS_TABLE = "hr_calling_dropdown_masters";
const DROPDOWN_OPTIONS_TABLE = "hr_calling_dropdown_options";
const EMPLOYEE_MASTER_TABLE = "admin_ifsp_employee_master";
const SITES_TABLE = "sites";

function friendlyError(error, fallback = "Something went wrong.") {
  const message = String(error?.message || error || fallback);
  if (/duplicate key|unique/i.test(message)) {
    return "This mobile number already exists in Calling Master.";
  }
  if (/row-level security|permission|rls/i.test(message)) {
    return "You do not have permission to update Calling Database.";
  }
  return message || fallback;
}

function toNullableNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toText(value) {
  return value == null ? "" : String(value).trim();
}

function uniqueSortedLabels(values) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const label = String(value || "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** Normalize attachment metadata stored on hr_calling_candidates.attachments. */
export function normalizeCallingAttachment(item) {
  if (!item) return null;
  if (typeof item === "string") {
    const path = item.trim();
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
  const filePath = String(item.filePath || item.objectKey || "").trim();
  if (!filePath) return null;
  return {
    filePath,
    objectKey: String(item.objectKey || filePath).trim(),
    fileName: String(item.fileName || filePath.slice(filePath.lastIndexOf("/") + 1) || "file").trim(),
    contentType: String(item.contentType || "").trim(),
    bucket: String(item.bucket || "indus-erp-uploads").trim(),
    uploadedAt: String(item.uploadedAt || "").trim(),
  };
}

function normalizeCallingAttachments(value) {
  let list = value;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list.map(normalizeCallingAttachment).filter(Boolean);
}

/** Map DB row → frontend camelCase record. */
export function mapCandidateFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    callDate: row.call_date || "",
    callingBy: row.calling_by || "",
    candidateName: row.candidate_name || "",
    phoneNumber: row.phone_number || "",
    cvSubmitted: row.cv_submitted || "",
    academicQualification: row.academic_qualification || "",
    fireCourse: row.fire_course || "",
    yearCompleted: row.year_completed == null ? "" : String(row.year_completed),
    heightCm: row.height_cm == null ? "" : String(row.height_cm),
    weightKg: row.weight_kg == null ? "" : String(row.weight_kg),
    homeState: row.home_state || "",
    homeTown: row.home_town || "",
    currentlyWorking: row.currently_working || "",
    designation: row.designation || "",
    company: row.company || "",
    workingState: row.working_state || "",
    contractor: row.contractor || "",
    industryWorked: row.industry_worked || "",
    salaryGross: row.salary_gross == null ? "" : String(row.salary_gross),
    facilitiesProvided: row.facilities_provided || "",
    totalExperience: row.total_experience == null ? "" : String(row.total_experience),
    hmvLmv: row.hmv_lmv || "",
    drivingLicenseYear: row.driving_license_year == null ? "" : String(row.driving_license_year),
    remarks: row.remarks || "",
    siteSuitable: row.site_suitable || "",
    attachments: normalizeCallingAttachments(row.attachments),
    resumeUrl: row.resume_url || "",
    interviewStatus: row.interview_status || "",
    followUpDate: row.follow_up_date || "",
    recruiterNotes: row.recruiter_notes || "",
    hiringStatus: row.hiring_status || "",
    offerStatus: normalizeOfferStatus(row.offer_status),
    joiningDate: row.joining_date || "",
    fatherName: row.father_name || "",
    addressLine: row.address_line || "",
    addressDistrict: row.address_district || "",
    addressState: row.address_state || "",
    addressPincode: row.address_pincode || "",
    dutyPattern: row.duty_pattern || "",
    siteFullName: row.site_full_name || "",
    siteCode: row.site_code || "",
    employeeCode: row.employee_code || "",
    offerReferenceNo: row.offer_reference_no || "",
    offerGeneratedAt: row.offer_generated_at || "",
    offerSalutation: row.offer_salutation || "Mr.",
    isActive: row.is_active !== false,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    createdBy: row.created_by || "",
    updatedBy: row.updated_by || "",
  };
}

/** Map frontend record → DB payload. */
export function mapCandidateToDb(record) {
  return {
    phone_number: String(record.phoneNumber || "").replace(/\D/g, ""),
    call_date: record.callDate || null,
    calling_by: toText(record.callingBy),
    candidate_name: toText(record.candidateName),
    cv_submitted: toText(record.cvSubmitted),
    academic_qualification: toText(record.academicQualification),
    fire_course: toText(record.fireCourse),
    year_completed: toNullableNumber(record.yearCompleted),
    height_cm: toNullableNumber(record.heightCm),
    weight_kg: toNullableNumber(record.weightKg),
    home_state: toText(record.homeState),
    home_town: toText(record.homeTown),
    currently_working: toText(record.currentlyWorking),
    designation: toText(record.designation),
    company: toText(record.company),
    working_state: toText(record.workingState),
    contractor: toText(record.contractor),
    industry_worked: toText(record.industryWorked),
    salary_gross: toNullableNumber(record.salaryGross),
    facilities_provided: toText(record.facilitiesProvided),
    total_experience: toNullableNumber(record.totalExperience),
    hmv_lmv: toText(record.hmvLmv),
    driving_license_year: toNullableNumber(record.drivingLicenseYear),
    remarks: toText(record.remarks),
    site_suitable: toText(record.siteSuitable),
    attachments: normalizeCallingAttachments(record.attachments),
    hiring_status: normalizePipelineStatus(record.hiringStatus),
    is_active: record.isActive !== false,
  };
}

export function normalizeDutyPattern(value) {
  const v = String(value || "").trim();
  return v === "26" || v === "27" ? v : "";
}

export function normalizeOfferSalutation(value) {
  const v = String(value || "").trim();
  if (v === "Ms." || v === "Mrs.") return v;
  return "Mr.";
}

export function normalizeOfferStatus(value) {
  const v = String(value || "").trim();
  if (v === "Generated") return "Generated";
  return "Not Generated";
}

/** Selected candidates for Offer Generation tab. */
export async function listSelectedOfferCandidates() {
  const { data, error } = await supabase
    .from(CANDIDATES_TABLE)
    .select("*")
    .eq("is_active", true)
    .eq("hiring_status", "Selected")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(friendlyError(error, "Unable to load selected candidates."));
  return (data || []).map(mapCandidateFromDb);
}

/**
 * Persist offer detail fields only (no employee code / reference allocation).
 * Used for data entry on the Selected register.
 */
export async function updateOfferDetailsOnly(record) {
  if (!record?.id) throw new Error("Candidate is required.");

  const siteCode = toText(record.siteCode).toUpperCase();
  const duty = normalizeDutyPattern(record.dutyPattern);

  const payload = {
    father_name: toText(record.fatherName),
    address_line: toText(record.addressLine),
    address_district: toText(record.addressDistrict),
    address_state: toText(record.addressState),
    address_pincode: toText(record.addressPincode),
    duty_pattern: duty,
    site_full_name: toText(record.siteFullName),
    site_code: siteCode,
    joining_date: record.joiningDate || null,
    offer_salutation: normalizeOfferSalutation(record.offerSalutation),
    designation: toText(record.designation),
    salary_gross: toNullableNumber(record.salaryGross),
  };

  const { data, error } = await supabase
    .from(CANDIDATES_TABLE)
    .update(payload)
    .eq("id", record.id)
    .select("*")
    .single();

  if (error) throw new Error(friendlyError(error, "Unable to save offer details."));
  return mapCandidateFromDb(data);
}

/**
 * Persist offer details, allocate employee code + reference (if needed), return updated row.
 * Used when generating the offer letter.
 */
export async function saveCandidateOfferDetails(record) {
  if (!record?.id) throw new Error("Candidate is required.");

  const siteCode = toText(record.siteCode).toUpperCase();
  if (!siteCode) throw new Error("Site code is required for the offer reference number.");

  const duty = normalizeDutyPattern(record.dutyPattern);
  if (!duty) throw new Error("Duty pattern must be 26 or 27 days.");

  if (!toText(record.fatherName)) throw new Error("Father's name is required.");
  if (!toText(record.addressLine)) throw new Error("Address is required.");
  if (!toText(record.addressDistrict)) throw new Error("District is required.");
  if (!toText(record.addressState)) throw new Error("State is required.");
  if (!toText(record.addressPincode)) throw new Error("Pincode is required.");
  if (!record.joiningDate) throw new Error("Date of joining is required.");
  if (!toText(record.siteFullName)) throw new Error("Site name and location is required.");
  if (!toText(record.designation)) throw new Error("Designation is required.");
  if (record.salaryGross === "" || record.salaryGross == null) {
    throw new Error("Gross salary is required.");
  }

  await updateOfferDetailsOnly(record);

  const year = new Date().getFullYear();
  const { data: allocated, error: allocError } = await supabase.rpc("hr_calling_allocate_offer_codes", {
    p_candidate_id: record.id,
    p_site_code: siteCode,
    p_year: year,
  });

  if (allocError) {
    throw new Error(friendlyError(allocError, "Unable to assign employee code / reference number."));
  }

  const { data, error } = await supabase
    .from(CANDIDATES_TABLE)
    .select("*")
    .eq("id", record.id)
    .single();

  if (error) throw new Error(friendlyError(error, "Unable to reload candidate after offer save."));

  const mapped = mapCandidateFromDb(data);
  const row = Array.isArray(allocated) ? allocated[0] : allocated;
  if (row?.employee_code) mapped.employeeCode = row.employee_code;
  if (row?.offer_reference_no) mapped.offerReferenceNo = row.offer_reference_no;
  return mapped;
}

export const CALLING_PIPELINE_STATUSES = ["Calling", "Shortlisted", "Selected", "Rejected"];

/** Normalize recruitment pipeline stage stored in hiring_status. */
export function normalizePipelineStatus(status) {
  const value = String(status || "").trim();
  if (value === "Shortlisted" || value === "Selected" || value === "Rejected") return value;
  return "Calling";
}

export async function updateCandidatePipelineStatus(id, hiringStatus) {
  const nextStatus = normalizePipelineStatus(hiringStatus);
  if (!id) throw new Error("Candidate is required.");

  const { data, error } = await supabase
    .from(CANDIDATES_TABLE)
    .update({ hiring_status: nextStatus })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(friendlyError(error, "Unable to update candidate status."));
  return mapCandidateFromDb(data);
}

export async function listCallingCandidates() {
  const { data, error } = await supabase
    .from(CANDIDATES_TABLE)
    .select("*")
    .eq("is_active", true)
    .order("call_date", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) throw new Error(friendlyError(error, "Unable to load candidates."));
  return (data || []).map(mapCandidateFromDb);
}

export async function upsertCallingCandidate(record) {
  const payload = mapCandidateToDb(record);
  if (!payload.phone_number) throw new Error("Mobile number is required.");
  if (!payload.candidate_name) throw new Error("Candidate name is required.");

  if (record.id) {
    const { data, error } = await supabase
      .from(CANDIDATES_TABLE)
      .update(payload)
      .eq("id", record.id)
      .select("*")
      .single();
    if (error) throw new Error(friendlyError(error, "Unable to update candidate."));
    return mapCandidateFromDb(data);
  }

  const { data, error } = await supabase
    .from(CANDIDATES_TABLE)
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(friendlyError(error, "Unable to create candidate."));
  return mapCandidateFromDb(data);
}

export async function deleteCallingCandidates(ids) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return [];

  const { error } = await supabase
    .from(CANDIDATES_TABLE)
    .update({ is_active: false })
    .in("id", list);

  if (error) throw new Error(friendlyError(error, "Unable to delete candidates."));
  return list;
}

/** Active HR employees used for Calling By. */
export async function fetchCallingByFullNames() {
  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select("full_name, department, status")
    .eq("status", "Active")
    .in("department", CALLING_BY_DEPARTMENTS)
    .order("full_name", { ascending: true });

  if (error) throw new Error(friendlyError(error, "Unable to load Calling By names."));
  return uniqueSortedLabels((data || []).map((row) => row.full_name));
}

/** Site names from public.sites for Site Suitable. */
export async function fetchSiteSuitableNames() {
  const { data, error } = await supabase
    .from(SITES_TABLE)
    .select("id, site_name")
    .order("site_name", { ascending: true });

  if (error) throw new Error(friendlyError(error, "Unable to load sites."));

  return uniqueSortedLabels((data || []).map((row) => row.site_name));
}

function emptyCatalogFromConfig() {
  const catalog = {};
  CALLING_DROPDOWN_MASTERS.forEach((master) => {
    catalog[master.key] = [];
  });
  return catalog;
}

export async function listDropdownCatalog() {
  const catalog = emptyCatalogFromConfig();

  const { data: masters, error: mastersError } = await supabase
    .from(DROPDOWN_MASTERS_TABLE)
    .select("master_key, label, description, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (mastersError) throw new Error(friendlyError(mastersError, "Unable to load dropdown masters."));

  const { data: options, error: optionsError } = await supabase
    .from(DROPDOWN_OPTIONS_TABLE)
    .select("id, master_key, label, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (optionsError) throw new Error(friendlyError(optionsError, "Unable to load dropdown options."));

  (masters || []).forEach((master) => {
    if (!catalog[master.master_key]) catalog[master.master_key] = [];
  });

  (options || []).forEach((option) => {
    if (!catalog[option.master_key]) catalog[option.master_key] = [];
    catalog[option.master_key].push({
      id: option.id,
      label: option.label,
      sortOrder: option.sort_order,
    });
  });

  try {
    const callingBy = await fetchCallingByFullNames();
    catalog.callingBy = callingBy.map((label, index) => ({
      id: `emp-${index}-${label}`,
      label,
      sortOrder: index,
      linked: true,
    }));
  } catch (err) {
    console.error("Calling By load failed:", err);
  }

  try {
    const sites = await fetchSiteSuitableNames();
    catalog.siteSuitable = sites.map((label, index) => ({
      id: `site-${index}-${label}`,
      label,
      sortOrder: index,
      linked: true,
    }));
  } catch (err) {
    console.error("Site Suitable load failed:", err);
  }

  return catalog;
}

export async function listSelectOptionsMap() {
  const catalog = await listDropdownCatalog();
  const options = {};
  Object.entries(catalog).forEach(([key, list]) => {
    options[key] = (list || []).map((item) => item.label);
  });

  try {
    options.callingBy = await fetchCallingByFullNames();
  } catch {
    options.callingBy = options.callingBy || [];
  }
  try {
    options.siteSuitable = await fetchSiteSuitableNames();
  } catch {
    options.siteSuitable = options.siteSuitable || [];
  }

  return options;
}

export async function createDropdownOption(masterKey, label) {
  if (masterKey === "callingBy" || masterKey === "siteSuitable") {
    throw new Error("This list is linked to a master table and cannot be edited here.");
  }
  const clean = String(label || "").trim();
  if (!clean) throw new Error("Option label is required.");

  const { data, error } = await supabase
    .from(DROPDOWN_OPTIONS_TABLE)
    .insert({
      master_key: masterKey,
      label: clean,
      sort_order: Date.now() % 100000,
      is_active: true,
    })
    .select("id, master_key, label, sort_order")
    .single();

  if (error) {
    if (/unique|duplicate/i.test(error.message || "")) {
      throw new Error("This option already exists.");
    }
    throw new Error(friendlyError(error, "Unable to add option."));
  }
  return data;
}

export async function updateDropdownOptionRow(optionId, label) {
  const clean = String(label || "").trim();
  if (!clean) throw new Error("Option label is required.");

  const { data, error } = await supabase
    .from(DROPDOWN_OPTIONS_TABLE)
    .update({ label: clean })
    .eq("id", optionId)
    .select("id, master_key, label, sort_order")
    .single();

  if (error) {
    if (/unique|duplicate/i.test(error.message || "")) {
      throw new Error("This option already exists.");
    }
    throw new Error(friendlyError(error, "Unable to update option."));
  }
  return data;
}

export async function deleteDropdownOptionRow(optionId) {
  const { error } = await supabase
    .from(DROPDOWN_OPTIONS_TABLE)
    .update({ is_active: false })
    .eq("id", optionId);

  if (error) throw new Error(friendlyError(error, "Unable to delete option."));
}

export async function clearDropdownOptionsForMaster(masterKey) {
  if (masterKey === "callingBy" || masterKey === "siteSuitable") {
    throw new Error("This list is linked to a master table and cannot be cleared here.");
  }
  const { error } = await supabase
    .from(DROPDOWN_OPTIONS_TABLE)
    .update({ is_active: false })
    .eq("master_key", masterKey)
    .eq("is_active", true);

  if (error) throw new Error(friendlyError(error, "Unable to clear dropdown options."));
}

export async function clearAllDropdownOptions() {
  const { error } = await supabase
    .from(DROPDOWN_OPTIONS_TABLE)
    .update({ is_active: false })
    .eq("is_active", true)
    .not("master_key", "in", '("callingBy","siteSuitable")');

  if (error) throw new Error(friendlyError(error, "Unable to clear dropdown options."));
}
