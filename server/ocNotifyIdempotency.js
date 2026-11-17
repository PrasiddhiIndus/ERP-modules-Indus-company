/**
 * Idempotency for PO At Glance sign-off emails (public.oc_signoff_notify_log, service_role only).
 *
 * claim()    → { state: 'claimed' }                 send now
 *              { state: 'duplicate', result }       already sent — return the stored result, send nothing
 *              { state: 'in_progress' }             another request is sending it right now
 *              { state: 'unavailable' }             table not deployed yet — send without idempotency
 * complete() → mark sent (stores the result returned to the UI)
 * fail()     → mark failed (a later retry may send again)
 */
export const OC_NOTIFY_LOG_TABLE = 'oc_signoff_notify_log';
/** A 'sending' claim older than this is treated as crashed and may be taken over by a retry. */
export const STALE_CLAIM_MS = 2 * 60 * 1000;

function isMissingTable(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  if (code === '42P01' || code === 'PGRST205') return true;
  return /oc_signoff_notify_log/.test(msg) && /does not exist|schema cache/i.test(msg);
}

function claimError(message) {
  const err = new Error(message);
  err.status = 500;
  return err;
}

export async function claimOcNotify(db, { key, department, ocId, event, userId, now = Date.now() }) {
  const nowIso = new Date(now).toISOString();
  const { error: insErr } = await db.from(OC_NOTIFY_LOG_TABLE).insert({
    idempotency_key: key,
    department,
    oc_id: ocId,
    event,
    status: 'sending',
    attempts: 1,
    requested_by: userId || null,
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (!insErr) return { state: 'claimed' };
  if (isMissingTable(insErr)) return { state: 'unavailable' };
  if (String(insErr.code) !== '23505') throw claimError('Could not record the notification.');

  const { data: row, error: readErr } = await db
    .from(OC_NOTIFY_LOG_TABLE)
    .select('status, attempts, updated_at, result')
    .eq('idempotency_key', key)
    .maybeSingle();
  if (readErr || !row) throw claimError('Could not read the notification record.');
  if (row.status === 'sent') return { state: 'duplicate', result: row.result || null };
  if (row.status === 'sending' && now - Date.parse(row.updated_at) < STALE_CLAIM_MS) {
    return { state: 'in_progress' };
  }

  // Failed (or crashed) earlier — take it over. `attempts` acts as a version so only one retry wins.
  const { data: taken, error: updErr } = await db
    .from(OC_NOTIFY_LOG_TABLE)
    .update({
      status: 'sending',
      attempts: Number(row.attempts || 0) + 1,
      requested_by: userId || null,
      last_error: null,
      updated_at: nowIso,
    })
    .eq('idempotency_key', key)
    .eq('attempts', row.attempts)
    .neq('status', 'sent')
    .select('id');
  if (updErr) throw claimError('Could not record the notification retry.');
  return taken?.length ? { state: 'claimed' } : { state: 'in_progress' };
}

export async function completeOcNotify(db, key, result) {
  const { error } = await db
    .from(OC_NOTIFY_LOG_TABLE)
    .update({ status: 'sent', result, last_error: null, updated_at: new Date().toISOString() })
    .eq('idempotency_key', key);
  if (error) console.warn('[oc/signoff-notify] could not mark sent', key, error.message);
}

export async function failOcNotify(db, key, message) {
  const { error } = await db
    .from(OC_NOTIFY_LOG_TABLE)
    .update({ status: 'failed', last_error: String(message || 'Send failed').slice(0, 500), updated_at: new Date().toISOString() })
    .eq('idempotency_key', key);
  if (error) console.warn('[oc/signoff-notify] could not mark failed', key, error.message);
}
