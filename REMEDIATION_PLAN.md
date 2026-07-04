# Remediation Plan: Secure, Scalable, Maintainable ERP

**Project:** ERP-modules-Indus-company  
**Related:** [AUDIT_REPORT.md](./AUDIT_REPORT.md)  
**Last updated:** 2026-07-04  

This document is a **phased engineering program** to address findings in the production readiness audit. It builds on work already in the codebase (`server/authMiddleware.js`, Helmet, rate limits, `20260704120000_production_security_hardening.sql`, CI security-check).

---

## Target Scores (After Full Execution)

| Dimension | Current | Target |
|-----------|---------|--------|
| Overall health | 44 / 100 | **78–85** |
| Security | 42 / 100 | **82–88** |
| Performance | 44 / 100 | **72–80** |
| Maintainability | 43 / 100 | **75–82** |
| Scalability | 35 / 100 | **70–78** |
| Production readiness | 40 / 100 | **80–85** |

---

## Guiding Principles

1. **Server + RLS are the real security boundary** — client RBAC in `roles.js` is UX only.
2. **One source of truth per domain** — leave quotas, paid days, PO approval rules must not diverge across files.
3. **No mock data in production builds** — mock modules either get wired or hidden behind `import.meta.env.DEV`.
4. **Pagination at the database** — never load full tables into React state.
5. **Migrations must be automated** — stop relying on “paste in SQL Editor” for production.

---

## Phase 0 — Emergency (Day 1, Before Anything Else)

### 0.1 Secrets Rotation (Critical)

**Do this first.** If `.env.server.example` was ever pushed, assume compromise.

| Action | Detail |
|--------|--------|
| Rotate Supabase `service_role` | Dashboard → Settings → API → regenerate |
| Rotate R2 keys | Cloudflare R2 → regenerate access keys |
| Rotate Whitebooks + eTime credentials | Provider dashboards |
| Redact git-tracked examples | Replace all values in `.env.server.example` with placeholders |
| Scrub git history | `git filter-repo` or BFG if secrets were committed |
| Store live secrets only in | Render env, GitHub Secrets, Supabase secrets — never in repo |

**Add to CI** (`scripts/security-check.mjs`):

```javascript
// Fail if .env.server.example contains JWT-like strings or real passwords
mustNotInclude('.env.server.example', ['eyJhbGci', 'Indus@', 'de5a9852'], 'No live secrets in example');
```

### 0.2 Verify Hardening Migration Applied

Run on **both** staging and production after applying `supabase/migrations/20260704120000_production_security_hardening.sql`:

```sql
-- Verification queries
SELECT proname FROM pg_proc WHERE proname = 'guard_profiles_self_update';
SELECT policyname FROM pg_policies WHERE tablename = 'profiles';
SELECT policyname FROM pg_policies WHERE tablename LIKE 'hr_payroll%' LIMIT 5;
```

If helpers/policies are missing → apply the migration immediately in Supabase SQL Editor.

### 0.3 Production Environment Variables

Set on Render / server (never commit):

```env
NODE_ENV=production
CORS_ORIGINS=https://your-erp-domain.com
ETIME_SYNC_SECRET=<strong-random-32+>
SUPABASE_SERVICE_ROLE_KEY=<rotated>
# Never set VITE_STAGING_FULL_ACCESS in production
```

**Fail fast on server startup:** if `IS_PRODUCTION && !CORS_ORIGINS` → throw and refuse to start.

---

## Phase 1 — Security Foundation (Week 1)

**Goal:** Close privilege escalation and remaining RLS holes.  
**Target security score:** ~70.

### 1.1 New Migration: Profile INSERT Guard

**File:** `supabase/migrations/20260705_profiles_insert_guard.sql`

Fix profile INSERT escalation (UPDATE is already guarded in `20260704120000`).

**Option A (recommended):** Remove client INSERT entirely — only `handle_new_user` trigger + service role create profiles.

```sql
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Profiles created only by trigger on auth.users insert or admin RPC
CREATE POLICY "Block client profile inserts"
  ON public.profiles FOR INSERT
  WITH CHECK (false);
```

