-- Survey Management: ERP (Indus OS) creates / assigns surveys, employees fill them in Indus One.
--
-- Extends the existing indus_one.survey_* tables (no parallel stack):
--   survey_templates   + kind, status (draft|published|archived), audience, due date, audit cols
--   survey_assignments + in_progress / revoked states, started_at, one row per (template, employee_code)
--   survey_responses   + one response per assignment
--
-- Writes from ERP go through the API server (service_role, gated by requireHrOrAdmin).
-- Employees read only their own assignments / assigned published templates, and submit via
-- SECURITY DEFINER RPCs so they cannot edit assignment rows directly.

GRANT USAGE ON SCHEMA indus_one TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- survey_templates
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  -- First run only: templates created before this migration were live (is_active = visible),
  -- so keep them published instead of silently hiding them behind the new draft default.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'indus_one' AND table_name = 'survey_templates' AND column_name = 'status'
  ) THEN
    ALTER TABLE indus_one.survey_templates
      ADD COLUMN status text NOT NULL DEFAULT 'draft';
    UPDATE indus_one.survey_templates
    SET status = CASE WHEN is_active THEN 'published' ELSE 'draft' END;
  END IF;
END $$;

ALTER TABLE indus_one.survey_templates
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'pulse',
  ADD COLUMN IF NOT EXISTS audience_type text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS audience_employee_codes text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS estimated_minutes integer,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_by_email text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE indus_one.survey_templates DROP CONSTRAINT IF EXISTS survey_templates_status_check;
ALTER TABLE indus_one.survey_templates
  ADD CONSTRAINT survey_templates_status_check
  CHECK (status IN ('draft', 'published', 'archived'));

ALTER TABLE indus_one.survey_templates DROP CONSTRAINT IF EXISTS survey_templates_kind_check;
ALTER TABLE indus_one.survey_templates
  ADD CONSTRAINT survey_templates_kind_check
  CHECK (kind IN ('engagement', 'pulse', 'exit', '360', 'training'));

ALTER TABLE indus_one.survey_templates DROP CONSTRAINT IF EXISTS survey_templates_audience_type_check;
ALTER TABLE indus_one.survey_templates
  ADD CONSTRAINT survey_templates_audience_type_check
  CHECK (audience_type IN ('all', 'selected'));

CREATE INDEX IF NOT EXISTS idx_indus_one_survey_templates_status
  ON indus_one.survey_templates(status, created_at DESC);

-- -----------------------------------------------------------------------------
-- survey_assignments
-- -----------------------------------------------------------------------------

ALTER TABLE indus_one.survey_assignments
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS assigned_by uuid;

-- pending → in_progress → completed; revoked = removed from audience on re-publish (kept for history).
ALTER TABLE indus_one.survey_assignments DROP CONSTRAINT IF EXISTS survey_assignments_status_check;
ALTER TABLE indus_one.survey_assignments
  ADD CONSTRAINT survey_assignments_status_check
  CHECK (status IN ('pending', 'in_progress', 'completed', 'revoked'));

-- Drop duplicate (template, employee_code) rows that have no response so the unique index can build.
DELETE FROM indus_one.survey_assignments a
USING indus_one.survey_assignments b
WHERE a.template_id = b.template_id
  AND a.employee_code IS NOT NULL
  AND a.employee_code = b.employee_code
  AND a.assigned_at > b.assigned_at
  AND NOT EXISTS (SELECT 1 FROM indus_one.survey_responses r WHERE r.assignment_id = a.id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_indus_one_survey_assignments_template_emp
  ON indus_one.survey_assignments(template_id, employee_code);

CREATE INDEX IF NOT EXISTS idx_indus_one_survey_assignments_template
  ON indus_one.survey_assignments(template_id, status);

-- -----------------------------------------------------------------------------
-- survey_responses
-- -----------------------------------------------------------------------------

ALTER TABLE indus_one.survey_responses
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES indus_one.survey_templates(id) ON DELETE CASCADE;

UPDATE indus_one.survey_responses r
SET template_id = a.template_id
FROM indus_one.survey_assignments a
WHERE a.id = r.assignment_id AND r.template_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_indus_one_survey_responses_assignment
  ON indus_one.survey_responses(assignment_id);

CREATE INDEX IF NOT EXISTS idx_indus_one_survey_responses_template
  ON indus_one.survey_responses(template_id, submitted_at DESC);

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON indus_one.survey_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON indus_one.survey_assignments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON indus_one.survey_responses TO service_role;

GRANT SELECT ON indus_one.survey_templates TO authenticated;
GRANT SELECT ON indus_one.survey_assignments TO authenticated;
GRANT SELECT ON indus_one.survey_responses TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON indus_one.survey_templates FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON indus_one.survey_assignments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON indus_one.survey_responses FROM authenticated;

ALTER TABLE indus_one.survey_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE indus_one.survey_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE indus_one.survey_responses ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- RLS — employees see only their own, live assignments
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS survey_assignments_select ON indus_one.survey_assignments;
CREATE POLICY survey_assignments_select ON indus_one.survey_assignments
  FOR SELECT TO authenticated
  USING (status <> 'revoked' AND indus_one.employee_code_owned(employee_code));

-- Employees change assignment state only through the RPCs below.
DROP POLICY IF EXISTS survey_assignments_update ON indus_one.survey_assignments;

DROP POLICY IF EXISTS survey_templates_select ON indus_one.survey_templates;
CREATE POLICY survey_templates_select ON indus_one.survey_templates
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND status = 'published'
    AND EXISTS (
      SELECT 1 FROM indus_one.survey_assignments a
      WHERE a.template_id = survey_templates.id
        AND a.status <> 'revoked'
        AND indus_one.employee_code_owned(a.employee_code)
    )
  );

