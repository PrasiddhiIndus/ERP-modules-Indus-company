import { supabase } from "../../lib/supabase";
import { isSupabaseRealtimeEnabled } from "../../lib/supabaseConfig";
import { QA_SCHEMA } from "./qaConstants";

function qa() {
  return supabase.schema(QA_SCHEMA);
}

function throwIf(error, fallback = "Something went wrong.") {
  if (!error) return;
  // eslint-disable-next-line no-console
  console.error("[qaApi]", error);
  throw new Error(error.message || fallback);
}

function userMessage(error, fallback) {
  const msg = error?.message || fallback;
  // Strip Postgres RAISE context noise when present
  return String(msg).replace(/^.*ERROR:\s*/i, "").split("\n")[0].trim() || fallback;
}

export { userMessage };

// ---------- Membership / role -------------------------------------------

export async function fetchMyQaRole() {
  const { data, error } = await qa().rpc("my_role");
  if (error) {
    // Not a member → null role (UI stays read-gated by UM)
    if (/permission|policy|not found/i.test(error.message || "")) return null;
    throwIf(error, "Could not load your QA role.");
  }
  return data ?? null;
}

export async function listMembers({ activeOnly = true } = {}) {
  let q = qa().from("members").select("user_id, full_name, qa_role, active, created_at").order("full_name");
  if (activeOnly) q = q.eq("active", true);
  const { data, error } = await q;
  throwIf(error, "Could not load QA members.");
  return data || [];
}

// ---------- Releases ----------------------------------------------------

export async function listReleases() {
  const { data, error } = await qa()
    .from("releases")
    .select("id, target_date, status, created_at")
    .order("created_at", { ascending: false });
  throwIf(error, "Could not load releases.");
  return data || [];
}

export async function createRelease({ id, targetDate = null }) {
  const { data, error } = await qa()
    .from("releases")
    .insert({ id, target_date: targetDate, status: "open" })
    .select("id, target_date, status, created_at")
    .single();
  throwIf(error, "Could not create release.");
  return data;
}

export function pickDefaultRelease(releases) {
  const list = releases || [];
  return list.find((r) => r.status === "open") || list[0] || null;
}

// ---------- Requests ----------------------------------------------------

const REQUEST_SELECT =
  "id, code, title, request_type, change_class, module, likelihood, impact, risk_score, risk, stage, release_id, description, unit_evidence_url, owner_id, created_by, created_at";

export async function listRequests({ releaseId = null, stage = null, search = "" } = {}) {
  let q = qa().from("requests").select(REQUEST_SELECT).order("id", { ascending: false });
  if (releaseId) q = q.eq("release_id", releaseId);
  if (stage) q = q.eq("stage", stage);
  if (search.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`title.ilike.${s},code.ilike.${s},module.ilike.${s}`);
  }
  const { data, error } = await q;
  throwIf(error, "Could not load QA requests.");
  return data || [];
}

export async function getRequest(idOrCode) {
  const raw = String(idOrCode || "").trim();
  let q = qa().from("requests").select(REQUEST_SELECT);
  if (/^QR-\d+$/i.test(raw)) q = q.eq("code", raw.toUpperCase());
  else q = q.eq("id", Number(raw));
  const { data, error } = await q.maybeSingle();
  throwIf(error, "Could not load request.");
  return data;
}

export async function createRequest(payload) {
  const { data, error } = await qa()
    .from("requests")
    .insert({
      title: payload.title,
      request_type: payload.request_type,
      change_class: payload.change_class,
      module: payload.module,
      likelihood: payload.likelihood,
      impact: payload.impact,
      release_id: payload.release_id || null,
      description: payload.description || null,
      owner_id: payload.owner_id || null,
    })
    .select(REQUEST_SELECT)
    .single();
  throwIf(error, "Could not create request.");
  return data;
}

export async function updateRequest(id, patch) {
  const { data, error } = await qa()
    .from("requests")
    .update(patch)
    .eq("id", id)
    .select(REQUEST_SELECT)
    .single();
  throwIf(error, "Could not update request.");
  return data;
}