**Option B:** INSERT trigger that forces safe defaults:

```sql
CREATE OR REPLACE FUNCTION public.guard_profiles_self_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF auth.uid() = NEW.id THEN
    NEW.role := COALESCE(NEW.role, 'executive');
    IF NEW.role NOT IN ('executive') THEN
      RAISE EXCEPTION 'Cannot self-assign elevated role on insert.' USING ERRCODE = '42501';
    END IF;
    NEW.allowed_modules := '[]'::jsonb;
    NEW.team := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profiles_self_insert ON public.profiles;
CREATE TRIGGER trg_guard_profiles_self_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_self_insert();
```

Also: **disable public signup** in Supabase Auth unless required; use admin-create-user only.

### 1.2 New Migration: Remaining RLS Hardening

**File:** `supabase/migrations/20260705_remaining_rls_hardening.sql`

Harden tables **not** covered by `20260704120000`:

| Table | Policy helper |
|-------|---------------|
| `erp_attendance_punches` | HR/admin only; employees read own punches via `employee_code` |
| `projects.*` (4 tables) | `current_user_has_fire_tender_shared_catalog_access()` or projects module |
| `marketing_enquiries`, `marketing_quotations`, `marketing_clients` | Marketing module helper |
| Fleet bootstrap | Remove `NOT EXISTS profile → true` in `current_user_has_fleet_module_access()` |

Example pattern:

```sql
DROP POLICY IF EXISTS erp_attendance_punches_select_authenticated ON public.erp_attendance_punches;

CREATE POLICY erp_attendance_punches_hr_select ON public.erp_attendance_punches
  FOR SELECT TO authenticated
  USING (public.current_user_has_attendance_admin_access());
```

Revoke `GRANT SELECT ON ALL TABLES IN SCHEMA indus_one TO anon` — authenticated + RLS only.

### 1.3 Server: R2 + Admin Route Hardening

**File:** `server/authMiddleware.js` — add super-admin check:

```javascript
function requireSuperAdmin(ctx) {
  const role = String(ctx.profile?.role || '').trim();
  return role === 'super_admin' || role === 'super_admin_pro';
}

return {
  // ...
  requireSuperAdmin: middleware((ctx) => requireSuperAdmin(ctx)),
};
```

Apply to all `/api/software-subscriptions/r2/*` routes in `server/index.js` (replace `requireSessionForSoftwareSubscriptionsR2` JWT-only check).

| Fix | File |
|-----|------|
| `app.set('trust proxy', 1)` | `server/index.js` — correct rate-limit IPs behind nginx |
| Stricter admin rate limit (10/min) | Separate `rateLimit` on `/api/admin/*` |
| Sanitize e-invoice responses | Strip `providerResponse` in production |
| Auth **before** multer | Move multer middleware after auth check |
| Escape `ilike` wildcards | `adminBulkDeleteUserApi.js` — escape `%` and `_` in email |

### 1.4 Edge Functions Alignment

| Fix | Detail |
|-----|--------|
| Enable `verify_jwt = true` where possible | `supabase/config.toml` |
| Align RBAC with server | `admin-update-profile`: super_admin only for role changes |
| Fix `access-check` fail-open | Return `{ ok: false }` on `profErr`, not `{ ok: true }` |
| Restrict CORS | Allowlist frontend origin, not `*` |
| Block admin → super_admin escalation | Same guard as `admin-create-user` |

### 1.5 Client Auth Hardening

| Fix | File |
|-----|------|
| Don't grant modules until profile loads | `AuthContext.jsx` — `accessibleModules = ['settings']` until `profiles` row fetched |
| Remove legacy broad access in prod | `roles.js` — gate `!normalized.role` fallback behind `import.meta.env.DEV` |
| Add `ModuleRoute` wrapper | New component for `/app/user-management`, billing write routes |
| Marketing client gates | Import `userCanEditInModules` in marketing pages |

---

## Phase 2 — Data Integrity & HR Correctness (Weeks 2–3)

**Goal:** Stop generating wrong payroll, leave, and billing data.  
**Target overall health:** ~65.

