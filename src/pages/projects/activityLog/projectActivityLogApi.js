import { projectsTable } from '../../../services/projectsApi';

/**
 * Projects Activity Log (projects.activity_log, migration 20261118183000).
 * Rows are written by database triggers only; the app reads them.
 */
export const ACTIVITY_ENTITY = {
  QUOTATION: 'quotation',
  PO_AT_GLANCE: 'po_at_glance',
};

const PAGE = 500;

export function activityLogErrorMessage(err) {
  const msg = String(err?.message || err || '');
  console.error('Projects activity log', err);
  if (/activity_log|schema cache|does not exist|PGRST205/i.test(msg)) {
    return 'Activity log is not set up yet. Ask your administrator to apply the latest update.';
  }
  if (/permission denied|row-level security|42501/i.test(msg)) {
    return 'You do not have access to this history.';
  }
  return 'Could not load the history. Please try again.';
}

/** Chronological history (newest first) of one record. */
export async function listActivity(entityType, entityId) {
  if (!entityId) return [];
  const { data, error } = await projectsTable('activity_log')
    .select(
      'id, entity_type, entity_id, entity_ref, entity_label, action, field_name, old_value, new_value, changed_by_name, changed_by_employee_code, changed_at, source'
    )
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('changed_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE);
  if (error) throw error;
  return data || [];
}

/** Approval requests on a quotation (deletion + Order Lost), as history events. Visible ones only. */
export async function listQuotationRequestEvents(quotationId) {
  if (!quotationId) return [];
  const [del, lost] = await Promise.all([
    projectsTable('quotation_deletion_requests')
      .select('id, reason, status, requested_by_name, requested_at, decided_by_name, decided_at, decision_note')
      .eq('quotation_id', quotationId),
    projectsTable('quotation_status_change_requests')
      .select('id, previous_status, requested_status, reason, status, requested_by_name, requested_at, decided_by_name, decided_at, decision_note')
      .eq('quotation_id', quotationId),
  ]);
  const events = [];
  const push = (kind, rows) => {
    for (const r of rows || []) {
      const what = kind === 'deletion' ? 'Deletion' : `${r.previous_status || '—'} → ${r.requested_status || 'Order Lost'}`;
      events.push({
        id: `${kind}-req-${r.id}`,
        kind: 'request',
        changed_at: r.requested_at,
        actor: r.requested_by_name,
        title: kind === 'deletion' ? 'Deletion requested (L1)' : 'Order Lost requested (L1)',
        detail: [what, r.reason ? `Reason: ${r.reason}` : ''].filter(Boolean).join(' · '),
      });
      if (r.status !== 'pending' && r.decided_at) {
        events.push({
          id: `${kind}-dec-${r.id}`,
          kind: r.status,
          changed_at: r.decided_at,
          actor: r.decided_by_name,
          title: `${kind === 'deletion' ? 'Deletion' : 'Order Lost'} request ${r.status}`,
          detail: r.decision_note || '',
        });
      }
    }
  };
  // Request history is supplementary — a missing table (not migrated yet) must not hide the log.
  if (!del.error) push('deletion', del.data);
  if (!lost.error) push('order_lost', lost.data);
  return events;
}
