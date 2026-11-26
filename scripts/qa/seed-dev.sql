-- =====================================================================
-- QA module DEV / LOCAL seed ONLY. Do NOT run against production.
--
-- Prerequisites: migration 20261126150000_qa_schema.sql applied.
-- Prefer Supabase local (`supabase db reset`) or a disposable database.
--
-- Creates one member per qa_role, release 2.4.0, ~8 requests, ~15 cases,
-- 2 runs, executions, and 6 defects.
--
-- Fixed UUIDs:
--   qa_lead        aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1
--   tester         aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2
--   developer      aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3
--   product_owner  aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4
--   business_owner aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5
--   viewer         aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'qa' AND table_name = 'releases'
  ) AND EXISTS (
    SELECT 1 FROM qa.releases WHERE status = 'shipped'
  ) THEN
    RAISE EXCEPTION 'seed-dev.sql refused: shipped releases present (non-dev?).';
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Auth users + ERP profiles ------------------------------------
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
SELECT
  u.id,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  u.email,
  crypt('QaSeedPass1!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.full_name),
  now(),
  now()
FROM (VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid, 'qa.lead@indus.local', 'Priya QA Lead'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid, 'qa.tester@indus.local', 'Asha Tester'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'::uuid, 'qa.dev@indus.local', 'Rohan Developer'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'::uuid, 'qa.po@indus.local', 'Neha Product Owner'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'::uuid, 'qa.bo@indus.local', 'Vikram Business Owner'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'::uuid, 'qa.viewer@indus.local', 'Sam Viewer')
) AS u(id, email, full_name)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, username, role, team, allowed_modules, allowed_sub_modules, is_active)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'qa.lead@indus.local', 'Priya QA Lead', 'executive', 'QA', '["qa"]'::jsonb, '["qa.dashboard","qa.requests","qa.cases","qa.execution","qa.defects","qa.traceability","qa.release-gate","qa.audit","qa.standards"]'::jsonb, true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'qa.tester@indus.local', 'Asha Tester', 'executive', 'QA', '["qa"]'::jsonb, '["qa.dashboard","qa.requests","qa.cases","qa.execution","qa.defects","qa.traceability","qa.release-gate","qa.standards"]'::jsonb, true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'qa.dev@indus.local', 'Rohan Developer', 'executive', 'IT', '["qa"]'::jsonb, '["qa.dashboard","qa.requests","qa.defects"]'::jsonb, true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'qa.po@indus.local', 'Neha Product Owner', 'executive', 'Product', '["qa"]'::jsonb, '["qa.dashboard","qa.requests","qa.release-gate","qa.traceability"]'::jsonb, true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', 'qa.bo@indus.local', 'Vikram Business Owner', 'executive', 'Business', '["qa"]'::jsonb, '["qa.dashboard","qa.release-gate"]'::jsonb, true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6', 'qa.viewer@indus.local', 'Sam Viewer', 'executive', 'QA', '["qa"]'::jsonb, '["qa.dashboard","qa.requests","qa.cases","qa.defects","qa.traceability"]'::jsonb, true)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  username = EXCLUDED.username,
  allowed_modules = EXCLUDED.allowed_modules,
  allowed_sub_modules = EXCLUDED.allowed_sub_modules,
  is_active = true;

