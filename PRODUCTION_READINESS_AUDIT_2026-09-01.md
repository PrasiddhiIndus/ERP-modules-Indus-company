# INDUS ERP — Complete Production-Readiness Audit

**Audit date:** 2026-09-01  
**Mode:** Read-only analysis — no code, configuration, or schema changes were made.  
**Scope:** Full stack — React 18 + Vite SPA (`src/`), Express 5 API (`server/`), shared modules (`shared/`), Supabase (PostgreSQL, Auth, 173 migrations, 10 Edge Functions), CI/CD (GitHub Actions), DigitalOcean/nginx/PM2 deployment, and third-party integrations (eTimeOffice, Whitebooks e-invoice, Cloudflare R2, Microsoft Graph mail).

**Methodology:** Static code review, migration analysis, test execution verification, CI/workflow inspection, and cross-reference with prior audits (`AUDIT_REPORT.md`, `ERP-Performance-Security-Reliability-Audit-Report.md`, `REMEDIATION_PLAN.md`). Runtime metrics (P95 latency, live RLS state, production env values) require operational verification and are flagged where applicable.

---

## Executive Summary

INDUS ERP is a **feature-rich modular monolith** with deliberate security investment (JWT auth middleware, Helmet, rate limiting, layered RLS hardening migrations, profile privilege protection, CI security-check script). The architecture sensibly separates browser (anon key + RLS) from server (service_role + third-party secrets).

**However, the system is not yet fully production-hardened.** The primary risks are:

1. **Database policy drift** — permissive `USING (true)` policies in legacy migrations and one-off fix scripts can negate scoped RLS if not verified on live DB.
2. **Business correctness gaps** — attendance register sync depends on browser UI after server cron; leave balance deductions lack locking; unapproved POs may still be invoiced.
3. **Operational gaps** — no error monitoring (Sentry/Datadog), no automated DB migration in CI/CD, no documented DR drills, single-server deployment (SPOF).
4. **Authorization holes** — R2 presign paths, activity log forgery, unauthenticated info-disclosure endpoints.
5. **Testing gap** — 112 passing unit/smoke tests cover domain logic only; zero component or E2E tests.

**Overall score: 5.4 / 10** — Suitable for controlled production use with active ops oversight; **not** ready for unattended high-stakes deployment without addressing P0/P1 items.

> **Note:** A prior audit (2026-07-04) scored overall health at 4.4/10. Significant progress since then includes 84 additional migrations, attendance RLS hardening, profile INSERT protection (`20260901130000`), leave balance edit restrictions, CI security-check, and expanded test suite. Several July blockers remain partially open.

---

## Category Score Table

| # | Category | Score / 10 | Risk Level | Summary |
|---|----------|:----------:|:----------:|---------|
| 1 | Security | **5.5** | High | Strong API auth; RLS drift + CORS + R2 IDOR remain |
| 2 | Architecture | **6.0** | Medium | Clear modular monolith; dual API surfaces, sync duplication |
| 3 | Scalability | **4.5** | High | Full-table fetches, single droplet, no horizontal scale |
| 4 | Performance | **5.0** | Medium | Good code splitting; monolith pages, blocking sync/DSC |
| 5 | Reliability | **5.0** | High | eTime retries good; register sync gap, leave races |
| 6 | Availability | **5.0** | High | Single DO droplet + PM2; no HA/failover |
| 7 | Database | **6.5** | Medium | 173 migrations, strong triggers; RLS complexity |
| 8 | API / Backend | **6.0** | Medium | Helmet + rate limits; unauth endpoints, large payloads |
| 9 | Frontend / UI / UX | **6.0** | Medium | AdminUi maturing; legacy modules inconsistent |
| 10 | Accessibility | **4.5** | Medium | Basic focus rings; modal/dialog gaps, no a11y lint |
| 11 | Mobile Responsiveness | **5.5** | Medium | Nav works; data-heavy screens desktop-first |
| 12 | Authentication | **6.5** | Medium | Supabase GoTrue + session cache; localStorage XSS risk |
| 13 | Authorization / RBAC | **6.0** | High | Layered guards; client bypassable without RLS |
| 14 | Data Integrity | **5.5** | High | Attendance triggers strong; leave/billing gaps |
| 15 | Validation | **5.0** | Medium | Ad hoc per-page; no shared schema library |
| 16 | Error Handling | **6.0** | Medium | Good server patterns; inconsistent frontend |
| 17 | Logging | **4.0** | Medium | `console.*` only; no structured server logging |
| 18 | Monitoring / Observability | **3.0** | High | No APM/error tracking; health endpoint only |
| 19 | Caching | **4.5** | Medium | Auth/chunk cache; no HTTP or query cache layer |
| 20 | Concurrency | **5.0** | Medium | Punch upsert dedupe; leave balance race conditions |
| 21 | Transactions | **6.0** | Medium | Finance atomic RPCs; migrations lack explicit TX |
| 22 | Audit Trails | **5.0** | High | `erp_activity_log` exists but RLS allows forgery |
| 23 | Maintainability | **5.0** | Medium | 5k-line pages; partial design system adoption |
| 24 | Code Quality | **5.5** | Medium | Good shared modules; ESLint skips 95% of JSX |
| 25 | Testing | **4.0** | High | 112 logic tests; no UI/E2E/coverage |
| 26 | Deployment / DevOps | **6.5** | Medium | CI/CD + security-check; manual DB migrations |
| 27 | Infrastructure | **5.0** | High | DO droplet + nginx + PM2; no containers/HA |
| 28 | Backup / Recovery | **4.0** | High | PITR recommended in docs only; no runbooks |
| 29 | User Experience | **6.0** | Medium | Strong Admin Ops; schema jargon in some toasts |
| 30 | Integrations & Dependencies | **5.5** | Medium | eTime/Whitebooks/R2/Graph; external SPOFs |

