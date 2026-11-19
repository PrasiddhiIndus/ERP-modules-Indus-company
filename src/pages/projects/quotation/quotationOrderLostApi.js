import { supabase } from '../../../lib/supabase';
import { PROJECTS_SCHEMA, projectsTable } from '../../../services/projectsApi';
import { normalizeAppRole, ROLES } from '../../../config/roles';

/** Offer status that needs L1 approval before it applies (migration 20261118180000). */
export const ORDER_LOST_STATUS = 'Order Lost';

const rpc = (name, args) => supabase.schema(PROJECTS_SCHEMA).rpc(name, args);

/** Super Admin / Super Admin Pro set Order Lost directly (same exception as quotation deletion). */
export function canSetOrderLostDirectly(profile) {
  const role = normalizeAppRole(profile?.role);
  return role === ROLES.SUPER_ADMIN || role === ROLES.SUPER_ADMIN_PRO;
}

/** True when this status change must go to L1 instead of being saved. */
export function needsOrderLostApproval(previousStatus, nextStatus, profile) {
  return (
    nextStatus === ORDER_LOST_STATUS &&
    previousStatus !== ORDER_LOST_STATUS &&
    !canSetOrderLostDirectly(profile)
  );
}

export function orderLostErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const msg = String(err?.message || err || '');
  console.error('Quotation Order Lost', err);
  if (/quotation_status_change_requests|request_quotation_order_lost|decide_quotation_order_lost|schema cache|could not find the function/i.test(msg)) {
    return 'Order Lost approval is not set up yet. Ask your administrator to apply the latest update.';
  }
  if (
    /reporting manager is not set|only this employee|no longer exists|already (approved|rejected|failed|marked|waiting)|do not have access|enter the reason|cannot be marked|needs l1 approval|view-only/i.test(
      msg
    )
  ) {
    return msg;
  }
  return fallback;
}

/** Pending Order Lost requests visible to the user (own, or ones they can decide as L1 / admin). */
export async function listPendingOrderLostRequests() {
  const { data, error } = await projectsTable('quotation_status_change_requests')
    .select(
      'id, quotation_id, offer_no, client_name, previous_status, requested_status, reason, requested_by, requested_by_name, requested_at, l1_manager_code'
    )
    .eq('status', 'pending')
    .order('requested_at', { ascending: true });
  if (error) {
    console.warn('Order Lost requests unavailable', error);
    return [];
  }
  return data || [];
}

/**
 * Reportee view: own Order Lost requests (pending + recent decided), newest first.
 * RLS already limits rows to requester / L1 / admin.
 */
export async function listMyOrderLostRequests({ limit = 30 } = {}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return [];
  const { data, error } = await projectsTable('quotation_status_change_requests')
    .select(
      'id, quotation_id, offer_no, client_name, previous_status, requested_status, reason, status, requested_by, requested_by_name, requested_at, decided_by_name, decided_at, decision_note'
    )
    .eq('requested_by', user.id)
    .in('status', ['pending', 'approved', 'rejected', 'failed'])
    .order('requested_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('My Order Lost requests unavailable', error);
    return [];
  }
  return data || [];
}

/** Full request history for one quotation (newest first). */
export async function listOrderLostHistory(quotationId) {
  if (!quotationId) return [];
  const { data, error } = await projectsTable('quotation_status_change_requests')
    .select(
      'id, previous_status, requested_status, reason, status, requested_by_name, requested_at, decided_by_name, decided_at, decision_note'
    )
    .eq('quotation_id', quotationId)
    .order('requested_at', { ascending: false });
  if (error) {
    console.warn('Order Lost history unavailable', error);
    return [];
  }
  return data || [];
}

export async function requestOrderLost(quotationId, reason) {
  const { data, error } = await rpc('request_quotation_order_lost', {
    p_quotation_id: quotationId,
    p_reason: String(reason || '').trim(),
  });
  if (error) throw error;
  return data;
}

/** Returns 'approved' | 'rejected' | 'failed'. */
export async function decideOrderLost(requestId, approve, note) {
  const { data, error } = await rpc('decide_quotation_order_lost', {
    p_request_id: requestId,
    p_approve: approve,
    p_note: note || null,
  });
  if (error) throw error;
  return data;
}
