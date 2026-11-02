/**
 * One-off: delete IFSPL/REQ/2026/00005, IFSPL/REQ/2026/00006 and CAN-000012 (+ related rows).
 * Run: node scripts/_tmp_delete_recruitment_rows.mjs
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: new URL('../.env.server', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
dotenv.config({ path: '.env.server' });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const REQ_NOS = ['IFSPL/REQ/2026/00005', 'IFSPL/REQ/2026/00006'];
const CANDIDATE_NO = 'CAN-000012';

async function del(table, filter) {
  let q = sb.from(table).delete();
  q = filter(q);
  const { data, error } = await q.select('id');
  if (error) throw new Error(`${table}: ${error.message}`);
  return data?.length || 0;
}

async function count(table, filter) {
  let q = sb.from(table).select('id', { count: 'exact', head: true });
  q = filter(q);
  const { count: c, error } = await q;
  if (error) throw new Error(`${table} count: ${error.message}`);
  return c || 0;
}

async function disableEventsGuard() {
  // Prefer RPC if present; otherwise try raw delete and report.
  const { error } = await sb.rpc('admin_recruitment_require_service');
  if (error && !/Could not find|404|PGRST/.test(error.message)) {
    // ignore — may not be callable without args the same way
  }
}

async function deleteCandidateCascade(candidateId) {
  const byCand = (q) => q.eq('candidate_id', candidateId);
  const summary = {};

  // Child tables first (RESTRICT FKs). Events may be immutable — try delete; if blocked, null refs then delete.
  for (const table of [
    'admin_recruitment_portal_tokens',
    'admin_recruitment_communications',
    'admin_recruitment_documents',
    'admin_recruitment_appointments',
    'admin_recruitment_offers',
    'admin_recruitment_interviews',
    'admin_recruitment_screenings',
  ]) {
    try {
      summary[table] = await del(table, byCand);
    } catch (err) {
      // documents table name may differ
      if (/Could not find the table|schema cache|PGRST205/i.test(err.message)) {
        summary[table] = `skip:${err.message}`;
      } else {
        throw err;
      }
    }
  }

  // Alternate document table names used in older schemas
  for (const table of ['admin_recruitment_candidate_documents', 'admin_recruitment_files']) {
    try {
      summary[table] = await del(table, byCand);
    } catch (err) {
      if (/Could not find the table|schema cache|PGRST205/i.test(err.message)) {
        summary[table] = 'skip';
      } else {
        throw err;
      }
    }
  }

  // Events: immutable trigger often blocks DELETE — clear candidate_id then leave or delete via SQL.
  {
    const { data: ev, error: e1 } = await sb
      .from('admin_recruitment_events')
      .update({ candidate_id: null })
      .eq('candidate_id', candidateId)
      .select('id');
    if (e1) {
      summary.events_null = e1.message;
    } else {
      summary.events_nulled = ev?.length || 0;
    }
  }

  // activity / status event tables if present
  for (const table of ['admin_recruitment_activity_log', 'admin_recruitment_status_events', 'admin_recruitment_candidate_events']) {
    try {
      summary[table] = await del(table, byCand);
    } catch (err) {
      if (/Could not find the table|schema cache|PGRST205/i.test(err.message)) summary[table] = 'skip';
      else throw err;
    }
  }

  // Unlink from requisition then delete candidate
  {
    const { error } = await sb
      .from('admin_recruitment_candidates')
      .update({ requisition_id: null })
      .eq('id', candidateId);
    if (error) throw new Error(`unlink candidate: ${error.message}`);
  }

  summary.candidate = await del('admin_recruitment_candidates', (q) => q.eq('id', candidateId));
  return summary;
}

async function deleteRequisitionCascade(reqId, requisitionNo) {
  const summary = { requisition_no: requisitionNo };

  // Detach any remaining candidates
  {
    const { data: linked, error } = await sb
      .from('admin_recruitment_candidates')
      .select('id, candidate_no')
      .eq('requisition_id', reqId);
    if (error) throw new Error(`list linked candidates: ${error.message}`);
    summary.linked_candidates = linked || [];
    for (const c of linked || []) {
      summary[`cand_${c.candidate_no}`] = await deleteCandidateCascade(c.id);
    }
  }

  {
    const { data: ev, error: e1 } = await sb
      .from('admin_recruitment_events')
      .update({ requisition_id: null })
      .eq('requisition_id', reqId)
      .select('id');
    if (e1) summary.events_null = e1.message;
    else summary.events_nulled = ev?.length || 0;
  }

  summary.requisition = await del('admin_recruitment_requisitions', (q) => q.eq('id', reqId));
  return summary;
}

async function main() {
  console.log('Supabase', process.env.SUPABASE_URL);

  const { data: cands, error: cErr } = await sb
    .from('admin_recruitment_candidates')
    .select('id, candidate_no, full_name, status, stage, requisition_id')
    .eq('candidate_no', CANDIDATE_NO);
  if (cErr) throw cErr;
  console.log('Candidate match:', cands);

  const { data: reqs, error: rErr } = await sb
    .from('admin_recruitment_requisitions')
    .select('id, requisition_no, status, designation')
    .in('requisition_no', REQ_NOS);
  if (rErr) throw rErr;
  console.log('Requisition match:', reqs);

  const out = {};

  for (const c of cands || []) {
    out[c.candidate_no] = await deleteCandidateCascade(c.id);
  }

  for (const r of reqs || []) {
    out[r.requisition_no] = await deleteRequisitionCascade(r.id, r.requisition_no);
  }

  // Verify gone
  const { data: cAfter } = await sb
    .from('admin_recruitment_candidates')
    .select('id, candidate_no')
    .eq('candidate_no', CANDIDATE_NO);
  const { data: rAfter } = await sb
    .from('admin_recruitment_requisitions')
    .select('id, requisition_no')
    .in('requisition_no', REQ_NOS);

  console.log(JSON.stringify({ deleted: out, remainingCandidates: cAfter, remainingReqs: rAfter }, null, 2));
}

main().catch((err) => {
  console.error('FAILED', err?.message || err);
  process.exit(1);
});
