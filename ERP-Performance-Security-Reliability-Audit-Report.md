# ERP Performance + Security + Reliability Audit Report

**Scope:** Static analysis of `server/`, `src/`, `supabase/migrations` (~144), `supabase/functions` (8), shared libs.  
**Mode:** Analysis only — no code, schema, or config changes.  
**Date basis:** Code as of this workspace snapshot (Aug 2026 migrations through `20260820*`).

### Methodology limits (read first)

| What this audit **can** confirm | What it **cannot** invent |
|--------------------------------|---------------------------|
| Authz gaps, IDOR patterns, secret exposure in source | P50/P95/P99 latency, QPS, Edge Function memory MB |
| N+1 / unbounded fetches / sync CPU paths | Seq-scan %, index bloat, pool saturation |
| Trigger chains, SECURITY DEFINER posture | Live `pg_stat_statements` winners |
| Migration lock risk classes | Actual production downtime from past deploys |

**Runtime required for metrics:** Supabase Dashboard → Database → `pg_stat_statements` / `pg_stat_user_tables` (script already exists: `supabase/scripts/database_performance_audit.sql`); Edge Function logs + Deno isolate metrics; Node APM (or access logs) for `/api/*`; Cloudflare R2 + Whitebooks + eTime latency. **No APM (Sentry/Datadog/OpenTelemetry) is present in `package.json`.**

---

## 1. API Performance Audit

**Latency averages / P95 / P99:** `NEEDS RUNTIME METRICS` — not measurable from source.

### Static ranking of likely slowest / heaviest APIs

| API | Module | Root cause | Evidence | Impact | Severity | Recommended fix |
|-----|--------|------------|----------|--------|----------|-----------------|
| `POST /api/billing/dsc/sign-pdf` | Billing | Sync USB DSC + PowerShell CMS, 120s timeout, base64 PDF ≤8MB | `server/index.js`, `server/dscSignPdf.js` | Blocks worker; high CPU/mem | 🔴 Critical (perf) | Queue signing; stream PDF; isolate Windows worker |
| `GET/POST …/dsc/usb-certificates` | Billing | PowerShell cert list 12–30s, serialized queue | `server/dscUsbCertificates.js` | Contends with other DSC ops | 🟠 High | Cache cert list briefly; dedicated process |
| `POST /api/admin/attendance/sync` + cron | Attendance | eTime multi-endpoint fetch, lookback 14d, chunked upserts | `server/attendanceEtime.js` (`ETIME_SYNC_*`, `startAttendanceSyncCron`) | Long jobs; Auth/DB write load | 🟠 High | Background job + lock; don’t run on request path under UI |
| `GET /api/admin/attendance/punches` | Attendance | Same eTime fan-out + optional upsert | `server/index.js` + `attendanceEtime.js` | User-facing latency spikes | 🟠 High | Paginate; async sync status |
| `GET /api/admin/leave-requests` | Leave | `select('*')` paginated to **20 000** × 2 tables | `server/adminLeaveRequestsApi.js` `LEAVE_FETCH_CAP = 20000` | Huge payloads; PostgREST pressure | 🟠 High | Server-side filters, columns, cursor pagination |
| `GET /api/admin/tour-requests` | Tours | Up to 2000 × 2 tables `select('*')` | `server/adminTourRequestsApi.js` | Large payloads | 🟡 Medium | Same as leave |
| `POST /api/admin/bulk-create-users` | Admin | Up to 100 sequential creates; `listUsers` up to 20×200 pages | `adminBulkCreateUserApi.js` / Edge twin | Auth API exhaustion | 🟠 High | Batch Auth Admin; job queue |
| `POST …/e-invoice/generate` | Billing | External Whitebooks + GSTN + QR | `server/index.js` `cfg()` | Tail latency from 3rd party | 🟡 Medium | Timeouts + circuit breaker |
| R2 uploads (3 surfaces) | Docs/Fleet/HR | Multer **25MB** in memory | `server/index.js` | Memory spikes | 🟡 Medium | Stream to R2; lower body limits per route |

### Patterns (CONFIRMED)

