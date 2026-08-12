-- ---------------------------------------------------------------------------
-- HR Recruitment tab-level sub-module backfill
-- ---------------------------------------------------------------------------
-- allowed_sub_modules is jsonb (not text[]) — use jsonb operators throughout.
--
-- Adds the 7 workflow tab keys to profiles that already have hr.calling-master
-- but no hr.recruitment.* keys yet. Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  _workflow_tabs text[] := ARRAY[
    'hr.recruitment.dashboard',
    'hr.recruitment.candidates',
    'hr.recruitment.offer-generation',
    'hr.recruitment.offer-response',
    'hr.recruitment.joining',
    'hr.recruitment.iom',
    'hr.recruitment.conversion'
  ];
  _all_tab_keys text[] := _workflow_tabs || ARRAY['hr.recruitment.dropdown-master'];
  _r record;
BEGIN
  FOR _r IN
    SELECT id, allowed_sub_modules
    FROM public.profiles
    WHERE
      allowed_sub_modules @> '["hr.calling-master"]'::jsonb
      AND NOT (allowed_sub_modules ?| _all_tab_keys)
  LOOP
    UPDATE public.profiles
    SET allowed_sub_modules = (
      SELECT COALESCE(jsonb_agg(DISTINCT elem ORDER BY elem), '[]'::jsonb)
      FROM (
        SELECT jsonb_array_elements_text(_r.allowed_sub_modules) AS elem
        UNION ALL
        SELECT unnest(_workflow_tabs) AS elem
      ) merged
    )
    WHERE id = _r.id;
  END LOOP;

  RAISE NOTICE 'hr_recruitment_tab_submodules_backfill: done.';
END;
$$;
