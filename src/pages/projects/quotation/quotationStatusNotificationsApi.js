import { projectsTable } from '../../../services/projectsApi';

/** Status changes plus L1 approval / rejection (RLS limits to eligible recipients). */
export async function listQuotationStatusNotifications({ sinceIso, limit = 40 } = {}) {
  let q = projectsTable('quotation_notifications')
    .select(
      'id, quotation_id, offer_no, client_name, previous_status, new_status, kind, created_at, created_by, created_by_name'
    )
    .in('kind', ['status_change', 'approved', 'rejected'])
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
