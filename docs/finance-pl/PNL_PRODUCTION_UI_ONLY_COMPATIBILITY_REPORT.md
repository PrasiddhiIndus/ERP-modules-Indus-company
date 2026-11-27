# Production UI-Only Release — Compatibility Report

**RC:** `PNL-RC-2026-11-27`  
**Strategy:** UI modernization only — **no backend migration**  
**Date:** 2026-11-27  
**Mode:** Compatibility audit + deploy package prep — **not deployed**

| Constraint | Result |
|------------|--------|
| Deploy redesigned P&L UI | Allowed after approval of this report |
| Retain production Finance schema | **Required — no DDL** |
| Retain existing APIs / RPCs / persistence | **Verified for flags OFF** |
| Preserve calcs / Fire-Safety / history / routes | **Verified (local suite)** |
| Feature flags | **Both OFF** (default + build) |
| DB migration apply | **Forbidden** for this release |
| Atomic / explicit-save workflows | **Must stay inactive** |

---

## Verdict

**COMPATIBLE — UI-only production release is feasible.**

No redesigned UI path that runs with both flags **OFF** requires new database objects, columns, RPCs, policies, or records. Phase 3 RPCs exist in the client bundle but are **unreachable** unless `atomicConcurrency` is enabled.

**Do not deploy until this report is accepted and a frontend-only deploy is explicitly authorized.**  
**Do not apply** `20261127140000_finance_period_concurrency_atomic.sql` (or any other migration) as part of this release.

---

## 1. Integration-point comparison (RC vs production backend)

| Production surface | RC behaviour (flags OFF) | Requires new DB? |
|--------------------|--------------------------|------------------|
| Route `/app/accounts-finance/reports/site-ledger` | Unchanged (`navConfig.js`) | No |
| Views `overview \| sites \| site \| config \| entry \| reports` | Preserved | No |
| `loadLedgerStore` | `select("*")` on existing finance tables; ignores missing `revision` / `setup_revision` | No |
| `savePeriodRecord` | Debounced autosave → upsert `period_entries` + `replace_period_entry_lines` | No |
| Leave / hide flush | `flushAllPendingPeriodRecords` (legacy) | No |
| `saveSiteSetupChanges` | Diff-based writes; structure via table upsert/update/delete (not `apply_site_structure_diff`) | No |
| Budgets / spreads | Existing `replace_budget_lines` / table upserts | No |
| Fire/Safety | `filterSitesByFinancePlAccess` (UI filter on `allowed_sub_modules`) | No |
| RLS / `user_site_access` | Unchanged client assumptions | No |
| Reports / exports / calcs | Same formulas; recon tests green | No |
| `save_period_entry_atomic` | Only if `isAtomicConcurrencyEnabled()` | **Yes if ON — keep OFF** |
| `apply_site_structure_diff` | Only if atomic flag ON during structure mutation | **Yes if ON — keep OFF** |
| `period_save_requests` / revision columns | Read optionally; never required when OFF | No |

### Flag defaults (production build)

| Flag | Env | Storage key | Default |
|------|-----|-------------|---------|
| Explicit figure save | `VITE_SITE_LEDGER_EXPLICIT_FIGURE_SAVE` | `indus.finance.pl.explicitFigureSave` | **OFF** |
| Atomic concurrency | `VITE_SITE_LEDGER_ATOMIC_CONCURRENCY` | `indus.finance.pl.atomicConcurrency` | **OFF** |

Production build chunk `Finance-C-Mf4fET.js` (this run): env names present; **not** baked to `true`.  
Repo `.env*` has **no** `VITE_SITE_LEDGER_*` overrides.

---

## 2. Frontend code that needs new DB objects / RPCs

| Code path | New object | Gate |
|-----------|------------|------|
| `syncOnePeriodRecord` → `financeRpc("save_period_entry_atomic", …)` | Phase 3 RPC + `revision` + `period_save_requests` | `isAtomicConcurrencyEnabled()` |
| `saveSiteSetupChangesInner` → `financeRpc("apply_site_structure_diff", …)` | Phase 3 RPC + `sites.setup_revision` | `isAtomicConcurrencyEnabled()` |
| Conflict UI / OCC revision fields | Meaningful only with atomic path | Flag / conflict errors |

**With both flags OFF: none of the above run.**  
Error copy that mentions the Phase 3 migration is defensive only (if someone enables the flag against an unmigrated DB).

**STOP rule:** If production deploy enables either flag, **stop** — that is no longer UI-only and requires Phase 3 schema.

---

## 3. Persistence verification (flags OFF)

| Operation | Production mechanism retained |
|-----------|-------------------------------|
| Load portfolio | Existing finance tables via `loadLedgerStore` |
| Figure autosave | `period_entries` upsert + `replace_period_entry_lines` |
| Figure leave flush | Same queue flush path |
| Site Setup save | Diff → heads sync + structure table ops + spreads/budgets |
| New-site full structure | Existing `replace_site_structure` where used for new sites |
| Budget lines | Existing `replace_budget_lines` |
| Delete site | `finance.sites` delete (existing) |

