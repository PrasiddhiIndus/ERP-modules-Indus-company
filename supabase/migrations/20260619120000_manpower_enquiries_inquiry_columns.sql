-- Align manpower_enquiries with Manpower Management inquiry tracker columns.
-- Adds dedicated columns for the 14 Excel fields; legacy address/contact columns kept for RM / old rows.

ALTER TABLE public.manpower_enquiries
  ADD COLUMN IF NOT EXISTS sr_no integer,
  ADD COLUMN IF NOT EXISTS received_date date,
  ADD COLUMN IF NOT EXISTS vertical text,
  ADD COLUMN IF NOT EXISTS mode_of_submission text,
  ADD COLUMN IF NOT EXISTS total_manpower integer,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS offer_submitted_on date,
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS further_action text;

CREATE UNIQUE INDEX IF NOT EXISTS manpower_enquiries_sr_no_unique
  ON public.manpower_enquiries (sr_no)
  WHERE sr_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS manpower_enquiries_received_date_idx
  ON public.manpower_enquiries (received_date DESC);

CREATE INDEX IF NOT EXISTS manpower_enquiries_vertical_idx
  ON public.manpower_enquiries (vertical);

COMMENT ON COLUMN public.manpower_enquiries.sr_no IS 'Manpower Management inquiry serial number (auto-generated).';
COMMENT ON COLUMN public.manpower_enquiries.received_date IS 'Inquiry received date.';
COMMENT ON COLUMN public.manpower_enquiries.vertical IS 'Fire Tender, Manpower, or Training.';
COMMENT ON COLUMN public.manpower_enquiries.mode_of_submission IS 'Email, Online Portal, Verbal, Reference, Phone, Other.';
COMMENT ON COLUMN public.manpower_enquiries.total_manpower IS 'Total number of manpower requested.';
COMMENT ON COLUMN public.manpower_enquiries.location IS 'Work / site location.';
COMMENT ON COLUMN public.manpower_enquiries.offer_submitted_on IS 'Date offer was submitted to client.';
COMMENT ON COLUMN public.manpower_enquiries.remarks IS 'General remarks.';
COMMENT ON COLUMN public.manpower_enquiries.further_action IS 'Follow-up / further action notes.';

-- Backfill from JSON meta (__META__:{...}) and legacy column aliases.
UPDATE public.manpower_enquiries
SET
  sr_no = COALESCE(
    sr_no,
    NULLIF(TRIM(COALESCE(substring(authorization_to from 9)::jsonb ->> 'srNo', '')), '')::integer
  ),
  received_date = COALESCE(
    received_date,
    NULLIF(TRIM(COALESCE(substring(authorization_to from 9)::jsonb ->> 'receivedDate', '')), '')::date,
    NULLIF(TRIM(COALESCE(substring(authorization_to from 9)::jsonb ->> 'enquiryDate', '')), '')::date,
    created_at::date
  ),
  vertical = COALESCE(
    vertical,
    NULLIF(TRIM(COALESCE(substring(authorization_to from 9)::jsonb ->> 'vertical', '')), '')
  ),
  mode_of_submission = COALESCE(
    mode_of_submission,
    source,
    NULLIF(TRIM(COALESCE(substring(authorization_to from 9)::jsonb ->> 'modeOfSubmission', '')), '')
  ),
  total_manpower = COALESCE(
    total_manpower,
    NULLIF(TRIM(COALESCE(substring(authorization_to from 9)::jsonb ->> 'totalManpower', '')), '')::integer
  ),
  location = COALESCE(
    location,
    NULLIF(TRIM(COALESCE(substring(authorization_to from 9)::jsonb ->> 'location', '')), ''),
    NULLIF(TRIM(COALESCE(substring(authorization_to from 9)::jsonb ->> 'siteName', '')), '')
  ),
  offer_submitted_on = COALESCE(
    offer_submitted_on,
    NULLIF(TRIM(COALESCE(substring(authorization_to from 9)::jsonb ->> 'offerSubmittedOn', '')), '')::date
  ),
  remarks = COALESCE(
    remarks,
    NULLIF(TRIM(COALESCE(substring(authorization_to from 9)::jsonb ->> 'remarks', '')), '')
  ),
  further_action = COALESCE(
    further_action,
    NULLIF(TRIM(COALESCE(substring(authorization_to from 9)::jsonb ->> 'furtherAction', '')), '')
  )
WHERE authorization_to LIKE '__META__:%';

UPDATE public.manpower_enquiries
SET
  mode_of_submission = COALESCE(mode_of_submission, source),
  received_date = COALESCE(received_date, created_at::date)
WHERE mode_of_submission IS NULL OR received_date IS NULL;
