-- One-off purge (run in Supabase SQL Editor as postgres / service role)
-- Deletes: IFSPL/REQ/2026/00005, IFSPL/REQ/2026/00006, CAN-000012 (+ related rows)

BEGIN;

-- Audit events are append-only; temporarily allow cleanup.
ALTER TABLE public.admin_recruitment_events DISABLE TRIGGER trg_admin_recruitment_events_immutable;

CREATE TEMP TABLE _purge_cands ON COMMIT DROP AS
SELECT id, candidate_no
FROM public.admin_recruitment_candidates
WHERE candidate_no = 'CAN-000012'
   OR requisition_id IN (
        SELECT id FROM public.admin_recruitment_requisitions
        WHERE requisition_no IN ('IFSPL/REQ/2026/00005', 'IFSPL/REQ/2026/00006')
      );

CREATE TEMP TABLE _purge_reqs ON COMMIT DROP AS
SELECT id, requisition_no
FROM public.admin_recruitment_requisitions
WHERE requisition_no IN ('IFSPL/REQ/2026/00005', 'IFSPL/REQ/2026/00006');

-- Preview
SELECT 'candidates' AS kind, candidate_no AS ref, id::text AS id FROM _purge_cands
UNION ALL
SELECT 'requisitions', requisition_no, id::text FROM _purge_reqs;

-- Child rows for candidates
DELETE FROM public.admin_recruitment_portal_tokens
WHERE candidate_id IN (SELECT id FROM _purge_cands);

DELETE FROM public.admin_recruitment_communications
WHERE candidate_id IN (SELECT id FROM _purge_cands);

DELETE FROM public.admin_recruitment_candidate_documents
WHERE candidate_id IN (SELECT id FROM _purge_cands);

DELETE FROM public.admin_recruitment_appointments
WHERE candidate_id IN (SELECT id FROM _purge_cands);

DELETE FROM public.admin_recruitment_offers
WHERE candidate_id IN (SELECT id FROM _purge_cands);

DELETE FROM public.admin_recruitment_interviews
WHERE candidate_id IN (SELECT id FROM _purge_cands);

DELETE FROM public.admin_recruitment_screenings
WHERE candidate_id IN (SELECT id FROM _purge_cands);

DELETE FROM public.admin_recruitment_events
WHERE candidate_id IN (SELECT id FROM _purge_cands)
   OR requisition_id IN (SELECT id FROM _purge_reqs);

-- Clear array links to these requisitions on any other candidates (if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_recruitment_candidates'
      AND column_name = 'active_requisition_ids'
  ) THEN
    UPDATE public.admin_recruitment_candidates c
    SET active_requisition_ids = ARRAY(
      SELECT x FROM unnest(COALESCE(c.active_requisition_ids, '{}'::uuid[])) AS x
      WHERE x NOT IN (SELECT id FROM _purge_reqs)
    )
    WHERE c.active_requisition_ids && ARRAY(SELECT id FROM _purge_reqs);
  END IF;
END $$;

-- Detach then delete candidates
UPDATE public.admin_recruitment_candidates
SET requisition_id = NULL
WHERE id IN (SELECT id FROM _purge_cands);

DELETE FROM public.admin_recruitment_candidates
WHERE id IN (SELECT id FROM _purge_cands);

DELETE FROM public.admin_recruitment_requisitions
WHERE id IN (SELECT id FROM _purge_reqs);

ALTER TABLE public.admin_recruitment_events ENABLE TRIGGER trg_admin_recruitment_events_immutable;

-- Verify
SELECT 'remaining_candidates' AS check, count(*)::int AS n
FROM public.admin_recruitment_candidates
WHERE candidate_no = 'CAN-000012'
UNION ALL
SELECT 'remaining_requisitions', count(*)::int
FROM public.admin_recruitment_requisitions
WHERE requisition_no IN ('IFSPL/REQ/2026/00005', 'IFSPL/REQ/2026/00006');

COMMIT;