- **No classic SQL injection** in Node (Supabase client / REST). Residual: PostgREST filter string in `adminCreateUserApi.findProfileByEmployeeCode` (`ilike.${employeeCode}`) — **LIKELY** filter injection if code contains operators.
- **Per-request `createClient`** across auth middleware + handlers — connection/HTTP concurrency pressure on Supabase (not a local `pg` pool). **CONFIRMED** design risk; pool exhaustion **NEEDS RUNTIME**.
- **Global rate limit** 120/min + e-invoice/DSC 30/min; **no** dedicated limits on bulk/sync/R2. In-memory store → multi-instance bypass **NEEDS RUNTIME**.
- **No Express requestTimeout** for long DSC/sync paths — proxy may kill first (**NEEDS RUNTIME**).

### Frontend → API amplification (CONFIRMED)

- Billing: every `upsertInvoice` reloads **all** POs + invoices + CN + PA (`BillingContext.jsx` ~415–430); realtime on `po_wo`/`invoice`/`invoice_line_item` re-triggers `loadFromDb`.
- Dashboard: realtime × 8 tables + **45s poll** + focus/visibility.
- Leave/tour bells: 30–60s polling **and** realtime.

**Should be cached:** USB cert list, attendance API status, commercial PO lists (scoped), holiday calendars.  
**Should be async:** DSC sign, attendance sync, bulk user create/delete, full billing snapshot rebuild.

---

## 2. API Security Audit

### Confirmed vulnerabilities

| Finding | Class | Evidence | Severity |
|---------|-------|----------|----------|
| **Software-subscriptions R2:** any authenticated session can upload/presign/delete under `software-subscriptions/` | Broken authz / IDOR | Comment: UI super-admin-only; API uses only `requireSessionForSoftwareSubscriptionsR2` (`server/index.js` ~509–527, ~1739+) | **Confirmed vulnerability** — High |
| **HR Calling R2 `presign-get`:** any session can sign **any** key under `hr-calling/` (no owner check; fleet has owner check) | IDOR/BOLA | `server/index.js` ~1971–1983 vs `assertFleetObjectKeyAllowedForUser` ~546–561 | **Confirmed vulnerability** — High |
| **Unauthenticated `/api/admin/attendance/status`** exposes eTime endpoints, timeouts, cron flag | Info disclosure | `server/index.js` ~1206–1221 | **Confirmed vulnerability** — Medium (recon) |
| **CORS `origin: true` when `CORS_ORIGINS` empty** + `credentials: true` | Insecure CORS | `server/index.js` ~331–356 | **Confirmed** if prod env unset; **NEEDS RUNTIME** for prod `.env` |

### High-risk design (not auto-“confirmed exploit”)

| Finding | Evidence | Notes |
|---------|----------|-------|
| JWT `user_metadata` role/modules fallback when profile unreadable | `authMiddleware.js` ~258–271 | Privilege escalation **if** users can set `user_metadata.role` and service_role/profile path fails — treat as **High-risk design** / **Potential** until Auth policies verified |
| Dual admin surfaces: Node `/api/admin/*` **and** Edge `admin-*` both use service_role | `supabase/functions/*`, `server/admin*Api.js` | Larger attack surface; drift risk |
| Edge Functions: CORS `*`, service_role in function, gateway `verify_jwt = false` for 3 functions | `supabase/config.toml`, function sources | Auth is in-function; OK if role checks always run — **verify deploy flags for bulk/delete** |
| Browser can call privileged admin/billing/DSC with user JWT | By design if server checks hold | Safe only with airtight server RBAC |
| `VITE_WHITEBOOKS_*` password/client_secret path | `src/services/eInvoiceApi.js` | **Confirmed vulnerability** only if `VITE_EINVOICE_PROVIDER=whitebooks` in a shipped build; default is `backend` (safer). **High-risk design** + **NEEDS RUNTIME** for deployed env |
| `VITE_STAGING_FULL_ACCESS` elevates all modules on staging project | `src/config/roles.js` ~1019–1024 | **Confirmed** staging bypass if flag set on staging URL |

### Positive controls (CONFIRMED)

- Browser **blocks** service_role in `VITE_SUPABASE_ANON_KEY` (`supabaseConfig.js` `assertBrowserSafeSupabaseKey`).
- Helmet + rate limits on `/api`.
- E-invoice/DSC gated by `requireBillingAccess`.
- Attendance sync requires JWT **and** `ETIME_SYNC_SECRET`.
- Fleet R2 keys scoped to `user.id`.
- Latest `billing.current_user_has_billing_access()` returns false when no matching profile (`20260802120000_…`) — earlier “no profile ⇒ allow” bootstrap appears **fixed**.