INSERT INTO qa.members (user_id, full_name, qa_role, active) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Priya QA Lead', 'qa_lead', true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Asha Tester', 'tester', true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'Rohan Developer', 'developer', true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'Neha Product Owner', 'product_owner', true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', 'Vikram Business Owner', 'business_owner', true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6', 'Sam Viewer', 'viewer', true)
ON CONFLICT (user_id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  qa_role = EXCLUDED.qa_role,
  active = true;

INSERT INTO qa.releases (id, target_date, status)
VALUES ('2.4.0', CURRENT_DATE + 14, 'open')
ON CONFLICT (id) DO UPDATE SET target_date = EXCLUDED.target_date, status = 'open';

-- Clear prior sample business data (members + release kept)
DELETE FROM qa.evidence;
DELETE FROM qa.executions;
DELETE FROM qa.run_cases;
DELETE FROM qa.test_runs WHERE release_id = '2.4.0';
DELETE FROM qa.defect_history;
DELETE FROM qa.defects;
DELETE FROM qa.test_case_versions;
DELETE FROM qa.test_cases;
DELETE FROM qa.request_signoffs;
DELETE FROM qa.requests;
DELETE FROM qa.waivers WHERE release_id = '2.4.0';
DELETE FROM qa.release_signoffs WHERE release_id = '2.4.0';

SELECT setval('qa.request_no', 100, true);
SELECT setval('qa.case_no', 1000, true);
SELECT setval('qa.run_no', 23, true);
SELECT setval('qa.defect_no', 500, true);

-- Session as QA lead (Supabase auth.uid())
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}', true);

