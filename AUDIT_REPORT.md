# INDUS ERP — Production Readiness Audit

**Audit date:** 2026-07-04 (revised)  
**Scope:** ~634 files — React 18 + Vite frontend, Express Node API (`server/index.js`, `server/authMiddleware.js`), Supabase (PostgreSQL, Auth, Edge Functions, 89 migrations + `all_migrations.sql` baseline).  
**Verdict:** **Not production-ready.** Recent hardening (Helmet, rate limits, auth middleware, `20260704120000_production_security_hardening.sql`, CI security-check) improves the posture, but committed secrets, unapplied/partial RLS fixes, HR correctness gaps, and frontend data-integrity bugs remain blockers.

---

## Executive Scores

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| **Overall project health** | **44 / 100** | Broad module coverage + recent security sprint; HR/billing correctness and partial mock data still fail production bar |
| **Security** | **42 / 100** | Auth middleware + hardening migration help; live secrets in git, profile INSERT escalation, R2 any-session access, unhardened tables if migration not applied |
| **Performance** | **44 / 100** | Unbounded `select('*')`, monolithic components, client-only pagination unchanged |
| **Maintainability** | **43 / 100** | CI lint/security-check added; zero unit tests; 4,800-line components; split migration baseline |
| **Scalability** | **35 / 100** | Full-table loads, in-memory debug maps, free-tier Render plan |
| **Production readiness** | **40 / 100** | CI lint + `security-check` in deploy workflows; secrets in git; no monitoring/error tracking; hardening migration requires manual SQL Editor apply |

---

## Production Blockers (Deploy = No)

1. **Rotate and remove all committed secrets** — `.env.server.example` lines 4–46 still contain live Whitebooks credentials, eTimeOffice password, R2 keys, and Supabase `service_role` JWT. Rotate immediately if ever pushed.
2. **Verify `20260704120000_production_security_hardening.sql` is applied** on production DB — file header says run manually in SQL Editor; without it HR payroll, AMC, attendance, billing bootstrap bypass remain open.
3. **Fix profile INSERT privilege escalation** — `guard_profiles_self_update` trigger (`20260704120000:90–116`) blocks self-UPDATE only; `"Users can insert own profile"` policy (`20260609180000:177–179`) still allows arbitrary `role`/`allowed_modules` on INSERT.
4. **Harden remaining permissive RLS tables** not covered by hardening migration: `erp_attendance_punches` (`20260512110000:34–53`), `projects.*` (`20260527120000_projects_enquiry_master.sql:94–107`), marketing legacy tables in `all_migrations.sql`, fleet no-profile bootstrap (`20260603120000:11–23`).
5. **Add role checks to software-subscription R2 routes** — `requireSessionForSoftwareSubscriptionsR2` (`server/index.js:256–288`) accepts any valid JWT; no super-admin/module check despite UI being admin-only.
6. **Set `CORS_ORIGINS` explicitly in production** — default `origin: true` when unset (`server/index.js:134–152`) allows any origin with credentials.
7. **Block unapproved PO invoicing** — `CreateInvoice.jsx:872–876` includes all non-supplementary POs with no `approvalStatus` filter; `AddOnInvoices.jsx` correctly requires approved.
8. **Remove or disable billing localStorage fallback in production** — `BillingContext.jsx:307–312`, `billingStore.js:46–80` seeds fake POs when DB unavailable.
9. **Fix HR leave/payroll correctness** — sandwich leave absent, balance not enforced at approval, payroll path undercounts paid days (see §8).
10. **Wire or hide mock modules** — `PayrollApproval.jsx` (mock), `AttendanceIntegration.jsx` (mock), Operations (mock), AMC mock merge (`amcApi.js`).

---

## Prioritized Roadmap (Business Impact → Effort)