### Missing (CONFIRMED gaps)

- No per-route audit log for admin user create/delete, DSC sign, e-invoice, R2 delete.
- No webhook signature layer (no inbound webhooks found).
- Coarse rate limits; bulk/R2/sync not specially limited.

---

## 3. Database / Supabase Performance Audit

**Hottest objects by static write/read amplification (CONFIRMED design load):**

1. `public.admin_attendance_register` — leave apply loops per date; punch sync upserts  
2. `indus_one.admin_leave_requests` / `indus_one.leave_requests` — mirror + status triggers  
3. `billing.invoice` / `invoice_line_item` / `po_wo` — full-table frontend fetches + realtime  
4. `public.profiles` + `auth.users` — ban/employee_code sync triggers  
5. Finance site-ledger tables — frontend `fetchAll` across 11 tables  

**Indexes:** ~254 creates; **`CONCURRENTLY` count = 0** (`grep` empty). Batch: `20260626130000_database_performance_indexes.sql`.  
**Unused / duplicate indexes / seq scans / bloat:** `NEEDS RUNTIME` via `database_performance_audit.sql`.

**RLS cost (LIKELY):** Most policies call SECURITY DEFINER helpers that `SELECT` from `profiles` per row. Hardened with `row_security = off` in helpers (`20260704120000_production_security_hardening.sql`) — better than recursive RLS, still **per-row function cost** under large selects.

**Triggers (highest cascade risk):**

```
LMS leave_requests
  → trg_mirror_lms_leave_to_admin
    → admin_leave_requests status trigger
      → admin_leave_apply_attendance (day loop)
      → admin_leave_apply_balance_deduction
```

Plus: employee_master → profile `is_active` → `auth.users.banned_until`; profiles → `app_users` / employee_code sync.

**Pool pressure:** App uses PostgREST HTTP, not direct `pg`. Exhaustion = Supabase connection / Auth rate limits under bulk + leave inbox + billing fan-out. **NEEDS RUNTIME**.

---

## 4. Migration Audit

| Migration | Operation | Expected load | Lock/downtime risk | Severity | Safer alternative |
|-----------|-----------|---------------|--------------------|----------|-------------------|
| `20260626130000_database_performance_indexes.sql` | Many `CREATE INDEX` (non-CONCURRENT) | High I/O on large tables | Blocking writes while building | 🔴 | `CREATE INDEX CONCURRENTLY` in maintenance window |
| `20260804180000_hr_calling_designation_attachments.sql` | `ALTER COLUMN … TYPE integer USING` | Table rewrite | Access Exclusive | 🟠 | New column + backfill + swap |
| `20260622120000_invoice_prefix_ifspl.sql` | Full UPDATE of invoice/note numbers | Write storm | Row locks | 🟠 | Batched UPDATE |
| `20260810150000_fix_auth_ban_infinity.sql` | UPDATE `auth.users` | Auth table contention | High if many rows | 🟠 | Batched; off-peak |
| `20260610120000_fire_tender_costing_templates.sql` | Backfill templates | Medium | Row locks | 🟡 | Batched |
| `20260810130000_drop_admin_salary_tables.sql` | DROP TABLE/SCHEMA CASCADE | Instant drop | Irreversible data loss if wrong env | 🔴 (ops) | Explicit backup + gated deploy |
| Repeated leave/profile function recreations | `CREATE OR REPLACE` churn | Brief lock on function | Low–med | 🟡 | Consolidate; avoid thrash |

**No CONCURRENTLY anywhere** — all index migrations are production lock risks on large tables.

---

## 5. PostgreSQL Function / RPC Audit

### Ranked by performance impact (static)

| Rank | Function | Why | Security notes |
|------|----------|-----|----------------|
| 1 | `indus_one.admin_leave_apply_attendance` | Per-day loop, punch checks, register UPSERT | SECURITY DEFINER + `search_path` set (**CONFIRMED** hardened path) |
| 2 | `indus_one.mirror_lms_leave_request_to_admin` | Cascades into #1 | DEFINER |
| 3 | `indus_one.admin_leave_apply_balance_deduction` | Balance mutations on approve | DEFINER |
| 4 | `recalculate_all_leave_entitlements_for_year` | Year-wide recompute | Expensive if invoked carelessly |
| 5 | Billing cycle helpers / `trg_invoice_cycle_tracker` | Extra writes on invoice DML | Moderate |
| 6 | HR calling allocate/convert RPCs | Multi-table writes | DEFINER; grant to authenticated — verify callers |
| 7 | Access helpers (`current_user_has_*`, `billing.current_user_has_billing_access`) | Called from RLS constantly | DEFINER + search_path; **performance tax** |

