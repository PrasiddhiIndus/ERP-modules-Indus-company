# ERP Regression & Failure-Isolation Test Report

**Product:** INDUS OS (ERP)  
**Environment:** Local Vite + API (`http://localhost:5173`, API `:8787`)  
**Date:** 16 September 2026  
**Tester account:** `amitp.ifspl@gmail.com` (read-only session)  
**Method:** Read-only browser regression + static architecture review + safe runtime fault injection (browser network blocking / fetch stubs). **No code, schema, config, or data writes.**

---

## 1. Executive summary

**Verdict: Module data/API failures do not take down the whole ERP shell; uncaught React render crashes can.**

| Area | Result |
|------|--------|
| Major module navigation (read-only) | **PASS** — shell remained available across tested modules |
| API / Node `/api` failures | **PASS (contained)** — shell stayed up; failed calls observed on shared admin leave/tour endpoints |
| Supabase REST unavailability | **PASS (degraded, contained)** — modules showed empty/zero data; sidebar/navigation remained |
| Unauthorized deep links | **PASS (contained)** — Access denied UI with recovery; not a white-screen crash |
| React render-crash isolation | **FAIL (architectural)** — single app-level `RouteErrorBoundary`; only Billing has a module-level boundary |
| Cascading “entire ERP unavailable” from one module API | **Not observed** in runtime tests |
| Cascading “entire ERP unavailable” from one module render throw | **Likely** (code evidence) — would replace all routes with full-screen error |

**Overall resilience rating:** **Moderate**  
Strong code-splitting and generally local API error handling; weak crash isolation between modules; several global single points of failure (Auth, Layout, Supabase client).

---

## 2. Modules / features tested

Tested as **read-only** load + navigation (no create/update/delete, no outbound mail/WhatsApp/payments).

| Module / area | Route(s) exercised | Result |
|---------------|-------------------|--------|
| Dashboard / Command centre | `/app/dashboard` | PASS — shell + P&L tiles |
| HR | `/app/hr/dashboard` | PASS |
| Admin Ops | `/app/admin/dashboard` | PASS |
| Commercial — Manpower / Training | `/app/commercial/manpower-training` | PASS |
| Commercial — R&M / AMC / IEV | `/app/commercial/rm-mm-amc-iev` | PASS |
| Marketing | `/app/marketing` | PASS |
| Maintenance | `/app/maintenance` | PASS |
| Billing | `/app/billing`, `/app/billing/tracking` | PASS |
| Operations | `/app/operations` | PASS (UI notes preview/mock ops data) |
| Projects — PO | `/app/projects/po` | PASS |
| Procurement | `/app/procurement` | PASS (placeholder “under development”) |
| AMC Management | `/app/amc` | PASS |
| Finance / Accounts | `/app/accounts-finance` → site ledger | PASS |
| Fire Tender | `/app/fire-tender` | PASS |
| CRM Outreach | `/app/crm-outreach` | PASS |
| Software subscriptions | `/app/software-subscriptions-reminders` | PASS |
| All Employees | `/app/all-employees` | PASS |
| User Management | `/app/user-management` | PASS |
| API Health | `/app/api-health` | PASS |
| Settings | `/app/settings` | PASS |
| Indus LMS | `/app/indus-lms-trainings` | PASS (earlier crawl) |
| Fleet vehicles | `/app/fire-tender-vehicle-management` | PASS (earlier crawl) |
| Store / Gate | `/app/store-inventory`, `/app/gate-pass` | PASS (earlier crawl) |
| Salary Admin (restricted) | `/app/admin/salary-admin/dashboard` | PASS* — Access denied (expected for this user) |
| Compliance (restricted) | `/app/compliance/dashboard`, `/app/ifsp-employee-compliance` | PASS* — denied / redirected (expected) |

\*Authorization containment, not feature functional pass.

**Also covered in architecture review (not every sub-tab clicked):** HR payroll/salary trees, calling master, site attendance, marketing/maintenance sub-routes, AMC/Finance tab shells.

---

## 3. Test scenarios performed

### A. Baseline regression (read-only)