| Priority | Item | Severity | Effort | Business Impact |
|----------|------|----------|--------|-----------------|
| 1 | Rotate secrets; redact `.env.server.example`; scrub git history | Critical | Medium | Prevents total compromise |
| 2 | Apply + verify `20260704120000_production_security_hardening.sql` on prod/staging | Critical | Small | Closes HR/AMC/attendance/billing RLS holes |
| 3 | Add INSERT guard on `profiles` (restrict role/modules or disallow client INSERT) | Critical | Small | Stops privilege escalation |
| 4 | Role-check R2 software-subscription routes | Critical | Small | Stops any-user file access |
| 5 | Block `CreateInvoice` for unapproved POs | Critical | Small | GST/compliance integrity |
| 6 | Disable billing localStorage fallback in prod | Critical | Small | Prevents phantom invoices |
| 7 | Harden `erp_attendance_punches`, projects, marketing RLS | Critical | Medium | Closes remaining data exposure |
| 8 | Enforce leave balance at approval + fix `admin_leave_working_dates` | High | Medium | Correct leave deductions |
| 9 | Align payroll attendance merge with daily register UI | High | Medium | Correct payslips |
| 10 | Server-side pagination for invoices/POs/employee master | High | Medium | Usable at scale |
| 11 | Enforce finance permissions in `SiteLedgerApp.jsx` | High | Medium | Finance data integrity |
| 12 | Remove AMC/Operations mock data from production builds | High | Small | Prevents false operational decisions |
| 13 | Fix PF employer calculation | Medium | Small | Statutory compliance |
| 14 | Split `CreateInvoice.jsx` / `SiteLedgerApp.jsx` | Medium | Large | Maintainability |

---

## Quick Wins (High ROI, Small Effort)

1. **Redact `.env.server.example`** — replace all values with `YOUR_*_HERE` placeholders.
2. **Set `CORS_ORIGINS`** in Render/production env to your frontend origin only.
3. **Add `approvalStatus === 'approved'` filter** to `billablePOs` in `CreateInvoice.jsx:872–876`.
4. **Fix `validateCoMark` bug** — pass `oldMark` not `value` as `dayMarkOnDate` (`EmployeeAttendanceDailyPage.jsx:603`).
5. **Revoke `GRANT SELECT ON indus_one TO anon`** if hardening migration not yet run.
6. **Show persistent mock banner** on Operations/AMC until real data wired.
7. **Fix `Commercial.jsx` path parsing** for `/manpower-training/po-entry` tab state (`Commercial.jsx:13–18`).

---

# Detailed Findings by Category

---

## 1. Functional Bugs

### Critical

| Issue | Location | Why / Impact | Fix | Effort |
|-------|----------|--------------|-----|--------|
| **Sandwich leave not implemented** | `indus_one.admin_leave_working_dates` in `20260605100000_admin_leave_workflow.sql:188–198` — `generate_series` | Counts Sundays/WO/NH as leave days | Exclude WO/NH/PH; optional sandwich policy function | Large |
| **Leave approval without balance enforcement** | `admin_leave_apply_balance_deduction` in `20260610170000:100–127` | Silent skip if no balance row; clamps to 0 instead of rejecting | Reject approve when insufficient balance | Medium |
| **Invoices on unapproved POs** | `CreateInvoice.jsx:872–876` — no approval filter | Draft/pending POs can receive tax invoices | Match `AddOnInvoices.jsx` approved-only filter | Small |
| **Billing localStorage fake data** | `BillingContext.jsx:307–312`, `billingStore.js:46–80` | Phantom POs/invoices when DB down | Hard-disable fallback in prod | Small |
| **Profile INSERT escalation** | `20260609180000:177–179` + no INSERT trigger | User inserts own row with `role=super_admin` | INSERT trigger or column restriction | Small |
| **Payroll path skips leave overlay** | `attendanceDaily.js` `fetchMonthlyRegisterPayrollTotals:2056–2100` vs daily page merge | Payslip days ≠ HR register | Same merge pipeline as daily page | Medium |
| **Payroll WO/NH/PH excluded from paid days** | `registerPresentDayCredit` in `attendanceDaily.js:168–178` | Systematic underpayment for monthly staff | Policy-driven paid-day definition | Medium |

### High

