# QA Module — Discovery Plan

Status: **Phases 1–8 scaffolded.** Module is navigable under `/app/qa`. Polish / E2E / deeper evidence upload still open.

Schema source: `docs/indus_qa_schema.sql` (found).

---

## 1. Stack found

| Area | ERP reality | Implication for QA |
|------|-------------|--------------------|
| Framework | React 18 + Vite 5 | Same |
| Language | **JS/JSX-first** (~647 `.jsx` / ~401 `.js`; almost no app TS) | **Deviation:** build UI in JS like IT Support, not “TypeScript strict”. Keep a thin typed layer only if we introduce generated DB types as tooling. |
| Router | `react-router-dom` v6 — routes in `src/App.jsx`, lazy in `src/routes/lazyPages.jsx` | Same pattern |
| UI kit | `src/components/erpUi/` (canonical). `AdminUi.jsx` is a deprecated re-export | Use erpUi only |
| Styling | Tailwind 3 + CSS tokens in `src/theme/tokens.css` (+ dark via `ThemeContext`) | Map pass/fail/blocked/not-run to existing semantic tokens — **no new UI library** |
| Icons | `lucide-react` (+ some `react-icons`) | Prefer lucide |
| Data / state | Direct Supabase client + local `useState`/`useEffect`. **No** React Query / SWR / Redux / Zustand | Same: `qaApi.js` + page state |
| Forms / validation | Local state + inline checks. **No** react-hook-form / zod | **Deviation:** match ERP (inline validation). Optional small validators in `qaRules.js` tested with Vitest — ask before adding zod |
| Charts | `recharts` | Dashboard bars |
| Export | Module-local CSV; `exceljs`/`xlsx`; `jspdf` / `exportNodeToPdf.js` | Traceability CSV/Excel + report PDF via existing utils |
| Cmd+K | Global `CommandPalette` + `src/lib/commandDestinations.js` | Register QA destinations; deep-link search can extend destinations or add a QA-local search |
| Tests | **Vitest**; DB rules via **PGlite** harness (`scripts/security/rlsHarness.mjs`). **No Playwright / pgTAP** | **Deviation:** DB tests in Vitest+PGlite; E2E deferred or ask to add Playwright |
| Backend | Express (`server/`) for R2, Graph, etc. | Evidence: prefer **Supabase Storage** as specified; R2 only if Storage is blocked |
| Supabase schemas exposed | `config.toml`: `public`, `graphql_public`, `billing`, `finance`, `indus_one`, `projects` | Add **`qa`** to this list; client uses `supabase.schema("qa")` |
| Auth / users | `public.profiles` (id → `auth.users`), `allowed_modules` / `allowed_sub_modules` | Link `qa.members` to profiles (see §5) |
| Attachments precedent | IT Support uses **R2**, not Storage; other modules use private Storage buckets | Follow prompt: private bucket `qa-evidence` |

---

## 2. Components to reuse (by screen)

| QA screen | Existing primitives / patterns |
|-----------|--------------------------------|
| Module shell + tabs | `PageShell`, IT Support `*Layout` tab strip, `PageTaskHeader` |
| Release selector (header) | `TinySelect` / filter control pattern from Site Attendance / IT filters |
| Dashboard KPIs | `KpiTile`, `SectionCard`, `recharts` (IT Reports / Site Attendance Dashboard) |
| Workflow strip / waiting queue | `StatusChip` / `LinkedChip`, dense list in `SectionCard` |
| Requests kanban + table toggle | **IT Support** `TicketQueuePage` HTML5 drag-and-drop + `DenseTable` view toggle |
| Request form + live risk preview | `Modal`/`Drawer`, `FormField`, `TinyInput`/`TinySelect`, `InlineAlert`, segmented controls built from buttons + tokens |
| Request detail | Prefer **page** (like `TicketDetailPage`) for density; drawer only for quick peek if needed |
| Stage stepper / advance reasons | Step strip + `InlineAlert` list for `advance_request` reasons |
| Coverage chips | `Badge` / `StatusChip` mapped to success / warning / critical / neutral / info tokens |
| Test cases table | `DenseTable`, `FilterBar`, search input |
| Case form + step editor | Form fields + reorderable list (new local component from erpUi buttons — no DnD library unless you approve) |
| Execution player | New module component from erpUi + tokens (no third-party player) |
| Evidence upload | Pattern after Storage modules (commercial WO / projects PO) or IT file list UI |
| Defects kanban | Same as Requests / IT queue; invalid move → toast + open detail |
| Traceability | `DenseTable` + CSV/`exceljs` export |
| Release gate + e-sign | `SectionCard`, `Modal` (name retype + meaning checkbox), `StatusChip` |
| Audit trail | Read-only `DenseTable` + filters; diff rendered as text |
| Standards & rules | `SectionCard`, `CollapsibleHelp`, editable rules table for QA Lead |
| Empty / loading / error | `EmptyState`, `LoadingBlock`/`Skeleton`, `InlineAlert`, `toast` |
| Global search | Extend `commandDestinations` + optional QA record search in palette |