### Security posture

- ~100 DEFINER functions; inspected pattern shows **`SET search_path` present** (good).  
- `admin_save_profile` / similar: **service_role only** in later migrations — good.  
- `get_profile_role` revoked from `authenticated` in hardening migration — good.  
- **Risk:** any DEFINER granted to `authenticated` that mutates attendance/HR without internal auth checks is a bypass surface — leave apply is trigger-driven (OK), but HR convert/allocate RPCs need **runtime/RBAC verification**.

---

## 6. Supabase Edge Function Audit

**Functions:** `login-check`, `access-check`, `admin-create-user`, `admin-bulk-create-users`, `admin-update-profile`, `admin-delete-user`, `admin-bulk-delete-users`, `admin-list-profiles` (+ `_shared`).

| Metric | Status |
|--------|--------|
| Invocation frequency / avg / P95 / P99 duration | **Cannot be confirmed statically** |
| Memory consumption | **Cannot be confirmed statically** |

**Required observability:** Supabase Edge Function logs (wall time, status), platform isolate memory if exposed, Auth Admin API latency, request body sizes for bulk ops.

### Static findings (CONFIRMED)

- All use **service_role** from Deno secrets (expected for admin).  
- CORS `Access-Control-Allow-Origin: *`.  
- **No** explicit AbortSignal/timeouts in handlers.  
- Heaviest CPU/wall-clock **candidates:** `admin-bulk-create-users` / `admin-bulk-delete-users` (≤100 sequential Auth Admin ops + possible `listUsers` pagination) — **LIKELY highest memory** due to response aggregation + Auth payloads, but **MB numbers unknown**.  
- `login-check` / `access-check` on every login → profile provision — high **frequency** candidates.  
- No third-party HTTP (no WhatsApp/email providers in Edge).  
- `verify_jwt = false` only for login-check, admin-update-profile, admin-create-user in `config.toml`; other functions depend on deploy `--no-verify-jwt` practice — **NEEDS RUNTIME** deploy audit.

> **Which Edge Functions consume the most memory and why?**  
> **Cannot be confirmed.** Statically, bulk create/delete are the only functions with large in-memory work (up to 100 user ops). Confirm with Edge runtime metrics / logs under a 100-user bulk call.

---

## 7. Background Jobs / Queues / Webhooks

| Job | Evidence | Risks |
|-----|----------|-------|
| Attendance eTime sync cron | `startAttendanceSyncCron` — default **15 min**, min 60s; overlap lookback 14d | Overlap with manual sync; no distributed lock → **duplicate processing** if multi-instance (**LIKELY**) |
| `pg_cron` `daily-db-usage-check` | `20260810140000_db_usage_tracker.sql` | Low risk; optional if extension missing |
| `hr_calling_auto_expire_offers` | RPC only — **not** scheduled in migrations | Must be called externally or never runs |
| WhatsApp / email workers / queues | **Not found** in repo (only Supabase auth email resend) | N/A |
| Webhooks | **Not found** | N/A |
| Frontend “jobs” | 30–60s polls + realtime | Soft retry storms on flaky networks |

**Idempotency:** Punch upserts / leave mark `ON CONFLICT` help; attendance cron lacks explicit lease/lock — **High-risk design** under horizontal scale.

---

## 8. Frontend Load Audit

### Highest backend load generators (CONFIRMED)

1. **Billing** — `billingApi.fetchInvoices` unbounded `select('*')` + all lines/attachments; `BillingProvider` remounted across many routes; realtime + focus refresh.  
2. **Executive Dashboard** — multi-schema fan-out + realtime + 45s poll.  
3. **Attendance daily / leave inbox** — multi-query month loads + Node leave dump up to 20k.  
4. **Finance Site Ledger** — `SiteLedgerApp.jsx` (~297KB) `fetchAll` × 11 tables.  
5. **Marketing + Maintenance clones** — near-duplicate query trees.  
6. **HR Calling** — many `select('*')` + RPCs.  
7. **VehicleTrips** — nested select without `.range()`.

### Other