| Issue | Location | Impact | Effort |
|-------|----------|--------|--------|
| `validateCoMark` passes wrong mark | `EmployeeAttendanceDailyPage.jsx:602–605` | CO allowed on WO/NH days | Small |
| Leave limits warn-only | `EmployeeAttendanceDailyPage.jsx:608–659` | Annual limits bypassed | Medium |
| Punch sync overwrites tour marks | `attendanceRegisterSync.mjs:82–104` | Tour approval lost | Small |
| SPLA/SPLB/SBEL quota mismatch | `leaveManagement.js:10–24` vs `attendanceLeaveLimits.js:14–22` | Year-end ≠ daily alerts | Medium |
| Payroll approval is mock | `PayrollApproval.jsx:9–21` | False approval confidence | Large |
| PF employer double-count | `statutory.js:19–21` | Wrong employer cost | Small |
| Attendance integration mock | `AttendanceIntegration.jsx:5–56` | HR thinks sync works | Medium |
| AMC merges mock data on empty DB | `amcApi.js` + `mockAmcData.js` | Fake contracts shown as real | Small |
| Operations entire module mock | `OperationsContext.jsx:22–27` | False operational KPIs | Medium |
| Finance permissions not enforced | `SiteLedgerApp.jsx` ignores `permissions.js` | Any finance user edits all | Medium |
| LMS mirror bypasses JS approver check | `mirror_lms_leave_request_to_admin` in `20260610170000` | Approve without hierarchy | Medium |
| Commercial tab path parsing broken | `Commercial.jsx:13–18` for `/manpower-training/*` routes | Wrong tab state | Small |

### Medium

| Issue | Location |
|-------|----------|
| Single-step leave approval (L1 OR L2) | `adminLeaveRequests.js` `resolveLeaveApprover:70–102` |
| Reject/cancel without approver check | `adminLeaveRequests.js` `applyLeaveDecision:394–398` |
| Inbox not scoped to L1/L2 reportees | `EmployeeLeaveInboxPage.jsx` |
| OT column always 0 | `attendanceDaily.js` `computeEmployeeRegisterSummary` |
| `finalizePayrollRun` no status guards | `payrollApi.js` |
| CL carry-forward ignored on save | `leaveManagement.js` `upsertLeaveCarryForwardRules:56–70` |
| Marketing unbounded fetch + no client auth | All `src/pages/marketing/*` |

---

## 2. UI/UX Review

### High

| Issue | File | Recommendation |
|-------|------|----------------|
| Legacy users get broad module nav | `roles.js:516–520` | Pending-access screen until profile loads |
| Billing vertical filter empty state | `BillingContext.jsx:224–254` | Default vertical or onboarding prompt |
| `alert()` for errors | `FireTender.jsx`, `POEntry.jsx` | Toast/banner pattern |
| Register role dropdown misleading | `Register.jsx` (dev-only route gated by `App.jsx:284`) | Remove Admin options or honor selection |
| Mock data indistinguishable from real | AMC, Operations, Dashboard | Persistent banners / hide in prod |
| Access denied exposes raw URL | `Layout.jsx:195–197` | User-friendly message |

### Medium

| Issue | File |
|-------|------|
| Mobile menu ☰ without `aria-label` | `Layout.jsx:1171–1175` |
| Password toggles missing `aria-label` | `Register.jsx`, `ResetPassword.jsx` |
| Fetch failures console-only | `EnquiryMaster.jsx:109–112` |
| Dashboard mock command-center KPIs | `Dashboard.jsx` + `mockCommandCenterData.js` |
| Admin ops alerts mock | `AdminOpsAlerts.jsx` |

### Positive

- `PageLoader.jsx` with `role="status"`; `RouteErrorBoundary.jsx`; lazy routes with Suspense in `App.jsx`.
- Finance schema missing banner in `Finance.jsx`.

---

## 3. Performance

### High

| Issue | Location | Impact at Scale |
|-------|----------|-----------------|
| Unbounded invoice fetch | `billingApi.js:989–992` | OOM at 10k+ invoices |
| PO fetch capped at 200, no loop | `billingApi.js:459–472` | Missing POs silently |
| BillingContext loads all on mount | `BillingContext.jsx:265–269` | N+1 line items + attachments |
| Finance 15 parallel unbounded selects | `siteLedgerStore.js:171–176` | Full schema in memory |
| Employee master full table | `IfspEmployeeMaster.jsx:597–600` | 5k employees unusable |
| CreateInvoice ~4,800 lines | `pages/billing/CreateInvoice.jsx` | Re-render + bundle cost |
| SiteLedgerApp ~4,400 lines | `pages/finance/SiteLedgerApp.jsx` | Same |
| BillingKeepAlivePanels | Keeps visited tabs mounted | Memory growth |
| Global MutationObserver on body | `App.jsx:172–243` | CPU on DOM churn |
| Marketing monoliths | `QuotationTracker.jsx`, `EnquiryMaster.jsx` | Bundle + re-render |

