/**
 * Site Employee IOM — HR-Safety payroll memo events (draft → confirm → Excel export).
 * Sensitive banking/ID lives in people_sensitive_details (not on general people selects).
 */
import { supabase } from "./supabase";

export const SITE_IOM_ROTATION_TYPES = [
  "New",
  "Transferred",
  "Promotion",
  "Demotion",
  "Revision of Salary",
];

export const SITE_IOM_ENTRY_STATUSES = ["draft", "confirmed", "cancelled"];

const ENTRIES_TABLE = "hr_site_iom_entries";

function friendlyError(error, fallback = "Something went wrong.") {
  const message = String(error?.message || error || fallback);
  if (/permission|rls|policy/i.test(message)) {
    return "You do not have permission to manage Site Employee IOM.";
  }
  if (/already taken/i.test(message)) {
    return message;
  }
  return message || fallback;
}

function toText(value) {
  return value == null ? "" : String(value).trim();
}

function toNullableNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNullableDate(value) {
  const s = toText(value);
  return s || null;
}

export function emptySiteIomForm(overrides = {}) {
  return {
    rotationType: "New",
    eventDate: new Date().toISOString().slice(0, 10),
    siteId: "",
    siteName: "",
    personId: null,
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
    sourceCallingCandidateId: null,
    ...overrides,
  };
}

export function mapSiteIomFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    entryStatus: row.entry_status || "draft",
    rotationType: row.rotation_type || "",
    eventDate: row.event_date || "",
    siteId: row.site_id == null ? "" : String(row.site_id),
    siteName: row.site_name || "",
    personId: row.person_id == null ? null : row.person_id,
    employeeCode: row.employee_code || "",
    employeeName: row.employee_name || "",
    designation: row.designation || "",
    salaryAmount: row.salary_amount == null ? "" : String(row.salary_amount),
    fatherName: row.father_name || "",
    bankAccountNo: row.bank_account_no || "",
    ifscCode: row.ifsc_code || "",
    bankName: row.bank_name || "",
    dateOfBirth: row.date_of_birth || "",
    dateOfJoining: row.date_of_joining || "",
    remarks: row.remarks || "",
    contactNumber: row.contact_number || "",
    aadhaarNo: row.aadhaar_no || "",
    panNo: row.pan_no || "",
    uanNo: row.uan_no || "",
    pfNo: row.pf_no || "",
    sourceCallingCandidateId: row.source_calling_candidate_id || null,
    previousSiteName: row.previous_site_name || "",
    previousDesignation: row.previous_designation || "",
    previousSalaryAmount:
      row.previous_salary_amount == null ? "" : String(row.previous_salary_amount),
    confirmedAt: row.confirmed_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function mapFormToDb(form) {
  return {
    entry_status: "draft",
    rotation_type: form.rotationType,
    event_date: toNullableDate(form.eventDate) || new Date().toISOString().slice(0, 10),
    site_id: form.siteId === "" || form.siteId == null ? null : Number(form.siteId),
    site_name: toText(form.siteName),
    person_id: form.personId || null,
    employee_code: toText(form.employeeCode),
    employee_name: toText(form.employeeName),
    designation: toText(form.designation),
    salary_amount: toNullableNumber(form.salaryAmount),
    father_name: toText(form.fatherName),
    bank_account_no: toText(form.bankAccountNo),
    ifsc_code: toText(form.ifscCode).toUpperCase(),
    bank_name: toText(form.bankName),
    date_of_birth: toNullableDate(form.dateOfBirth),
    date_of_joining: toNullableDate(form.dateOfJoining),
    remarks: toText(form.remarks),
    contact_number: toText(form.contactNumber),
    aadhaar_no: toText(form.aadhaarNo),
    pan_no: toText(form.panNo).toUpperCase(),
    uan_no: toText(form.uanNo),
    pf_no: toText(form.pfNo),
    source_calling_candidate_id: form.sourceCallingCandidateId || null,
    updated_at: new Date().toISOString(),
  };
}

export function formFromSiteIomEntry(entry) {
  if (!entry) return emptySiteIomForm();
  return emptySiteIomForm({
    rotationType: entry.rotationType || "New",
    eventDate: entry.eventDate || "",
    siteId: entry.siteId || "",
    siteName: entry.siteName || "",
    personId: entry.personId,
    employeeCode: entry.employeeCode || "",
    employeeName: entry.employeeName || "",
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
    sourceCallingCandidateId: entry.sourceCallingCandidateId || null,
  });
}

