-- =============================================================================
-- Admin In-house Recruitment — workflow data model (replaces the Admin use of the
-- shared Calling Database). HR Calling Database tables and functions are untouched.
--
--   Requisition → Approval → Candidate → Screening → Interview → Selection → Offer →
--   Offer Acceptance → Appointment → Documents → Joining → Employee Conversion
--
-- All writes go through SECURITY DEFINER workflow functions (next migration).
-- Signed-in users only get SELECT through RLS; there are no direct write grants.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Permission helper
--   view          any Admin recruitment access (or approver)
--   requisitions | candidates | interviews | offers | documents | joining |
--   conversion | communication | reports  → workflow tabs (admin.recruitment.<tab>)
--   settings      Admin / Super Admin role or admin.recruitment.settings
--   approve       Admin / Super Admin role or admin.recruitment.approve
-- Full Admin module users (team/allowed module/admin.employee) get every workflow
-- capability unless they are restricted to specific recruitment tabs.
-- Service role (API server automation) is always allowed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_can(p_cap text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_role text;
  v_team text;
  v_mods jsonb;
  v_subs jsonb;
  v_keys text[];
  v_restricted boolean;
  v_full boolean;
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN true;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT public.normalize_erp_role(p.role),
         public.normalize_erp_module_key(p.team),
         public.jsonb_text_array(to_jsonb(p) -> 'allowed_modules'),
         public.jsonb_text_array(to_jsonb(p) -> 'allowed_sub_modules')
    INTO v_role, v_team, v_mods, v_subs
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND coalesce((to_jsonb(p) ->> 'is_active')::boolean, true);

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_role IN ('super_admin', 'super_admin_pro', 'admin') THEN
    RETURN true;
  END IF;

  -- Legacy Admin recruitment tab keys map onto the new sections.
  SELECT coalesce(array_agg(
           CASE s.value
             WHEN 'admin.recruitment.offer-generation' THEN 'admin.recruitment.offers'
             WHEN 'admin.recruitment.offer-response' THEN 'admin.recruitment.offers'
             WHEN 'admin.recruitment.iom' THEN 'admin.recruitment.joining'
             WHEN 'admin.recruitment.referral' THEN 'admin.recruitment.candidates'
             WHEN 'admin.recruitment.dropdown-master' THEN 'admin.recruitment.settings'
             ELSE s.value
           END), '{}'::text[])
    INTO v_keys
  FROM jsonb_array_elements_text(v_subs) AS s(value);

  IF p_cap = 'approve' THEN
    RETURN 'admin.recruitment.approve' = ANY (v_keys);
  END IF;
  IF p_cap = 'settings' THEN
    RETURN 'admin.recruitment.settings' = ANY (v_keys);
  END IF;

  v_restricted := EXISTS (
    SELECT 1 FROM unnest(v_keys) AS k
    WHERE k LIKE 'admin.recruitment.%' AND k <> 'admin.recruitment.approve'
  );

  v_full := (
      (
        v_team = 'admin'
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(v_mods) AS m(value)
          WHERE public.normalize_erp_module_key(m.value) = 'admin'
        )
        OR 'admin.employee' = ANY (v_keys)
      )
      AND NOT v_restricted
    )
    OR 'admin.recruitment' = ANY (v_keys);

  IF p_cap = 'view' THEN
    RETURN v_full OR v_restricted OR 'admin.recruitment.approve' = ANY (v_keys);
  END IF;

  IF v_full THEN
    RETURN true;
  END IF;

  RETURN ('admin.recruitment.' || p_cap) = ANY (v_keys);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recruitment_can(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recruitment_can(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_recruitment_can(text) IS
  'Admin In-house Recruitment capability check (server-side source of truth for the recruitment UI and workflow functions).';

-- ---------------------------------------------------------------------------
-- Reference numbers
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.admin_recruitment_req_seq;
CREATE SEQUENCE IF NOT EXISTS public.admin_recruitment_candidate_seq;
CREATE SEQUENCE IF NOT EXISTS public.admin_recruitment_offer_seq;
CREATE SEQUENCE IF NOT EXISTS public.admin_recruitment_appointment_seq;

CREATE OR REPLACE FUNCTION public.admin_recruitment_today()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_next_ref(p_kind text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text := to_char(public.admin_recruitment_today(), 'YYYY');
BEGIN
  CASE p_kind
    WHEN 'REQ' THEN RETURN 'IFSPL/REQ/' || v_year || '/' || lpad(nextval('public.admin_recruitment_req_seq')::text, 5, '0');
    WHEN 'OFR' THEN RETURN 'IFSPL/OFR/' || v_year || '/' || lpad(nextval('public.admin_recruitment_offer_seq')::text, 5, '0');
    WHEN 'APT' THEN RETURN 'IFSPL/APT/' || v_year || '/' || lpad(nextval('public.admin_recruitment_appointment_seq')::text, 5, '0');
    WHEN 'CAN' THEN RETURN 'CAN-' || lpad(nextval('public.admin_recruitment_candidate_seq')::text, 6, '0');
    ELSE RAISE EXCEPTION 'Unknown reference kind %', p_kind;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recruitment_next_ref(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_recruitment_stage_rank(p_stage text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT array_position(ARRAY[
    'new', 'screening', 'shortlisted', 'interview', 'selected', 'offer', 'offer_accepted',
    'appointment', 'documents', 'ready_to_join', 'joined', 'employee_created'
  ]::text[], p_stage)
$$;

GRANT EXECUTE ON FUNCTION public.admin_recruitment_today() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_recruitment_stage_rank(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Settings (single row) and configurable document checklist
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_recruitment_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  company_name text NOT NULL DEFAULT 'Indus Fire Safety Private Limited',
  offer_validity_days integer NOT NULL DEFAULT 7 CHECK (offer_validity_days BETWEEN 1 AND 90),
  approval_levels integer NOT NULL DEFAULT 1 CHECK (approval_levels BETWEEN 1 AND 3),
  portal_link_days integer NOT NULL DEFAULT 14 CHECK (portal_link_days BETWEEN 1 AND 60),
  auto_reminders jsonb NOT NULL DEFAULT '{"interview": true, "offer": true, "documents": true, "joining": true}'::jsonb,
  interview_reminder_hours integer NOT NULL DEFAULT 24 CHECK (interview_reminder_hours BETWEEN 1 AND 168),
  offer_reminder_days integer NOT NULL DEFAULT 2 CHECK (offer_reminder_days BETWEEN 1 AND 30),
  document_reminder_days integer NOT NULL DEFAULT 2 CHECK (document_reminder_days BETWEEN 1 AND 30),
  joining_reminder_days integer NOT NULL DEFAULT 1 CHECK (joining_reminder_days BETWEEN 0 AND 14),
  max_reminders integer NOT NULL DEFAULT 3 CHECK (max_reminders BETWEEN 0 AND 10),
  auto_convert_on_join boolean NOT NULL DEFAULT false,
  sources jsonb NOT NULL DEFAULT '["Job portal", "Referral", "Walk-in", "Consultant", "Direct application", "Campus"]'::jsonb,
  interviewers jsonb NOT NULL DEFAULT '[]'::jsonb,
  evaluation_criteria jsonb NOT NULL DEFAULT '["Communication", "Technical knowledge", "Relevant experience", "Attitude & discipline", "Culture fit"]'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.admin_recruitment_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.admin_recruitment_document_types (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]{2,40}$'),
  label text NOT NULL,
  description text,
  required boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.admin_recruitment_document_types (key, label, required, sort_order) VALUES
  ('aadhaar', 'Aadhaar card', true, 10),
  ('pan', 'PAN card', true, 20),
  ('photo', 'Passport-size photograph', true, 30),
  ('bank', 'Bank details (cancelled cheque / passbook)', true, 40),
  ('education', 'Education certificates', true, 50),
  ('prev_employment', 'Previous employment documents', false, 60),
  ('police', 'Police verification', false, 70)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Requisitions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_recruitment_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_no text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'erp' CHECK (source IN ('erp', 'indus_one')),
  source_ref uuid UNIQUE,
  designation text NOT NULL,
  department text,
  openings integer NOT NULL DEFAULT 1 CHECK (openings BETWEEN 1 AND 999),
  filled_count integer NOT NULL DEFAULT 0 CHECK (filled_count >= 0),
  location text,
  employment_type text NOT NULL DEFAULT 'Permanent',
  experience_min numeric(4, 1),
  experience_max numeric(4, 1),
  skills text,
  qualification text,
  required_by date,
  reason text,
  other_requirements text,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'pending_approval', 'approved', 'rejected', 'open', 'filled', 'cancelled')),
  approval_levels_required integer NOT NULL DEFAULT 1 CHECK (approval_levels_required BETWEEN 1 AND 3),
  approval_level_done integer NOT NULL DEFAULT 0 CHECK (approval_level_done >= 0),
  status_reason text,
  raised_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  raised_by_name text,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_by_name text,
  opened_at timestamptz,
  closed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_recruitment_requisitions_status_idx
  ON public.admin_recruitment_requisitions (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Candidates (one continuous record for the whole lifecycle)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_recruitment_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_no text NOT NULL UNIQUE,
  requisition_id uuid REFERENCES public.admin_recruitment_requisitions(id) ON DELETE RESTRICT,
  full_name text NOT NULL,
  email text,
  phone text,
  phone_key text,
  email_key text,
  alternate_phone text,
  gender text,
  date_of_birth date,
  current_location text,
  home_town text,
  qualification text,
  experience_years numeric(4, 1),
  current_company text,
  current_designation text,
  current_ctc numeric(12, 2),
  expected_ctc numeric(12, 2),
  notice_period_days integer CHECK (notice_period_days IS NULL OR notice_period_days BETWEEN 0 AND 365),
  skills text,
  source text NOT NULL DEFAULT 'Direct application',
  referred_by_employee_id bigint REFERENCES public.admin_ifsp_employee_master(id) ON DELETE SET NULL,
  referred_by_name text,
  referral_notes text,
  recruiter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recruiter_name text,
  stage text NOT NULL DEFAULT 'new'
    CHECK (stage IN ('new', 'screening', 'shortlisted', 'interview', 'selected', 'offer', 'offer_accepted',
                     'appointment', 'documents', 'ready_to_join', 'joined', 'employee_created')),
  outcome text CHECK (outcome IN ('rejected', 'withdrawn', 'no_show', 'offer_declined', 'offer_expired', 'cancelled')),
  outcome_reason text,
  outcome_at timestamptz,
  resume jsonb,
  expected_joining_date date,
  actual_joining_date date,
  joining_remarks text,
  doc_reminder_count integer NOT NULL DEFAULT 0,
  doc_last_reminder_at timestamptz,
  joining_reminder_for date,
  employee_master_id bigint UNIQUE REFERENCES public.admin_ifsp_employee_master(id) ON DELETE SET NULL,
  employee_code text,
  employee_system_id text,
  converted_at timestamptz,
  converted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  converted_by_name text,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_recruitment_candidates_contact_chk CHECK (phone_key IS NOT NULL OR email_key IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS admin_recruitment_candidates_req_idx
  ON public.admin_recruitment_candidates (requisition_id);
CREATE INDEX IF NOT EXISTS admin_recruitment_candidates_stage_idx
  ON public.admin_recruitment_candidates (stage, outcome);
CREATE INDEX IF NOT EXISTS admin_recruitment_candidates_phone_idx
  ON public.admin_recruitment_candidates (phone_key);
CREATE INDEX IF NOT EXISTS admin_recruitment_candidates_email_idx
  ON public.admin_recruitment_candidates (email_key);

-- A person can only be in one live recruitment pipeline at a time.
CREATE UNIQUE INDEX IF NOT EXISTS admin_recruitment_candidates_live_phone_uidx
  ON public.admin_recruitment_candidates (phone_key)
  WHERE phone_key IS NOT NULL AND outcome IS NULL AND stage <> 'employee_created';
CREATE UNIQUE INDEX IF NOT EXISTS admin_recruitment_candidates_live_email_uidx
  ON public.admin_recruitment_candidates (email_key)
  WHERE email_key IS NOT NULL AND outcome IS NULL AND stage <> 'employee_created';

-- ---------------------------------------------------------------------------
-- Screening & calling history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_recruitment_screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.admin_recruitment_candidates(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('call', 'screening')),
  call_outcome text CHECK (call_outcome IN ('connected', 'no_answer', 'busy', 'switched_off', 'wrong_number', 'call_back', 'not_interested')),
  result text CHECK (result IN ('pass', 'fail', 'hold')),
  notes text,
  follow_up_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_recruitment_screenings_candidate_idx
  ON public.admin_recruitment_screenings (candidate_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Interviews
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_recruitment_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.admin_recruitment_candidates(id) ON DELETE RESTRICT,
  round_no integer NOT NULL DEFAULT 1,
  round_name text NOT NULL DEFAULT 'Round 1',
  scheduled_at timestamptz NOT NULL,
  duration_mins integer NOT NULL DEFAULT 45 CHECK (duration_mins BETWEEN 10 AND 480),
  mode text NOT NULL DEFAULT 'office' CHECK (mode IN ('office', 'online', 'phone')),
  location text,
  interviewers jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'attended', 'evaluated', 'no_show', 'cancelled', 'rescheduled')),
  status_reason text,
  rescheduled_from uuid REFERENCES public.admin_recruitment_interviews(id) ON DELETE SET NULL,
  attended_at timestamptz,
  ratings jsonb,
  overall_rating numeric(3, 1),
  recommendation text CHECK (recommendation IN ('strong_hire', 'hire', 'hold', 'reject')),
  remarks text,
  evaluated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  evaluated_by_name text,
  evaluated_at timestamptz,
  invite_sent_at timestamptz,
  reminder_sent_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_recruitment_interviews_candidate_idx
  ON public.admin_recruitment_interviews (candidate_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS admin_recruitment_interviews_schedule_idx
  ON public.admin_recruitment_interviews (status, scheduled_at);
CREATE UNIQUE INDEX IF NOT EXISTS admin_recruitment_interviews_one_scheduled_uidx
  ON public.admin_recruitment_interviews (candidate_id)
  WHERE status = 'scheduled';

-- ---------------------------------------------------------------------------
-- Offers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_recruitment_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.admin_recruitment_candidates(id) ON DELETE RESTRICT,
  offer_ref text UNIQUE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'generated', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'withdrawn')),
  designation text NOT NULL,
  department text,
  location text,
  employment_type text NOT NULL DEFAULT 'Permanent',
  monthly_gross numeric(12, 2),
  annual_ctc numeric(14, 2),
  joining_date date,
  valid_until date,
  terms text,
  generated_doc jsonb,
  signed_doc jsonb,
  generated_at timestamptz,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_by_name text,
  sent_at timestamptz,
  send_count integer NOT NULL DEFAULT 0,
  viewed_at timestamptz,
  responded_at timestamptz,
  response_note text,
  response_channel text CHECK (response_channel IN ('candidate_link', 'recorded_by_staff')),
  response_recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  response_recorded_by_name text,
  response_ip text,
  response_user_agent text,
  closed_reason text,
  expired_at timestamptz,
  reminder_count integer NOT NULL DEFAULT 0,
  last_reminder_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_recruitment_offers_candidate_idx
  ON public.admin_recruitment_offers (candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_recruitment_offers_status_idx
  ON public.admin_recruitment_offers (status, valid_until);
CREATE UNIQUE INDEX IF NOT EXISTS admin_recruitment_offers_one_live_uidx
  ON public.admin_recruitment_offers (candidate_id)
  WHERE status IN ('draft', 'generated', 'sent', 'viewed', 'accepted');

-- ---------------------------------------------------------------------------
-- Appointment letters
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_recruitment_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.admin_recruitment_candidates(id) ON DELETE RESTRICT,
  offer_id uuid NOT NULL REFERENCES public.admin_recruitment_offers(id) ON DELETE RESTRICT,
  appointment_ref text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'generated'
    CHECK (status IN ('generated', 'sent', 'viewed', 'signed', 'cancelled')),
  designation text NOT NULL,
  department text,
  location text,
  employment_type text,
  monthly_gross numeric(12, 2),
  joining_date date,
  reporting_to text,
  terms text,
  generated_doc jsonb,
  signed_doc jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_by_name text,
  sent_at timestamptz,
  send_count integer NOT NULL DEFAULT 0,
  viewed_at timestamptz,
  signed_at timestamptz,
  signed_channel text CHECK (signed_channel IN ('candidate_link', 'recorded_by_staff')),
  signed_recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  signed_recorded_by_name text,
  signed_ip text,
  closed_reason text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_recruitment_appointments_candidate_idx
  ON public.admin_recruitment_appointments (candidate_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS admin_recruitment_appointments_one_live_uidx
  ON public.admin_recruitment_appointments (candidate_id)
  WHERE status IN ('generated', 'sent', 'viewed', 'signed');

-- ---------------------------------------------------------------------------
-- Candidate documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_recruitment_candidate_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.admin_recruitment_candidates(id) ON DELETE RESTRICT,
  document_key text NOT NULL REFERENCES public.admin_recruitment_document_types(key) ON UPDATE CASCADE,
  label text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'under_review', 'verified', 'rejected')),
  file jsonb,
  submitted_at timestamptz,
  submitted_via text CHECK (submitted_via IN ('staff', 'candidate_link')),
  submission_count integer NOT NULL DEFAULT 0,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by_name text,
  reviewed_at timestamptz,
  rejection_reason text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, document_key)
);

CREATE INDEX IF NOT EXISTS admin_recruitment_candidate_documents_status_idx
  ON public.admin_recruitment_candidate_documents (status);

-- ---------------------------------------------------------------------------
-- Email templates & communication log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_recruitment_templates (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]{2,60}$'),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  subject text NOT NULL,
  body text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.admin_recruitment_templates (key, name, category, subject, body, is_system) VALUES
  ('interview_invite', 'Interview invitation', 'interview',
   'Interview invitation — {{position}}',
   E'Dear {{candidate_name}},\n\nThank you for your interest in {{company_name}}. You are invited for an interview for the position of {{position}}.\n\nDate: {{interview_date}}\nTime: {{interview_time}}\nMode: {{interview_mode}}\nVenue / link: {{interview_location}}\n\nPlease reply to this email if you need to reschedule.\n\nRegards,\nRecruitment Team\n{{company_name}}', true),
  ('interview_reminder', 'Interview reminder', 'interview',
   'Reminder: interview for {{position}} on {{interview_date}}',
   E'Dear {{candidate_name}},\n\nThis is a reminder of your interview for {{position}} on {{interview_date}} at {{interview_time}} ({{interview_mode}}).\nVenue / link: {{interview_location}}\n\nRegards,\nRecruitment Team\n{{company_name}}', true),
  ('offer_letter', 'Offer letter', 'offer',
   'Offer of employment — {{position}} ({{offer_ref}})',
   E'Dear {{candidate_name}},\n\nWe are pleased to offer you the position of {{position}} at {{company_name}}. Your offer letter ({{offer_ref}}) is attached.\n\nPlease review and respond before {{expiry_date}} using the secure link below:\n{{portal_link}}\n\nRegards,\nRecruitment Team\n{{company_name}}', true),
  ('offer_reminder', 'Offer reminder', 'offer',
   'Reminder: your offer for {{position}} is awaiting response',
   E'Dear {{candidate_name}},\n\nYour offer for {{position}} ({{offer_ref}}) is awaiting your response. It is valid until {{expiry_date}}.\n\nRespond here: {{portal_link}}\n\nRegards,\nRecruitment Team\n{{company_name}}', true),
  ('appointment_letter', 'Appointment letter', 'appointment',
   'Appointment letter — {{position}} ({{appointment_ref}})',
   E'Dear {{candidate_name}},\n\nWelcome to {{company_name}}! Your appointment letter ({{appointment_ref}}) is attached. Your joining date is {{joining_date}}.\n\nPlease sign and upload the letter using the secure link below:\n{{portal_link}}\n\nRegards,\nRecruitment Team\n{{company_name}}', true),
  ('document_request', 'Document request', 'documents',
   'Documents required for joining — {{company_name}}',
   E'Dear {{candidate_name}},\n\nTo complete your joining formalities, please upload the following documents:\n{{pending_documents}}\n\nUpload here: {{portal_link}}\n\nRegards,\nRecruitment Team\n{{company_name}}', true),
  ('document_reminder', 'Document reminder', 'documents',
   'Reminder: documents pending for joining',
   E'Dear {{candidate_name}},\n\nThe following documents are still pending:\n{{pending_documents}}\n\nUpload here: {{portal_link}}\n\nRegards,\nRecruitment Team\n{{company_name}}', true),
  ('joining_reminder', 'Joining reminder', 'joining',
   'See you on {{joining_date}} — {{company_name}}',
   E'Dear {{candidate_name}},\n\nWe look forward to welcoming you on {{joining_date}} at {{location}} as {{position}}.\n\nPlease carry original copies of your documents.\n\nRegards,\nRecruitment Team\n{{company_name}}', true),
  ('general', 'General message', 'general',
   'Message from {{company_name}}',
   E'Dear {{candidate_name}},\n\n\n\nRegards,\nRecruitment Team\n{{company_name}}', true)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.admin_recruitment_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.admin_recruitment_candidates(id) ON DELETE RESTRICT,
  template_key text,
  recipient text NOT NULL,
  subject text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped')),
  error text,
  attempts integer NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL UNIQUE,
  related_type text CHECK (related_type IN ('interview', 'offer', 'appointment', 'documents', 'joining')),
  related_id uuid,
  trigger text NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual', 'workflow', 'automation')),
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  locked_at timestamptz,
  sent_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_recruitment_communications_candidate_idx
  ON public.admin_recruitment_communications (candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_recruitment_communications_status_idx
  ON public.admin_recruitment_communications (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Audit trail / activity timeline (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_recruitment_events (
  id bigserial PRIMARY KEY,
  candidate_id uuid REFERENCES public.admin_recruitment_candidates(id) ON DELETE RESTRICT,
  requisition_id uuid REFERENCES public.admin_recruitment_requisitions(id) ON DELETE RESTRICT,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  from_status text,
  to_status text,
  summary text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  actor_name text,
  actor_kind text NOT NULL DEFAULT 'user' CHECK (actor_kind IN ('user', 'system', 'candidate')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_recruitment_events_candidate_idx
  ON public.admin_recruitment_events (candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_recruitment_events_requisition_idx
  ON public.admin_recruitment_events (requisition_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_recruitment_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Recruitment history cannot be changed or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_recruitment_events_immutable ON public.admin_recruitment_events;
CREATE TRIGGER trg_admin_recruitment_events_immutable
  BEFORE UPDATE OR DELETE ON public.admin_recruitment_events
  FOR EACH ROW EXECUTE FUNCTION public.admin_recruitment_events_immutable();

-- ---------------------------------------------------------------------------
-- Candidate secure links (offer response, appointment signing, document upload)
-- Only the API server (service role) reads or writes these.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_recruitment_portal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.admin_recruitment_candidates(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (purpose IN ('offer', 'appointment', 'documents')),
  ref_id uuid,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_recruitment_portal_tokens_ref_idx
  ON public.admin_recruitment_portal_tokens (candidate_id, purpose, ref_id);

-- Idempotency keys for create-type actions (retries return the first result).
CREATE TABLE IF NOT EXISTS public.admin_recruitment_request_keys (
  key text PRIMARY KEY,
  action text NOT NULL,
  result jsonb NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'admin_recruitment_requisitions', 'admin_recruitment_candidates', 'admin_recruitment_interviews',
    'admin_recruitment_offers', 'admin_recruitment_appointments', 'admin_recruitment_candidate_documents',
    'admin_recruitment_templates', 'admin_recruitment_communications', 'admin_recruitment_document_types'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_touch ON public.%1$I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_touch BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.admin_recruitment_touch_updated_at()',
      t
    );
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Row level security: read-only for permitted users; writes only via workflow functions
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'admin_recruitment_settings', 'admin_recruitment_document_types', 'admin_recruitment_requisitions',
    'admin_recruitment_candidates', 'admin_recruitment_screenings', 'admin_recruitment_interviews',
    'admin_recruitment_offers', 'admin_recruitment_appointments', 'admin_recruitment_candidate_documents',
    'admin_recruitment_templates', 'admin_recruitment_communications', 'admin_recruitment_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO authenticated USING ((SELECT public.admin_recruitment_can(''view'')))',
      t
    );
  END LOOP;
END;
$$;

ALTER TABLE public.admin_recruitment_portal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_recruitment_request_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_recruitment_portal_tokens FROM anon, authenticated;
REVOKE ALL ON public.admin_recruitment_request_keys FROM anon, authenticated;
GRANT ALL ON public.admin_recruitment_portal_tokens TO service_role;
GRANT ALL ON public.admin_recruitment_request_keys TO service_role;

GRANT USAGE ON SEQUENCE public.admin_recruitment_events_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- Candidate overview (one row per candidate with workflow summary)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.admin_recruitment_candidate_overview
WITH (security_invoker = true) AS
SELECT
  c.*,
  r.requisition_no,
  r.designation AS requisition_designation,
  r.department AS requisition_department,
  r.location AS requisition_location,
  r.status AS requisition_status,
  r.employment_type AS requisition_employment_type,
  li.status AS latest_interview_status,
  li.scheduled_at AS latest_interview_at,
  ni.next_interview_at,
  lo.id AS offer_id,
  lo.status AS offer_status,
  lo.offer_ref,
  lo.valid_until AS offer_valid_until,
  lo.joining_date AS offer_joining_date,
  lo.monthly_gross AS offer_monthly_gross,
  la.id AS appointment_id,
  la.status AS appointment_status,
  la.appointment_ref,
  coalesce(d.required_total, 0) AS docs_required_total,
  coalesce(d.required_verified, 0) AS docs_required_verified,
  coalesce(d.to_review, 0) AS docs_to_review,
  coalesce(d.total, 0) AS docs_total
FROM public.admin_recruitment_candidates c
LEFT JOIN public.admin_recruitment_requisitions r ON r.id = c.requisition_id
LEFT JOIN LATERAL (
  SELECT i.status, i.scheduled_at
  FROM public.admin_recruitment_interviews i
  WHERE i.candidate_id = c.id
  ORDER BY i.scheduled_at DESC
  LIMIT 1
) li ON true
LEFT JOIN LATERAL (
  SELECT min(i.scheduled_at) AS next_interview_at
  FROM public.admin_recruitment_interviews i
  WHERE i.candidate_id = c.id AND i.status = 'scheduled'
) ni ON true
LEFT JOIN LATERAL (
  SELECT o.*
  FROM public.admin_recruitment_offers o
  WHERE o.candidate_id = c.id
  ORDER BY o.created_at DESC
  LIMIT 1
) lo ON true
LEFT JOIN LATERAL (
  SELECT a.*
  FROM public.admin_recruitment_appointments a
  WHERE a.candidate_id = c.id
  ORDER BY a.created_at DESC
  LIMIT 1
) la ON true
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE x.required) AS required_total,
    count(*) FILTER (WHERE x.required AND x.status = 'verified') AS required_verified,
    count(*) FILTER (WHERE x.status IN ('submitted', 'under_review')) AS to_review,
    count(*) AS total
  FROM public.admin_recruitment_candidate_documents x
  WHERE x.candidate_id = c.id
) d ON true;

REVOKE ALL ON public.admin_recruitment_candidate_overview FROM anon, authenticated;
GRANT SELECT ON public.admin_recruitment_candidate_overview TO authenticated, service_role;

COMMENT ON TABLE public.admin_recruitment_candidates IS
  'Admin In-house Recruitment candidates — one continuous record from first contact to Employee Master conversion.';
COMMENT ON TABLE public.admin_recruitment_events IS
  'Append-only recruitment audit trail (status changes, approvals, interviews, offers, documents, joining, conversion, emails).';
