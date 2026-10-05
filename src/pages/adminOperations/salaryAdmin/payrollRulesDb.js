/**
 * Payroll Rule Master — versioned by Effective From and keyed by scheme.
 * Table: admin_payroll_rule_versions. Versions used by a CTC record are locked in the DB.
 */

import { supabase } from "../../../lib/supabase";
import { RULE_CODES, normalizeScheme } from "./ctcEngine";

const TABLE = "admin_payroll_rule_versions";

function toDay(d) {
  const s = String(d || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function cleanRules(raw) {
  const out = {};
  for (const code of RULE_CODES) {
    const n = Number(raw?.[code]);
    out[code] = Number.isFinite(n) ? n : null;
  }
  return out;
}

function rowToVersion(row) {
  if (!row) return null;
  return {
    ...row,
    scheme: normalizeScheme(row.scheme),
    effective_from: toDay(row.effective_from),
    rules: cleanRules(row.rules_json),
  };
}

export async function fetchRuleVersions() {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("scheme", { ascending: true })
    .order("effective_from", { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToVersion);
}

/**
 * Version in force for a scheme on a date. When the date is earlier than every version
 * (e.g. older CTC dates), the earliest version is used and `beforeFirstVersion` is set.
 */
export function resolveRuleVersion(versions, scheme, onDate) {
  const s = normalizeScheme(scheme);
  const day = toDay(onDate);
  const list = (versions || [])
    .filter((v) => v.scheme === s)
    .sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1));
  if (!list.length) return null;
  if (!day) return { ...list[list.length - 1], beforeFirstVersion: false };
  const eligible = list.filter((v) => v.effective_from <= day);
  if (eligible.length) return { ...eligible[eligible.length - 1], beforeFirstVersion: false };
  return { ...list[0], beforeFirstVersion: true };
}

export function findRuleVersionById(versions, id) {
  return (versions || []).find((v) => v.id === id) || null;
}

async function currentUserId() {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id || null;
  } catch {
    return null;
  }
}

/** New version. Rules are never edited in place once a version is in use. */
export async function createRuleVersion({
  scheme,
  effectiveFrom,
  rules,
  annexureTitle,
  annexureNote,
  signatoryCompany,
  signatoryTitle,
  remarks,
}) {
  const day = toDay(effectiveFrom);
  if (!day) throw new Error("Effective From date is required.");
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      scheme: normalizeScheme(scheme),
      effective_from: day,
      rules_json: cleanRules(rules),
      annexure_title: annexureTitle || undefined,
      annexure_note: annexureNote ?? null,
      signatory_company: signatoryCompany ?? null,
      signatory_title: signatoryTitle ?? null,
      remarks: remarks ?? null,
      created_by: userId,
      updated_by: userId,
    })
    .select("*")
    .single();
  if (error) {
    if (String(error.code) === "23505") {
      throw new Error("A version for this scheme already starts on that date.");
    }
    throw error;
  }
  return rowToVersion(data);
}

/** Update a version that has not been used yet, or only its Annexure text when locked. */
export async function updateRuleVersion(id, patch) {
  const userId = await currentUserId();
  const body = { updated_by: userId };
  if (patch.rules) body.rules_json = cleanRules(patch.rules);
  if (patch.effectiveFrom) body.effective_from = toDay(patch.effectiveFrom);
  if (patch.annexureTitle !== undefined) body.annexure_title = patch.annexureTitle;
  if (patch.annexureNote !== undefined) body.annexure_note = patch.annexureNote;
  if (patch.signatoryCompany !== undefined) body.signatory_company = patch.signatoryCompany;
  if (patch.signatoryTitle !== undefined) body.signatory_title = patch.signatoryTitle;
  if (patch.remarks !== undefined) body.remarks = patch.remarks;
  const { data, error } = await supabase.from(TABLE).update(body).eq("id", id).select("*").single();
  if (error) throw error;
  return rowToVersion(data);
}