### Medium

| Issue | Location |
|-------|----------|
| `debugInvoiceSnapshots` Map (max 200 in prod) | `server/index.js:131–132` |
| Multer buffers before auth check | `server/index.js:1216–1271` |
| No `trust proxy` for rate limit behind nginx | `server/index.js` |
| Client pagination after full fetch | `ManageInvoices.jsx`, `EnquiryMaster.jsx` |

### Positive

- `20260626130000_database_performance_indexes.sql` — guarded hot-path indexes.
- `UserManagement.jsx` — server-side pagination via `userManagementListApi.js`.
- `ProductCatalog.jsx` — server-side pagination.

---

## 4. Security

### Improvements Since Prior Audit

| Control | Location |
|---------|----------|
| Helmet + rate limiting | `server/index.js:138–175` |
| Auth middleware (billing, HR, admin) | `server/authMiddleware.js`, routes in `server/index.js` |
| E-invoice requires `requireBillingAccess` | `server/index.js:1004+` |
| Attendance punches require `requireHrOrAdmin` | `server/index.js:917+` |
| Debug invoice route admin-only + prod disabled | `server/index.js:875–888` |
| Profile self-UPDATE guard trigger | `20260704120000:90–116` |
| HR/AMC/attendance RLS helpers | `20260704120000` |
| Billing bootstrap bypass removed (if applied) | `20260704120000:128–174` |
| Register route hidden in prod | `App.jsx:284` |
| Hardcoded super-admin email removed | `AuthContext.jsx` (verified absent) |
| CI `npm run lint` + `npm run security-check` | `.github/workflows/deploy.yml:32–35` |

### Critical (Remaining)

| Vulnerability | Location | Impact |
|---------------|----------|--------|
| **Live secrets in git** | `.env.server.example:4–46` | Full DB, R2, e-invoice, attendance API compromise |
| **Profile INSERT escalation** | `20260609180000:177–179` | super_admin via PostgREST INSERT |
| **R2 any-session access** | `server/index.js:256–288`, `1216–1310` | Any user uploads/reads/deletes subscription files |
| **Hardening migration may be unapplied** | `20260704120000` header — manual SQL Editor | Pre-hardening RLS still live |
| **Permissive RLS on punches/projects/marketing** | See blockers §4 | Cross-user attendance/project data |
| **Role from user_metadata on signup** | `20260609190000`, `login-check`, `access-check` | Attacker-controlled role if signup open |

### High

| Vulnerability | Location |
|---------------|----------|
| CORS `origin: true` when `CORS_ORIGINS` unset | `server/index.js:134–152` |
| Edge functions `verify_jwt = false` | `supabase/config.toml:2–9` |
| Wildcard CORS on edge functions | All `supabase/functions/*/index.ts` |
| `access-check` fails open on profile error | `access-check/index.ts:51–54` returns `{ ok: true }` |
| Admin edge vs server RBAC mismatch | Edge allows `admin`; server `adminProfileApi.js` super_admin only |
| Fleet no-profile bootstrap | `20260603120000:11–23` |
| Marketing zero client auth gates | All `src/pages/marketing/*` |
| Min password length 6 | `adminCreateUserApi.js:587–593` |
| R2 presign falls back to anon + metadata role | `server/index.js:98–115` |
| Finance permissions defined but not enforced in UI | `SiteLedgerApp.jsx` |

### Medium

- No CSRF (acceptable for JWT SPA if APIs authenticated — e-invoice now gated).
- E-invoice returns full `providerResponse` — may leak provider internals (`server/index.js:1135–1162`).
- `ilike` wildcard injection on user delete — `adminBulkDeleteUserApi.js:44,54`.
- Staging scripts with `USING (true)` must never run on prod — `staging_fix_403.sql`, `production_modules_data_fix.sql`.

---

## 5. Database Review

### Strengths
- Leave workflow DB triggers (documented in `20260605100000` header).
- `20260704120000` module-scoped helpers with `SET row_security = off`.
- Finance RLS module/site-scoped (`20260609120000`).
- Partial unique indexes on payroll runs.

### Critical Gaps