**Weighted overall: 5.4 / 10**

---

## Detailed Findings by Category

---

### 1. Security — 5.5 / 10

| Priority | Issue | Risk | Evidence / Root Cause | Recommendation |
|----------|-------|------|----------------------|----------------|
| **P0** | Permissive RLS via `production_modules_data_fix.sql` | **Critical** | Script recreates `erp_auth_*` policies with `USING (true)` on marketing, tenders, employee master, activity log (`supabase/production_modules_data_fix.sql`) | Never run on production; audit live `pg_policies` for `USING (true)` |
| **P0** | CORS allows all origins when `CORS_ORIGINS` unset | **Critical** (misconfig) | `server/index.js:330–355` — `origin: true` with `credentials: true` if env empty | Fail fast at startup if `CORS_ORIGINS` empty in production |
| **P1** | Activity log forgery | **High** | `erp_activity_log` allows any authenticated user INSERT/SELECT with `USING (true)` | Restrict INSERT to `user_id = auth.uid()`; SELECT admin-only |
| **P1** | R2 presign IDOR | **High** | Fleet/HR-calling presign-get validates prefix only, not object ownership (`server/index.js`) | Verify key contains caller `user.id` or DB metadata |
| **P1** | Software-subscriptions R2 any-session access | **High** | `requireSessionForSoftwareSubscriptionsR2` accepts any valid JWT | Add super-admin or module gate matching UI |
| **P2** | JWT tokens in `localStorage` | **Medium** | `src/lib/supabase.js` — standard SPA XSS exposure | Strict CSP, dependency hygiene; consider httpOnly proxy |
| **P2** | `/api/health` info disclosure | **Medium** | Exposes Supabase project ref, service_role status (`server/index.js`) | Trim production response or require admin token |
| **P2** | `/api/admin/attendance/status` unauthenticated | **Medium** | `server/index.js:1221` — no auth middleware | Add `requireAttendanceAdmin` |
| **P3** | Staging full-access bypass | **Low** (config) | `VITE_STAGING_FULL_ACCESS=true` grants all modules (`src/config/roles.js`) | Build-time guard preventing flag in production |
| **P3** | Edge Functions CORS `*` | **Low** | `login-check`, `admin-create-user` — `Access-Control-Allow-Origin: *` | Acceptable with Bearer auth; document intent |

**Positive controls:** Helmet, rate limiting (180/min API, 30/min e-invoice), `assertBrowserSafeSupabaseKey()` blocks service_role in browser, `profiles_protect_privilege_columns` trigger, CI `scripts/security-check.mjs`, cross-project JWT rejection in auth middleware.

---

### 2. Architecture — 6.0 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P1** | Dual admin API surfaces | **High** | Express `/api/admin/*` + Supabase Edge Functions (`admin-create-user`, etc.) both use service_role | Consolidate to one path; document canonical surface |
| **P1** | Duplicate register sync implementations | **High** | `shared/attendanceRegisterSync.mjs`, `server/attendanceRegisterSync.js`, `src/lib/attendanceDaily.js` | Single server-side pipeline; browser calls API |
| **P2** | Monolithic route table | **Medium** | `src/App.jsx` ~743 lines, all routes in one file | Split by domain module |
| **P2** | No API gateway / BFF consistency | **Medium** | Most CRUD direct to Supabase; some via Express | Document which operations use which path |
| **P3** | Package metadata | **Low** | `package.json` name `vite-react-typescript-starter`, version `0.0.0` | Rename to `indus-erp`, semver |

**Strengths:** Modular monolith with domain folders (`src/pages/<domain>/`), lazy route splitting (`src/routes/lazyPages.jsx`), shared pure-logic modules (`shared/`), clear prod/staging Supabase isolation (`server/index.js:126–128`).

---

### 3. Scalability — 4.5 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P0** | Unbounded data fetches | **Critical** | Leave requests cap 20,000 rows `select('*')` (`server/adminLeaveRequestsApi.js`); client full-table loads in billing/dashboard | Server-side pagination, column projection, cursor-based APIs |
| **P1** | Single-server deployment | **High** | DigitalOcean droplet + PM2; no load balancer | Add second instance + LB when user count grows |
| **P1** | In-memory rate limit store | **High** | `express-rate-limit` default memory store — bypassed with multiple instances | Redis-backed rate limiter |
| **P2** | Monolith page components | **Medium** | `SiteLedgerApp.jsx` (5,816 lines), `CreateInvoice.jsx` (4,596 lines) | Split + virtualize tables |
| **P2** | Billing realtime amplification | **Medium** | `BillingContext.jsx` reloads all POs/invoices on any change | Scoped queries, debounce, incremental updates |
| **P3** | Debug invoice snapshots in memory | **Low** | `server/index.js:327–328` — `Map` capped at 200 | Remove or persist externally |

