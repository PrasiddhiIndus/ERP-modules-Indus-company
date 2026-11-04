/**
 * Survey Management (ERP admin) — client for /api/admin/surveys.
 * The API server reads/writes indus_one.survey_* with service_role; employees fill the
 * assigned surveys in Indus One (/indus-one/surveys).
 */

import { fetchApiWithAuth } from "./apiBase";

async function call(path, { method = "GET", body } = {}) {
  const res = await fetchApiWithAuth(path, {
    method,
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  if (!res.ok) {
    const err = new Error(res.error || "Survey request failed.");
    err.status = res.status;
    err.fields = res.data?.details?.fields || null;
    throw err;
  }
  return res.data || {};
}

export async function listSurveys() {
  const data = await call("/api/admin/surveys");
  return data.surveys || [];
}

export async function getSurvey(id) {
  return call(`/api/admin/surveys/${encodeURIComponent(id)}`);
}

export async function listSurveyEmployees() {
  const data = await call("/api/admin/surveys/employees");
  return data.employees || [];
}

/** mode: "draft" (save only) | "publish" (save, publish and assign). */
export async function createSurvey(survey, mode = "draft") {
  return call("/api/admin/surveys", { method: "POST", body: { survey, mode } });
}

export async function updateSurvey(id, survey, mode = "save") {
  return call(`/api/admin/surveys/${encodeURIComponent(id)}`, { method: "PUT", body: { survey, mode } });
}

export async function publishSurvey(id) {
  return call(`/api/admin/surveys/${encodeURIComponent(id)}/publish`, { method: "POST", body: {} });
}

export async function unpublishSurvey(id) {
  return call(`/api/admin/surveys/${encodeURIComponent(id)}/unpublish`, { method: "POST", body: {} });
}

/** Pause / resume from the surveys list without opening the editor. */
export async function setSurveyActive(id, isActive) {
  return call(`/api/admin/surveys/${encodeURIComponent(id)}/active`, {
    method: "POST",
    body: { is_active: Boolean(isActive) },
  });
}

export async function duplicateSurvey(id) {
  return call(`/api/admin/surveys/${encodeURIComponent(id)}/duplicate`, { method: "POST", body: {} });
}

export async function archiveSurvey(id) {
  return call(`/api/admin/surveys/${encodeURIComponent(id)}/archive`, { method: "POST", body: {} });
}

/** Permanently deletes the survey, its assignments, and all responses. */
export async function deleteSurvey(id) {
  return call(`/api/admin/surveys/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Short summary shown in toasts after publish. */
export function describeAssignmentSync(assignment) {
  if (!assignment) return "";
  const parts = [`${assignment.targeted} employee(s) in audience`];
  if (assignment.created) parts.push(`${assignment.created} newly assigned`);
  if (assignment.reopened) parts.push(`${assignment.reopened} re-assigned`);
  if (assignment.revoked) parts.push(`${assignment.revoked} removed`);
  return parts.join(" · ");
}
