import { supabase } from "../../../lib/supabase";
import {
  CALLING_BY_DEPARTMENTS,
  CALLING_DROPDOWN_MASTERS,
  DEFAULT_OFFER_EXPIRY_DAYS,
  isJoiningChecklistComplete,
  normalizeIomDepartments,
  normalizeJoiningChecklist,
  normalizeRecruitmentIomEntry,
  seedOpenIomEntryPayload,
} from "./callingMasterConfig";

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
    candidateSource: normalizeCandidateSource(row.candidate_source),
    referredByEmployeeId:
      row.referred_by_employee_id == null || row.referred_by_employee_id === ""
        ? null
        : Number(row.referred_by_employee_id),
    referredByNote: row.referred_by_note || "",
    offerStatus: normalizeOfferStatus(row.offer_status),
    joiningDate: row.joining_date || "",
    offerRespondedAt: row.offer_responded_at || "",
    joiningStatus: normalizeJoiningStatus(row.joining_status),
    joiningChecklist: normalizeJoiningChecklist(row.joining_checklist),
    actualJoiningDate: row.actual_joining_date || "",
    noShowFlaggedAt: row.no_show_flagged_at || "",
    iomStatus: normalizeIomStatus(row.iom_status),
    iomReferenceNo: row.iom_reference_no || "",
    iomGeneratedAt: row.iom_generated_at || "",
    iomDepartments: normalizeIomDepartments(row.iom_departments),
    iomEntryPayload: normalizeRecruitmentIomEntry(row.iom_entry_payload),
    iomEntrySaved: Boolean(
      row.iom_entry_payload &&
        typeof row.iom_entry_payload === "object" &&
        !Array.isArray(row.iom_entry_payload) &&
        Object.keys(row.iom_entry_payload).length > 0
    ),
    siteIomEntryId: row.site_iom_entry_id || null,
    conversionStatus: normalizeConversionStatus(row.conversion_status),
    employeeMasterId: row.employee_master_id == null ? null : row.employee_master_id,
    convertedAt: row.converted_at || "",
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

export function normalizeCandidateSource(value) {
  return String(value || "").trim() === "Referral" ? "Referral" : "Calling";
}

export function isReferralCandidate(row) {
  return normalizeCandidateSource(row?.candidateSource ?? row?.candidate_source) === "Referral";
}

export function normalizeOfferStatus(value) {
  const v = String(value || "").trim();
  if (v === "Generated" || v === "Accepted" || v === "Declined" || v === "Expired") return v;
  return "Not Generated";
}

export function normalizeJoiningStatus(value) {
  const v = String(value || "").trim();
  if (v === "Pending" || v === "Joined" || v === "No-show") return v;
  return "";
}

export function normalizeIomStatus(value) {
  const v = String(value || "").trim();
  return v === "Issued" ? "Issued" : "";
}

export function normalizeConversionStatus(value) {
  const v = String(value || "").trim();
  return v === "Converted" ? "Converted" : "";
}

/** True when an offer letter has been generated (including later response stages). */
export function hasOfferLetterBeenGenerated(row) {
  const status = normalizeOfferStatus(row?.offerStatus ?? row?.offer_status);
  if (status === "Generated" || status === "Accepted" || status === "Declined" || status === "Expired") {
    return true;
  }
  return Boolean(String(row?.offerReferenceNo || row?.offer_reference_no || "").trim());
}

