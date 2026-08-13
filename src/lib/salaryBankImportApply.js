/**
 * Apply parsed salary-bank Excel rows onto admin_ifsp_employee_master.
 * Updates matched employees; creates basic profiles for unmatched codes.
 * Personal details + Salary Processing both read these columns from DB.
 */

import { supabase } from "./supabase";
import { EMPLOYEE_MASTER_TABLE } from "../modules/payroll/integrations";
import { normalizeAttendanceEmpCode } from "./attendanceDaily";
import { buildMasterPatchFromBankRow } from "./salaryBankExcel";
import { syncScopeDraftBankFromMaster } from "../pages/adminOperations/salaryAdmin/salaryMonthProcessing";
import {
  nextEmployeeSystemId,
  normalizeEmploymentType,
} from "../utils/employeeMasterReminders";

/** Normalize Emp. Code so FTC 41 / FTC-41 / FTC41 are the same key. */
export function salaryEmpCodeKey(code) {
  const n = normalizeAttendanceEmpCode(code);
  if (!n) return "";
  if (/^\d+$/.test(n)) return n;
  const compact = n.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return compact.replace(/^([A-Z]+)(\d+)$/, "$1-$2");
}

function codeKey(code) {
  return salaryEmpCodeKey(code);
}

function inferTypeFromCode(code) {
  const c = String(code || "").trim();
  if (/^ftc[-_\s]?\d+/i.test(c) || /^c-\d+/i.test(c)) return "contract";
  if (/^v-\d+/i.test(c)) return "voucher";
  return "permanent";
}

/** Prefer hyphenated Active profile (FTC-41) over spaced duplicate (FTC 41). */
function pickPreferredMaster(rows = []) {
  const list = (rows || []).filter(Boolean);
  if (!list.length) return null;
  const scored = [...list].sort((a, b) => {
    const aHyphen = String(a.employee_code || "").includes("-") ? 1 : 0;
    const bHyphen = String(b.employee_code || "").includes("-") ? 1 : 0;
    if (bHyphen !== aHyphen) return bHyphen - aHyphen;
    const aActive = String(a.status || "") === "Active" ? 1 : 0;
    const bActive = String(b.status || "") === "Active" ? 1 : 0;
    if (bActive !== aActive) return bActive - aActive;
    return Number(a.id) - Number(b.id);
  });
  return scored[0];
}

function findLocalByCode(list, code) {
  const key = codeKey(code);
  if (!key) return null;
  const hits = (list || []).filter((e) => codeKey(e.employee_code) === key);
  return pickPreferredMaster(hits);
}

function codeLookupVariants(code) {
  const raw = String(code || "").trim();
  const key = codeKey(raw);
  const norm = normalizeAttendanceEmpCode(raw);
  const variants = new Set([raw, norm, key].filter(Boolean));
  if (/^\d+$/.test(norm || key)) {
    const digits = norm || key;
    variants.add(digits);
    for (let w = 3; w <= 6; w += 1) variants.add(digits.padStart(w, "0"));
  } else if (key) {
    const m = /^([A-Z]+)-(\d+)$/.exec(key);
    if (m) {
      variants.add(`${m[1]}-${m[2]}`);
      variants.add(`${m[1]} ${m[2]}`);
      variants.add(`${m[1]}${m[2]}`);
      variants.add(`${m[1]}_${m[2]}`);
      variants.add(`${m[1].toLowerCase()}-${m[2]}`);
      variants.add(`${m[1]}-${String(Number(m[2]))}`);
    }
  }
  return [...variants];
}

/** DB lookup — all code variants (FTC-41 / FTC 41); prefer hyphenated Active row. */
async function fetchMastersByCode(code) {
  const list = codeLookupVariants(code);
  if (!list.length) return [];

  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select(
      "id, employee_code, employee_id, full_name, bank_account_no, ifsc_code, uan_no, esic_no, bank_name, status"
    )
    .in("employee_code", list)
    .limit(20);
  if (error) {
    console.warn("salary bank import: code lookup failed", code, error);
    return [];
  }
  if (data?.length) {
    const want = codeKey(code);
    return data.filter((r) => codeKey(r.employee_code) === want);
  }
  return [];
}

async function fetchMasterByCode(code) {
  return pickPreferredMaster(await fetchMastersByCode(code));
}

/**
 * @param {{ rows?: object[], unmatched?: object[] }} parsed
 * @param {{ employees?: object[], user?: { id: string, email?: string } }} options
 */