| Issue | Location |
|-------|----------|
| Split baseline: `all_migrations.sql` vs `migrations/` | Fresh DB from migrations alone incomplete |
| Duplicate migration timestamps | `20260527120000_*` (2 files), `20260624120000_*` (2 files) |
| Attendance FK intentionally dropped | `20260521140000` — orphan emp codes |
| `tour_request_id` no FK | `20260624140000` |
| Hardening requires manual apply | `20260704120000:1–11` |
| INSERT escalation gap | UPDATE guarded; INSERT not |

### Missing
- No backup/restore runbook in repo.
- No transaction wrapping for leave approve + LMS sync (`adminLeaveRequests.js` partial failure documented).

---

## 6. Code Quality

| Issue | Evidence | Severity | Effort |
|-------|----------|----------|--------|
| Zero automated tests | No `*.test.*`; no test script | High | Large |
| Monolithic components | CreateInvoice ~4800, SiteLedgerApp ~4400, Layout ~1210 | High | Large |
| Duplicated PO entry | `POEntry.jsx`, `POEntryRm.jsx`, unused `commercial/POEntry.jsx` | Medium | Large |
| Mock mixed with production | AMC, Operations, Dashboard, PayrollApproval | High | Medium |
| Audit logger scope narrow | `auditLogger.js:53–55` — unit_cost only | Medium | Medium |
| Silent trigger failures | `handle_new_user` EXCEPTION WHEN OTHERS | Medium | Small |
| Dead stubs | `HrEmployeeMaster.jsx`, `accountsFinance/AccountsFinance.jsx` | Medium | Small |
| TypeScript starter, mostly JSX | `package.json` vs `.jsx` pages | Low | Large |

**Positive:** `scripts/security-check.mjs` + CI integration; `authMiddleware.js` separation.

---

## 7. API Review

### Express (`server/index.js`)

| Endpoint | Auth | Rate limit | Notes |
|----------|------|------------|-------|
| `GET /api/health` | None | 120/min | Leaks key presence in non-prod |
| `POST /api/admin/*` | Bearer JWT + handler role | 120/min | Service role server-side ✓ |
| `GET /api/debug/invoice/:id` | `requireAdmin` | 120/min | Disabled in prod ✓ |
| `GET /api/admin/attendance/*` | `requireHrOrAdmin` | 120/min | Fixed since prior audit ✓ |
| `POST /api/billing/e-invoice/*` | `requireBillingAccess` | 30/min | Fixed since prior audit ✓ |
| `POST /api/*/r2/*` | Session JWT only | 120/min | **Missing role checks** on software-subscriptions |

### Supabase PostgREST / Edge
- No API versioning.
- Inconsistent error shapes: `{ error }` vs `{ message }` vs `{ ok: false }`.
- Edge functions: `--no-verify-jwt`, wildcard CORS.

### Positive
- E-invoice 401 retry with token refresh (`server/index.js:1055–1065`).
- R2 upload: UUID validation, extension whitelist, 25MB cap.

---

## 8. Business Logic by Workflow

| Workflow | Status | Key Gaps |
|----------|--------|----------|
| **User Management** | Working | Role escalation via INSERT; bulk delete role mismatch edge vs server |
| **Authentication** | Improved | Register dev-only; metadata-trusted roles on signup; cached profile RBAC window |
| **Permissions** | UI-only for many routes | Legacy broad access; `sales` over-grants commercial RM |
| **Employee Profiles** | Admin authoritative | HR master stub; hierarchy_sort not persisted |
| **Attendance** | Working with sync | Punch/leave/tour conflicts; late-in hardcoded 09:00 |
| **Leave Management** | Partially correct | No sandwich leave; balance not enforced; inbox not scoped |
| **Sandwich Leave** | **Not implemented** | Zero code |
| **Payroll** | Engine exists, workflow broken | Mock approval; undercounted paid days; attendance path ≠ UI |
| **Payslips** | Minimal | No PDF; created at preview |
| **Notifications** | Fragmented | Marketing permissive RLS; admin alerts mock |
| **Email workflows** | Auth only | No HR/PO/payroll automation |
| **Approval hierarchy** | Leave single-step; Payroll mock | No L1→L2→L3 chain |
| **Purchase Orders** | Functional | Duplicated code; Commercial tab routing fragile |
| **Billing** | Functional with gaps | Unapproved PO invoicing; localStorage fallback |
| **Reports** | Partial | OT dead; mock dashboards |
| **Dashboard** | Mock KPIs | `mockCommandCenterData.js` |
| **Finance** | Site Ledger live | Permissions ignored; orphaned permission-aware pages |
| **AMC** | DB + mock hybrid | Mock merge on empty |
| **Operations** | Mock preview | No real persistence except Dahej localStorage |
| **Marketing** | Live Supabase | No client auth; unbounded fetch |
| **Fire Tender / Projects** | Mostly live | Demo props still in router; partial auth gates |
| **Settings** | Per-module | Inconsistent date/currency |

