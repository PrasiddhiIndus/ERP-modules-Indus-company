import { supabase } from '../../../lib/supabase';
import { PROJECTS_SCHEMA, projectsTable } from '../../../services/projectsApi';

const rpc = (name, args) => supabase.schema(PROJECTS_SCHEMA).rpc(name, args);

export function deletionErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const msg = String(err?.message || err || '');
  console.error('Enquiry deletion', err);
  if (/enquiry_deletion_requests|request_enquiry_deletion|decide_enquiry_deletion|schema cache|does not exist/i.test(msg)) {
    return 'Deletion approval is not set up yet. Ask your administrator to apply the latest update.';
  }
  if (/only a manager|no longer exists|already (approved|rejected)|do not have access/i.test(msg)) {
    return msg;
  }
  return fallback;
}

/** Pending requests the user can see (their own, or all for managers). [] when not set up. */
export async function listPendingDeletionRequests() {
  const { data, error } = await projectsTable('enquiry_deletion_requests')
    .select('id, enquiry_id, enquiry_serial, enquiry_client, reason, requested_by, requested_by_name, requested_at')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true });
  if (error) {
    console.warn('Enquiry deletion requests unavailable', error);
    return [];
  }
  return data || [];
}

export async function requestEnquiryDeletion(enquiryId, reason) {
  const { data, error } = await rpc('request_enquiry_deletion', { p_enquiry_id: enquiryId, p_reason: reason || null });
  if (error) throw error;
  return data;
}

export async function decideEnquiryDeletion(requestId, approve, note) {
  const { data, error } = await rpc('decide_enquiry_deletion', {
    p_request_id: requestId,
    p_approve: approve,
    p_note: note || null,
  });
  if (error) throw error;
  return data;
}