1. Sign in with provided credentials.
2. Confirm auth service reachable on login screen.
3. Crawl ~49 entry routes via SPA navigation; re-verify 16 major modules via reliable route transitions.
4. Confirm sidebar / Sign out / module content for each.

### B. Failure isolation (non-destructive)

1. **Node `/api` fault injection:** temporary `window.fetch` stub returning HTTP 503 for `/api/*` (auth endpoints left alone).
2. Navigate Admin / Billing / CRM / Software subscriptions while stub active.
3. **Supabase REST fault injection:** CDP `Network.setBlockedURLs` for `…supabase.co/rest|functions|storage/*` (Auth host not fully blocked to avoid forced logout).
4. Refresh Admin; open Marketing / All Employees / Dashboard; observe KPIs and shell.
5. Clear blocked URLs; confirm modules usable again.
6. Open restricted Salary Admin route → Access denied → **Go to Home** recovery.

### C. Static / code isolation analysis

1. Provider tree and `RouteErrorBoundary` placement (`src/App.jsx`).
2. Module error boundaries (`BillingErrorBoundary` only).
3. Shared clients: `src/lib/supabase.js`, `ProtectedRoute`, `Layout`.
4. External integrations (Graph mail, R2, e-invoice, eTimeOffice).

**Not performed (policy):** killing API process, DB writes, sending campaigns, generating invoices, schema/config changes, injecting production code faults.

---

## 4. Pass / Fail matrix

| ID | Scenario | Status | Severity if fail |
|----|----------|--------|------------------|
| R1 | Login + session restore | **PASS** | Critical |
| R2 | Shell visible on Dashboard | **PASS** | Critical |
| R3 | Cross-module navigation without global crash | **PASS** | Critical |
| R4 | Restricted module does not white-screen app | **PASS** | High |
| R5 | Recovery from Access denied via Go to Home | **PASS** | High |
| F1 | `/api` 503 does not crash shell | **PASS** | Critical |
| F2 | Supabase REST block degrades data, keeps shell | **PASS** | Critical |
| F3 | Failed module request leaves unrelated modules usable | **PASS** | Critical |
| F4 | Per-module React error boundary coverage | **FAIL** | High |
| F5 | Providers outside error boundary (Auth/Access) | **FAIL** | High |
| F6 | Access denied preserves full sidebar navigation | **FAIL** | Medium |
| F7 | Operations marked as preview/mock data | **INFO** | Low |

---

## 5. Critical findings

### CF-1 — Uncaught render error in any route can blank the entire ERP UI

- **Severity:** **High** (Critical if frequent crashes occur in production)
- **Status:** Architectural **FAIL** (not observed live; high confidence from code)
- **Evidence:** `RouteErrorBoundary` wraps *all* `Routes` (including `Layout` + every module). On error it renders a full-screen “Something went wrong” and removes navigation.
- **Affected:** All modules
- **Expected:** Failed module panel shows local fallback; shell/nav remain.
- **Actual (design):** One child throw → global error screen.
- **Exception:** Billing wraps tab panels in `BillingErrorBoundary` (local fallback).

### CF-2 — Auth / access providers sit outside the route error boundary

- **Severity:** **High**
- **Evidence:** Tree order in `App.jsx`: `ConnectionGuard` → `AuthProvider` → `AppAccessConfigProvider` → `AuditConsoleProvider` → `Router` → `RouteErrorBoundary`.
- **Impact:** Throw in auth/access/audit provider → likely white screen with **no** recovery UI from `RouteErrorBoundary`.
- **Affected:** Entire application boot path.

### CF-3 — Single Supabase client is a global availability dependency

- **Severity:** **High** (infrastructure SPOF; runtime degradation was contained)
- **Evidence:** Ubiquitous `src/lib/supabase.js`; custom `fetch` bound at module init (`const baseFetch = fetch`).
- **Runtime:** Blocking REST URLs made Marketing KPIs go to **0** and All Employees counts to **0**, but **sidebar remained**.
- **Note:** Full Auth outage would block `/app` via `ProtectedRoute` (global gate) — not tested destructively.

---

## 6. Cascading failure scenarios