**Bottlenecks:** Attendance sync (14-day lookback, chunked upserts), DSC signing (120s blocking), bulk user create (100 sequential Auth API calls).

---

### 4. Performance — 5.0 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P1** | Blocking DSC sign-pdf | **High** | Sync USB DSC + PowerShell, 120s timeout (`server/dscSignPdf.js`) | Queue + dedicated Windows worker |
| **P1** | Attendance sync on request path | **High** | `POST /api/admin/attendance/sync` blocks until complete | Background job with status polling |
| **P2** | No HTTP caching layer | **Medium** | No SWR/React Query; refetch on every mount | Add query cache for stable reference data |
| **P2** | Dashboard polling + realtime | **Medium** | 45s poll + 8 realtime channels (`src/pages/Dashboard.jsx`) | Reduce channels; server-side aggregation |
| **P3** | Large vendor chunks | **Low** | `vendor-xlsx`, `vendor-pdf` manual chunks (`vite.config.ts`) | Already split; monitor bundle analyzer |

**Strengths:** Vite manual chunks, `lazyWithRetry` with deploy-safe chunk reload, performance indexes migration (`20260626130000_database_performance_indexes.sql`), noop register update skip (`20260806120000`).

---

### 5. Reliability — 5.0 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P0** | Attendance cron does not sync register | **Critical** | `runAttendanceOverlapSync` upserts punches only; register marks updated in browser (`server/attendanceEtime.js` vs `src/lib/attendanceDaily.js`) | Call `syncRegisterMarksFromPunches` after cron punch sync |
| **P1** | Leave balance race conditions | **High** | `admin_leave_apply_balance_deduction` — no `FOR UPDATE`, no idempotency (`20260605100000`) | Row lock + balance sufficiency check |
| **P1** | Leave balance silent no-op | **High** | If no yearly row exists, function returns without error | Fail loudly or auto-create balance row |
| **P2** | Register read-modify-write race | **Medium** | Fetch → filter → upsert without advisory lock | DB-level upsert with conflict handling |
| **P2** | eTime transient failures | **Medium** | Retries exist (`attendanceEtime.js:407–437`) | Add circuit breaker + alerting |
| **P3** | `access-check` Edge Function fail-open | **Low** | Returns `{ ok: true }` when profiles table missing | Fail closed in production |

**Strengths:** `punch_key` unique constraint + upsert dedupe, eTime 5xx → 502 mapping, partial upsert reporting, DSC in-process lock (`server/dscLock.js`).

---

### 6. Availability — 5.0 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P0** | Single droplet SPOF | **Critical** | `scripts/deploy.sh` — one DO VM, PM2 process | Multi-AZ or standby instance |
| **P1** | No health-based auto-restart policy in repo | **High** | PM2 started inline in deploy script; no `ecosystem.config.js` | PM2 ecosystem with max_restarts, memory limits |
| **P1** | Supabase platform dependency | **High** | All data/auth via Supabase hosted | Monitor Supabase status; document failover (read-only mode) |
| **P2** | No blue-green or canary deploy | **Medium** | Direct tar.gz replace of `dist/` | Staged rollout with rollback |
| **P3** | Render free-tier alternate | **Low** | `render.yaml` — optional e-invoice API on free tier | Not suitable for production SLA |

**Strengths:** CI builds frontend (avoids droplet OOM), post-deploy health check (`https://indus-erp.in/api/health`), `scripts/recover-production-api.sh` for PM2 port conflicts.

---

### 7. Database — 6.5 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P0** | Live RLS state unknown | **Critical** | 173 migrations layered; early files have `USING (true)` superseded by later hardening | Run verification queries on production (see § Verification) |
| **P1** | No migration-level transactions | **High** | Zero `BEGIN/COMMIT` in migration files | Break risky migrations into smaller files; test on staging first |
| **P1** | No down migrations | **High** | Forward-only | Document manual rollback procedures per migration |
| **P2** | Function overload duplicates | **Medium** | Fixed in `20260903110000` — evidence of re-apply pain | Enforce migration ordering in CI |
| **P2** | Hardcoded email in SQL auth | **Medium** | `bency@indusfire.com` in `20260902100000_restrict_leave_balance_edits.sql` | Move to config table or role-based check |
| **P3** | `get_profile_role` revocation | **Low** | Revoked from `authenticated` in hardening migration | Verify not re-granted |

**Strengths:** Idempotent DDL patterns, `SECURITY DEFINER` helpers with `SET row_security = off`, attendance business validation triggers (`20260827170000`), finance atomic replace RPCs (`20260807140000`), performance indexes, punch dedupe via `punch_key`.

---

### 8. API / Backend — 6.0 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P1** | Unauthenticated endpoints | **High** | `/api/health`, `/api/admin/attendance/status` | Add auth or strip sensitive fields |
| **P1** | Large response payloads | **High** | Leave/tour APIs fetch up to 20k rows | Pagination + field selection |
| **P2** | Per-request Supabase client creation | **Medium** | `authMiddleware.js` creates client per request | Connection pooling / client reuse |
| **P2** | E-invoice provider response leakage | **Medium** | Full `providerResponse` may reach client | Sanitize in production |
| **P3** | DSC USB returns 200 on error | **Low** | `handleUsbDscCertificates` swallows HTTP errors | Return proper status codes |

**Strengths:** Structured `HttpError`, role-scoped middleware (`requireHrOrAdmin`, `requireBillingAccess`, etc.), eTime sync secret header, 8 MB body cap, env pinning for prod/staging project refs.

