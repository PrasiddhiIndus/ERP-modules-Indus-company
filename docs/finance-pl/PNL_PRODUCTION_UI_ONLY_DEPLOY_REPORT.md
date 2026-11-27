# Production UI-Only Deploy Report — PNL-RC-2026-11-27

**Authorized:** Frontend-only production deployment  
**Target:** https://indus-erp.in  
**Baseline (pre-deploy):** `origin/main` `9372490`  
**Rollback snapshot:** `.pnl-rollback/20261127T102359Z` (entry assets + META)  
**Phase 3 migration files:** **Not included** in this release commit  
**Feature flags:** both **OFF** (unset in build env)

## Scope shipped

- Redesigned Site Ledger UI module (`src/pages/finance/site-ledger/**`)
- Updated `SiteLedgerApp.jsx`, `siteLedgerStore.js`, `siteSetupDiff.js`
- Supporting unit tests (excludes Phase 3 concurrency SQL fixture test)
- Docs for UI-only compatibility

## Explicitly excluded

- Applying any Supabase migration
- `20261127140000_finance_period_concurrency_atomic.sql` (+ rollback)
- Staging bootstrap / Phase 3.1 scripts
- Enabling `explicitFigureSave` / `atomicConcurrency`

## Pre-deploy verification (worktree)

| Check | Result |
|-------|--------|
| Site Ledger + access tests | **186 passed** / 0 failed (11 files) |
| `vite build --mode production` | **PASS** (~9.0s) |
| Finance chunk | `Finance-C08Q1r_T.js` |
| Legacy RPC string present | `replace_period_entry_lines` |
| Flags baked true | **No** (env unset) |
