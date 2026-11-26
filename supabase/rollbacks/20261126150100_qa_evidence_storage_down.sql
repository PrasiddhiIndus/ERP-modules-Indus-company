-- Rollback: remove QA evidence Storage bucket policies (bucket left in place if objects exist).

DROP POLICY IF EXISTS "qa_evidence_insert" ON storage.objects;
DROP POLICY IF EXISTS "qa_evidence_select" ON storage.objects;
DROP POLICY IF EXISTS "qa_evidence_update" ON storage.objects;
DROP POLICY IF EXISTS "qa_evidence_delete" ON storage.objects;

-- Do not DROP the bucket if objects may still exist; clear policies only.
-- To remove empty bucket manually: delete from storage.buckets where id = 'qa-evidence';

NOTIFY pgrst, 'reload schema';
