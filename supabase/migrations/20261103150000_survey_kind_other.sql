-- Survey Management: allow Kind = Other with a free-text label.
-- Rollback: supabase/rollbacks/20261103150000_survey_kind_other_down.sql

ALTER TABLE indus_one.survey_templates
  ADD COLUMN IF NOT EXISTS kind_other text;

ALTER TABLE indus_one.survey_templates DROP CONSTRAINT IF EXISTS survey_templates_kind_check;
ALTER TABLE indus_one.survey_templates
  ADD CONSTRAINT survey_templates_kind_check
  CHECK (kind IN ('engagement', 'pulse', 'exit', '360', 'training', 'other'));

COMMENT ON COLUMN indus_one.survey_templates.kind_other IS
  'Custom kind label when kind = other; null for fixed kinds.';
