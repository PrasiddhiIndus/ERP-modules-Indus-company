-- =============================================================================
-- CTC details for site employees (public.people) — same methodology as the
-- Employee Master CTC tab (admin_salary_structures & co.).
--
-- Why separate tables
--   admin_salary_* rows are keyed by employee_master_id with a foreign key to
--   admin_ifsp_employee_master. people.id is a different id space (person 12 is
--   not employee 12), so writing people into admin_salary_* would either fail
--   or attach a CTC to the wrong office employee.
--
-- Design
--   - Clone the admin tables with LIKE ... INCLUDING ALL so columns, defaults,
--     CHECK rules and unique indexes stay identical to the Employee Master CTC.
--   - Rename the key to person_id and point it at public.people.
--   - ON DELETE RESTRICT: a person with salary records cannot be hard-deleted
--     by accident (deactivate instead); salary history is payroll evidence.
--   - Same access rule as Employee Master CTC: admin_salary_user_has_access().
--   - Site people are NOT added to Admin Salary Processing (it keeps reading
--     admin_salary_structures only).
--
-- DATA SAFETY: additive only. Existing admin_salary_* tables are untouched.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.people') IS NULL THEN
    RAISE EXCEPTION 'public.people does not exist.';
  END IF;
  IF to_regclass('public.admin_salary_structures') IS NULL
     OR to_regclass('public.admin_salary_structure_revisions') IS NULL
     OR to_regclass('public.admin_salary_person_components') IS NULL
     OR to_regclass('public.admin_salary_person_component_history') IS NULL THEN
    RAISE EXCEPTION 'Admin salary tables are missing — apply the Admin Salary migrations first.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.people_salary_structures
  (LIKE public.admin_salary_structures INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.people_salary_structure_revisions
  (LIKE public.admin_salary_structure_revisions INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.people_salary_person_components
  (LIKE public.admin_salary_person_components INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.people_salary_person_component_history
  (LIKE public.admin_salary_person_component_history INCLUDING ALL);

-- employee_master_id → person_id (indexes and unique rules follow the rename)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'people_salary_structures',
    'people_salary_structure_revisions',
    'people_salary_person_components',
    'people_salary_person_component_history'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'employee_master_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I RENAME COLUMN employee_master_id TO person_id', t);
    END IF;
  END LOOP;
END $$;

-- Foreign keys (LIKE does not copy them)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'people_salary_structures_person_fk') THEN
    ALTER TABLE public.people_salary_structures
      ADD CONSTRAINT people_salary_structures_person_fk
      FOREIGN KEY (person_id) REFERENCES public.people (id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'people_salary_structure_revisions_person_fk') THEN
    ALTER TABLE public.people_salary_structure_revisions
      ADD CONSTRAINT people_salary_structure_revisions_person_fk
      FOREIGN KEY (person_id) REFERENCES public.people (id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'people_salary_structure_revisions_structure_fk') THEN
    ALTER TABLE public.people_salary_structure_revisions
      ADD CONSTRAINT people_salary_structure_revisions_structure_fk
      FOREIGN KEY (structure_id) REFERENCES public.people_salary_structures (id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'people_salary_person_components_person_fk') THEN
    ALTER TABLE public.people_salary_person_components
      ADD CONSTRAINT people_salary_person_components_person_fk
      FOREIGN KEY (person_id) REFERENCES public.people (id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'people_salary_person_component_history_person_fk') THEN
    ALTER TABLE public.people_salary_person_component_history
      ADD CONSTRAINT people_salary_person_component_history_person_fk
      FOREIGN KEY (person_id) REFERENCES public.people (id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'people_salary_person_component_history_component_fk') THEN
    ALTER TABLE public.people_salary_person_component_history
      ADD CONSTRAINT people_salary_person_component_history_component_fk
      FOREIGN KEY (component_id) REFERENCES public.people_salary_person_components (id) ON DELETE SET NULL;
  END IF;
END $$;

-- updated_at maintenance (LIKE does not copy triggers)
DO $$
BEGIN
  IF to_regprocedure('public.admin_salary_set_updated_at()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_people_salary_structures_updated_at ON public.people_salary_structures;
    CREATE TRIGGER trg_people_salary_structures_updated_at
      BEFORE UPDATE ON public.people_salary_structures
      FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

    DROP TRIGGER IF EXISTS trg_people_salary_person_components_updated_at ON public.people_salary_person_components;
    CREATE TRIGGER trg_people_salary_person_components_updated_at
      BEFORE UPDATE ON public.people_salary_person_components
      FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();
  END IF;
END $$;

COMMENT ON TABLE public.people_salary_structures IS
  'Declared CTC for site employees (people). Same shape and formulas as admin_salary_structures.';
COMMENT ON TABLE public.people_salary_structure_revisions IS
  'Archived CTC versions for site employees. Written on every revision; never overwritten.';
COMMENT ON TABLE public.people_salary_person_components IS
  'Person-specific CTC extras for site employees (Part A / Part B).';
COMMENT ON TABLE public.people_salary_person_component_history IS
  'Audit history for site employee CTC extras.';

-- Access: same rule as Employee Master CTC
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'people_salary_structures',
    'people_salary_structure_revisions',
    'people_salary_person_components',
    'people_salary_person_component_history'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.admin_salary_user_has_access()) '
      'WITH CHECK (public.admin_salary_user_has_access())',
      t || '_all', t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated, service_role', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