Client-only additions (safe without DB change): IndexedDB drafts / SaveCoordinator / navigation guard — inactive for figure autosave when explicit flag OFF; setup dirty tracking remains client-side.

---

## 4. Test suite and production build (executed this session)

```bash
npx vitest run tests/siteLedger*.test.js tests/financePlSiteAccess.test.js
# 12 files · 203 passed · 0 failed

npx vite build --mode production
# ✓ built in 9.87s · Finance-C-Mf4fET.js present · exit 0
```

Includes: feature-flag defaults OFF, calc reconciliation, Fire/Safety access, setup/period save, coordinator, page smokes. Concurrent atomic suite proves gated path on PGlite — **not** required for UI-only prod.

**Not run:** browser E2E against production; production write smoke (by design — no prod credentials).

---

## 5. Legacy save path confirmation (both flags OFF)

| Behaviour | Confirmed |
|-----------|-----------|
| `isExplicitFigureSaveEnabled()` → `false` | Default + tests |
| `isAtomicConcurrencyEnabled()` → `false` | Default + tests |
| FiguresEntryPage autosave debounce | Runs when `explicitSaveMode={false}` |
| Leave/hide flush via `flushAllPendingPeriodRecords` | SiteLedgerApp legacy branch |
| Period write uses `replace_period_entry_lines` | `syncOnePeriodRecord` legacy branch |
| Structure write skips `apply_site_structure_diff` | `else` branch in setup save |

---

## 6. Deployment plan (frontend only — do not run until authorized)

### 6.1 In scope

- Ship application frontend artifacts that include RC Site Ledger UI (`src/pages/finance/SiteLedgerApp.jsx`, `site-ledger/**`, related finance API modules, tests as CI only).
- Production static/hosting deploy of `vite build --mode production` output (or existing hosting pipeline).

### 6.2 Out of scope (hard)

- Any `supabase db` / SQL Editor migration on production  
- Applying `20261127140000_…` even if present in the git tree  
- Enabling `VITE_SITE_LEDGER_*` in production build env  
- Instructing users to set localStorage flag keys  
- Staging finance bootstrap / Phase 3.1 (separate track)

### 6.3 Pre-deploy checklist

1. Confirm production hosting build env has **neither** `VITE_SITE_LEDGER_EXPLICIT_FIGURE_SAVE` nor `VITE_SITE_LEDGER_ATOMIC_CONCURRENCY` set true.  
2. Commit/tag the UI release from the RC working tree (frontend + docs); **do not** run migration apply scripts in CD.  
3. Snapshot current production frontend release (prior build artifact / git SHA) for rollback.  
4. Smoke after deploy (read-only first): open Site Ledger → load sites → open one period → confirm figures visible.  
5. Write smoke (authorized user): edit one disposable figure amount → wait autosave / leave → reload → amount persists.  
6. Confirm Fire/Safety scoped user still sees filtered sites.  
7. Confirm reports/export still open on same route.

### 6.4 Post-deploy monitoring (24h)

- Figure save errors / RLS denials  
- Site Setup save failures  
- No spike in “concurrency RPC is missing” messages (would indicate accidental flag ON)

---

## 7. Rollback plan

| Layer | Action |
|-------|--------|
| Frontend | Redeploy previous production build artifact / prior git SHA |
| Flags | Ensure env/localStorage flags remain OFF (rollback does not need flag changes if never enabled) |
| Database | **None** — no migration applied; no DB rollback |
| Data | Historical amounts untouched by UI deploy |

Rollback is complete when prior UI is live and Site Ledger load + legacy figure save succeed.

---

## 8. Residual risks (accepted for UI-only)

| Risk | Mitigation |
|------|------------|
| Operator enables localStorage atomic flag in browser | Document ban; support playbook: remove key + reload |
| CD pipeline auto-applies all `supabase/migrations` | **Block** Phase 3 file from prod migrate job; UI-only release ≠ migrate |
| Browser UAT not yet done on production URL | Short post-deploy smoke (§6.3) before broad announce |
| Working tree ahead of last push | Tag/commit UI release before deploy |

---

## 9. Explicit non-goals of this release

- Phase 3 OCC / atomic concurrency  
- Explicit figure-save workflow as default  
- Staging schema bootstrap for Phase 3.1  
- Any production DDL/DML beyond normal app writes through existing RPCs/tables  

---

## Stop / approval gate

- Compatibility: **PASS for UI-only**  
- DB change required for redesigned UI at flags OFF: **None**  
- Migrations executed: **0**  
- Production modified: **No**  
- Deployment: **Not started** — awaiting explicit authorization to deploy frontend only