### 2.1 Billing (Small, High Impact)

**`CreateInvoice.jsx` (~line 872):**

```javascript
const billablePOs = useMemo(() => {
  return sortNewestPoFirst(
    commercialPOs.filter((p) =>
      !p.isSupplementary &&
      String(p.approvalStatus || '').toLowerCase() === 'approved'
    )
  );
}, [commercialPOs]);
```

Also enforce in `handleSaveInvoice` — reject save if PO not approved (defense in depth).

**`BillingContext.jsx`:** Disable localStorage fallback in production:

```javascript
if (import.meta.env.PROD) {
  // Show error UI; do not seed fake POs from billingStore.js
  throw new Error('Billing database unavailable');
}
```

**`billingApi.js`:** Add pagination:

```javascript
export async function fetchInvoices({ limit = 100, offset = 0 } = {}) {
  const { data, error } = await table('invoice')
    .select('id, invoice_number, buyer_name, total, status, created_at') // avoid select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data || [];
}
```

Loop in `BillingContext` until partial page returned, or use cursor-based pagination for very large datasets.

### 2.2 Leave Management (Medium–Large)

**Step 1 — Define policy document** (business input required):

- Which marks count as leave days?
- Sandwich rule: include WO between leave blocks?
- NH/PH inside leave range?

**Step 2 — Fix `admin_leave_working_dates`:**

```sql
CREATE OR REPLACE FUNCTION indus_one.admin_leave_working_dates(p_from date, p_to date)
RETURNS SETOF date
LANGUAGE sql
STABLE
AS $$
  SELECT d::date
  FROM generate_series(p_from, p_to, '1 day') AS g(d)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.admin_attendance_register r
    WHERE r.register_date = g.d::date
      AND r.mark IN ('WO', 'NH', 'PH')
  );
$$;
```

**Step 3 — Enforce balance at approval:**

```sql
-- In admin_leave_apply_balance_deduction:
IF v_unused < v_days THEN
  RAISE EXCEPTION 'Insufficient leave balance' USING ERRCODE = '23514';
END IF;
```

**Step 4 — Unify quota mapping**

Create `src/lib/leaveMarkRules.js` — single export used by both `leaveManagement.js` and `attendanceLeaveLimits.js`:

```javascript
export const LEAVE_MARK_RULES = {
  PL: { bucket: 'pl', weight: 1 },
  SPLA: { bucket: 'spla', weight: 0.5 },
  SPLB: { bucket: 'splb', weight: 0.5 },
  SBEL: { bucket: 'sbel', weight: 1 },
  SPLM: { bucket: 'splm', weight: 1 },
  PTL: { bucket: 'pl', weight: -3 },
  // ...
};
```

**Step 5 — Fix attendance UI bugs**

| Fix | File |
|-----|------|
| Pass `oldMark` not `value` to `validateCoMark` | `EmployeeAttendanceDailyPage.jsx:603` |
| Block save when limits exceeded (or require override + audit) | `EmployeeAttendanceDailyPage.jsx` |
| Preserve `leave_request_id` on manual edits to leave cells | `attendanceDaily.js` `upsertRegisterMark` |

### 2.3 Payroll Alignment

**Single attendance pipeline** — extract from daily page into `src/lib/attendancePayrollPipeline.js`:

```
fetchRegisterMarks → syncAutoWeekoff → fetchApprovedLeaveMarks → mergePunches → computePaidDays
```

Use this in:

- `fetchMonthlyRegisterPayrollTotals` (`attendanceDaily.js`)
- `fetchPresentDaysByEmployeeCode` (`attendancePayrollApi.js`)

**Paid days policy** (example for monthly salaried):

```javascript
function registerPaidDayCredit(mark) {
  if (registerPresentDayCredit(mark)) return 1;
  if (['WO', 'NH', 'PH'].includes(mark)) return 1; // if WO/NH are paid per policy
  if (mark === 'LWP') return 0;
  return 0;
}
```

**PF fix** in `src/modules/payroll/calc/statutory.js`:

