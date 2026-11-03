-- Rollback for 20261103150000_survey_kind_other.sql

UPDATE indus_one.survey_templates
SET kind = 'pulse', kind_other = NULL
WHERE kind = 'other';

ALTER TABLE indus_one.survey_templates DROP CONSTRAINT IF EXISTS survey_templates_kind_check;
ALTER TABLE indus_one.survey_templates
  ADD CONSTRAINT survey_templates_kind_check
  CHECK (kind IN ('engagement', 'pulse', 'exit', '360', 'training'));

ALTER TABLE indus_one.survey_templates DROP COLUMN IF EXISTS kind_other;