export async function advanceRequest(requestId) {
  const { data, error } = await qa().rpc("advance_request", { p_request: requestId });
  throwIf(error, "Could not advance request.");
  return Array.isArray(data) ? data : [];
}

export async function listRequestSignoffs(requestId) {
  const { data, error } = await qa()
    .from("request_signoffs")
    .select("request_id, signer_role, signed_by, signed_at")
    .eq("request_id", requestId);
  throwIf(error, "Could not load sign-offs.");
  return data || [];
}

export async function signRequest({ requestId, signerRole }) {
  const { data, error } = await qa()
    .from("request_signoffs")
    .insert({ request_id: requestId, signer_role: signerRole })
    .select("request_id, signer_role, signed_by, signed_at")
    .single();
  throwIf(error, "Could not record sign-off.");
  return data;
}

// ---------- Coverage / gate views ---------------------------------------

export async function listCoverage({ releaseId = null, requestId = null } = {}) {
  let q = qa().from("v_coverage").select("request_id, code, release_id, requirement, coverage");
  if (releaseId) q = q.eq("release_id", releaseId);
  if (requestId) q = q.eq("request_id", requestId);
  const { data, error } = await q;
  throwIf(error, "Could not load coverage.");
  return data || [];
}

export async function listReleaseGate(releaseId) {
  const { data, error } = await qa()
    .from("v_release_gate")
    .select("release_id, key, description, target, actual, met, waived, ok")
    .eq("release_id", releaseId)
    .order("key");
  throwIf(error, "Could not load release gate.");
  return data || [];
}

export async function listLatestResults(releaseId) {
  const { data, error } = await qa()
    .from("v_latest_results")
    .select("release_id, case_id, case_version, result, run_id, attempt, executed_by, executed_at")
    .eq("release_id", releaseId);
  throwIf(error, "Could not load latest results.");
  return data || [];
}

// ---------- Rules -------------------------------------------------------

export async function listRequiredLevelRules() {
  const { data, error } = await qa()
    .from("rule_required_levels")
    .select("change_class, risk, requirement")
    .order("change_class")
    .order("risk")
    .order("requirement");
  throwIf(error, "Could not load required-level rules.");
  return data || [];
}

export async function listSignoffRules() {
  const { data, error } = await qa()
    .from("rule_signoffs")
    .select("change_class, signer_role")
    .order("change_class");
  throwIf(error, "Could not load sign-off rules.");
  return data || [];
}

// ---------- Test cases --------------------------------------------------

const CASE_SELECT =
  "id, code, request_id, current_version, status, author_id, reviewer_id, created_at";

export async function listTestCases({ releaseId = null, requestId = null, status = null, search = "" } = {}) {
  let q = qa().from("test_cases").select(CASE_SELECT).order("id", { ascending: false });
  if (requestId) q = q.eq("request_id", requestId);
  if (status) q = q.eq("status", status);
  if (search.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`code.ilike.${s}`);
  }
  const { data, error } = await q;
  throwIf(error, "Could not load test cases.");
  let rows = data || [];

  if (releaseId) {
    const { data: reqs, error: rErr } = await qa().from("requests").select("id").eq("release_id", releaseId);
    throwIf(rErr, "Could not filter cases by release.");
    const ids = new Set((reqs || []).map((r) => r.id));
    rows = rows.filter((c) => ids.has(c.request_id));
  }
  return rows;
}

export async function getTestCase(idOrCode) {
  const raw = String(idOrCode || "").trim();
  let q = qa().from("test_cases").select(CASE_SELECT);
  if (/^TC-\d+$/i.test(raw)) q = q.eq("code", raw.toUpperCase());
  else q = q.eq("id", Number(raw));
  const { data, error } = await q.maybeSingle();
  throwIf(error, "Could not load test case.");
  return data;
}

export async function listCaseVersions(caseId) {
  const { data, error } = await qa()
    .from("test_case_versions")
    .select(
      "case_id, version, title, level, test_type, iso_char, technique, priority, preconditions, test_data, steps, change_note, created_by, created_at, approved_by, approved_at"
    )
    .eq("case_id", caseId)
    .order("version", { ascending: false });
  throwIf(error, "Could not load case versions.");
  return data || [];
}

