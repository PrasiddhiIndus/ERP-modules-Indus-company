# Survey Management (INDUS OS → Indus One)

HR/admin create surveys in ERP, assign them to all or selected employees, and see progress and
answers. Employees fill them in Indus One → Surveys (`/indus-one/surveys`).

## Where things live

| Piece | Location |
|-------|----------|
| Migration (not applied yet) | `supabase/migrations/20261103140000_indus_one_survey_management.sql` |
| Shared model (question types, validation, aggregates) | `shared/surveyModel.mjs` (+ `tests/surveyModel.test.js`) |
| API server routes | `server/adminSurveysApi.js`, registered in `server/index.js` |
| ERP client | `src/lib/adminSurveysApi.js` |
| ERP pages | `src/pages/adminOperations/surveys/*` |
| Indus One (separate repo `indus-one`) | `services/ess/contentApi.ts`, `pages/SurveysPage.tsx`, `pages/SurveyDetailPage.tsx`, `types/index.ts`, `query/keys.ts`, `locales/en.json` |

ERP routes (inherit the **Employee Administration** `admin.employee` sub-module; sidebar → Admin → Surveys):

- `/app/admin/employee/surveys` — list (`/app/admin/surveys` redirects here)
- `/app/admin/employee/surveys/new`, `/:surveyId/edit` — editor
- `/app/admin/employee/surveys/:surveyId` — responses / analytics (+ CSV export)

## Schema changes (extends existing `indus_one.survey_*`)

`survey_templates` + `kind`, `status` (`draft|published|archived`), `audience_type` (`all|selected`),
`audience_employee_codes text[]`, `due_date`, `estimated_minutes`, `published_at`, `archived_at`,
`created_by`, `created_by_email`, `updated_at`. On first run, existing templates become `published`
if `is_active`, else `draft` (so nothing live disappears).

`survey_assignments` + `started_at`, `updated_at`, `assigned_by`; status now
`pending | in_progress | completed | revoked`; **unique (template_id, employee_code)** (duplicate rows
without a response are removed first).

`survey_responses` + `template_id` (backfilled); **unique (assignment_id)** — one submission per assignment.

`questions` jsonb: `[{ id, type: short_text|long_text|single_choice|multi_choice|rating, label, required, options?[] }]`.
`answers` jsonb: `{ [questionId]: string | number | string[] }`.

## RLS / RPC changes

- `survey_templates_select`: only `is_active AND status = 'published'` **and** the caller has a non-revoked assignment for it.
- `survey_assignments_select`: own `employee_code` and `status <> 'revoked'`.
- `survey_assignments_update` (employee) **dropped**; `survey_responses_insert` (employee) **dropped**.
  Employees now change state only through:
  - `indus_one.start_survey_assignment(p_assignment_id)` — pending → in_progress.
  - `indus_one.submit_survey_response(p_assignment_id, p_answers)` — checks ownership, survey still
    live, not already submitted, required answers present; inserts the response and completes the assignment.
- `survey_responses_select`: own rows only. Employees cannot read others' responses.
- Authenticated role: SELECT only on the three tables; service_role: full DML (ERP API).

## Assignment rules

- **All employees** = `admin_ifsp_employee_master` rows with `status = 'Active'` (case-insensitive) and a non-empty
  `employee_code` (falls back to `employee_id`).
- **Selected** = chosen codes, matched case-insensitively against Employee Master; unknown codes are rejected.
- Publish / re-publish / saving a live survey re-syncs: new employees get a `pending` row, revoked rows in the
  audience are reopened, open rows get the new due date, employees no longer in the audience with an unfinished
  survey become `revoked`. Completed assignments are never reset or revoked.
- Unpublish → `draft` (assignments kept, hidden in Indus One). Archive → `archived` + `is_active = false`.
  `is_active = false` on a published survey pauses it.

## Anonymous surveys

The ERP API never returns employee code/name, assignment list or exact submission time for anonymous
surveys — only answers, the submission date and aggregates. Responses still store `employee_code` so RLS
lets the employee see their own answer.

## Not done / to verify

- Migration has **not** been applied. Apply it before using the pages (the ERP API returns errors until then).
- Not exercised end-to-end against a live database.
- Hindi / Gujarati strings for the new Indus One labels fall back to English.
- No notifications are sent on publish (v1).