/** Display label for offer response stage. */
export function offerResponseLabel(row) {
  const status = normalizeOfferStatus(row?.offerStatus);
  if (status === "Accepted" || status === "Declined" || status === "Expired") return status;
  if (status === "Generated" || hasOfferLetterBeenGenerated(row)) return "Awaiting response";
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

/** Alphanumeric employee code (matches Employee Master usage). */
export function isValidOfferEmployeeCode(value) {
  const code = String(value || "").trim();
  if (!code) return false;
  return /^[A-Za-z0-9]+$/.test(code);
}

/** Peek last used + suggested next employee code without incrementing counter. */
export async function peekNextEmployeeCode() {
  const { data, error } = await supabase.rpc("hr_calling_peek_next_employee_code");
  if (error) throw new Error(friendlyError(error, "Unable to load employee code suggestion."));
  const row = Array.isArray(data) ? data[0] : data;
  return {
    lastUsed: String(row?.last_used ?? "").trim(),
    suggestedNext: String(row?.suggested_next ?? "").trim(),
  };
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

  const existingCode = toText(record.employeeCode);
  if (!existingCode && !isValidOfferEmployeeCode(record.requestedEmployeeCode)) {
    throw new Error("Employee code is required and must contain only letters and numbers.");
  }

  await updateOfferDetailsOnly(record);

  const year = new Date().getFullYear();
  const manualCode = existingCode ? null : toText(record.requestedEmployeeCode);
  const { data: allocated, error: allocError } = await supabase.rpc("hr_calling_allocate_offer_codes", {
    p_candidate_id: record.id,
    p_site_code: siteCode,
    p_year: year,
    p_employee_code: manualCode || null,
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

/** Active HR employees used for Calling By (names) and Referred By (ids). */
export async function fetchCallingByEmployees() {
  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select("id, full_name, employee_code, department, status")
    .eq("status", "Active")
    .in("department", CALLING_BY_DEPARTMENTS)
    .order("full_name", { ascending: true });

  if (error) throw new Error(friendlyError(error, "Unable to load Calling By names."));
  return (data || [])
    .map((row) => ({
      id: row.id,
      fullName: String(row.full_name || "").trim(),
      employeeCode: String(row.employee_code || "").trim(),
      department: String(row.department || "").trim(),
    }))
    .filter((row) => row.id != null && row.fullName);
}

/** Active HR employees used for Calling By. */
export async function fetchCallingByFullNames() {
  const employees = await fetchCallingByEmployees();
  return uniqueSortedLabels(employees.map((row) => row.fullName));
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

const SETTINGS_TABLE = "hr_calling_settings";

export async function getOfferExpiryDays() {
  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select("setting_value")
    .eq("setting_key", "offer_expiry_days")
    .maybeSingle();

  if (error) throw new Error(friendlyError(error, "Unable to load offer expiry setting."));
  const raw = Number(String(data?.setting_value || "").replace(/\D/g, ""));
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_OFFER_EXPIRY_DAYS;
  return Math.min(Math.floor(raw), 365);
}

export async function setOfferExpiryDays(days) {
  const value = Math.min(Math.max(Number(days) || DEFAULT_OFFER_EXPIRY_DAYS, 1), 365);
  const { error } = await supabase.from(SETTINGS_TABLE).upsert(
    {
      setting_key: "offer_expiry_days",
      setting_value: String(value),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "setting_key" }
  );
  if (error) throw new Error(friendlyError(error, "Unable to save offer expiry setting."));
  return value;
}

/** Run server-side auto-expire for Generated offers whose joining date has arrived. */
export async function autoExpireOffers() {
  const { data, error } = await supabase.rpc("hr_calling_auto_expire_offers");
  if (error) throw new Error(friendlyError(error, "Unable to auto-expire offers."));
  return Number(data) || 0;
}

/** Candidates with a generated offer (any response stage) for Offer Response tab. */
export async function listOfferResponseCandidates() {
  await autoExpireOffers().catch((err) => {
    console.error("Auto-expire offers failed:", err);
  });

  const { data, error } = await supabase
    .from(CANDIDATES_TABLE)
    .select("*")
    .eq("is_active", true)
    .eq("hiring_status", "Selected")
    .in("offer_status", ["Generated", "Accepted", "Declined", "Expired"])
    .order("updated_at", { ascending: false });

  if (error) throw new Error(friendlyError(error, "Unable to load offer response candidates."));
  return (data || []).map(mapCandidateFromDb);
}

export async function setCandidateOfferResponse(id, response) {
  if (!id) throw new Error("Candidate is required.");
  const { data, error } = await supabase.rpc("hr_calling_set_offer_response", {
    p_candidate_id: id,
    p_response: response,
  });
  if (error) throw new Error(friendlyError(error, "Unable to record offer response."));
  const row = Array.isArray(data) ? data[0] : data;
  return mapCandidateFromDb(row);
}

/** Accepted candidates for Joining tab. */
export async function listJoiningCandidates() {
  const { data, error } = await supabase
    .from(CANDIDATES_TABLE)
    .select("*")
    .eq("is_active", true)
    .eq("offer_status", "Accepted")
    .order("joining_date", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) throw new Error(friendlyError(error, "Unable to load joining candidates."));
  return (data || []).map(mapCandidateFromDb);
}

export async function updateJoiningChecklist(id, checklist) {
  if (!id) throw new Error("Candidate is required.");

  const { data: existing, error: loadError } = await supabase
    .from(CANDIDATES_TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (loadError) throw new Error(friendlyError(loadError, "Unable to load candidate."));
  if (String(existing?.offer_status || "").trim() !== "Accepted") {
    throw new Error("Only accepted candidates can update the joining checklist.");
  }
  if (String(existing?.joining_status || "").trim() === "Joined") {
    throw new Error("Checklist cannot be changed after the candidate has joined.");
  }
  if (String(existing?.joining_status || "").trim() === "No-show") {
    throw new Error("Checklist cannot be changed for a no-show candidate.");
  }

  const normalizedChecklist = normalizeJoiningChecklist(checklist);
  const mapped = mapCandidateFromDb(existing);
  const payload = {
    joining_checklist: normalizedChecklist,
    joining_status: "Pending",
  };

  // Auto-open one IOM entry when checklist becomes complete (editable until Confirm).
  if (
    isJoiningChecklistComplete(normalizedChecklist) &&
    mapped.iomStatus !== "Issued" &&
    !mapped.iomEntrySaved
  ) {
    payload.iom_entry_payload = seedOpenIomEntryPayload({
      ...mapped,
      joiningChecklist: normalizedChecklist,
    });
  }

  const { data, error } = await supabase
    .from(CANDIDATES_TABLE)
    .update(payload)
    .eq("id", id)
    .eq("offer_status", "Accepted")
    .select("*")
    .single();

  if (error) throw new Error(friendlyError(error, "Unable to update joining checklist."));
  return mapCandidateFromDb(data);
}

export async function markCandidateJoined(id, actualJoiningDate) {
  if (!id) throw new Error("Candidate is required.");
  if (!actualJoiningDate) throw new Error("Actual joining date is required.");

  const { data: existing, error: loadError } = await supabase
    .from(CANDIDATES_TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (loadError) throw new Error(friendlyError(loadError, "Unable to load candidate."));
  const mapped = mapCandidateFromDb(existing);
  if (mapped.offerStatus !== "Accepted") {
    throw new Error("Only accepted candidates can be marked as Joined.");
  }
  if (mapped.joiningStatus === "No-show") {
    throw new Error("This candidate is flagged as a no-show. Clear that status before marking Joined.");
  }
  if (!isJoiningChecklistCompleteLocal(mapped.joiningChecklist)) {
    throw new Error("Complete the pre-joining checklist before marking Joined.");
  }

  const { data, error } = await supabase
    .from(CANDIDATES_TABLE)
    .update({
      joining_status: "Joined",
      actual_joining_date: actualJoiningDate,
      no_show_flagged_at: null,
      ...(mapped.iomStatus !== "Issued" && !mapped.iomEntrySaved
        ? {
            iom_entry_payload: seedOpenIomEntryPayload({
              ...mapped,
              actualJoiningDate,
            }),
          }
        : {}),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(friendlyError(error, "Unable to mark candidate as Joined."));
  return mapCandidateFromDb(data);
}

function isJoiningChecklistCompleteLocal(checklist) {
  return isJoiningChecklistComplete(checklist);
}

export async function flagCandidateNoShow(id) {
  if (!id) throw new Error("Candidate is required.");

  const { data: existing, error: loadError } = await supabase
    .from(CANDIDATES_TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (loadError) throw new Error(friendlyError(loadError, "Unable to load candidate."));
  const mapped = mapCandidateFromDb(existing);
  if (mapped.offerStatus !== "Accepted") {
    throw new Error("Only accepted candidates can be flagged as no-show.");
  }
  if (mapped.joiningStatus === "Joined") {
    throw new Error("Joined candidates cannot be flagged as no-show.");
  }

  const { error: releaseError } = await supabase.rpc("hr_calling_release_offer_codes", {
    p_candidate_id: id,
    p_reason: "No-show",
  });
  if (releaseError) throw new Error(friendlyError(releaseError, "Unable to free allocated codes."));

  const { data, error } = await supabase
    .from(CANDIDATES_TABLE)
    .update({
      joining_status: "No-show",
      no_show_flagged_at: new Date().toISOString(),
      actual_joining_date: null,
      iom_status: "",
      iom_reference_no: "",
      iom_generated_at: null,
      conversion_status: "",
      employee_master_id: null,
      converted_at: null,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(friendlyError(error, "Unable to flag no-show."));
  return mapCandidateFromDb(data);
}

/** Close out a no-show by marking offer Declined (codes already freed). */
export async function closeNoShowCandidate(id) {
  return setCandidateOfferResponse(id, "Declined");
}

/** Open + confirmed IOM entries: accepted candidates with complete checklist (or already confirmed). */
export async function listIomCandidates() {
  const { data, error } = await supabase
    .from(CANDIDATES_TABLE)
    .select("*")
    .eq("is_active", true)
    .eq("offer_status", "Accepted")
    .neq("joining_status", "No-show")
    .order("actual_joining_date", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) throw new Error(friendlyError(error, "Unable to load IOM candidates."));

  const rows = (data || []).map(mapCandidateFromDb).filter((row) => {
    if (row.iomStatus === "Issued") return true;
    return isJoiningChecklistComplete(row.joiningChecklist);
  });

  // Ensure open entry exists for checklist-complete candidates (legacy rows).
  const ensured = [];
  for (const row of rows) {
    if (row.iomStatus === "Issued" || row.iomEntrySaved) {
      ensured.push(row);
      continue;
    }
    try {
      const seeded = await saveOpenIomEntry(row.id, seedOpenIomEntryPayload(row));
      ensured.push(seeded);
    } catch (err) {
      console.warn("Unable to open IOM entry for candidate:", row.id, err);
      ensured.push(row);
    }
  }
  return ensured;
}

/** Persist IOM form fields (editable before and after Confirm). */
export async function saveOpenIomEntry(id, entry) {
  if (!id) throw new Error("Candidate is required.");

  const { data: existing, error: loadError } = await supabase
    .from(CANDIDATES_TABLE)
    .select("iom_status, offer_status, joining_status, site_iom_entry_id")
    .eq("id", id)
    .single();

  if (loadError) throw new Error(friendlyError(loadError, "Unable to load candidate."));
  if (String(existing?.offer_status || "").trim() !== "Accepted") {
    throw new Error("Only accepted candidates can edit an IOM entry.");
  }
  if (String(existing?.joining_status || "").trim() === "No-show") {
    throw new Error("No-show candidates cannot edit an IOM entry.");
  }

  const normalized = normalizeRecruitmentIomEntry(entry);
  const payload = {
    iom_entry_payload: normalized,
  };
  if (normalized.siteCode) payload.site_code = normalized.siteCode;
  if (normalized.siteName) payload.site_full_name = normalized.siteName;

  const { data, error } = await supabase
    .from(CANDIDATES_TABLE)
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(friendlyError(error, "Unable to save IOM entry."));

  // Keep linked Site Employee IOM row in sync when this recruitment IOM was already confirmed.
  const siteEntryId = existing?.site_iom_entry_id;
  if (siteEntryId) {
    const siteId =
      normalized.siteId === "" || normalized.siteId == null ? null : Number(normalized.siteId);
    const sitePayload = {
      site_id: Number.isFinite(siteId) ? siteId : null,
      site_name: normalized.siteName || "",
      employee_code: normalized.employeeCode || "",
      employee_name: normalized.employeeName || "",
      designation: normalized.designation || "",
      salary_amount:
        normalized.salaryAmount === "" || normalized.salaryAmount == null
          ? null
          : Number(normalized.salaryAmount),
      father_name: normalized.fatherName || "",
      bank_account_no: normalized.bankAccountNo || "",
      ifsc_code: (normalized.ifscCode || "").toUpperCase(),
      bank_name: normalized.bankName || "",
      date_of_birth: normalized.dateOfBirth || null,
      date_of_joining: normalized.dateOfJoining || null,
      remarks: normalized.remarks || "",
      contact_number: normalized.contactNumber || "",
      aadhaar_no: normalized.aadhaarNo || "",
      pan_no: (normalized.panNo || "").toUpperCase(),
      uan_no: normalized.uanNo || "",
      pf_no: normalized.pfNo || "",
      event_date: normalized.eventDate || null,
      updated_at: new Date().toISOString(),
    };
    const { error: siteErr } = await supabase
      .from("hr_site_iom_entries")
      .update(sitePayload)
      .eq("id", siteEntryId);
    if (siteErr) {
      console.warn("IOM saved, but Site Employee IOM sync failed:", siteErr);
    }
  }

  return mapCandidateFromDb(data);
}

/**
 * Confirm open IOM entry: allocate reference and create Site IOM (New).
 * Entry remains editable after confirm via saveOpenIomEntry.
 */
export async function confirmCandidateIom(record) {
  if (!record?.id) throw new Error("Candidate is required.");

  const entry = normalizeRecruitmentIomEntry(record.iomEntryPayload || record);
  if (!entry.siteId && !entry.siteName) {
    throw new Error("Site is required for the IOM entry.");
  }
  if (!entry.employeeName) {
    throw new Error("Employee name is required.");
  }

  const { data, error } = await supabase.rpc("hr_calling_confirm_iom_entry", {
    p_candidate_id: record.id,
    p_entry: {
      rotationType: "New",
      eventDate: entry.eventDate || null,
      siteId: entry.siteId || null,
      siteName: entry.siteName || "",
      siteCode: entry.siteCode || record.siteCode || "",
      employeeCode: entry.employeeCode || record.employeeCode || "",
      employeeName: entry.employeeName || record.candidateName || "",
      designation: entry.designation || "",
      salaryAmount: entry.salaryAmount || "",
      fatherName: entry.fatherName || "",
      bankAccountNo: entry.bankAccountNo || "",
      ifscCode: entry.ifscCode || "",
      bankName: entry.bankName || "",
      dateOfBirth: entry.dateOfBirth || "",
      dateOfJoining: entry.dateOfJoining || "",
      remarks: entry.remarks || "",
      contactNumber: entry.contactNumber || "",
      aadhaarNo: entry.aadhaarNo || "",
      panNo: entry.panNo || "",
      uanNo: entry.uanNo || "",
      pfNo: entry.pfNo || "",
    },
  });

  if (error) throw new Error(friendlyError(error, "Unable to confirm IOM entry."));
  const row = Array.isArray(data) ? data[0] : data;
  return mapCandidateFromDb(row);
}

/** @deprecated Use confirmCandidateIom */
export async function issueCandidateIom(record) {
  return confirmCandidateIom(record);
}

/** IOM-issued candidates for Conversion tab. */
export async function listConversionCandidates() {
  const { data, error } = await supabase
    .from(CANDIDATES_TABLE)
    .select("*")
    .eq("is_active", true)
    .eq("iom_status", "Issued")
    .order("iom_generated_at", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) throw new Error(friendlyError(error, "Unable to load conversion candidates."));
  return (data || []).map(mapCandidateFromDb);
}

export async function convertCandidateToEmployeeMaster(id) {
  if (!id) throw new Error("Candidate is required.");
  const { data, error } = await supabase.rpc("hr_calling_convert_to_employee_master", {
    p_candidate_id: id,
  });
  if (error) throw new Error(friendlyError(error, "Unable to convert to Employee Master."));

  const result = Array.isArray(data) ? data[0] : data;

  const { data: row, error: reloadError } = await supabase
    .from(CANDIDATES_TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (reloadError) throw new Error(friendlyError(reloadError, "Converted, but unable to reload candidate."));

  return {
    candidate: mapCandidateFromDb(row),
    employeeMasterId: result?.employee_master_id ?? null,
    employeeId: result?.employee_id || "",
    employeeCode: result?.employee_code || "",
  };
}

/** Insert a referral candidate at Selected without allocating offer codes. */
export async function createReferralCandidate(record) {
  const phone = String(record.phoneNumber || "").replace(/\D/g, "");
  const referrerId =
    record.referredByEmployeeId == null || record.referredByEmployeeId === ""
      ? null
      : Number(record.referredByEmployeeId);

  const { data, error } = await supabase.rpc("hr_calling_create_referral_candidate", {
    p_payload: {
      candidate_name: toText(record.candidateName),
      phone_number: phone,
      cv_submitted: toText(record.cvSubmitted),
      academic_qualification: toText(record.academicQualification),
      fire_course: toText(record.fireCourse),
      currently_working: toText(record.currentlyWorking),
      designation: toText(record.designation),
      company: toText(record.company),
      salary_gross: record.salaryGross === "" || record.salaryGross == null ? "" : String(record.salaryGross),
      site_suitable: toText(record.siteSuitable),
      attachments: normalizeCallingAttachments(record.attachments),
      referred_by_employee_id: referrerId == null || !Number.isFinite(referrerId) ? "" : String(referrerId),
      referred_by_note: toText(record.referredByNote),
      father_name: toText(record.fatherName),
      address_line: toText(record.addressLine),
      address_district: toText(record.addressDistrict),
      address_state: toText(record.addressState),
      address_pincode: toText(record.addressPincode),
      duty_pattern: normalizeDutyPattern(record.dutyPattern),
      site_full_name: toText(record.siteFullName),
      site_code: toText(record.siteCode).toUpperCase(),
      joining_date: record.joiningDate || "",
      offer_salutation: normalizeOfferSalutation(record.offerSalutation),
    },
  });

  if (error) throw new Error(friendlyError(error, "Unable to add referral candidate."));
  const row = Array.isArray(data) ? data[0] : data;
  return mapCandidateFromDb(row);
}
