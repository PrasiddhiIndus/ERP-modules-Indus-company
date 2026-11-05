/**
 * Probation Reviews data access — same security-definer RPCs as Indus One
 * (`src/indus-one/services/probationReviewApi.ts`) on `indus_one.probation_reviews`.
 * The ERP does not read or write the table directly: every workflow rule (eligibility,
 * DOJ + 5 months 15 days trigger, 7-day deadline, L1 → L2 → HR, corrections,
 * notifications) is enforced inside those RPCs, so both apps share one workflow.
 */
import { supabase } from "../../../lib/supabase";
import { getSupabaseAnonKey, getSupabaseUrl } from "../../../lib/supabaseConfig";

export const INDUS_ONE_SCHEMA = "indus_one";

/** Designated probation HR signer (employee master code) — same constant as Indus One. */
export const PROBATION_HR_EMPLOYEE_CODE = "10935";

function indusOneDb() {
  return supabase.schema(INDUS_ONE_SCHEMA);
}

/** Match employee codes (handles 5 vs 0005 style differences) — same rule as Indus One. */
export function empCodesMatch(stored, caller) {
  const a = String(stored || "").trim().toLowerCase();
  const b = String(caller || "").trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return parseInt(a, 10) === parseInt(b, 10);
  return false;
}

function isRpcNotFound(error) {
  if (!error) return false;
  const msg = String(error.message || "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    msg.includes("could not find the function") ||
    msg.includes("schema cache")
  );
}

const str = (v) => (v != null ? String(v) : null);

function mapReview(row) {
  if (!row || typeof row !== "object" || !row.id) return null;
  const r = row;
  return {
    id: String(r.id),
    employee_master_id: Number(r.employee_master_id),
    employee_code: String(r.employee_code || ""),
    employee_name: str(r.employee_name),
    department: str(r.department),
    designation: str(r.designation),
    date_of_joining: String(r.date_of_joining || "").slice(0, 10),
    probation_completion_date: String(r.probation_completion_date || "").slice(0, 10),
    trigger_date: String(r.trigger_date || "").slice(0, 10),
    deadline_date: String(r.deadline_date || "").slice(0, 10),
    is_work_level_2: Boolean(r.is_work_level_2),
    status: String(r.status || "awaiting_l1"),
    display_status: String(r.display_status || r.status || "awaiting_l1"),
    l1_code: String(r.l1_code || ""),
    l1_name: str(r.l1_name),
    l2_code: str(r.l2_code),
    l2_name: str(r.l2_name),
    hr_code: String(r.hr_code || PROBATION_HR_EMPLOYEE_CODE),
    hr_name: r.hr_name != null ? String(r.hr_name).trim() || null : null,
    md_code: String(r.md_code || "1"),
    scores: r.scores || null,
    recommendation: r.recommendation || null,
    draft_scores: r.draft_scores || null,
    draft_recommendation: r.draft_recommendation || null,
    l1_remarks: str(r.l1_remarks),
    l2_remarks: str(r.l2_remarks),
    document_version: Number(r.document_version || 1),
    l1_submitted_at: str(r.l1_submitted_at),
    l1_signer_code: str(r.l1_signer_code),
    l2_signed_at: str(r.l2_signed_at),
    l2_signer_code: str(r.l2_signer_code),
    hr_signed_at: str(r.hr_signed_at),
    hr_signer_code: str(r.hr_signer_code),
    md_signed_at: str(r.md_signed_at),
    md_signer_code: str(r.md_signer_code),
    correction_comments: str(r.correction_comments),
    correction_by_code: str(r.correction_by_code),
    correction_at: str(r.correction_at),
    finalized_at: str(r.finalized_at),
    pdf_object_key: str(r.pdf_object_key),
    created_at: String(r.created_at || ""),
    updated_at: String(r.updated_at || ""),
    is_overdue: Boolean(r.is_overdue),
    history: Array.isArray(r.history) ? r.history : undefined,
  };
}

function mapList(data) {
  return (Array.isArray(data) ? data : []).map(mapReview).filter(Boolean);
}

function aliasNameKeys(map, code, name) {
  const trimmed = String(code || "").trim();
  if (!trimmed) return;
  map[trimmed] = name;
  map[trimmed.toLowerCase()] = name;
}

function lookupEmployeeName(code, names) {
  if (!code) return undefined;
  const trimmed = String(code).trim();
  if (names[trimmed]) return names[trimmed];
  if (names[trimmed.toLowerCase()]) return names[trimmed.toLowerCase()];
  for (const [key, value] of Object.entries(names)) {
    if (empCodesMatch(key, trimmed)) return value;
  }
  return undefined;
}