### Semantic token mapping (no new colours unless you OK)

| QA state | Token family |
|----------|----------------|
| Pass / met / verified | `--success` (+ soft / border / text) |
| Fail / S1 / gate blocked | `--critical` |
| Blocked / waiver / below target | `--warning` |
| Not run / draft / neutral | `--neutral-state` |
| Info / in progress / open | `--info` or `--accent` for interactive |

---

## 3. File layout (follows IT Support + Site Attendance)

```
src/pages/qa/
  QaLayout.jsx              # tabs + release selector context
  qaAccess.js               # maps UM keys + qa.members role
  qaApi.js                  # supabase.schema("qa") data layer + realtime
  qaConstants.js            # stages, severities, ACCESS_KEYS, environments
  qaRules.js                # risk score, required levels, overall result (unit-tested)
  DashboardPage.jsx
  RequestsBoardPage.jsx
  RequestDetailPage.jsx
  RequestFormPage.jsx       # or modal on board
  TestCasesPage.jsx
  TestCaseDetailPage.jsx
  TestCaseFormPage.jsx
  ExecutionPage.jsx
  DefectsPage.jsx
  DefectDetailPage.jsx
  TraceabilityPage.jsx
  ReleaseGatePage.jsx
  AuditTrailPage.jsx
  StandardsPage.jsx
  components/               # KanbanBoard, ExecutionPlayer, StepEditor, RiskMatrix, CoverageChips, SignOffModal, …
  README.md

src/lib/qa/                 # optional: evidence upload helpers, report builders
  qaEvidence.js
  qaReport.js
  qaExport.js

docs/qa-module/
  PLAN.md                   # this file
  README.md                 # Phase 9

supabase/migrations/
  YYYYMMDDHHMMSS_qa_schema.sql          # from indus_qa_schema.sql + ERP linkages
  YYYYMMDDHHMMSS_qa_storage_evidence.sql
  YYYYMMDDHHMMSS_qa_realtime.sql        # if publication needed
  YYYYMMDDHHMMSS_qa_reports.sql         # optional qa.reports for snapshots

supabase/rollbacks/         # paired down scripts

scripts/qa/
  seed-dev.sql              # local/dev only sample data
  # or scripts/one-off/seed_qa_dev.sql

tests/
  qaRules.test.js
  qaDbRules.test.js         # PGlite against migration + business rules
```

Registration touchpoints (ERP convention):

1. `src/routes/lazyPages.jsx` — lazy exports  
2. `src/App.jsx` — nested routes under `/app/qa`  
3. `src/config/roles.js` — `NAV_MODULE_TREE`, `MODULE_PATH_PREFIXES`, `MODULE_LANDING_PATHS`  
4. `src/contexts/Layout.jsx` / `sidebarNavPages.js` — sidebar  
5. `src/lib/commandDestinations.js` — Cmd+K  
6. `accessModel.js` if tab/page keys need UM editor extras  
7. `supabase/config.toml` — add `qa` to `[api] schemas`

---

## 4. Navigation & permissions

### Proposed UM keys (top-level module `qa`)