- Missing AbortController on most Supabase fetches (race on filter change).  
- Single app-wide `RouteErrorBoundary` — poor fault isolation (billing has local boundary).  
- Heavy deps: jspdf, pdf-lib, exceljs, html2canvas, recharts.  
- Direct Supabase from browser is intentional; security depends on RLS.

---

## 9. Module-Level Fault Isolation

| Module | APIs / EF | Core tables | Triggers / shared | Blast radius if slow/compromised |
|--------|-----------|-------------|-------------------|----------------------------------|
| **Auth** | Edge login/access-check; GoTrue | `auth.users`, `profiles`, `app_users` | signup + ban sync | **Whole ERP** login/RBAC |
| **Admin / Users** | Node + Edge admin-* | `profiles` | employee_code sync | Privilege escalation → all modules |
| **Attendance** | `/api/admin/attendance/*`, cron | punches, `admin_attendance_register` | leave apply writes register | Leave marks wrong; payroll downstream |
| **Leave / LMS** | leave APIs, triggers | `leave_requests`, `admin_leave_requests` | **Cross-writes attendance + balances** | Attendance + payroll integrity |
| **Tours** | tour APIs | tour tables | register marks helper | Attendance display |
| **Billing** | Node e-invoice/DSC; PostgREST | `billing.*` | cycle tracker on invoice | Finance reports; GST compliance; shared R2 bucket |
| **HR Calling** | RPCs + R2 | calling/IOM tables | convert → employee_master | HR master + leave entitlements chain |
| **Payroll / Salary** | PostgREST | salary tables | updated_at mostly | Isolated better after schema rewires |
| **Finance** | PostgREST | finance schema | site access helpers | Mostly isolated; large read load |
| **Fleet / Fire Tender / Marketing** | R2 + PostgREST | module tables | few cross triggers | Mostly isolated; shared Supabase quota |
| **Notifications** | realtime + bells | various | — | Amplifies DB load globally |
| **Documents / R2** | shared bucket | object keys | — | **Cross-module:** weak R2 authz affects HR + software-sub |

**Coupling hotspots:** Leave↔Attendance↔Employee Master↔Auth ban; Billing↔Commercial PO; Profiles as global RBAC source; **one Supabase project + one Node process** as shared fate.

**Isolation to introduce:** (1) R2 authz per module, (2) async worker for DSC/etime, (3) stop leave triggers from holding long transactions on huge date ranges, (4) route-level error boundaries, (5) billing read models / pagination instead of full snapshot.

---

## 10. Resource Consumption Ranking

### 🔴 Critical
1. Software-subscriptions + HR Calling R2 authz gaps  
2. Billing full-snapshot + realtime refresh storm  
3. Leave→attendance DEFINER trigger chain under bulk approvals  
4. Non-CONCURRENT index migrations on large tables  
5. DSC sign on request path (worker stall)

### 🟠 High
6. Attendance sync/punches + optional multi-instance cron overlap  
7. Leave inbox 20k `select('*')`  
8. Bulk user Edge/Node (100 sequential Auth Admin)  
9. CORS open if `CORS_ORIGINS` unset  
10. JWT metadata auth fallback  
11. Whitebooks `VITE_*` path if enabled in prod build  
12. Unauthenticated attendance status disclosure  

### 🟡 Medium
13. Per-request Supabase clients  
14. Dashboard/bell polling + realtime duplication  
15. Site Ledger / VehicleTrips / manpower unbounded lists  
16. RLS helper cost on large selects  
17. Edge CORS `*` + verify_jwt deploy consistency  
18. Missing audit logs / APM  

### 🟢 Low
19. Health endpoint service_role diagnosis fields  
20. Marketing/maintenance page duplication (maintainability + load)  
21. AbortController gaps  

---

## 11. Evidence labels (selected)

| Finding | Label |
|---------|-------|
| R2 software-sub session-only; HR presign no owner | **CONFIRMED** vulnerability |
| Attendance status unauthenticated | **CONFIRMED** |
| CORS allow-all when env empty | **CONFIRMED** in code; prod config **NEEDS RUNTIME** |
| `fetchInvoices` unbounded | **CONFIRMED** |
| Leave apply day-loop | **CONFIRMED** |
| API P95/P99, Edge memory MB, seq scans | **NEEDS RUNTIME METRICS** |
| Multi-instance cron duplicate sync | **LIKELY** |
| JWT metadata privilege escalation | **Potential vulnerability requiring runtime verification** |
| Whitebooks secrets in bundle | **Potential / env-dependent**; **CONFIRMED** code path exists |