export async function listSiteIomEntries({
  fromDate = null,
  toDate = null,
  status = "All",
  rotationType = "All",
  search = "",
} = {}) {
  let query = supabase
    .from(ENTRIES_TABLE)
    .select("*")
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (fromDate) query = query.gte("event_date", fromDate);
  if (toDate) query = query.lte("event_date", toDate);
  if (status && status !== "All") query = query.eq("entry_status", status);
  if (rotationType && rotationType !== "All") query = query.eq("rotation_type", rotationType);

  const { data, error } = await query.limit(2000);
  if (error) throw new Error(friendlyError(error, "Unable to load IOM entries."));

  const q = String(search || "").trim().toLowerCase();
  let rows = (data || []).map(mapSiteIomFromDb);
  if (q) {
    rows = rows.filter((row) =>
      [row.employeeName, row.employeeCode, row.siteName, row.designation, row.rotationType]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }
  return rows;
}

export async function saveSiteIomDraft(form, existingId = null) {
  if (!SITE_IOM_ROTATION_TYPES.includes(form.rotationType)) {
    throw new Error("Select a valid rotation type.");
  }
  if (!toText(form.employeeName) && form.rotationType === "New") {
    throw new Error("Employee name is required.");
  }
  if (form.rotationType !== "New" && !form.personId) {
    throw new Error("Select the existing site employee for this change.");
  }
  if (!form.siteId && !toText(form.siteName)) {
    throw new Error("Site is required.");
  }

  const payload = mapFormToDb(form);

  if (existingId) {
    const { data: existing, error: loadErr } = await supabase
      .from(ENTRIES_TABLE)
      .select("entry_status")
      .eq("id", existingId)
      .maybeSingle();
    if (loadErr) throw new Error(friendlyError(loadErr));
    if (!existing) throw new Error("Entry not found.");
    if (existing.entry_status !== "draft") {
      throw new Error("Confirmed entries cannot be edited. Add a new IOM event instead.");
    }

    const { data, error } = await supabase
      .from(ENTRIES_TABLE)
      .update(payload)
      .eq("id", existingId)
      .eq("entry_status", "draft")
      .select("*")
      .single();
    if (error) throw new Error(friendlyError(error, "Unable to save draft."));
    return mapSiteIomFromDb(data);
  }

  const { data: userData } = await supabase.auth.getUser();
  payload.created_by = userData?.user?.id || null;
  payload.updated_by = userData?.user?.id || null;

  const { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(friendlyError(error, "Unable to create draft."));
  return mapSiteIomFromDb(data);
}

export async function confirmSiteIomEntry(id) {
  if (!id) throw new Error("Entry is required.");
  const { data, error } = await supabase.rpc("hr_site_iom_confirm_entry", {
    p_entry_id: id,
  });
  if (error) throw new Error(friendlyError(error, "Unable to confirm IOM entry."));
  const row = Array.isArray(data) ? data[0] : data;
  return mapSiteIomFromDb(row);
}

export async function cancelSiteIomDraft(id) {
  const { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .update({ entry_status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("entry_status", "draft")
    .select("*")
    .single();
  if (error) throw new Error(friendlyError(error, "Unable to cancel draft."));
  return mapSiteIomFromDb(data);
}

export async function deleteSiteIomDraft(id) {
  const { error } = await supabase
    .from(ENTRIES_TABLE)
    .delete()
    .eq("id", id)
    .eq("entry_status", "draft");
  if (error) throw new Error(friendlyError(error, "Unable to delete draft."));
}

export async function peekSharedEmployeeCode() {
  const { data, error } = await supabase.rpc("hr_peek_shared_employee_code");
  if (error) throw new Error(friendlyError(error, "Unable to suggest employee code."));
  const row = Array.isArray(data) ? data[0] : data;
  return {
    lastUsed: String(row?.last_used ?? "").trim(),
    suggestedNext: String(row?.suggested_next ?? "").trim(),
  };
}

/** Active site people for change events (no sensitive fields). */
export async function searchSitePeople(search = "", limit = 40) {
  let query = supabase
    .from("people")
    .select(
      "id, unique_code, full_name, designation, father_name, phone_no, joining_date, pf_no, salary_basic, is_active"
    )
    .eq("is_active", true)
    .order("full_name", { ascending: true })
    .limit(limit);

  const q = String(search || "").trim();
  if (q) {
    query = query.or(`full_name.ilike.%${q}%,unique_code.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(friendlyError(error, "Unable to search site employees."));
  return (data || []).map((row) => ({
    id: row.id,
    employeeCode: row.unique_code || "",
    fullName: row.full_name || "",
    designation: row.designation || "",
    fatherName: row.father_name || "",
    phoneNo: row.phone_no || "",
    joiningDate: row.joining_date || "",
    pfNo: row.pf_no || "",
    salaryBasic: row.salary_basic == null ? "" : String(row.salary_basic),
  }));
}

/** Load sensitive details only when editing a change for an existing person. */
export async function loadPersonSensitiveDetails(personId) {
  if (!personId) return null;
  const { data, error } = await supabase
    .from("people_sensitive_details")
    .select("date_of_birth, aadhaar_no, pan_no, uan_no, bank_account_no, ifsc_code, bank_name")
    .eq("person_id", personId)
    .maybeSingle();
  if (error) throw new Error(friendlyError(error, "Unable to load employee details."));
  if (!data) return null;
  return {
    dateOfBirth: data.date_of_birth || "",
    aadhaarNo: data.aadhaar_no || "",
    panNo: data.pan_no || "",
    uanNo: data.uan_no || "",
    bankAccountNo: data.bank_account_no || "",
    ifscCode: data.ifsc_code || "",
    bankName: data.bank_name || "",
  };
}

export async function loadActiveSiteNameForPerson(personId) {
  if (!personId) return "";
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("site_assignments")
    .select("site_id, from_date, to_date, sites:site_id ( site_name )")
    .eq("person_id", personId)
    .or(`to_date.is.null,to_date.gte.${today}`)
    .order("from_date", { ascending: false })
    .limit(1);
  if (error) {
    console.warn("Active site lookup failed:", error);
    return "";
  }
  const row = data?.[0];
  return row?.sites?.site_name || "";
}