```javascript
const employeeContribution = round2(cappedWages * rate);
const epsContribution = round2(cappedWages * 0.0833);
const epfEmployer = round2(cappedWages * 0.12 - epsContribution); // 3.67% within 12%
const employerContribution = round2(cappedWages * 0.12);
```

**Remove or wire mock pages:**

| Page | Action |
|------|--------|
| `PayrollApproval.jsx` | Hide from nav until wired to `hr_payroll_runs` |
| `AttendanceIntegration.jsx` | Replace mock with real sync from `/api/admin/attendance/status` |

### 2.4 Finance Permissions

In `SiteLedgerApp.jsx`, at every save/edit path:

```javascript
const { permissions } = useFinance();
if (!permissions.canEditSite) {
  // disable inputs + show banner
}
```

Or route users to permission-aware sub-pages in `finance/constants/permissions.js`.

### 2.5 Mock Modules

| Module | Fix |
|--------|-----|
| AMC | `amcApi.js` — in prod, return `[]` + empty state; never merge `mockAmcData.js` |
| Operations | Hide from nav in prod OR show fixed “Preview mode” banner |
| Dashboard | Replace `mockCommandCenterData.js` with real Supabase aggregates |
| Admin alerts | Wire to real alerts table or hide from production nav |

---

## Phase 3 — Performance & Scalability (Weeks 3–4)

**Goal:** Support 1,000+ users and large datasets.  
**Target performance:** ~75, scalability: ~72.

### 3.1 Database Indexes

