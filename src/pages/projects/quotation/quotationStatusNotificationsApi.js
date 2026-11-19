import { projectsTable } from '../../../services/projectsApi';

/** Recent quotation status-change notifications (RLS already limits to eligible recipients). */
export async function listQuotationStatusNotifications({ sinceIso, limit = 40 } = {}) {
  let q = projectsTable('quotation_notifications')
    .select(
      'id, quotation_id, offer_no, client_name, previous_status, new_status, created_at, created_by, created_by_name'
    )
    .eq('kind', 'status_change')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (sinceIso) q = q.gte('created_at', sinceIso);
  const { data, error } = await q;
  if (error) {
    console.warn('Quotation status notifications unavailable', error);
    return [];
  }
  return data || [];
}