---

## 9. Supabase Review

| Area | Finding |
|------|---------|
| **Auth** | ES256 JWT; gateway verify disabled on 3 functions; profile auto-provision from metadata |
| **RLS** | Hardening migration fixes HR/AMC/attendance/billing **if applied**; punches/projects/marketing/fleet gaps remain |
| **Edge Functions** | 6+ admin functions; inconsistent RBAC; CORS `*` |
| **Storage** | R2 via Express; marketing public URLs in `ExpoSeminar.jsx:261–265` |
| **Realtime** | Tour register; optional disable `VITE_DISABLE_SUPABASE_REALTIME` |
| **Migrations** | 89 incremental + monolithic baseline; duplicate timestamps; manual scripts duplicate migrations |
| **Triggers** | Leave triggers well-designed; `guard_profiles_self_update` UPDATE-only |
| **Backup** | Platform-dependent; no repo runbook |

---

## 10. Reliability

| Scenario | Behavior | Risk |
|----------|----------|------|
| Leave approve + LMS sync fail | Attendance changed, LMS pending | Data split |
| Concurrent leave approvers | Second gets conflict | Poor UX |
| Attendance sync partial upsert | Returns `partialUpserted` | Good reporting |
| E-invoice 401 | Single retry | Good |
| Payroll preview repeated | New run each time | Duplicate runs |
| Billing DB down | Falls back to localStorage fake data | **Silent corruption** |
| Trigger silent failure | `handle_new_user` swallows errors | Profile missing |

---

## 11. Scalability

| Load | Expected behavior |
|------|-------------------|
| **100 users** | Works |
| **1,000 users** | Employee master + billing degrade; attendance year queries slow |
| **10,000 users** | **Fails** — full-table client loads, PostgREST timeouts |
| **Large attendance** | Year register in memory on daily page |
| **Large payroll** | Preview upserts all employees — OK to ~2k |
| **Large file uploads** | 25MB OK; in-memory multer limits concurrency on free Render |

**Bottlenecks:** Unbounded queries, monolithic React, free Render plan, no CDN documented.

---

## 12. Production Readiness

| Check | Status |
|-------|--------|
| Environment variables | `.env.server.example` still has live secrets |
| Configuration | Staging/prod build modes; `CORS_ORIGINS` documented |
| Monitoring | None |
| Logging | console only |
| Auditing | Narrow client logger; fire tender DB audit |
| Backups | Not documented |
| Disaster recovery | Not documented |
| Security headers | Helmet ✓ |
| Rate limiting | express-rate-limit ✓ |
| Health checks | `/api/health`; `render.yaml:19` |
| Error tracking | None |
| CI/CD | Build + lint + security-check + SSH deploy ✓ |
| Tests | None |

---

## 13. Missing Features (Enterprise HRMS/ERP)

- Sandwich leave policy engine
- Multi-level leave approval (L1→L2→L3) with SLA
- Real payroll approval integrated with payslip release
- Payslip PDF + employee self-service portal
- Email notifications (leave, payroll, PO approval)
- Employee self-service (leave apply, payslip, bank details)
- HR/payroll audit trail
- Shift/roster management
- Biometric reconciliation UI
- Statutory exports (PF ECR, ESIC, Form 16)
- Multi-company / multi-entity
- Unified workflow engine for PO/billing
- Mobile attendance marking
- Backup verification drills
- Data retention / GDPR export-delete

---

## 14. Consistency Audit