**File:** `supabase/migrations/20260706_performance_indexes.sql`

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoice_created_at
  ON billing.invoice (created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_po_wo_created_at
  ON billing.po_wo (created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_attendance_register_emp_date
  ON public.admin_attendance_register (employee_code, register_date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_marketing_enquiries_created
  ON public.marketing_enquiries (created_at DESC);
```

### 3.2 API Pagination Standard

Create `src/lib/supabasePagination.js`:

```javascript
export async function fetchAllPages(queryFn, pageSize = 500) {
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await queryFn(offset, pageSize);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}
```

Apply to:

- `fetchInvoices`, `fetchCommercialPOs` (`billingApi.js`)
- `IfspEmployeeMaster.jsx`
- `EnquiryMaster.jsx`
- `siteLedgerStore.js`

**Prefer server-side table pagination** for UI lists:

```javascript
.select('id, client_name, ...', { count: 'exact' })
.range(page * pageSize, (page + 1) * pageSize - 1)
```

### 3.3 React Performance

| Fix | Detail |
|-----|--------|
| Split `CreateInvoice.jsx` | Extract: PO picker, line items, tax calc, save handler (~5 files) |
| Split `SiteLedgerApp.jsx` | Extract site selector, entry grid, spread config |
| Remove `BillingKeepAlivePanels` keep-alive | Unmount inactive tabs or lazy-load per tab |
| Remove global `MutationObserver` on `body` | Scope to date inputs or use `FormDateInput` everywhere |
| Memoize heavy rows | `React.memo` on table row components |
| Virtualize long tables | `@tanstack/react-virtual` for employee master, enquiries |

### 3.4 Bundle Size

Add `rollup-plugin-visualizer` and run `npm run build -- --analyze`.

- Lazy-load heavy libs: `exceljs`, `jspdf`, `xlsx` — dynamic `import()` only when export clicked
- Split marketing/fire-tender into separate chunks (extend `lazyPages.jsx` pattern)

### 3.5 Infrastructure Scaling

| Current | Upgrade |
|---------|---------|
| Render free tier | Paid plan + autoscaling |
| Full-table client loads | PostgREST `.range()` + DB indexes |
| In-memory debug map | Remove in prod (already capped at 200) |
| Single Node process | PM2 cluster or horizontal scale behind load balancer |
| Supabase free | Pro plan for connection pooling (PgBouncer) |

### 3.6 Caching (Optional, After Pagination)

- React Query (`@tanstack/react-query`) for billing/finance with `staleTime: 60_000`
- Server: short cache on `/api/health` only — not on mutating routes
- Supabase: materialized views for dashboard KPIs (refresh nightly)

---

## Phase 4 — Maintainability (Weeks 4–8, Ongoing)

**Goal:** Maintainability ~78, prevent regression.

### 4.1 Testing Pyramid

Add to `package.json`:

```json
"test": "vitest",
"test:e2e": "playwright test"
```

**Priority tests (write first):**

| Area | Test type | What to assert |
|------|-----------|----------------|
| `leaveMarkRules.js` | Unit | SPLA → correct bucket/weight |
| `statutory.js` computePF | Unit | EPS/EPF split |
| `authMiddleware.js` | Unit | billing/HR/admin role checks |
| `roles.js` isPathAllowed | Unit | module prefix matching |
| Leave approval | Integration (Supabase local) | Insufficient balance rejects |
| CreateInvoice | E2E | Cannot save unapproved PO |

### 4.2 Shared Libraries (Reduce Duplication)

| New module | Replaces duplication in |
|------------|-------------------------|
| `src/lib/formatInr.js` | Billing, marketing, finance, operations |
| `src/lib/formatDate.js` | Re-export from `dateDisplay.js`; migrate ad hoc usages |
| `src/lib/poValidation.js` | `POEntry.jsx`, `POEntryRm.jsx`, `commercial/POEntry.jsx` |
| `src/lib/leaveMarkRules.js` | `leaveManagement.js`, `attendanceLeaveLimits.js` |
| `src/lib/attendancePayrollPipeline.js` | Daily page + payroll API |

### 4.3 Architecture Cleanup

```
src/
  modules/           # Domain logic (payroll, leave, billing-calc)
  services/          # Supabase/API calls only
  pages/             # Thin UI — compose hooks + components
  components/        # Reusable UI
  hooks/             # useBillingInvoices, useEmployeeMaster, etc.
```

**Delete or archive:**

- Unused `commercial/POEntry.jsx` if confirmed dead
- `accountsFinance/AccountsFinance.jsx` stub
- Demo files: `demoTenders.jsx`, `demoQuotations.js` from production router

### 4.4 Migration Pipeline Fix

1. Document: **baseline** = run `all_migrations.sql` once on fresh DB, then `supabase/migrations/*`
2. Fix duplicate timestamps: rename conflicting files (e.g. `20260527120000_projects_enquiry_master.sql` → `20260527120001_...`)
3. Add migration verify script in CI — check no `USING (true)` on sensitive tables
4. Never run `staging_fix_403.sql` on production — add to `security-check.mjs` denylist

### 4.5 TypeScript Migration (Gradual)

- Rename new files `.ts` / `.tsx`
- Add `src/types/` for Profile, PO, Invoice, LeaveRequest
- Enable `strict` incrementally per folder starting with `src/modules/payroll/`

---

## Phase 5 — Production Operations (Week 5+)

**Goal:** Production readiness ~82.

### 5.1 Observability

| Tool | Purpose |
|------|---------|
| Sentry | Frontend + Node error tracking |
| Structured logging | `pino` in server — JSON logs; no buyer PIN in prod |
| Uptime monitor | Ping `/api/health` every 60s |
| Supabase dashboard | Query performance, RLS policy hits |

### 5.2 CI/CD Enhancements

Extend `.github/workflows/deploy.yml`:

```yaml
- run: npm run lint
- run: npm run security-check
- run: npm run test          # after vitest added
- run: npm run build
# Block deploy if any step fails
```

Add staging smoke test: login → fetch billing page → expect 200.

### 5.3 Backup & Disaster Recovery

- Document Supabase PITR backup schedule
- Quarterly restore drill to staging
- Export critical config: RLS policies, edge function versions

### 5.4 Security Headers & Policies

Already have Helmet. Additionally:

- Content-Security-Policy for frontend (Vite `index.html` meta or nginx)
- Supabase Auth: MFA for admin roles
- Password policy: min 12 chars in `admin-create-user`

---

## Implementation Checklist

### Week 1 — Security

- [ ] Rotate all secrets; redact `.env.server.example`
- [ ] Apply + verify `20260704120000` on prod/staging
- [ ] New migration: profile INSERT guard
- [ ] New migration: punches/projects/marketing RLS
- [ ] R2 routes → `requireSuperAdmin`
- [ ] `CORS_ORIGINS` required in prod
- [ ] `trust proxy`, admin rate limits
- [ ] Fix edge function CORS + access-check fail-open

### Week 2 — Data Integrity

- [ ] CreateInvoice approved PO only + save guard
- [ ] Disable billing localStorage fallback in prod
- [ ] Finance permissions in SiteLedgerApp
- [ ] AMC/Operations mock removed from prod
- [ ] validateCoMark fix
- [ ] `leaveMarkRules.js` unified module

### Week 3 — HR

- [ ] Leave working dates function (policy-aligned)
- [ ] Balance enforcement at approval
- [ ] `attendancePayrollPipeline.js` shared module
- [ ] PF statutory fix
- [ ] Hide/wire PayrollApproval + AttendanceIntegration

### Week 4 — Performance

- [ ] Pagination on invoices, POs, employee master, enquiries
- [ ] Performance indexes migration
- [ ] Split CreateInvoice (phase 1)
- [ ] Dynamic import for exceljs/jspdf
- [ ] React Query for billing context

### Weeks 5–8 — Maintainability

- [ ] Vitest unit tests for critical paths
- [ ] formatInr / formatDate shared
- [ ] Migration pipeline documented + CI lint
- [ ] Sentry + structured logging
- [ ] TypeScript in `src/modules/`

---

## What NOT to Do

1. **Don't "fix security" only in React** — RLS and server must enforce everything.
2. **Don't apply staging scripts to production** — especially `staging_fix_403.sql`, `staging_public_schema_all.sql`.
3. **Don't paginate in UI after loading everything** — paginate at the Supabase query.
4. **Don't implement sandwich leave without a written HR policy** — you'll build the wrong rules.
5. **Don't deploy with `VITE_STAGING_FULL_ACCESS=true`** in any production build.

---

## Effort Summary

| Phase | Duration | Team size | Primary outcome |
|-------|----------|-----------|-----------------|
| 0 Emergency | 1 day | 1 dev + 1 ops | Secrets safe |
| 1 Security | 1 week | 1–2 devs | RLS + server locked down |
| 2 Data integrity | 2 weeks | 2 devs + HR stakeholder | Correct billing/leave/payroll |
| 3 Performance | 1–2 weeks | 1–2 devs | 1k users viable |
| 4 Maintainability | 3–4 weeks | 1–2 devs | Tests, shared libs, splits |
| 5 Ops | Ongoing | 1 dev + ops | Monitoring, DR |

**Minimum viable production:** Phases 0 + 1 + billing fixes (§2.1) + verify hardening ≈ **1.5 weeks**.

**Full audit remediation:** ≈ **8–10 weeks** with 2 engineers.

---

## Quick Reference — Files to Touch First

| Priority | Files |
|----------|-------|
| Critical | `.env.server.example`, `20260704120000_production_security_hardening.sql`, `server/authMiddleware.js`, `server/index.js` |
| Critical | New: `20260705_profiles_insert_guard.sql`, `20260705_remaining_rls_hardening.sql` |
| High | `CreateInvoice.jsx`, `BillingContext.jsx`, `billingApi.js` |
| High | `EmployeeAttendanceDailyPage.jsx`, `leaveManagement.js`, `attendanceLeaveLimits.js` |
| High | `SiteLedgerApp.jsx`, `amcApi.js`, `OperationsContext.jsx` |
| Medium | `roles.js`, `AuthContext.jsx`, `supabase/functions/access-check/index.ts` |
| Medium | `IfspEmployeeMaster.jsx`, `EnquiryMaster.jsx`, `statutory.js` |

---

## Related Documents

- [AUDIT_REPORT.md](./AUDIT_REPORT.md) — Full findings with severity and file references
- [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md) — Architecture and module inventory
- [supabase/migrations/20260704120000_production_security_hardening.sql](./supabase/migrations/20260704120000_production_security_hardening.sql) — Existing security migration