export async function applySalaryBankImportToMaster(parsed, options = {}) {
  const matched = Array.isArray(parsed?.rows) ? parsed.rows : [];
  const unmatched = Array.isArray(parsed?.unmatched) ? parsed.unmatched : [];
  const working = [...(options.employees || [])];
  const user = options.user || null;

  let updated = 0;
  let created = 0;
  let unchanged = 0;
  const failures = [];
  const createdRows = [];
  const updatedIds = [];
  const sampleUpdated = [];

  const allIncoming = [...matched, ...unmatched];

  for (const row of allIncoming) {
    const empCode = row.empCodeRaw || row.empCode;
    if (!empCode) continue;
    const normalizedCode = codeKey(empCode) || String(empCode).trim();

    let masters = [];
    if (row.employeeMasterId) {
      const hit = working.find((e) => String(e.id) === String(row.employeeMasterId));
      if (hit) masters = [hit];
    }
    if (!masters.length) {
      const localHits = (working || []).filter(
        (e) => codeKey(e.employee_code) === codeKey(empCode)
      );
      masters = localHits;
    }
    if (!masters.length) {
      masters = await fetchMastersByCode(empCode);
      for (const m of masters) {
        if (!working.some((e) => String(e.id) === String(m.id))) working.push(m);
      }
    }

    // Prefer updating existing hyphenated profile; never create a spaced duplicate if one exists
    let master = pickPreferredMaster(masters);

    const patch = buildMasterPatchFromBankRow(row);
    if (row.employeeName && !String(master?.full_name || "").trim()) {
      patch.full_name = row.employeeName;
    }
    if (user?.email) patch.updated_by = user.email;

    const dataKeys = Object.keys(patch).filter(
      (k) => k !== "updated_at" && k !== "updated_by"
    );

    if (master?.id) {
      if (!dataKeys.length) {
        unchanged += 1;
        continue;
      }
      // Update every duplicate code variant (FTC 41 + FTC-41) so Personal details always shows data
      const targets = masters.length ? masters : [master];
      let anyOk = false;
      for (const target of targets) {
        const { data: saved, error } = await supabase
          .from(EMPLOYEE_MASTER_TABLE)
          .update(patch)
          .eq("id", target.id)
          .select("id, employee_code, bank_account_no, ifsc_code, uan_no, esic_no, full_name")
          .maybeSingle();
        if (error || !saved) {
          console.error("salary bank import: update failed", empCode, target.id, error);
          continue;
        }
        Object.assign(target, saved);
        syncScopeDraftBankFromMaster(target.id, {
          account_no: saved.bank_account_no,
          ifsc: saved.ifsc_code,
        });
        updatedIds.push(target.id);
        anyOk = true;
      }
      if (!anyOk) {
        failures.push(String(empCode));
        continue;
      }
      updated += 1;
      if (sampleUpdated.length < 5) {
        sampleUpdated.push(master.employee_code || normalizedCode);
      }
      continue;
    }

    const hasBits = Boolean(
      row.accountNo || row.ifsc || row.uanNo || row.esicNo || row.employeeName
    );
    if (!hasBits || !user?.id) {
      failures.push(String(empCode));
      continue;
    }

    try {
      const employment_type = normalizeEmploymentType(inferTypeFromCode(empCode));
      const employee_id = nextEmployeeSystemId(working, employment_type);
      const todayYmd = new Date().toISOString().slice(0, 10);
      const insertPayload = {
        // Always store normalized code (FTC-41) so profile + import stay aligned
        employee_code: normalizedCode,
        employee_id,
        employment_type,
        full_name: row.employeeName || `Employee ${normalizedCode}`,
        designation: row.designation || "Other",
        department: row.department || "Other",
        date_of_joining: row.dateOfJoining || todayYmd,
        status: "Active",
        uan_no: row.uanNo || null,
        esic_no: row.esicNo || null,
        bank_account_no: row.accountNo || null,
        ifsc_code: row.ifsc || null,
        user_id: user.id,
        created_by: user.email || "",
        updated_by: user.email || "",
        updated_at: new Date().toISOString(),
      };
      const { data: inserted, error } = await supabase
        .from(EMPLOYEE_MASTER_TABLE)
        .insert(insertPayload)
        .select("*")
        .single();
      if (error) throw error;
      working.push(inserted);
      syncScopeDraftBankFromMaster(inserted.id, {
        account_no: inserted.bank_account_no,
        ifsc: inserted.ifsc_code,
      });
      createdRows.push({
        ...row,
        employeeMasterId: inserted.id,
        matchStatus: "created",
        masterName: inserted.full_name,
      });
      updatedIds.push(inserted.id);
      created += 1;
    } catch (e) {
      console.error("salary bank import: create failed", empCode, e);
      failures.push(String(empCode));
    }
  }

  return {
    updated,
    created,
    unchanged,
    failures,
    createdRows,
    updatedIds,
    sampleUpdated,
    message: buildResultMessage({ updated, created, unchanged, failures, sampleUpdated }),
  };
}

function buildResultMessage({ updated, created, unchanged, failures, sampleUpdated }) {
  const parts = [];
  if (updated) {
    parts.push(
      `${updated} profile(s) updated${
        sampleUpdated?.length
          ? ` (${sampleUpdated.join(", ")}${updated > sampleUpdated.length ? "…" : ""})`
          : ""
      }`
    );
  }
  if (created) parts.push(`${created} new profile(s) created`);
  if (unchanged) parts.push(`${unchanged} already up to date`);
  if (failures?.length) {
    parts.push(
      `${failures.length} failed (${failures.slice(0, 6).join(", ")}${failures.length > 6 ? "…" : ""})`
    );
  }
  return parts.join(" · ") || "No salary account changes saved.";
}
