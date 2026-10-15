-- Probation review reminder log: one row per employee once their L1 has been emailed
-- that the employee completed 6 months on probation. Written by the API server
-- (service_role) before sending, so restarts or several instances never send twice.
-- Rollback: DROP TABLE IF EXISTS public.admin_probation_review_reminders;

CREATE TABLE IF NOT EXISTS public.admin_probation_review_reminders (
  id bigserial PRIMARY KEY,
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  employee_code text,
  date_of_joining date,
  six_month_date date NOT NULL,
  l1_manager_code text,
  sent_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_probation_review_reminders_once UNIQUE (employee_master_id)
);

CREATE INDEX IF NOT EXISTS admin_probation_review_reminders_code_idx
  ON public.admin_probation_review_reminders (employee_code);

ALTER TABLE public.admin_probation_review_reminders ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.admin_probation_review_reminders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_probation_review_reminders TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.admin_probation_review_reminders_id_seq TO service_role;

DROP POLICY IF EXISTS admin_probation_review_reminders_read ON public.admin_probation_review_reminders;
CREATE POLICY admin_probation_review_reminders_read ON public.admin_probation_review_reminders
  FOR SELECT TO authenticated
  USING (public.current_user_has_attendance_admin_access());

NOTIFY pgrst, 'reload schema';