export async function getCaseVersion(caseId, version) {
  const { data, error } = await qa()
    .from("test_case_versions")
    .select(
      "case_id, version, title, level, test_type, iso_char, technique, priority, preconditions, test_data, steps, change_note, created_by, created_at, approved_by, approved_at"
    )
    .eq("case_id", caseId)
    .eq("version", version)
    .maybeSingle();
  throwIf(error, "Could not load case version.");
  return data;
}

export async function createTestCaseWithVersion({ requestId, version }) {
  const { data: cse, error: cErr } = await qa()
    .from("test_cases")
    .insert({ request_id: requestId, status: "draft", current_version: 1 })
    .select(CASE_SELECT)
    .single();
  throwIf(cErr, "Could not create test case.");

  const { data: ver, error: vErr } = await qa()
    .from("test_case_versions")
    .insert({
      case_id: cse.id,
      version: 1,
      title: version.title,
      level: version.level,
      test_type: version.test_type || "functional",
      iso_char: version.iso_char || "functional_suitability",
      technique: version.technique,
      priority: version.priority,
      preconditions: version.preconditions || null,
      test_data: version.test_data || null,
      steps: version.steps,
      change_note: version.change_note || "Initial version",
    })
    .select("*")
    .single();
  throwIf(vErr, "Could not create case version.");
  return { case: cse, version: ver };
}

export async function addCaseVersion(caseId, version, nextVersion) {
  const { data, error } = await qa()
    .from("test_case_versions")
    .insert({
      case_id: caseId,
      version: nextVersion,
      title: version.title,
      level: version.level,
      test_type: version.test_type || "functional",
      iso_char: version.iso_char || "functional_suitability",
      technique: version.technique,
      priority: version.priority,
      preconditions: version.preconditions || null,
      test_data: version.test_data || null,
      steps: version.steps,
      change_note: version.change_note || null,
    })
    .select("*")
    .single();
  throwIf(error, "Could not create new case version.");
  return data;
}

export async function approveCaseVersion(caseId, version, approvedBy) {
  const { data, error } = await qa()
    .from("test_case_versions")
    .update({ approved_by: approvedBy })
    .eq("case_id", caseId)
    .eq("version", version)
    .select("*")
    .single();
  throwIf(error, "Could not approve case.");
  return data;
}

export async function setCaseStatus(caseId, status) {
  const { data, error } = await qa()
    .from("test_cases")
    .update({ status })
    .eq("id", caseId)
    .select(CASE_SELECT)
    .single();
  throwIf(error, "Could not update case status.");
  return data;
}

export async function countDraftCasesForRelease(releaseId) {
  if (!releaseId) return 0;
  const cases = await listTestCases({ releaseId, status: "draft" });
  const changes = await listTestCases({ releaseId, status: "changes_requested" });
  return cases.length + changes.length;
}

// ---------- Runs / executions -------------------------------------------

export async function listRuns(releaseId) {
  let q = qa()
    .from("test_runs")
    .select("id, code, name, release_id, build, environment, created_by, created_at")
    .order("id", { ascending: false });
  if (releaseId) q = q.eq("release_id", releaseId);
  const { data, error } = await q;
  throwIf(error, "Could not load test runs.");
  return data || [];
}

export async function getRun(idOrCode) {
  const raw = String(idOrCode || "").trim();
  let q = qa()
    .from("test_runs")
    .select("id, code, name, release_id, build, environment, created_by, created_at");
  if (/^RUN-\d+$/i.test(raw)) q = q.eq("code", raw.toUpperCase());
  else q = q.eq("id", Number(raw));
  const { data, error } = await q.maybeSingle();
  throwIf(error, "Could not load run.");
  return data;
}

export async function createRun({ name, releaseId, build, environment, cases }) {
  const { data: run, error } = await qa()
    .from("test_runs")
    .insert({ name, release_id: releaseId, build, environment })
    .select("id, code, name, release_id, build, environment, created_by, created_at")
    .single();
  throwIf(error, "Could not create test run.");

  if (cases?.length) {
    const rows = cases.map((c) => ({
      run_id: run.id,
      case_id: c.case_id,
      case_version: c.case_version,
      assigned_to: c.assigned_to || null,
    }));
    const { error: rcErr } = await qa().from("run_cases").insert(rows);
    throwIf(rcErr, "Could not add cases to the run.");
  }
  return run;
}

