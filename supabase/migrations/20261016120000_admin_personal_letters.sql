-- Personal letters: birthday and wedding-anniversary greeting cards
-- generated daily at 8:00 IST for employees whose occasion falls that day.
-- Rollback: DROP TABLE IF EXISTS public.admin_personal_letters;

CREATE TABLE IF NOT EXISTS public.admin_personal_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  letter_kind text NOT NULL
    CHECK (letter_kind IN ('birthday', 'anniversary')),
  occasion_date date NOT NULL,
  subject text,
  employee_full_name text NOT NULL,
  template_file text NOT NULL,
  object_key text,
  file_name text,
  content_type text,
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_personal_letters_once_per_day
    UNIQUE (employee_master_id, letter_kind, occasion_date)
);

COMMENT ON TABLE public.admin_personal_letters IS
  'Birthday and wedding-anniversary greeting cards generated for Employee Master occasions.';

COMMENT ON COLUMN public.admin_personal_letters.letter_kind IS
  'birthday = date_of_birth; anniversary = wedding anniversary (date_of_anniversary).';

COMMENT ON COLUMN public.admin_personal_letters.template_file IS
  'Source template file name from the public Indus 4K template folders.';

COMMENT ON COLUMN public.admin_personal_letters.object_key IS
  'Optional Cloudflare R2 object key for the personalized JPEG.';

CREATE INDEX IF NOT EXISTS admin_personal_letters_employee_idx
  ON public.admin_personal_letters (employee_master_id, occasion_date DESC);

CREATE INDEX IF NOT EXISTS admin_personal_letters_kind_date_idx
  ON public.admin_personal_letters (letter_kind, occasion_date DESC);

CREATE INDEX IF NOT EXISTS admin_personal_letters_created_at_idx
  ON public.admin_personal_letters (created_at DESC);

ALTER TABLE public.admin_personal_letters ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.admin_personal_letters TO authenticated;
GRANT ALL ON public.admin_personal_letters TO service_role;

DROP POLICY IF EXISTS admin_personal_letters_select ON public.admin_personal_letters;
CREATE POLICY admin_personal_letters_select
  ON public.admin_personal_letters
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
    OR (SELECT public.current_user_can_access_module('hr'))
  );

NOTIFY pgrst, 'reload schema';