| Key | Label | Path | Who |
|-----|-------|------|-----|
| `qa` (module) | QA | `/app/qa` | Full module |
| `qa.dashboard` | Dashboard | `/app/qa` | All members |
| `qa.requests` | Requests | `/app/qa/requests` | All members |
| `qa.cases` | Test cases | `/app/qa/cases` | All members |
| `qa.execution` | Execution | `/app/qa/execution` | Tester / Lead (viewer read-only) |
| `qa.defects` | Defects | `/app/qa/defects` | All members |
| `qa.traceability` | Traceability | `/app/qa/traceability` | All members |
| `qa.release-gate` | Release gate | `/app/qa/release-gate` | All members; sign/waive by role |
| `qa.audit` | Audit trail | `/app/qa/audit` | Lead (+ optionally all viewers read) |
| `qa.standards` | Standards & rules | `/app/qa/standards` | All; edit rules = Lead |

Deep links (as specified):  
`/app/qa/requests/QR-101`, `/app/qa/cases/TC-1001`, `/app/qa/defects/DEF-501`, `/app/qa/runs/RUN-24`  
(ERP uses `/app/...` prefix — **deviation from bare `/qa/...`** in the prompt; note in README.)

### Two-layer access (ERP convention + DB)

1. **ERP User Management** — can the user open the QA module / pages? (`allowed_modules` / `allowed_sub_modules`)  
2. **`qa.members.qa_role` + `qa.my_role()`** — what actions are allowed inside? (RLS + triggers remain source of truth)

`qaAccess.js` will combine both: hide/disable UI when either layer forbids; always surface DB exception messages via toast/`InlineAlert`.

Badge counts (cases awaiting review, open defects for current release) on layout tabs — same idea as IT Support notification bell / open counts.

---

## 5. Database Phase 1 plan

### Source of truth

Use your provided **`indus_qa_schema.sql` unchanged in spirit** (no weakened triggers/constraints). Wrap it in this repo’s migration format:

- `YYYYMMDDHHMMSS_qa_schema.sql`
- Paired rollback under `supabase/rollbacks/`

### Members ↔ profiles (chosen approach — confirm)

ERP already has `public.profiles` (1:1 with `auth.users`, username, email, employee_code, role, modules).

**Proposed linkage (does not duplicate user identity):**

- Keep `qa.members` as the QA role roster (as in your schema).
- `qa.members.user_id` → `auth.users(id)` (as designed) **and** treat `public.profiles.id` as the same UUID.
- Add FK or documented invariant: every `qa.members.user_id` must exist in `public.profiles`.
- Prefer **`full_name` default from `profiles.username`** (or a sync trigger on insert) so admins don’t re-type names.
- Do **not** invent a second user directory; membership is opt-in rows in `qa.members`.
- ERP Super Admin: UI may treat as elevated for module access; DB still requires a `qa.members` row for `qa.my_role()` unless we add a narrow exception — **decision needed** (see §7).

### API exposure

- Add `qa` to `supabase/config.toml` `[api] schemas`.
- Client: `supabase.schema("qa").from(...)` / `.rpc("advance_request", …)` (same as `projects` / `indus_one` / `finance`).

### Storage

- Private bucket `qa-evidence`.
- Policies: QA members (via `qa.my_role()` / membership) **insert + select**; **no delete**.
- Path convention: `qa-evidence/{run_code}/{case_code}/{attempt}/{filename}`.
- Optional: also store metadata in `qa.evidence` as schema defines.

### Types

- Repo has **no** `supabase gen types` script today.
- **Proposed:** add `scripts/qa/gen-types.mjs` (or document `supabase gen types`) writing `src/types/qa.database.ts` for tooling; UI remains JS. Or skip generated types until you insist — **decision**.

### Seed (local/dev only)

- `scripts/qa/seed-dev.sql` (guarded comments: never run in prod).
- Sample release **2.4.0**, ~8 requests, ~15 cases, 2 runs, 6 defects + executions, one member per `qa_role`.
- Prefer linking seed member UUIDs to existing local/dev profiles when present.

### DB tests

- Vitest + PGlite loading the QA migration (pattern: `tests/c2RlsMigration.test.js`).
- Cover: self-approve ban, frozen versions, role restrictions on results, attempt numbering, append-only executions, defect transitions, S1 non-waivable, gate sign-off block, audit append-only + hash chain, `advance_request` reasons.

### Optional `qa.reports`

- Add only if completion-report snapshots are required in Phase 7; keep triggers/audit consistent with schema style.

---

## 6. Build order (unchanged from your prompt)