export async function listRunCases(runId) {
  const { data, error } = await qa()
    .from("run_cases")
    .select("run_id, case_id, case_version, assigned_to")
    .eq("run_id", runId);
  throwIf(error, "Could not load run cases.");
  return data || [];
}

export async function listExecutions({ runId = null, caseId = null } = {}) {
  let q = qa()
    .from("executions")
    .select(
      "id, run_id, case_id, case_version, attempt, result, step_results, actual_result, executed_by, executed_at, witnessed_by"
    )
    .order("attempt", { ascending: false });
  if (runId) q = q.eq("run_id", runId);
  if (caseId) q = q.eq("case_id", caseId);
  const { data, error } = await q;
  throwIf(error, "Could not load executions.");
  return data || [];
}

export async function recordExecution(payload) {
  const { data, error } = await qa()
    .from("executions")
    .insert({
      run_id: payload.run_id,
      case_id: payload.case_id,
      case_version: payload.case_version,
      attempt: 1,
      result: payload.result,
      step_results: payload.step_results,
      actual_result: payload.actual_result || null,
      witnessed_by: payload.witnessed_by || null,
    })
    .select("*")
    .single();
  throwIf(error, "Could not record result.");
  return data;
}

export async function uploadEvidenceFile({ path, file }) {
  const { error } = await supabase.storage.from("qa-evidence").upload(path, file, {
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });
  throwIf(error, "Could not upload evidence.");
  return path;
}

export async function insertEvidenceRow(row) {
  const { data, error } = await qa()
    .from("evidence")
    .insert(row)
    .select("*")
    .single();
  throwIf(error, "Could not save evidence metadata.");
  return data;
}

export async function listEvidence({ executionId = null, defectId = null } = {}) {
  let q = qa()
    .from("evidence")
    .select("id, execution_id, defect_id, storage_path, file_name, size_bytes, sha256, uploaded_by, uploaded_at")
    .order("uploaded_at", { ascending: false });
  if (executionId) q = q.eq("execution_id", executionId);
  if (defectId) q = q.eq("defect_id", defectId);
  const { data, error } = await q;
  throwIf(error, "Could not load evidence.");
  return data || [];
}

// ---------- Defects -----------------------------------------------------

const DEFECT_SELECT =
  "id, code, title, severity, priority, status, resolution, request_id, case_id, execution_id, environment, found_in_build, fixed_in_build, assigned_to, reported_by, steps_to_reproduce, expected, actual, rca_category, corrective_action, preventive_action, reopen_count, created_at, updated_at";

export async function listDefects({
  releaseId = null,
  requestId = null,
  status = null,
  openOnly = false,
} = {}) {
  let q = qa().from("defects").select(DEFECT_SELECT).order("id", { ascending: false });
  if (requestId) q = q.eq("request_id", requestId);
  if (status) q = q.eq("status", status);
  if (openOnly) q = q.neq("status", "closed");
  const { data, error } = await q;
  throwIf(error, "Could not load defects.");
  let rows = data || [];
  if (releaseId) {
    const { data: reqs, error: rErr } = await qa().from("requests").select("id").eq("release_id", releaseId);
    throwIf(rErr, "Could not filter defects by release.");
    const ids = new Set((reqs || []).map((r) => r.id));
    rows = rows.filter((d) => ids.has(d.request_id));
  }
  return rows;
}

export async function getDefect(idOrCode) {
  const raw = String(idOrCode || "").trim();
  let q = qa().from("defects").select(DEFECT_SELECT);
  if (/^DEF-\d+$/i.test(raw)) q = q.eq("code", raw.toUpperCase());
  else q = q.eq("id", Number(raw));
  const { data, error } = await q.maybeSingle();
  throwIf(error, "Could not load defect.");
  return data;
}

export async function createDefect(payload) {
  const { data, error } = await qa().from("defects").insert(payload).select(DEFECT_SELECT).single();
  throwIf(error, "Could not log defect.");
  return data;
}