---

### 9. Frontend / UI / UX — 6.0 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P1** | Partial AdminUi adoption | **High** | Legacy modules (billing, finance, marketing) use bespoke UI | Migrate high-traffic screens to `AdminUi.jsx` primitives |
| **P1** | Schema jargon in user toasts | **High** | `QuotationTemplatePage.jsx` exposes table/migration names | Replace with business language per UI philosophy rule |
| **P2** | Monolith page files | **Medium** | 4k–5k line components hinder UX iteration | Decompose into task-specific views |
| **P2** | Inconsistent loading UX | **Medium** | Some pages show empty tables during fetch | Standardize skeleton/loading patterns |
| **P3** | `toast.error` uses warning styling | **Low** | `src/lib/toast.js` — amber not red | Distinguish error severity visually |

**Strengths:** `PageTaskHeader`, `SectionCard`, `DenseTable`, `FilterBar` design system; progressive disclosure in Admin Ops; `RouteErrorBoundary` with chunk deploy recovery; `lazyWithRetry`.

---

### 10. Accessibility — 4.5 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P1** | Modal/Drawer lack dialog semantics | **High** | `AdminUi.jsx` Modal/Drawer — no `role="dialog"`, focus trap | Add `aria-modal`, focus trap, `aria-labelledby` |
| **P1** | Click-only table rows | **High** | `DenseTable` freeze-pane rows — `<div onClick>`, not keyboard-focusable | Use `<button>` or `tabIndex` + `onKeyDown` |
| **P2** | No eslint-plugin-jsx-a11y | **Medium** | `eslint.config.js` — only hooks + refresh plugins | Add jsx-a11y rules |
| **P3** | Sparse `sr-only` labels | **Low** | ~10 files vs hundreds of forms | Audit high-traffic forms |

**Strengths:** Global `:focus-visible` in `src/index.css`, `aria-live` on toasts and page loader, partial dialog support in some modals.

---

### 11. Mobile Responsiveness — 5.5 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P2** | Desktop-first data grids | **Medium** | Attendance register, invoice creation — horizontal scroll only | Card/stack layout for key columns on mobile |
| **P2** | Dense tables without column reduction | **Medium** | `overflow-x-auto` pattern widespread | Responsive column hiding via breakpoints |
| **P3** | Sidebar navigation | **Low** | `Layout.jsx` — hamburger + `lg:ml-64` works | Adequate for current use |

**Strengths:** Tailwind responsive utilities, collapsible sidebar, login page media queries.

---

### 12. Authentication — 6.5 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P2** | localStorage session storage | **Medium** | `supabase.auth.token` in localStorage | CSP + XSS prevention; evaluate cookie proxy |
| **P2** | Register route in non-prod | **Medium** | `src/App.jsx` — `/register` gated by env | Ensure Supabase Dashboard disables signup in prod |
| **P3** | Remember-me in localStorage | **Low** | `Login.jsx` — 30-day remember flag | Acceptable with secure session handling |

**Strengths:** Direct GoTrue REST login avoids lock hangs, cached JWT hydration, project mismatch session clearing, `login-check` strips privilege metadata, inactive account rejection, staged permission loading in `ProtectedRoute`.

---

### 13. Authorization / RBAC — 6.0 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P0** | Client guards bypassable | **Critical** | `ProtectedRoute` checks session only; module ACL in `Layout.jsx` — direct Supabase REST bypasses | RLS must be authoritative (verify live state) |
| **P1** | Legacy no-role approval fallback | **High** | `userCanApproveInModules` fallback in `roles.js` | Remove after profile backfill |
| **P2** | Salary/Compliance client allowlists | **Medium** | Hardcoded emails in `salaryAccess.js`, `complianceAccess.js` | Move to DB config or RLS |
| **P3** | `is_current_user_admin()` naming | **Low** | Checks only super_admin variants | Rename for clarity |

**Strengths:** Three-layer model (client nav + server middleware + SQL RLS), `profiles_protect_privilege_columns`, super_admin-only profile management, server APIs enforce role hierarchy.

---

### 14. Data Integrity — 5.5 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P0** | Unapproved PO invoicing | **Critical** | `CreateInvoice.jsx:754–758` — `billablePOs` filters supplementary only, not `approvalStatus` | Add `approvalStatus === 'approved'` filter |
| **P1** | Leave balance not enforced at approval | **High** | Deduction without sufficiency check | Add CHECK or trigger validation |
| **P1** | Sandwich leave not implemented | **High** | `admin_leave_working_dates` counts all calendar days | Exclude WO/NH/PH per policy |
| **P2** | Billing localStorage fallback | **Medium** | `BillingContext.jsx`, `billingStore.js` — seeds fake POs when DB unavailable | Disable in production builds |
| **P2** | Mock data in production modules | **Medium** | Operations dashboard, AMC mock merge, `mockAlerts` in AdminOps | Wire real data or hide modules |
| **P3** | Payroll path undercounts paid days | **Medium** | Misalignment between daily register UI and payroll merge | Align data sources |

**Strengths:** Attendance register business validation triggers (PL/CL/SL adjacency, punch-required Present), punch priority over leave marks, finance atomic replace RPCs, employee code standardization migrations.

---

