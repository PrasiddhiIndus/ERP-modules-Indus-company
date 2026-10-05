-- Calling Database: Call Outcome on each calling record (+ free text when "Other").

ALTER TABLE public.hr_calling_candidates
  ADD COLUMN IF NOT EXISTS call_outcome text,
  ADD COLUMN IF NOT EXISTS call_outcome_other text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_calling_candidates_call_outcome_check'
  ) THEN
    ALTER TABLE public.hr_calling_candidates
      ADD CONSTRAINT hr_calling_candidates_call_outcome_check
      CHECK (
        call_outcome IS NULL OR call_outcome IN (
          'Interested',
          'Not Interested',
          'Call Back Later',
          'No Response',
          'Busy',
          'Switched Off',
          'Not Reachable',
          'Wrong Number',
          'Already Placed',
          'Other'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.hr_calling_candidates.call_outcome IS 'Result of the call (Interested, Busy, Other, …).';
COMMENT ON COLUMN public.hr_calling_candidates.call_outcome_other IS 'Details when call_outcome = Other.';

NOTIFY pgrst, 'reload schema';
