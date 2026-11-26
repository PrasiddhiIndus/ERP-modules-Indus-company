# QA module

Quality Assurance & Testing for INDUS ERP. Schema lives in `qa` (see `docs/indus_qa_schema.sql` and migrations `20261126150000_*` / `20261126150100_*`).

## Access

1. **User Management** — grant module `qa` (or page keys `qa.dashboard`, `qa.requests`, …).
2. **`qa.members`** — enroll the user with a `qa_role`. First lead must be inserted as service role / SQL owner.

## Local setup

1. Apply migrations (includes schema + `qa-evidence` storage bucket).
2. Ensure PostgREST exposes schema `qa` (`supabase/config.toml` already lists it).
3. Dev seed only: `psql … -f scripts/qa/seed-dev.sql` (refuses if shipped releases exist).

## UI routes

| Path | Screen |
|------|--------|
| `/app/qa` | Dashboard |
| `/app/qa/requests`, `/app/qa/requests/QR-101` | Board + detail |
| `/app/qa/cases`, `/app/qa/cases/TC-1001`, `/app/qa/cases/TC-1001/version` | Cases (+ new version) |
| `/app/qa/execution`, `/app/qa/runs/RUN-24` | Execution player |
| `/app/qa/defects`, `/app/qa/defects/DEF-501` | Defects |
| `/app/qa/traceability` | Traceability matrix |
| `/app/qa/release-gate` | Exit criteria + e-sign |
| `/app/qa/audit` | Audit trail |
| `/app/qa/standards` | Standards & rules |
| `/app/qa/manual` | User manual (markdown in `src/pages/qa/manual/content/`) |

Release selector in the module header scopes most lists to the selected release (defaults to latest open). The **?** in the QA header opens the matching manual section.

## User manual

Content lives in `src/pages/qa/manual/content/*.md` (one file per section). Regenerate or edit those files; the page loads them via `?raw`.

### Update the manual when you change these screens

When you rename a button, field, badge, tab, or stage check, update the matching section under `src/pages/qa/manual/content/` (or `scripts/qa/write-manual-content.mjs` then re-run it) so the guide stays true:

- [ ] Requests board / **New QA request** / **Create request** / likelihood & impact / **ERP module**
- [ ] Request detail / **Move to …** / **Evidence link** / **Save link** / **Sign as …**
- [ ] Test cases / **New case** / **Create case** / **Approve version** / **Request changes** / **Mark obsolete** / **New version**
- [ ] Execution / **New test run** / **Create run** / **Pass** / **Fail** / **Blocked** / **Record result** / **Retest (new attempt)**
- [ ] Defects / **Log defect** / status columns / **Fixed in build** / **Save**
- [ ] Traceability / **Export CSV** / coverage chips / verdicts
- [ ] Release gate / **Waive** / **Save waiver** / **Sign as …** / **Confirm sign-off** / **Copy test completion report**
- [ ] Audit / **Verify chain**
- [ ] Role permissions in `qaAccess.js` and DB RPCs (also refresh `#why-cant-i` and `#roles`)
- [ ] Keyboard shortcuts on Execution (P / F / B / N / Ctrl+Enter)

`tests/qaManual.test.js` fails if a listed UI label disappears from its source file, or if a help-anchor / Show-me route is missing.

## Tests

```bash
npx vitest run tests/qaRules.test.js tests/qaDbRules.test.js tests/qaManual.test.js
```

## Plan

See [PLAN.md](./PLAN.md) for stack deviations and build notes.