### 15. Validation — 5.0 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P2** | No shared validation library | **Medium** | Ad hoc `if (!field) toast.warning(...)` per page | Introduce Zod/Yup schemas for critical forms |
| **P2** | Inconsistent field-level errors | **Medium** | Rare `errors.email` pattern | Standardize inline field errors |
| **P3** | Bulk create up to 100 users | **Low** | `adminCreateUserApi.js` — Admin only, global rate limit | Per-route throttle |

**Strengths:** `FormDateInput`/`dateInput.js` shared date validation, GSTIN validation in PO flows, attendance leave limits tested (`tests/smoke.test.js`), R2 filename sanitization.

---

### 16. Error Handling — 6.0 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P2** | Frontend errors to console only | **Medium** | Many fetch paths — `console.error` without user toast | Standardize error surfacing |
| **P2** | `RouteErrorBoundary` no reporting | **Medium** | Catches render errors but only logs | Wire to error monitoring service |
| **P3** | Edge function error parsing | **Low** | `parseEdgeFunctionError` in `supabase.js` | Adequate |

**Strengths:** Server try/catch with status mapping, eTime provider error sanitization, `InlineAlert` for persistent form errors, refresh-token failure → sign out (`supabaseErrorHandler.js`).

---

### 17. Logging — 4.0 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P1** | No structured logging | **High** | `console.log/error` throughout server and client | Adopt pino/winston on server |
| **P2** | No request correlation IDs | **Medium** | Express has no request ID middleware | Add `X-Request-Id` propagation |
| **P3** | Login debug gated | **Low** | `logLoginStage()` — DEV or `VITE_LOGIN_DEBUG` only | Good pattern |

---

### 18. Monitoring / Observability — 3.0 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P0** | No error tracking | **Critical** | No Sentry, Datadog, LogRocket in dependencies | Integrate Sentry (frontend + server) |
| **P1** | No APM / metrics | **High** | No OpenTelemetry, no server metrics endpoint | Add basic Prometheus metrics or DO monitoring |
| **P1** | No alerting | **High** | Health check in CI only; no uptime monitoring | UptimeRobot/Pingdom on `/api/health` |
| **P2** | Internal API monitoring only | **Medium** | `src/pages/apiMonitoring/` — admin dashboard, not ops | Export metrics to external system |
| **P3** | DB performance script exists but unused in CI | **Low** | `supabase/scripts/database_performance_audit.sql` | Schedule monthly run |

---

### 19. Caching — 4.5 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P2** | No query cache | **Medium** | Refetch on mount everywhere | React Query for reference data |
| **P2** | USB cert list not cached | **Medium** | 12–30s PowerShell call each request | Brief TTL cache |
| **P3** | Auth session cache | **Low** | `authSessionUtils.js` — localStorage JWT/profile | Appropriate for SPA |
| **P3** | nginx asset caching | **Low** | `scripts/nginx-production-cache-snippet.conf` | Hashed assets cached |

---

### 20. Concurrency — 5.0 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P1** | Leave balance concurrent updates | **High** | No row locking on balance deduction | `SELECT ... FOR UPDATE` |
| **P2** | Overlapping attendance sync | **Medium** | No mutex on cron + manual sync | Advisory lock on sync state row |
| **P2** | Register upsert interleaving | **Medium** | Browser UI + punch sync concurrent writers | Server-side serialized sync |
| **P3** | DSC signing serialized | **Low** | `dscLock.js` promise chain | Correct for PKCS#11 |

---

### 21. Transactions — 6.0 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P2** | Migration partial-apply risk | **Medium** | Multi-statement migrations without explicit TX | Test on staging; smaller migrations |
| **P3** | Finance replace atomicity | **Low** | `finance.replace_*` functions — single PL/pgSQL body | Good pattern |

---

### 22. Audit Trails — 5.0 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P1** | Activity log integrity | **High** | Permissive RLS allows spoofed `user_id`/`user_email` | Tighten INSERT policy |
| **P2** | No server-side audit for admin ops | **Medium** | User create/delete, DSC sign, e-invoice lack structured audit | Log to immutable table via service_role |
| **P3** | Finance audit log enum | **Low** | `import_export_logs` supports backup/restore ops | Good domain audit |

---

### 23. Maintainability — 5.0 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P1** | 5k-line components | **High** | `SiteLedgerApp.jsx`, `CreateInvoice.jsx`, `Layout.jsx` | Incremental decomposition |
| **P2** | ESLint skips JSX | **Medium** | `eslint.config.js` — `**/*.{ts,tsx}` only | Extend to `.jsx` |
| **P2** | Missing git hooks script | **Medium** | `hooks:install` → non-existent `scripts/install-git-hooks.mjs` | Create or remove script |
| **P3** | README stub | **Low** | `README.md` — one line | Write setup/deploy guide |
| **P3** | Dual entry files | **Low** | `main.tsx` + legacy `main.jsx` | Remove unused entry |

---

### 24. Code Quality — 5.5 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P2** | ~99.5% JavaScript, minimal TypeScript | **Medium** | Only `main.tsx`, `vite-env.d.ts`, `App.d.ts` | Gradual TS migration for critical paths |
| **P2** | Parallel UI kits | **Medium** | FinanceUi, OperationsUi, AmcUi alongside AdminUi | Consolidate |
| **P3** | Shared module quality | **Low** | `attendancePunchSync.mjs`, `attendanceRegisterSync.mjs` — well-tested | Good pattern to replicate |