| Dimension | Inconsistency | Examples |
|-----------|---------------|----------|
| **Dates** | Canonical vs ad hoc | `dateDisplay.js` vs `EnquiryMaster.jsx` |
| **Currency** | ₹ vs INR vs Rs. | Billing vs quotations vs operations |
| **Time zones** | Server Asia/Kolkata vs client local | Punch display vs sync |
| **Validation** | Password min 6 | Register vs enterprise 12+ |
| **Permissions** | Page vs Layout vs RLS | SoftwareSubscriptions vs itIs module |
| **PO approval before billing** | AddOnInvoices requires approved | CreateInvoice does not |
| **Error messages** | alert vs banners | Cross-module |
| **API responses** | `{ error }` vs `{ message }` | Express vs edge vs PostgREST |
| **Employee codes** | Partial normalization | Payroll join vs leave aggregation |
| **Mock vs real data** | AMC, Operations, Payroll | Indistinguishable in UI |

---

## 15. Technical Debt Register

### High Priority

| Item | Impact | Effort |
|------|--------|--------|
| Committed secrets | Total compromise | Medium |
| Unapplied hardening migration | Data breach | Small (apply) |
| Profile INSERT escalation | Admin takeover | Small |
| R2 any-session access | File exfiltration | Small |
| Unapproved PO invoicing | Compliance failure | Small |
| Billing localStorage fallback | Data corruption | Small |
| HR leave/payroll correctness | Wrong pay & balances | Large |
| Zero automated tests | Regression risk | Large |
| Mock data in production paths | Wrong decisions | Medium |

### Medium Priority

| Item | Impact | Effort |
|------|--------|--------|
| Monolithic components | Velocity collapse | Large |
| Full-table fetches | Performance | Medium |
| Marketing no client auth | Depends on RLS | Medium |
| Finance permissions dead layer | Unauthorized edits | Medium |
| Edge vs server RBAC mismatch | Admin confusion | Small |
| Split migration baseline | Deploy failures | Medium |

### Low Priority

| Item | Impact | Effort |
|------|--------|--------|
| Currency/date unification | UX polish | Medium |
| Accessibility gaps | Compliance | Medium |
| TypeScript adoption | Type safety | Large |
| Commercial tab path parsing | Minor UX | Small |

---

## Code Examples — Highest-Risk Patterns

**Profile INSERT escalation (UPDATE guarded, INSERT not):**

```177:179:supabase/migrations/20260609180000_profiles_rls_definitive_fix.sql
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());
```

**Leave dates include all calendar days:**

```188:198:supabase/migrations/20260605100000_admin_leave_workflow.sql
CREATE OR REPLACE FUNCTION indus_one.admin_leave_working_dates(
  p_from date,
  p_to date
)
RETURNS SETOF date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT d::date
  FROM generate_series(p_from, p_to, interval '1 day') AS g(d);
$$;
```

**Unapproved POs billable:**

```872:876:src/pages/billing/CreateInvoice.jsx
  const billablePOs = useMemo(() => {
    return sortNewestPoFirst(commercialPOs.filter((p) => !p.isSupplementary));
  }, [commercialPOs]);
```

**CO validation bug:**

```602:605:src/pages/adminOperations/employee/EmployeeAttendanceDailyPage.jsx
        const coCheck = validateCoMark(empYearRows, registerDate, value, {
          dayMarkOnDate: value,
          holidayDates: holidayDatesInYear,
        });
```

**R2 session-only auth (no role check):**

```256:288:server/index.js
// requireSessionForSoftwareSubscriptionsR2 — validates JWT only, no super_admin check
```

---

## Summary

This ERP has **unusual breadth** across billing, commercial, marketing, fire tender, fleet, finance, HR, AMC, and operations. A **recent security sprint** (Helmet, rate limits, `authMiddleware.js`, hardening migration, CI security-check, prod register gate) materially improves the server and auth surface compared to the prior audit.

**Production is still blocked** by: (1) live secrets in `.env.server.example`, (2) hardening migration that must be manually verified applied, (3) profile INSERT escalation, (4) R2 routes trusting any session, (5) billing invoicing unapproved POs with localStorage fallback, and (6) HR/payroll business-logic gaps that produce incorrect leave deductions and payslips.

**Recommended path:** 1–2 week security verification sprint (secrets rotation, migration apply, INSERT guard, R2 roles, billing guards) followed by 2–3 week HR correctness sprint (leave dates, balance enforcement, payroll attendance alignment) before any customer-facing deployment.