export async function updateDefect(id, patch) {
  const { data, error } = await qa().from("defects").update(patch).eq("id", id).select(DEFECT_SELECT).single();
  throwIf(error, "Could not update defect.");
  return data;
}

export async function listDefectHistory(defectId) {
  const { data, error } = await qa()
    .from("defect_history")
    .select("id, defect_id, from_status, to_status, changed_by, changed_at")
    .eq("defect_id", defectId)
    .order("changed_at", { ascending: true });
  throwIf(error, "Could not load defect history.");
  return data || [];
}

export async function countOpenDefectsForRelease(releaseId) {
  const rows = await listDefects({ releaseId, openOnly: true });
  return rows.length;
}

// ---------- Waivers / release sign-offs / audit -------------------------

export async function createWaiver({ releaseId, criterionKey, reason }) {
  const { data, error } = await qa()
    .from("waivers")
    .insert({ release_id: releaseId, criterion_key: criterionKey, reason })
    .select("*")
    .single();
  throwIf(error, "Could not create waiver.");
  return data;
}

export async function listWaivers(releaseId) {
  const { data, error } = await qa().from("waivers").select("*").eq("release_id", releaseId);
  throwIf(error, "Could not load waivers.");
  return data || [];
}

export async function listReleaseSignoffs(releaseId) {
  const { data, error } = await qa()
    .from("release_signoffs")
    .select("release_id, signer_role, signed_by, signed_at, meaning")
    .eq("release_id", releaseId);
  throwIf(error, "Could not load release sign-offs.");
  return data || [];
}

export async function signRelease({ releaseId, signerRole, meaning }) {
  const { data, error } = await qa()
    .from("release_signoffs")
    .insert({ release_id: releaseId, signer_role: signerRole, meaning })
    .select("*")
    .single();
  throwIf(error, "Could not record release sign-off.");
  return data;
}

export async function listAuditLog({ limit = 100, tableName = null } = {}) {
  let q = qa()
    .from("audit_log")
    .select("id, at, actor, actor_role, action, table_name, record_key, old_row, new_row, prev_hash, row_hash")
    .order("id", { ascending: false })
    .limit(limit);
  if (tableName) q = q.eq("table_name", tableName);
  const { data, error } = await q;
  throwIf(error, "Could not load audit log.");
  return data || [];
}

export function verifyAuditChain(rowsOldestFirst) {
  const breaks = [];
  for (let i = 1; i < rowsOldestFirst.length; i += 1) {
    const prev = rowsOldestFirst[i - 1];
    const cur = rowsOldestFirst[i];
    if (cur.prev_hash !== prev.row_hash) {
      breaks.push({ atId: cur.id, expected: prev.row_hash, actual: cur.prev_hash });
    }
  }
  return { ok: breaks.length === 0, breaks };
}

// ---------- Badge counts / dashboard helpers ----------------------------

export async function fetchQaBadgeCounts(releaseId) {
  const [draftCases, openDefects] = await Promise.all([
    countDraftCasesForRelease(releaseId),
    countOpenDefectsForRelease(releaseId),
  ]);
  return { draftCases, openDefects };
}

// ---------- Realtime ----------------------------------------------------

export function subscribeQaRealtime(onChange, { channelName = "qa-live" } = {}) {
  if (!isSupabaseRealtimeEnabled()) return () => {};
  const channel = supabase
    .channel(channelName)
    .on("postgres_changes", { event: "*", schema: QA_SCHEMA, table: "requests" }, onChange)
    .on("postgres_changes", { event: "*", schema: QA_SCHEMA, table: "defects" }, onChange)
    .on("postgres_changes", { event: "*", schema: QA_SCHEMA, table: "executions" }, onChange)
    .on("postgres_changes", { event: "*", schema: QA_SCHEMA, table: "test_cases" }, onChange)
    .subscribe();
  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      /* ignore */
    }
  };
}

export function createQaRefreshScheduler(fn, delayMs = 400) {
  let t = null;
  return {
    schedule() {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        fn();
      }, delayMs);
    },
    cancel() {
      if (t) clearTimeout(t);
      t = null;
    },
  };
}