INSERT INTO qa.requests (
  title, request_type, change_class, module, likelihood, impact, stage, release_id,
  description, unit_evidence_url, owner_id, created_by
) VALUES
  ('Payroll statutory challan PDF layout', 'feature', 'A', 'HR Site – Payroll', 2, 3, 'execute', '2.4.0',
   'Acceptance: challan PDF matches statutory template.', 'https://ci.example/unit/payroll-challan',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  ('Site attendance bulk import validation', 'enhancement', 'B', 'HR Site – Attendance', 2, 2, 'execute', '2.4.0',
   'Reject bad rows with clear errors.', 'https://ci.example/unit/attendance-import',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  ('Leave balance sync after approved leave', 'bug_fix', 'B', 'IN-House HR/Admin', 3, 2, 'design', '2.4.0',
   'Balance must decrement on approve.', NULL,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'),
  ('Helpdesk SLA closed-ticket duration', 'bug_fix', 'B', 'IT/IS – Support', 2, 2, 'execute', '2.4.0',
   'Closed tickets show start→close elapsed time.', 'https://ci.example/unit/it-sla',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  ('PO at glance filter copy tweak', 'config', 'C', 'Projects', 1, 1, 'plan', '2.4.0',
   'Label change only.', NULL,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'),
  ('Finance site ledger hotfix rounding', 'hotfix', 'D', 'Finance', 2, 3, 'execute', '2.4.0',
   'Hotfix: paise rounding on ledger export.', NULL,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  ('Recruitment offer revise after accept', 'enhancement', 'B', 'IN-House HR/Admin – Recruitment', 2, 2, 'intake', NULL,
   'Allow revise of accepted offers under guardrails.', NULL,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'),
  ('Comp-off balance monthly summary', 'feature', 'A', 'HR Site – Payroll', 2, 2, 'design', '2.4.0',
   'New summary for managers.', NULL,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');

CREATE TEMP TABLE _qa_seed_cases (
  ord int PRIMARY KEY,
  req_code text NOT NULL,
  status text NOT NULL,
  level text NOT NULL,
  test_type text NOT NULL,
  title text NOT NULL
) ON COMMIT DROP;

INSERT INTO _qa_seed_cases (ord, req_code, status, level, test_type, title) VALUES
  (1,  'QR-101','approved','integration','functional','Payroll challan — integration'),
  (2,  'QR-101','approved','system','functional','Payroll challan — system'),
  (3,  'QR-101','approved','system','regression','Payroll challan — regression'),
  (4,  'QR-101','approved','acceptance','functional','Payroll challan — UAT'),
  (5,  'QR-102','approved','system','functional','Attendance import — system'),
  (6,  'QR-102','approved','system','regression','Attendance import — regression'),
  (7,  'QR-102','approved','integration','functional','Attendance import — integration'),
  (8,  'QR-103','draft','system','functional','Leave sync — system draft'),
  (9,  'QR-103','draft','integration','functional','Leave sync — integration draft'),
  (10, 'QR-104','approved','system','functional','SLA closed duration — system'),
  (11, 'QR-104','approved','system','regression','SLA closed duration — regression'),
  (12, 'QR-106','approved','system','smoke','Ledger hotfix — smoke'),
  (13, 'QR-106','approved','system','regression','Ledger hotfix — regression'),
  (14, 'QR-108','draft','system','functional','Comp-off summary — draft'),
  (15, 'QR-108','changes_requested','acceptance','functional','Comp-off summary — changes requested');

CREATE TEMP TABLE _qa_seed_case_ids (
  ord int PRIMARY KEY,
  case_id bigint NOT NULL,
  status text NOT NULL
) ON COMMIT DROP;

WITH ins AS (
  INSERT INTO qa.test_cases (request_id, current_version, status, author_id, reviewer_id)
  SELECT r.id, 1, s.status::qa.case_status,
         'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
         CASE WHEN s.status = 'approved' THEN 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid ELSE NULL END
  FROM _qa_seed_cases s
  JOIN qa.requests r ON r.code = s.req_code
  ORDER BY s.ord
  RETURNING id, status
),
numbered AS (
  SELECT id, status::text AS status, row_number() OVER (ORDER BY id) AS ord FROM ins
)
INSERT INTO _qa_seed_case_ids (ord, case_id, status)
SELECT ord, id, status FROM numbered;

INSERT INTO qa.test_case_versions (
  case_id, version, title, level, test_type, iso_char, technique, priority,
  preconditions, test_data, steps, change_note, created_by, approved_by, approved_at
)
SELECT
  i.case_id, 1, s.title,
  s.level::qa.test_level,
  s.test_type::qa.test_type,
  'functional_suitability'::qa.iso25010,
  'use_case'::qa.technique,
  'medium',
  'User is logged into INDUS ERP.',
  'Sample fixture data.',
  '[{"action":"Open the screen","expected":"Screen loads"},{"action":"Submit valid data","expected":"Success toast"},{"action":"Verify register","expected":"Row matches input"}]'::jsonb,
  'Initial version',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  CASE WHEN i.status = 'approved' THEN 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid ELSE NULL END,
  CASE WHEN i.status = 'approved' THEN now() ELSE NULL END
FROM _qa_seed_case_ids i
JOIN _qa_seed_cases s ON s.ord = i.ord;

INSERT INTO qa.test_runs (name, release_id, build, environment, created_by) VALUES
  ('2.4.0 regression cycle A', '2.4.0', 'build-2401', 'QA-01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  ('2.4.0 UAT smoke', '2.4.0', 'build-2402', 'UAT-02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');

INSERT INTO qa.run_cases (run_id, case_id, case_version, assigned_to)
SELECT r.id, c.id, 1, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
FROM qa.test_runs r
CROSS JOIN qa.test_cases c
JOIN qa.test_case_versions v ON v.case_id = c.id AND v.version = 1 AND v.approved_by IS NOT NULL
WHERE r.code = 'RUN-24';

INSERT INTO qa.run_cases (run_id, case_id, case_version, assigned_to)
SELECT r.id, c.id, 1, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
FROM qa.test_runs r
JOIN qa.test_cases c ON c.request_id = (SELECT id FROM qa.requests WHERE code = 'QR-101')
JOIN qa.test_case_versions v
  ON v.case_id = c.id AND v.version = 1 AND v.level = 'acceptance' AND v.approved_by IS NOT NULL
WHERE r.code = 'RUN-25';

-- Executions as tester (role check uses auth.uid → my_role)
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2","role":"authenticated"}', true);

INSERT INTO qa.executions (
  run_id, case_id, case_version, attempt, result, step_results, actual_result, executed_by
)
SELECT
  rc.run_id, rc.case_id, rc.case_version, 1,
  CASE WHEN row_number() OVER (ORDER BY c.id) IN (1, 2) THEN 'fail'::qa.result
       WHEN row_number() OVER (ORDER BY c.id) = 3 THEN 'blocked'::qa.result
       WHEN row_number() OVER (ORDER BY c.id) <= 8 THEN 'pass'::qa.result
       ELSE 'pass'::qa.result END,
  CASE WHEN row_number() OVER (ORDER BY c.id) IN (1, 2) THEN '["pass","fail","not_run"]'::jsonb
       WHEN row_number() OVER (ORDER BY c.id) = 3 THEN '["pass","blocked","not_run"]'::jsonb
       ELSE '["pass","pass","pass"]'::jsonb END,
  CASE WHEN row_number() OVER (ORDER BY c.id) IN (1, 2) THEN 'Observed failure at step 2.' ELSE NULL END,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
FROM qa.run_cases rc
JOIN qa.test_cases c ON c.id = rc.case_id
JOIN qa.test_runs r ON r.id = rc.run_id
WHERE r.code = 'RUN-24'
  AND c.id NOT IN (
    SELECT c2.id FROM qa.run_cases rc2
    JOIN qa.test_runs r2 ON r2.id = rc2.run_id
    JOIN qa.test_cases c2 ON c2.id = rc2.case_id
    WHERE r2.code = 'RUN-24'
    ORDER BY c2.id DESC
    LIMIT 2
  );

-- Defects (insert at target status; transition trigger is UPDATE-only)
INSERT INTO qa.defects (
  title, severity, priority, status, request_id, case_id, execution_id,
  environment, found_in_build, assigned_to, reported_by,
  steps_to_reproduce, expected, actual
)
SELECT
  format('Failure on %s', c.code),
  'S3'::qa.severity,
  'P3'::qa.priority,
  'new'::qa.defect_status,
  c.request_id, c.id, e.id,
  'QA-01', 'build-2401',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  '1. Open 2. Submit', 'Success', coalesce(e.actual_result, 'Failed')
FROM qa.executions e
JOIN qa.test_cases c ON c.id = e.case_id
WHERE e.result = 'fail'
LIMIT 2;

INSERT INTO qa.defects (
  title, severity, priority, status, request_id,
  environment, found_in_build, fixed_in_build, assigned_to, reported_by,
  steps_to_reproduce, expected, actual
) VALUES
  ('Import silently drops duplicate rows', 'S2', 'P1', 'ready_for_retest',
   (SELECT id FROM qa.requests WHERE code = 'QR-102'),
   'QA-01', 'build-2400', 'build-2402',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
   'Upload CSV with duplicates', 'Clear error per row', 'Rows vanished'),
  ('SLA chip shows overdue after close', 'S3', 'P2', 'in_progress',
   (SELECT id FROM qa.requests WHERE code = 'QR-104'),
   'QA-01', 'build-2399', NULL,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
   'Close ticket past due', 'Elapsed duration', 'Overdue Xh'),
  ('Ledger export off-by-one paise', 'S1', 'P1', 'triaged',
   (SELECT id FROM qa.requests WHERE code = 'QR-106'),
   'QA-01', 'build-2401', NULL,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   'Export site ledger', 'Exact paise', 'Off by 0.01'),
  ('UAT wording mismatch on challan footer', 'S4', 'P4', 'triaged',
   (SELECT id FROM qa.requests WHERE code = 'QR-101'),
   'UAT-02', 'build-2402', NULL,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
   'Open PDF footer', 'Exact legal text', 'Old FY label');

COMMIT;

SELECT 'releases' AS kind, count(*)::text AS n FROM qa.releases WHERE id = '2.4.0'
UNION ALL SELECT 'requests', count(*)::text FROM qa.requests
UNION ALL SELECT 'cases', count(*)::text FROM qa.test_cases
UNION ALL SELECT 'runs', count(*)::text FROM qa.test_runs
UNION ALL SELECT 'executions', count(*)::text FROM qa.executions
UNION ALL SELECT 'defects', count(*)::text FROM qa.defects
UNION ALL SELECT 'members', count(*)::text FROM qa.members;
