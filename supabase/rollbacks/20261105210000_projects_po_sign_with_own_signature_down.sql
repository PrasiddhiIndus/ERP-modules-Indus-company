-- Rollback for 20261105210000_projects_po_sign_with_own_signature.sql. Signatures already recorded stay in place.
DROP FUNCTION IF EXISTS public.pj_oc_sign_stage(uuid, text);
NOTIFY pgrst, 'reload schema';
