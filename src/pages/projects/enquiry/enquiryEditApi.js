import { supabase } from '../../../lib/supabase';
import { PROJECTS_SCHEMA, projectsTable } from '../../../services/projectsApi';

const rpc = (name, args) => supabase.schema(PROJECTS_SCHEMA).rpc(name, args);

/** Normalize a stored / draft value for change comparison. */
export function normalizeEnquiryCompareValue(value) {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Pure field diffs between two data maps (or flat drafts).
 * Returns [{ field_key, label, old_value, new_value }].
 */
export function diffEnquiryFields(before, after, fields = []) {
  const labelByKey = new Map((fields || []).map((f) => [f.field_key, f.label]));
  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);
  const skip = new Set(['id', 'serial_number', 'created_at', 'updated_at']);
  const out = [];
  for (const key of keys) {
    if (skip.has(key)) continue;
    const oldValue = normalizeEnquiryCompareValue(before?.[key]);
    const newValue = normalizeEnquiryCompareValue(after?.[key]);
    if (oldValue === newValue) continue;
    out.push({
      field_key: key,
      label: labelByKey.get(key) || key,
      old_value: oldValue || null,
      new_value: newValue || null,
    });
  }
  return out;
}

export function editErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const msg = String(err?.message || err || '');
  console.error('Enquiry edit', err);
  if (/enquiry_edit_requests|request_enquiry_edit|decide_enquiry_edit|apply_enquiry_completed|enquiry_notifications|schema cache|does not exist/i.test(msg)) {
    return 'Edit approval is not set up yet. Ask your administrator to apply the latest update.';
  }
  if (/only a manager|no longer exists|already (approved|rejected)|do not have access|no field changes|managers can save|Regret must be sent|Only Completed status/i.test(msg)) {
    return msg;
  }
  if (/row-level security|42501/i.test(msg)) {
    return 'Saving this enquiry needs manager approval. Send your changes for approval instead.';
  }
  return fallback;
}

export async function listPendingEditRequests() {
  const { data, error } = await projectsTable('enquiry_edit_requests')
    .select(
      'id, enquiry_id, enquiry_serial, enquiry_client, changes, reason, requested_by, requested_by_name, requested_at'
    )
    .eq('status', 'pending')
    .order('requested_at', { ascending: true });
  if (error) {
    console.warn('Enquiry edit requests unavailable', error);
    return [];
  }
  return data || [];
}

export async function requestEnquiryEdit(enquiryId, proposedData, reason) {
  const { data, error } = await rpc('request_enquiry_edit', {
    p_enquiry_id: enquiryId,
    p_proposed_data: proposedData || {},
    p_reason: reason || null,
  });
  if (error) throw error;
  return data;
}

/** Non-manager path: apply Completed immediately (fires projects notification). Not for Regret. */
export async function applyEnquiryCompleted(enquiryId, proposedData) {
  const { data, error } = await rpc('apply_enquiry_completed', {
    p_enquiry_id: enquiryId,
    p_proposed_data: proposedData || {},
  });
  if (error) throw error;
  return data;
}

function statusFromChanges(changes = []) {
  const row = (changes || []).find((c) => c.field_key === 'current_status');
  return String(row?.new_value || '').trim().toLowerCase();
}

/** True when the only edits are marking status Completed (+ optional completed_on). */
export function isCompletedOnlyChange(changes = []) {
  const keys = new Set((changes || []).map((c) => c.field_key));
  if (!keys.size) return false;
  for (const key of keys) {
    if (key !== 'current_status' && key !== 'completed_on') return false;
  }
  return statusFromChanges(changes) === 'completed';
}

/** True when status is being set to Regret (needs L1 for non-managers). */
export function isRegretStatusChange(changes = []) {
  return statusFromChanges(changes) === 'regret';
}

export async function decideEnquiryEdit(requestId, approve, note) {
  const { data, error } = await rpc('decide_enquiry_edit', {
    p_request_id: requestId,
    p_approve: approve,
    p_note: note || null,
  });
  if (error) throw error;
  return data;
}

export async function listEnquiryChangeHistory(enquiryId) {
  const { data, error } = await projectsTable('enquiry_field_change_history')
    .select(
      'id, enquiry_id, field_key, field_label, old_value, new_value, changed_by_name, changed_at, source'
    )
    .eq('enquiry_id', enquiryId)
    .order('changed_at', { ascending: false })
    .limit(200);
  if (error) {
    console.warn('Enquiry change history unavailable', error);
    return [];
  }
  return data || [];
}