---

## 12. Final Architecture Assessment

### A. Risk scores (static judgment)

| Dimension | Score /10 | Rationale |
|-----------|-----------|-----------|
| Security | **5** | RLS + server RBAC exist; R2 IDOR, optional CORS/secrets paths, metadata fallback hurt score |
| Performance | **4** | Unbounded billing/leave fetches; sync DSC/etime; trigger loops |
| Scalability | **4** | Single Node + shared Supabase; in-memory rate limit; no job queue |
| Reliability | **5** | Trigger coupling; dual admin paths; weak fault isolation |
| Fault Isolation | **3** | Shared DB/triggers/R2/Auth; one error boundary |
| Observability | **2** | Audit SQL script exists; no APM/tracing in app |
| Database Design | **6** | Schemas/modules/indexes/hardening present; DEFINER+triggers complex |

### B. Top 20 problems (Impact × Likelihood × Exploitability)

1. Software-subscriptions R2 any-user access  
2. HR Calling R2 cross-user download  
3. Billing unbounded load + realtime refresh amplification  
4. Leave approval → attendance register write amplification  
5. DSC PDF sign blocking API workers  
6. Attendance sync load / possible duplicate cron  
7. Leave API 20k row dumps  
8. Bulk user Auth Admin storms (Node + Edge)  
9. Open CORS if misconfigured  
10. JWT metadata authorization fallback  
11. Non-CONCURRENT production indexes  
12. Whitebooks credentials via Vite if provider=whitebooks  
13. Unauthenticated attendance status recon  
14. Dashboard poll+realtime storms  
15. Site Ledger full multi-table load  
16. Shared R2 bucket without uniform authz model  
17. Dual admin APIs (drift / double surface)  
18. No distributed lock / idempotency for sync jobs  
19. Missing APM → blind incidents  
20. Single global React error boundary  

### C. Immediate fixes (high ROI, low risk)

1. Tighten R2: role checks for software-sub; owner (or HR role) checks for `hr-calling` like fleet.  
2. Require auth on `/api/admin/attendance/status` (or strip endpoints).  
3. Enforce non-empty `CORS_ORIGINS` in production boot.  
4. Cap/column-project leave inbox API; never return 20k `*`.  
5. Paginate `fetchInvoices` / CN / PA; stop full reload on every upsert (invalidate range only).  
6. Disable JWT metadata role fallback in production, or ignore role claims from `user_metadata`.  
7. Confirm prod `VITE_EINVOICE_PROVIDER=backend` only.  
8. Run `database_performance_audit.sql` once; enable `pg_stat_statements`.

### D. Medium-term

- Job queue for DSC, eTime sync, bulk users.  
- Read models / materialized summaries for billing & attendance grids.  
- Soften leave trigger work (set-based apply; async register update).  
- Reuse Supabase clients; shared rate-limit store.  
- Per-module error boundaries; kill duplicate marketing/maintenance query clones.  
- Structured audit log for admin/billing/HR mutations.  
- Future indexes via `CONCURRENTLY` only.

### E. Long-term architecture

**Remain a Modular Monolith** on one Supabase project for now.

**Extract only where blast radius is proven:**

| Candidate | Why extract | When |
|-----------|-------------|------|
| **DSC / Windows signing worker** | OS-bound, long CPU, stalls API | Soon |
| **Attendance eTime sync worker** | External IO + write storms | Soon |
| **Billing e-invoice proxy** | Third-party secrets + rate limits | If Whitebooks becomes hot path |
| Full microservices for Leave/HR/Finance | **Not recommended yet** — coupling is DB triggers/RLS, not deploy size; splitting without removing shared tables worsens consistency |

Microservices without splitting the leave↔attendance data model would **increase** failure modes. Prefer **modular monolith + async workers + stricter module authz** until metrics show a single module saturating compute independently.

---

### What to run next (still analysis-only)

1. Supabase SQL Editor → `supabase/scripts/database_performance_audit.sql`  
2. Edge Function invocation logs for bulk vs login-check  
3. Access logs / timing for `/api/billing/dsc/*`, `/api/admin/attendance/*`, leave inbox  
4. Verify production env: `CORS_ORIGINS`, `VITE_EINVOICE_PROVIDER`, R2 key patterns  