| Scenario | Cascades to whole ERP? | Observed / evidence |
|----------|------------------------|---------------------|
| Module REST query fails | **No** | Marketing/Admin stayed mounted; empty/zero UI |
| Shared `/api/admin/leave-requests` or tour APIs fail | **No** | Shell OK; bells/admin widgets may degrade |
| Node API (`:8787`) partial failure | **No** for shell; **Yes** for R2 / e-invoice / eTimeOffice / CRM mail features | Code map + `/api` stub |
| One module React render throw | **Yes** (UI) | Single `RouteErrorBoundary` |
| Auth/session failure | **Yes** (access to `/app`) | `ProtectedRoute` full-screen loaders / redirect to login |
| Access denied deep link | **Partial** | Full shell replaced by Access denied card until Go to Home |
| Chunk load / stale deploy | **Mitigated** | `lazyWithRetry` + boundary auto-refresh |

**Answer to primary question:**  
**Failure or unavailability of one module’s data/API does not make the entire ERP application unavailable.**  
**An unhandled React exception in one module (or in shared Layout chrome) can make the entire UI unavailable until retry/reload.**

---

## 7. Single points of failure (SPOFs)

| SPOF | Type | Impact |
|------|------|--------|
| Supabase project (Auth + DB + Edge) | Infra | Login + almost all data |
| `AuthProvider` / `ProtectedRoute` | Frontend | Blocks all `/app` routes |
| `Layout.jsx` | Frontend | Shared shell for every protected page |
| One `RouteErrorBoundary` | Frontend | Any route crash → global error UI |
| Express API on `:8787` | Infra | File/R2, e-invoice, attendance sync, CRM mail |
| Microsoft Graph mail | Third-party | CRM outreach send only |
| Cloudflare R2 | Third-party | Uploads (fleet, subscriptions, joining docs, etc.) |
| GST e-invoice service | Third-party | Billing e-invoice flows |
| eTimeOffice | Third-party | Attendance punch sync |

---

## 8. Issue details (with repro)

### Issue I-1 — Global route error boundary (no per-module isolation)

| Field | Detail |
|-------|--------|
| Severity | **High** |
| Status | Fail (architecture) |
| Affected | All modules except Billing tab panels |
| Root cause | `src/components/RouteErrorBoundary.jsx` wraps entire router tree in `src/App.jsx` |
| Expected | Module crash contained; nav remains |
| Actual | Full-screen error replaces app chrome |
| Repro | (Code-level) Throw during render of any page under `/app/*` outside Billing’s inner boundary |
| Console | Would log `Route render failed:` |

### Issue I-2 — Access denied replaces entire shell

| Field | Detail |
|-------|--------|
| Severity | **Medium** |
| Status | Fail vs ideal isolation / UX resilience |
| Affected | Unauthorized deep links (e.g. Salary Admin for this user) |
| Root cause | `Layout.jsx` early-returns Access denied **instead of** rendering sidebar + denied outlet |
| Expected | Keep nav; show denied in content pane |
| Actual | Only “Go to Home” / “Sign out” card |
| Repro | 1) Login 2) Open `/app/admin/salary-admin/dashboard` 3) Observe full-page Access denied 4) Click Go to Home → recovers |
| Evidence | Screenshot session; URL showed denied state then recovered to an allowed landing route |

### Issue I-3 — Shared layout API calls fail independently but are cross-cutting

| Field | Detail |
|-------|--------|
| Severity | **Low–Medium** |
| Status | Pass (contained) with observation |
| Affected | Shell widgets (leave/tour related `/api/admin/*`) while on any page |
| Evidence | Under `/api` 503 stub, failed requests included `/api/admin/leave-requests`, `/api/admin/tour-requests` while Admin/Billing still rendered |
| Expected | Local toast/empty state |
| Actual | No global crash observed |

### Issue I-4 — Supabase client uses init-time `fetch` binding

| Field | Detail |
|-------|--------|
| Severity | **Low** (testability / resilience tooling) |
| Status | Info |
| Root cause | `const baseFetch = fetch` in `src/lib/supabase.js` |
| Impact | Late overrides of `window.fetch` do not affect Supabase; network blocking required for REST fault tests |