-- Responses are written by submit_survey_response(); direct inserts are no longer allowed.
DROP POLICY IF EXISTS survey_responses_insert ON indus_one.survey_responses;

DROP POLICY IF EXISTS survey_responses_select ON indus_one.survey_responses;
CREATE POLICY survey_responses_select ON indus_one.survey_responses
  FOR SELECT TO authenticated
  USING (indus_one.employee_code_owned(employee_code));

-- -----------------------------------------------------------------------------
-- Employee RPCs
-- -----------------------------------------------------------------------------

-- Mark an assignment as in_progress when the employee opens it (idempotent).
CREATE OR REPLACE FUNCTION indus_one.start_survey_assignment(p_assignment_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_status text;
BEGIN
  UPDATE indus_one.survey_assignments a
  SET status = 'in_progress',
      started_at = coalesce(a.started_at, now()),
      updated_at = now()
  FROM indus_one.survey_templates t
  WHERE a.id = p_assignment_id
    AND t.id = a.template_id
    AND t.is_active = true
    AND t.status = 'published'
    AND a.status = 'pending'
    AND indus_one.employee_code_owned(a.employee_code);

  SELECT a.status INTO v_status
  FROM indus_one.survey_assignments a
  WHERE a.id = p_assignment_id
    AND indus_one.employee_code_owned(a.employee_code);

  RETURN v_status;
END;
$$;

-- Submit answers once and mark the assignment completed. Validates ownership, that the
-- survey is still live, and that every required question has an answer.
CREATE OR REPLACE FUNCTION indus_one.submit_survey_response(p_assignment_id uuid, p_answers jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_assignment indus_one.survey_assignments%ROWTYPE;
  v_template indus_one.survey_templates%ROWTYPE;
  v_question jsonb;
  v_answer jsonb;
  v_response_id uuid;
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'Answers must be an object keyed by question id.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_assignment
  FROM indus_one.survey_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND OR NOT indus_one.employee_code_owned(v_assignment.employee_code) THEN
    RAISE EXCEPTION 'Survey assignment not found.' USING ERRCODE = '42501';
  END IF;
  IF v_assignment.status = 'revoked' THEN
    RAISE EXCEPTION 'This survey is no longer assigned to you.' USING ERRCODE = '42501';
  END IF;
  IF v_assignment.status = 'completed' THEN
    RAISE EXCEPTION 'You have already submitted this survey.' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_template FROM indus_one.survey_templates WHERE id = v_assignment.template_id;
  IF NOT FOUND OR v_template.status <> 'published' OR NOT v_template.is_active THEN
    RAISE EXCEPTION 'This survey is closed.' USING ERRCODE = '42501';
  END IF;

  FOR v_question IN SELECT * FROM jsonb_array_elements(coalesce(v_template.questions, '[]'::jsonb))
  LOOP
    IF coalesce((v_question->>'required')::boolean, false) THEN
      v_answer := p_answers -> (v_question->>'id');
      IF v_answer IS NULL
        OR jsonb_typeof(v_answer) = 'null'
        OR (jsonb_typeof(v_answer) = 'string' AND btrim(v_answer #>> '{}') = '')
        OR (jsonb_typeof(v_answer) = 'array' AND jsonb_array_length(v_answer) = 0)
      THEN
        RAISE EXCEPTION 'Please answer: %', coalesce(v_question->>'label', 'required question')
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  INSERT INTO indus_one.survey_responses (assignment_id, template_id, user_id, employee_code, answers)
  VALUES (v_assignment.id, v_assignment.template_id, auth.uid(), v_assignment.employee_code, p_answers)
  RETURNING id INTO v_response_id;

  UPDATE indus_one.survey_assignments
  SET status = 'completed',
      started_at = coalesce(started_at, now()),
      completed_at = now(),
      updated_at = now()
  WHERE id = v_assignment.id;

  RETURN v_response_id;
END;
$$;

REVOKE ALL ON FUNCTION indus_one.start_survey_assignment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION indus_one.submit_survey_response(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION indus_one.start_survey_assignment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION indus_one.submit_survey_response(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
