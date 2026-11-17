import { supabase } from '../../../lib/supabase';
import { PROJECTS_SCHEMA, projectsTable } from '../../../services/projectsApi';

const rpc = (name, args) => supabase.schema(PROJECTS_SCHEMA).rpc(name, args);

export function deletionErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const msg = String(err?.message || err || '');
  console.error('Quotation deletion', err);
  if (/quotation_deletion_requests|request_quotation_deletion|decide_quotation_deletion|delete_quotation_as_super_admin|schema cache|does not exist/i.test(msg)) {
    return 'Deletion approval is not set up yet. Ask your administrator to apply the latest update.';
  }
  if (/reporting manager is not set|only this employee|only a super admin|no longer exists|already (approved|rejected)|do not have access/i.test(msg)) {
    return msg;
  }
  return fallback;
}

/** Pending requests visible to the user (own requests, or ones they can decide as L1/admin). */
export async function listPendingQuotationDeletionRequests() {
  const { data, error } = await projectsTable('quotation_deletion_requests')
    .select(
      'id, quotation_id, offer_no, client_name, reason, requested_by, requested_by_name, requested_at, l1_manager_code'
    )
    .eq('status', 'pending')
    .order('requested_at', { ascending: true });
  if (error) {
    console.warn('Quotation deletion requests unavailable', error);
    return [];
  }
  return data || [];
}

export async function requestQuotationDeletion(quotationId, reason) {
  const { data, error } = await rpc('request_quotation_deletion', {
    p_quotation_id: quotationId,
    p_reason: reason || null,
  });
  if (error) throw error;
  return data;
}

/** Super Admin / Super Admin Pro only — deletes immediately (no L1). */
export async function deleteQuotationAsSuperAdmin(quotationId) {
  const { data, error } = await rpc('delete_quotation_as_super_admin', {
    p_quotation_id: quotationId,
  });
  if (error) throw error;
  return data;
}

export async function decideQuotationDeletion(requestId, approve, note) {
  const { data, error } = await rpc('decide_quotation_deletion', {
    p_request_id: requestId,
    p_approve: approve,
    p_note: note || null,
  });
  if (error) throw error;
  return data;
}