### Issue I-5 — Procurement / Operations maturity

| Field | Detail |
|-------|--------|
| Severity | **Low** |
| Status | Info |
| Procurement | “under development” placeholder — shell OK |
| Operations | Banner: UI preview / mock operations records |

---

## 9. Console / network observations

| Observation | Notes |
|-------------|-------|
| Login auth health | “Auth service reachable” (~166–415 ms) |
| Uncaught window errors during healthy crawl | None retained after navigations (hooks reset on full loads) |
| Simulated `/api` failures | `503` on admin leave/tour endpoints; UI remained |
| Simulated Supabase REST block | Marketing KPIs → 0; All Employees → 0; shell OK |
| API Health UI | Live monitoring page loaded; Supabase Realtime quota early-warning visible |

No production emails, WhatsApp, payments, or data mutations were triggered.

---

## 10. Screenshots / log references

Saved under `docs/test-reports/`:

| File | Description |
|------|-------------|
| `01-dashboard-shell.png` | Command centre with shell chrome |
| `02-module-view-example.png` | Module content with shell (subscriptions view from session) |
| `03-api-health.png` | API Health & Status (Live) |

Architecture references:

- `src/App.jsx` — provider + boundary tree  
- `src/components/RouteErrorBoundary.jsx`  
- `src/pages/billing/Billing.jsx` — `BillingErrorBoundary`  
- `src/contexts/Layout.jsx` — Access denied early return  
- `src/components/ProtectedRoute.jsx` — global `/app` gate  
- `src/lib/supabase.js` — shared client / fetch  

---

## 11. Overall ERP resilience assessment

| Dimension | Score | Notes |
|-----------|-------|-------|
| Availability of shell under module API failure | **Good** | Confirmed in browser |
| Isolation of data errors | **Good** | Local empty/zero/error patterns |
| Isolation of React crashes | **Poor** | One boundary for all routes |
| Auth resilience UX | **Fair** | Full-screen loaders; ConnectionGuard does not block render |
| External integration isolation | **Good** | Mail/R2/e-invoice/eTimeOffice are feature-scoped |
| Recovery after denied route | **Good** | Go to Home restores allowed module |
| Code-splitting / chunk recovery | **Good** | `lazyWithRetry` + Suspense |

**Bottom line:** The ERP is **resilient to module-level backend/data unavailability** (users can keep using other modules). It is **not fully resilient to module-level frontend exceptions**, which can still present as “ERP is down” until reload/retry.

---

## 12. Recommended fixes (do not implement in this exercise)

1. **Add per-module (or per-`Outlet`) error boundaries** inside `Layout`, modeled on `BillingErrorBoundary`, so nav/shell survive page crashes.
2. **Keep Access denied inside the shell** (sidebar + content), instead of replacing the entire `Layout` return.
3. **Wrap provider children** so Auth/AppAccess failures show a dedicated recovery screen rather than a blank root.
4. **Continue localizing API errors** (toasts/inline banners); avoid throws from render paths when queries fail.
5. **Treat Supabase Auth outage as the only true global app outage** and document/runbook it separately from module REST failures.
6. **Expand Billing-style boundaries** to Operations, AMC, Finance, Marketing, Maintenance, Admin hubs.
7. Optionally add a small “module health” badge using existing API Health patterns for operator visibility.

---

## 13. Test constraints & integrity statement

- No database rows created/updated/deleted.  
- No application source, env, or migration changes.  
- No real outbound notifications or payments.  
- Faults were simulated only in the browser session (fetch stub / URL block) and cleared afterward.  
- Credentials were used solely for authenticated read-only exploration.

---

## 14. Sign-off

| Item | Value |
|------|--------|
| Report file | `docs/test-reports/ERP-REGRESSION-FAILURE-ISOLATION-REPORT.md` |
| Primary question answered | One module API failure ≠ entire ERP down; one unhandled UI crash can blank the app |
| Follow-up | Implement recommendations only when explicitly requested |

**Report generated:** 16 September 2026  
