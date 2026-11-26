-- =====================================================================
-- Private Storage bucket for QA evidence (executions / defects).
-- Path convention (object name inside bucket):
--   {run_code}/{case_code}/{attempt}/{filename}
-- e.g. RUN-24/TC-1001/1/screenshot.png
-- Metadata rows live in qa.evidence; files are never deleted via policy.
-- =====================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('qa-evidence', 'qa-evidence', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "qa_evidence_insert" ON storage.objects;
DROP POLICY IF EXISTS "qa_evidence_select" ON storage.objects;
DROP POLICY IF EXISTS "qa_evidence_update" ON storage.objects;
DROP POLICY IF EXISTS "qa_evidence_delete" ON storage.objects;

-- Any active QA member may upload.
CREATE POLICY "qa_evidence_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'qa-evidence'
    AND qa.my_role() IS NOT NULL
  );

-- Any active QA member may read.
CREATE POLICY "qa_evidence_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'qa-evidence'
    AND qa.my_role() IS NOT NULL
  );

-- No update / delete policies: evidence is immutable once stored.
-- (Intentional omission — nobody can delete via Storage RLS.)

NOTIFY pgrst, 'reload schema';
