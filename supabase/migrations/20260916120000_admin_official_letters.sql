-- Official letters issued by Admin/HR, plus probation review milestones.

CREATE TABLE IF NOT EXISTS public.admin_official_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  letter_type text NOT NULL
    CHECK (letter_type IN (
      'warning',
      'show_cause',
      'appointment',
      'experience',
      'confirmation',
      'promotion',
      'other'
    )),
  subject text,
  reason text,
  reference_no text,
  letter_date date NOT NULL DEFAULT (CURRENT_DATE),
  effective_date date,
  body_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_official_letters IS
  'Official HR letters (warning, show-cause, appointment, experience, confirmation, promotion, other) issued from Admin.';

CREATE INDEX IF NOT EXISTS admin_official_letters_employee_idx
  ON public.admin_official_letters (employee_master_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_official_letters_type_idx
  ON public.admin_official_letters (letter_type, letter_date DESC);

CREATE INDEX IF NOT EXISTS admin_official_letters_created_at_idx
  ON public.admin_official_letters (created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_probation_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  milestone text NOT NULL
    CHECK (milestone IN ('m2', 'm4', 'm55')),
  scheduled_date date,
  held_on date,
  outcome text NOT NULL DEFAULT 'pending'
    CHECK (outcome IN ('pending', 'continue', 'confirm', 'extend', 'exit')),
  with_appraisal boolean NOT NULL DEFAULT false,
  notes text,
  confirmation_letter_id uuid
    REFERENCES public.admin_official_letters(id) ON DELETE SET NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_master_id, milestone)
);

COMMENT ON TABLE public.admin_probation_reviews IS
  'Probation review meetings at 2 / 4 / 5.5 months from date of joining, with optional appraisal flag.';

CREATE INDEX IF NOT EXISTS admin_probation_reviews_employee_idx
  ON public.admin_probation_reviews (employee_master_id, milestone);

CREATE INDEX IF NOT EXISTS admin_probation_reviews_outcome_idx
  ON public.admin_probation_reviews (outcome, scheduled_date);

CREATE OR REPLACE FUNCTION public.admin_probation_reviews_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_probation_reviews_updated_at
  ON public.admin_probation_reviews;
CREATE TRIGGER trg_admin_probation_reviews_updated_at
  BEFORE UPDATE ON public.admin_probation_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_probation_reviews_set_updated_at();

ALTER TABLE public.admin_official_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_probation_reviews ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_official_letters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_probation_reviews TO authenticated;
GRANT ALL ON public.admin_official_letters TO service_role;
GRANT ALL ON public.admin_probation_reviews TO service_role;

DROP POLICY IF EXISTS admin_official_letters_select ON public.admin_official_letters;
DROP POLICY IF EXISTS admin_official_letters_insert ON public.admin_official_letters;
DROP POLICY IF EXISTS admin_official_letters_update ON public.admin_official_letters;
DROP POLICY IF EXISTS admin_official_letters_delete ON public.admin_official_letters;
DROP POLICY IF EXISTS admin_probation_reviews_select ON public.admin_probation_reviews;
DROP POLICY IF EXISTS admin_probation_reviews_insert ON public.admin_probation_reviews;
DROP POLICY IF EXISTS admin_probation_reviews_update ON public.admin_probation_reviews;
DROP POLICY IF EXISTS admin_probation_reviews_delete ON public.admin_probation_reviews;

CREATE POLICY admin_official_letters_select
  ON public.admin_official_letters
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
    OR (SELECT public.current_user_can_access_module('hr'))
  );

CREATE POLICY admin_official_letters_insert
  ON public.admin_official_letters
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
    OR (SELECT public.current_user_can_access_module('hr'))
  );

CREATE POLICY admin_official_letters_update
  ON public.admin_official_letters
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
    OR (SELECT public.current_user_can_access_module('hr'))
  )
  WITH CHECK (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
    OR (SELECT public.current_user_can_access_module('hr'))
  );

CREATE POLICY admin_official_letters_delete
  ON public.admin_official_letters
  FOR DELETE TO authenticated
  USING (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
    OR (SELECT public.current_user_can_access_module('hr'))
  );

CREATE POLICY admin_probation_reviews_select
  ON public.admin_probation_reviews
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
    OR (SELECT public.current_user_can_access_module('hr'))
  );

CREATE POLICY admin_probation_reviews_insert
  ON public.admin_probation_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
    OR (SELECT public.current_user_can_access_module('hr'))
  );

CREATE POLICY admin_probation_reviews_update
  ON public.admin_probation_reviews
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
    OR (SELECT public.current_user_can_access_module('hr'))
  )
  WITH CHECK (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
    OR (SELECT public.current_user_can_access_module('hr'))
  );

CREATE POLICY admin_probation_reviews_delete
  ON public.admin_probation_reviews
  FOR DELETE TO authenticated
  USING (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
    OR (SELECT public.current_user_can_access_module('hr'))
  );