/** Display names by employee code — same RPCs Indus One uses (batch, then directory fallback). */
async function employeeNamesByCodes(codes) {
  const unique = [...new Set(codes.map((c) => String(c || "").trim()).filter(Boolean))];
  const map = {};
  if (!unique.length) return map;

  const { data, error } = await supabase.rpc("resolve_employee_display_names", {
    p_user_ids: null,
    p_master_ids: null,
    p_codes: unique,
  });
  if (!error && data && typeof data === "object" && data.by_code) {
    for (const [code, name] of Object.entries(data.by_code)) {
      const n = String(name || "").trim();
      if (code && n) aliasNameKeys(map, code, n);
    }
  }

  const missing = unique.filter((code) => !lookupEmployeeName(code, map));
  await Promise.all(
    missing.map(async (code) => {
      const { data: dir, error: dirError } = await supabase.rpc("lookup_employee_directory_entry", {
        p_code: code,
      });
      if (dirError || !dir || typeof dir !== "object") return;
      const name = dir.full_name != null ? String(dir.full_name).trim() : "";
      if (!name) return;
      aliasNameKeys(map, code, name);
      if (dir.employee_code) aliasNameKeys(map, dir.employee_code, name);
    })
  );
  return map;
}

/** Resolve HR display name from employee master when RPC did not include it. */
async function withHrNames(rows) {
  if (!rows.length) return rows;
  const codes = [
    ...new Set(
      rows
        .filter((r) => !r.hr_name)
        .map((r) => String(r.hr_signer_code || r.hr_code || "").trim())
        .filter(Boolean)
    ),
  ];
  if (!codes.length) return rows;
  let names = {};
  try {
    names = await employeeNamesByCodes(codes);
  } catch {
    return rows;
  }
  return rows.map((r) => {
    if (r.hr_name) return r;
    const code = String(r.hr_signer_code || r.hr_code || "").trim();
    const name = code ? lookupEmployeeName(code, names) : undefined;
    return name ? { ...r, hr_name: name } : r;
  });
}

export async function fetchMyProbationReviews(includeFinalized = true) {
  const { data, error } = await indusOneDb().rpc("list_my_probation_reviews", {
    p_include_finalized: includeFinalized,
  });
  if (error) {
    if (isRpcNotFound(error)) return [];
    throw error;
  }
  return withHrNames(mapList(data));
}

export async function fetchProbationReview(id) {
  const { data, error } = await indusOneDb().rpc("get_probation_review", { p_id: id });
  if (error) throw error;
  const mapped = mapReview(data);
  if (!mapped) throw new Error("Invalid review response");
  const [enriched] = await withHrNames([mapped]);
  return enriched;
}

export async function saveProbationReviewDraft(id, scores, recommendation, l1Remarks) {
  const { data, error } = await indusOneDb().rpc("save_probation_review_draft", {
    p_id: id,
    p_scores: scores,
    p_recommendation: recommendation,
    p_l1_remarks: l1Remarks ?? null,
  });
  if (error) throw error;
  const mapped = mapReview(data);
  if (!mapped) throw new Error("Invalid draft response");
  return mapped;
}

export async function submitProbationReviewL1(id, scores, recommendation, l1Remarks) {
  const { data, error } = await indusOneDb().rpc("submit_probation_review_l1", {
    p_id: id,
    p_scores: scores,
    p_recommendation: recommendation,
    p_l1_remarks: l1Remarks ?? null,
  });
  if (error) throw error;
  const mapped = mapReview(data);
  if (!mapped) throw new Error("Invalid submit response");
  return mapped;
}

export async function actOnProbationReview(id, stage, action, comments) {
  const { data, error } = await indusOneDb().rpc("act_probation_review", {
    p_id: id,
    p_stage: stage,
    p_action: action,
    p_comments: String(comments || "").trim() || null,
  });
  if (error) throw error;
  const mapped = mapReview(data);
  if (!mapped) throw new Error("Invalid action response");
  return mapped;
}

/** Blob URL for a participant signature (caller must be authorized for the review). */
export async function fetchProbationSignerSignatureBlob(reviewId, signerCode) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in");

  const res = await fetch(`${getSupabaseUrl()}/functions/v1/get-probation-review-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: getSupabaseAnonKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ review_id: reviewId, signer_code: signerCode, disposition: "inline" }),
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `Could not load signature (${res.status})`;
    try {
      const j = JSON.parse(text);
      if (j.error) msg = j.error;
    } catch {
      /* keep */
    }
    throw new Error(msg);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