---

### 25. Testing — 4.0 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P0** | No component or E2E tests | **Critical** | 15 test files, 112 tests — all pure logic (`tests/smoke.test.js`, `rolesAccess.test.js`, etc.) | Add Playwright smoke for auth + critical flows |
| **P1** | No coverage tooling | **High** | No `vitest.config.*`, no `--coverage` | Configure c8 coverage with thresholds |
| **P1** | CI runs smoke only | **High** | `.github/workflows/deploy.yml` — `npm run test:smoke` | Run full `npm test` in CI |
| **P2** | Untested critical paths | **Medium** | `AuthContext`, `CreateInvoice`, `EmployeeAttendanceDailyPage` | Priority test targets |
| **P3** | No `@testing-library/react` | **Low** | Not in dependencies | Add for component tests |

**Strengths:** Tests cover attendance sync rules, RBAC, payroll statutory calc, auth middleware exports, R2 access rules, profile safety.

---

### 26. Deployment / DevOps — 6.5 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P0** | DB migrations not in CI/CD | **Critical** | 173 migrations applied manually via Supabase Dashboard/CLI | Add migration verification step to deploy pipeline |
| **P1** | Node 18 (EOL approaching) | **High** | `.github/workflows/deploy.yml` — `node-version: '18'` | Upgrade to Node 20 LTS |
| **P2** | No Docker/containers | **Medium** | Bare-metal deploy on DO droplet | Containerize for reproducibility |
| **P3** | Concurrency group cancels in-progress | **Low** | `deploy-${{ github.ref }}` cancel-in-progress | Good for rapid iteration |

**Strengths:** CI pipeline (lint, security-check, smoke, build), guarded production deploy with health verification, staging/production isolation, CI-built frontend avoids droplet OOM, `security-check.mjs` blocks secret leaks in templates.

---

### 27. Infrastructure — 5.0 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P0** | Single server SPOF | **Critical** | One DO droplet for nginx + API + static files | HA architecture |
| **P1** | No IaC | **High** | nginx snippets in `scripts/`; full config on server | Terraform/Ansible for infra |
| **P1** | PM2 config not in repo | **High** | Started inline in `deploy.sh` | `ecosystem.config.js` with memory/CPU limits |
| **P2** | Optional Render on free tier | **Medium** | `render.yaml` — not production-grade | Use only for dev/staging |
| **P3** | Hardcoded prod URL in workflow | **Low** | `deploy.yml` line 188 — Supabase URL fallback | Remove fallback; fail if secret missing |

---

### 28. Backup / Recovery — 4.0 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P0** | No DR runbook | **Critical** | `REMEDIATION_PLAN.md` §5.3 — recommendations only | Document PITR restore procedure |
| **P1** | No restore drills | **High** | No evidence of quarterly restore tests | Schedule and log drills |
| **P2** | Finance export ≠ backup | **Medium** | `financeApi.js exportFinanceBackup()` — client JSON | Supplement with Supabase PITR |
| **P3** | Process recovery script exists | **Low** | `scripts/recover-production-api.sh` — PM2 only | Good for API recovery |

---

### 29. User Experience — 6.0 / 10

| Priority | Issue | Risk | Evidence | Recommendation |
|----------|-------|------|----------|----------------|
| **P2** | Inconsistent module UX | **Medium** | Admin Ops polished; billing/finance legacy | Phased AdminUi rollout |
| **P2** | Schema jargon in errors | **Medium** | Table/migration names in toasts | Business-language messages |
| **P3** | Mock data confusion | **Low** | Operations uses `mockOperationsData` | Banner or remove in prod |
| **P3** | Deploy chunk recovery | **Low** | `lazyWithRetry` auto-reload | Good UX for deploys |

**Strengths:** Task-oriented Admin Ops screens, progressive disclosure, role-based navigation, activity log drawer for admins.

---

### 30. Integrations & Dependencies — 5.5 / 10

| Integration | Risk | Evidence | Recommendation |
|-------------|------|----------|----------------|
| **eTimeOffice** | **High** | External API; cron + manual sync; credentials in `.env.server` | Monitor sync failures; alert on stale punches |
| **Whitebooks (e-invoice)** | **Medium** | GSP dependency; tail latency | Circuit breaker; timeout tuning |
| **Cloudflare R2** | **Medium** | S3-compatible; 25 MB in-memory uploads | Stream uploads; fix authz gaps |
| **Microsoft Graph (mail)** | **Medium** | CRM outreach campaigns | Retry + bounce handling |
| **Supabase** | **Medium** | Auth + DB + Edge Functions platform SPOF | Status page monitoring; connection pooling |
| **USB DSC (Windows)** | **High** | Platform-specific; blocks Node worker | Isolate signing service |

---

## Single Points of Failure

| SPOF | Impact | Mitigation |
|------|--------|------------|
| DigitalOcean droplet | Full app downtime | Second instance + LB |
| PM2 single process | API unavailable on crash | PM2 cluster mode or container orchestration |
| Supabase project | Auth + all data unavailable | PITR; status monitoring |
| eTimeOffice API | Attendance punches stale | Retry + alert; manual fallback |
| Whitebooks GSP | E-invoice generation blocked | Queue + retry; manual IRN entry fallback |
| Windows DSC host | PDF signing unavailable | Dedicated signing service |
| `CORS_ORIGINS` misconfiguration | CSRF-like cross-origin API abuse | Startup validation |