1. Discovery + PLAN + migration + Storage + types + seed + DB tests  
2. Module shell (routes, nav, release selector, permissions, data hooks)  
3. Requests  
4. Test cases  
5. Execution  
6. Defects  
7. Traceability + release gate + report  
8. Dashboard + audit + standards + search  
9. Realtime, theme/a11y polish, E2E (if approved), README  

Commit after each phase when you ask for commits.

---

## 7. Decisions / gaps needed from you

1. **`indus_qa_schema.sql` location** — **BLOCKER.** Not in this repo, Downloads, Desktop, Documents, or sibling Indus folders. Please drop the file into the repo (e.g. `docs/qa-module/indus_qa_schema.sql` or `supabase/schema_sources/`) so Phase 1 can proceed without inventing/weakening rules.

2. **TypeScript / zod** — Prompt asks for TS strict + zod; ERP is JS + inline validation. Plan defaults to **JS + Vitest rule helpers**. Approve adding zod (and how much TS) if you want the stricter bar.

3. **E2E** — No Playwright today. Approve adding Playwright for Phase 9, or accept Vitest-only + manual UAT checklist?

4. **Super Admin vs `qa.members`** — Should Super Admin bypass membership for read, or must everyone be enrolled in `qa.members` for any QA data access?

5. **Module placement** — New top-level sidebar **“QA”** (proposed) vs under **IT/IS**?

6. **Environments list** — Seed `QA-01`, `UAT-02`, `PERF-01`; confirm table vs constants for configurability.

7. **Evidence hash** — Client-side sha256 (Web Crypto) before upload OK?

8. **Realtime** — Enable postgres_changes on `qa.requests`, `qa.executions`, `qa.defects` (and publication migration) like IT Support?

---

## 8. Explicit deviations from the prompt (ERP wins)

| Prompt | ERP convention we will follow |
|--------|-------------------------------|
| TypeScript strict throughout | JS/JSX pages; optional generated types file |
| zod on every form | Inline validation + shared `qaRules.js` (unless you approve zod) |
| React Query invalidation | Refetch helpers after writes (IT Support style) |
| Routes `/qa/...` | `/app/qa/...` |
| Playwright E2E | Not present; pending your OK |
| pgTAP | Vitest + PGlite instead |
| New visual style / UI kit | Forbidden — erpUi + tokens only |

---

## 9. Phase 1 — done

| Item | Location / note |
|------|-----------------|
| Schema source | `docs/indus_qa_schema.sql` |
| Migration | `supabase/migrations/20261126150000_qa_schema.sql` (+ profiles FK/name sync, service_role grants, portable `advance_request` via `array_append`) |
| Rollback | `supabase/rollbacks/20261126150000_qa_schema_down.sql` |
| Storage | `supabase/migrations/20261126150100_qa_evidence_storage.sql` — private bucket `qa-evidence`, insert+select for QA members, **no delete** |
| API expose | `supabase/config.toml` includes `qa` |
| Seed (dev only) | `scripts/qa/seed-dev.sql` |
| DB harness / tests | `scripts/qa/qaHarness.mjs`, `tests/qaDbRules.test.js` (13 passing with `tests/qaRules.test.js`) |
| Rule helpers | `src/pages/qa/qaRules.js` |
| Types | Hand-maintained `src/types/qa.database.ts` (no `supabase gen types` in repo yet) |

### Members ↔ profiles (chosen)

- Kept `qa.members` as the QA role roster (`user_id` → `auth.users`).
- Added `qa_members_profile_fk` → `public.profiles(id)` (same UUID).
- Trigger `trg_members_fill_name` can fill `full_name` from `profiles.username` / email when placeholder `(from profile)` is used.
- **Not** a second user directory; enrollment is opt-in rows in `qa.members`.
- First QA lead must be inserted as `service_role` / SQL owner (RLS only lets an existing `qa_lead` manage members).

### Schema note (non-weakening fix)

`qa.advance_request` in the source used `text[] || text`, which is ambiguous and fails on some Postgres clients (including PGlite). Migration ends with an equivalent `CREATE OR REPLACE` using `array_append` — **same gate logic**, no relaxed rules.

### Still waiting before Phase 2

Your OK on this plan (and any §7 answers you care about).