---

## Scalability Bottlenecks

1. **Leave/tour API** — up to 20,000 rows × `select('*')` per request
2. **Billing context** — full PO/invoice reload on any realtime event
3. **Attendance sync** — 14-day lookback, sequential eTime API calls
4. **DSC signing** — 120s blocking, serialized via in-process lock
5. **Bulk user create** — up to 100 sequential Supabase Auth API calls
6. **Dashboard** — 8 realtime channels + 45s polling
7. **Monolith React components** — render cost on large datasets without virtualization

---

## Security Vulnerabilities Summary

| ID | Vulnerability | Severity | Status |
|----|--------------|----------|--------|
| SEC-V1 | RLS `USING (true)` policy drift | Critical | Needs live DB verification |
| SEC-V2 | CORS allow-all when env unset | Critical | Config-dependent |
| SEC-V3 | R2 presign IDOR (fleet/HR-calling) | High | Open |
| SEC-V4 | Software-subscriptions R2 any-session | High | Open |
| SEC-V5 | Activity log forgery | High | Open |
| SEC-V6 | Unauthenticated attendance status | Medium | Open |
| SEC-V7 | Health endpoint info disclosure | Medium | Open |
| SEC-V8 | JWT in localStorage (XSS) | Medium | Inherent SPA risk |
| SEC-V9 | Staging full-access bypass flag | Medium | Config-dependent |
| SEC-V10 | Edge Functions `verify_jwt = false` | Low | Mitigated by in-function auth |

---

## Technical Debt Register

| Item | Impact | Effort |
|------|--------|--------|
| 5k-line page components | Maintainability, performance | Large |
| Dual admin API (Express + Edge) | Security surface, drift | Medium |
| Triple register sync implementation | Correctness, maintenance | Medium |
| 95% JSX unlinted | Quality regressions | Small |
| Mock data in Operations/AMC/AdminOps | User confusion | Small |
| `production_modules_data_fix.sql` landmine | Security catastrophe if run | Small (delete/guard) |
| No TypeScript in business logic | Type safety | Large |
| Legacy `USING (true)` in early migrations | Security if not superseded | Medium (verify) |

---

## Top 10 Issues to Fix First

| Rank | Priority | Issue | Category | Business Impact |
|:----:|:--------:|-------|----------|-----------------|
| 1 | **P0** | Verify live RLS has no `USING (true)` on sensitive tables | Security / Database | Data breach |
| 2 | **P0** | Enforce `CORS_ORIGINS` at production startup | Security | Cross-origin API abuse |
| 3 | **P0** | Wire attendance cron → register mark sync | Reliability | Incorrect payroll/attendance |
| 4 | **P0** | Block unapproved PO invoicing | Data Integrity | GST/compliance violation |
| 5 | **P0** | Integrate error monitoring (Sentry) | Observability | Blind to production failures |
| 6 | **P0** | Add DB migration verification to CI/CD | DevOps | Schema drift |
| 7 | **P1** | Fix R2 presign authorization (IDOR) | Security | Unauthorized file access |
| 8 | **P1** | Tighten `erp_activity_log` RLS | Audit Trails | Audit trail corruption |
| 9 | **P1** | Add leave balance row locking + sufficiency check | Data Integrity | Incorrect leave deductions |
| 10 | **P1** | Add E2E smoke tests for auth + billing + attendance | Testing | Regressions ship undetected |

---

## Prioritized Remediation Roadmap

### Immediate (0–2 weeks) — P0

| # | Action | Owner | Verification |
|---|--------|-------|-------------|
| 1 | Run RLS verification queries on production (see below) | DBA / Backend | Zero `USING (true)` on sensitive tables |
| 2 | Add production startup check: fail if `CORS_ORIGINS` empty | Backend | Server refuses to start without CORS |
| 3 | Call `syncRegisterMarksFromPunches` in attendance cron after punch upsert | Backend | Register marks update without browser open |
| 4 | Add `approvalStatus === 'approved'` filter to `billablePOs` | Frontend | Unapproved POs not invoiceable |
| 5 | Integrate Sentry (or equivalent) on frontend + server | DevOps | Errors appear in dashboard within 5 min |
| 6 | Add migration version check to deploy pipeline | DevOps | CI fails if DB behind code |
| 7 | Authenticate or strip `/api/admin/attendance/status` | Backend | 401 without valid JWT |
| 8 | Delete or quarantine `production_modules_data_fix.sql` | DBA | File cannot be accidentally run |

### Short-term (2–6 weeks) — P1

| # | Action | Owner |
|---|--------|-------|
| 1 | Fix R2 presign ownership checks (fleet, HR-calling, software-subscriptions) | Backend |
| 2 | Tighten `erp_activity_log` INSERT/SELECT policies | DBA |
| 3 | Add `FOR UPDATE` + balance check to leave deduction function | DBA |
| 4 | Implement server-side pagination for leave/tour/invoice APIs | Backend |
| 5 | Add Playwright E2E for login, attendance mark, invoice create | QA |
| 6 | Configure vitest coverage with minimum thresholds | QA |
| 7 | Extend ESLint to `.jsx` files | Frontend |
| 8 | Harden AdminUi Modal/Drawer accessibility | Frontend |
| 9 | Remove schema jargon from user-facing toasts | Frontend |
| 10 | Document Supabase PITR restore runbook + schedule first drill | DevOps |
| 11 | Upgrade Node.js to 20 LTS in CI and production | DevOps |
| 12 | Add uptime monitoring on `/api/health` | DevOps |
| 13 | Disable billing localStorage fallback in production | Frontend |
| 14 | Guard `VITE_STAGING_FULL_ACCESS` from production builds | Frontend |

### Medium-term (6–12 weeks) — P2/P3

| # | Action | Owner |
|---|--------|-------|
| 1 | Containerize API (Docker) + PM2 ecosystem config | DevOps |
| 2 | Redis-backed rate limiting for multi-instance | Backend |
| 3 | Queue DSC signing and attendance sync as background jobs | Backend |
| 4 | Consolidate register sync to single server implementation | Backend |
| 5 | Decompose `CreateInvoice.jsx` and `SiteLedgerApp.jsx` | Frontend |
| 6 | Migrate legacy modules to AdminUi design system | Frontend |
| 7 | Introduce React Query for reference data caching | Frontend |
| 8 | Add structured logging (pino) with request correlation IDs | Backend |
| 9 | Consolidate admin user management to single API surface | Architecture |
| 10 | Implement sandwich leave policy in SQL | DBA |
| 11 | Align payroll attendance merge with daily register | Backend |
| 12 | Add second DO instance + load balancer | DevOps |
| 13 | Gradual TypeScript migration for `src/lib/` and `server/` | Engineering |
| 14 | Remove mock data from Operations/AMC production builds | Frontend |
| 15 | Write comprehensive README with setup/deploy/rollback guide | Docs |

---

## Production Verification Queries

Run in Supabase SQL Editor on production and staging:

```sql
-- 1. Open RLS policies (should return ZERO rows on hardened production)
SELECT schemaname, tablename, policyname, qual, with_check
FROM pg_policies
WHERE (qual::text ILIKE '%true%' OR with_check::text ILIKE '%true%')
  AND schemaname IN ('public', 'billing', 'finance', 'indus_one')
  AND tablename NOT IN ('erp_app_access_config')  -- intentionally open for nav config
ORDER BY tablename;

-- 2. Attendance tables must NOT have erp_auth_* policies
SELECT * FROM pg_policies
WHERE tablename IN ('erp_attendance_punches', 'admin_attendance_register')
  AND policyname LIKE 'erp_auth_%';

-- 3. Activity log policies
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'erp_activity_log';

-- 4. Latest applied migration (compare with repo HEAD)
SELECT version FROM supabase_migrations.schema_migrations
ORDER BY version DESC LIMIT 5;

-- 5. Profiles INSERT protection trigger exists
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass
  AND tgname LIKE '%privilege%';
```

---

## What Could Cause Production Incidents

| Scenario | Likelihood | Impact | Prevention |
|----------|:----------:|:------:|------------|
| RLS policy drift exposes HR/payroll data | Medium | Critical | Verification queries + never run fix scripts |
| Attendance register stale after cron | High | High | Server-side register sync |
| Incorrect leave balance after concurrent approvals | Medium | High | Row locking |
| Invoice on unapproved PO | Medium | Critical | Approval filter |
| Droplet failure | Low | Critical | HA architecture |
| eTime API outage | Medium | Medium | Alerting + manual entry fallback |
| Secret leak via committed `.env` | Low | Critical | CI security-check (already in place) |
| Chunk deploy mismatch | Low | Low | `lazyWithRetry` (already in place) |
| DSC signing blocks all billing ops | Medium | Medium | Queue + timeout isolation |

---

## Positive Findings (What's Working Well)

1. **Layered security model** — client guards + Express middleware + SQL RLS + profile privilege triggers
2. **CI/CD pipeline** — lint, security-check, smoke tests, guarded deploy with health verification
3. **Attendance domain depth** — shared sync rules, DB business validation triggers, punch dedupe, manual mark priority
4. **Staging/production isolation** — separate Supabase projects, env pinning, project mismatch detection
5. **Deploy resilience** — CI-built frontend, chunk retry with cache bust, HTML no-cache meta
6. **Finance atomicity** — replace RPCs prevent partial line loss
7. **Design system maturation** — AdminUi primitives with documented UI philosophy
8. **Test suite growth** — 112 tests covering RBAC, attendance sync, payroll statutory, auth middleware
9. **Security automation** — `scripts/security-check.mjs` blocks secret leaks and auth bypass patterns
10. **Recent migration velocity** — 84 migrations since July audit addressing RLS, performance, leave balance, profile protection

---

## Audit Limitations

This audit is based on **static code analysis** and does not include:

- Live production environment variable values
- Runtime performance metrics (P50/P95/P99 latency)
- Actual Supabase RLS policy state on production database
- Penetration testing or dynamic security scanning
- Dependency CVE scan (recommend `npm audit` + Snyk)
- Load testing results
- User acceptance testing feedback

**Recommended next steps:** Run verification queries on production, execute `npm audit`, perform load test on attendance sync and billing flows, and schedule a penetration test focused on RLS bypass and R2 IDOR.

---

## Document History

| Version | Date | Author | Notes |
|---------|------|--------|-------|
| 1.0 | 2026-09-01 | Automated audit | Complete production-readiness audit; read-only |

---

*This document was generated as part of a read-only production-readiness audit. No code, configuration, or database changes were made.*
