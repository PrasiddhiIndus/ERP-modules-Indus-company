# Finance → P&L — Staging / UAT Release Candidate

**RC ID:** `PNL-RC-2026-11-27`  
**Git HEAD (at packaging):** `5f95b5c` (branch `rahul`; working tree may include uncommitted local redesign)  
**Packaged (UTC):** 2026-11-27T08:53Z  
**Overall status:** **UI-ONLY COMPATIBILITY PASS** (frontend deploy not yet authorized)  
**Architecture freeze:** **YES — ACCEPTED**  
**Production strategy (authorized prep):** UI modernization only — **no** production DB migration; both flags **OFF**.  
**Rollback baseline:** This RC is the rollback baseline until a later RC is explicitly accepted.  
**UI-only report:** [`PNL_PRODUCTION_UI_ONLY_COMPATIBILITY_REPORT.md`](./PNL_PRODUCTION_UI_ONLY_COMPATIBILITY_REPORT.md)  
**Deferred track:** Phase 3 / staging bootstrap (`qpxytpicoledzeekpfjj`) remains separate and is **not** required for the UI-only production cut.

---

## Verdict

This package is a **local release candidate** for staging deployment and browser UAT only.

| Gate | Result |
|------|--------|
| Production Vite build | **PASS** (~9.6s) |
| Local regression suite | **203 passed / 0 failed** (12 files) |
| Real Supabase staging validation | **0 runs** |
| Production migration / flags | **0 / OFF** |
| Final readiness | **NOT READY** until staging + UAT succeed |

Do **not** apply remote migrations until an approved dedicated non-production project and explicit authorization exist. Do **not** touch production. Do **not** enable `explicitFigureSave` or `atomicConcurrency`.

---

## 1. Build and test results (actual)

### Production build

```bash
npx vite build
# ✓ built in 9.59s
```

- Exit code: **0**
- Finance chunk present (`Finance-*.js`)
- No build errors; existing large-chunk warnings only (xlsx/pdf vendors)

### Regression suite

```bash
npx vitest run tests/siteLedger*.test.js tests/financePlSiteAccess.test.js
```

| Result | Count |
|--------|------:|
| Test files | 12 |
| Tests passed | **203** |
| Failed | **0** |
| Duration | ~1.0s |

Coverage includes: concurrency/atomic (PGlite), drafts, save coordinator, setup diffs, deps UX, calc reconciliation, feature-flag matrix, Fire/Safety access, page smokes, domain helpers.

**Not executed:** browser E2E, real PostgreSQL/Supabase RPC/RLS, production smoke.

---

## 2. Frozen contracts (verified by review)

| Contract | Status |
|----------|--------|
| Route `/app/accounts-finance/reports/site-ledger` | Preserved (`navConfig.js`) |
| Views `overview \| sites \| site \| config \| entry \| reports` | Preserved (`SL_VALID_VIEWS`) |
| `loadLedgerStore` | Preserved |
| `savePeriodRecord` | Preserved |
| `saveSiteSetupChanges` | Preserved |
| `replace_period_entry_lines` / `replace_site_structure` | Retained in Phase 3 migration |
| Fire/Safety `filterSitesByFinancePlAccess` | Preserved + unit tested |
| Financial formulas (revenue / expense+spreads / profit / margin) | Unchanged; recon tests green |
| Feature flags default | **Both OFF** |

---

## 3. Database migration review

| Artifact | Assessment |
|----------|------------|
| `supabase/migrations/20261127140000_finance_period_concurrency_atomic.sql` | **Additive only** — revision columns `IF NOT EXISTS`, new table, new RPCs; no amount rewrites; no drops of finance fact tables |
| `…atomic.rollback.sql` | Drops new RPCs + `period_save_requests`; revision columns **kept** by default (optional drop commented) |
| Audit recovery migration | **Not in repo as applied migration** — draft only (see §7 / `PNL_AUDIT_RECOVERY_GAP.md`) |

**Production apply count for this RC:** **0**  
**Staging apply count for this RC:** **0** (blocked)

---

## 4. Staging deployment package

See: [`PNL_STAGING_DEPLOYMENT_PACKAGE.md`](./PNL_STAGING_DEPLOYMENT_PACKAGE.md)

Includes identity gates, env template, migration order, validator command, flag policy (stay OFF until authorized).

---

## 5. UAT and scenario packs

| Doc | Purpose |
|-----|---------|
| [`PNL_UAT_CHECKLIST.md`](./PNL_UAT_CHECKLIST.md) | Desktop + tablet browser acceptance |
| [`PNL_STAGING_TEST_SCENARIOS.md`](./PNL_STAGING_TEST_SCENARIOS.md) | Failed saves, concurrency, stale revision, drafts, historical integrity |

---

## 6. Known limitations

1. No approved staging project — Phase 3.1 remote gate still **BLOCKED**.
2. Atomic OCC / idempotency proven on **PGlite**, not production-shaped Supabase.
3. Spreads/budgets remain multi-round-trip outside structure OCC RPC.
4. Server-side versioned audit/recovery not shipped — client `_audit` meta + activity enqueue only.
5. Browser UAT not yet executed against this RC.
6. Load/performance soak with very large portfolios not automated.
7. Working tree may contain uncommitted redesign files relative to last push — tag/commit before staging deploy.

---

## 7. Staging prerequisites (must all be true)

1. Dedicated **non-prod** Supabase project approved (≠ `wbyzhknaqcjqqtwopupl`, ≠ retired `xjzhlbpgnpcmbdlufhwo`).
2. Local `.env.server.staging` with `STAGING_*` + `PHASE31_CONFIRM_REF` + `STAGING_ENV_CLASS` (never commit secrets).
3. `phase31-staging-validate.mjs` prints `Identity OK`.
4. Representative anonymized finance data loaded.
5. Explicit authorization to apply Phase 3 migration on that project only.
6. Flags remain OFF until separate staging QA authorization.

---

## 8. UAT acceptance criteria (minimum)

UAT **PASS** only if all are checked on staging (or staging-pointed preview):

- [ ] All Site Ledger nav views load without console-breaking errors
- [ ] Fire-only / Safety-only users see scoped sites only
- [ ] Figures save (legacy path, flags OFF) persists and reloads correctly
- [ ] Site Setup save with change summary; structure remove does not wipe historical line amounts
- [ ] Reports/export numbers match on-screen P&L for sampled sites/periods
- [ ] Desktop (≥1280px) and tablet (~768–1024px) layouts usable for Overview, Sites, Figures, Setup
- [ ] Failed-save / draft / concurrent scenarios from scenario pack executed with recorded outcomes
- [ ] No production credentials used; flags still OFF

---

## 9. Related documents

- `PNL_LOCAL_REDESIGN_IMPLEMENTATION_REPORT.md`
- `PNL_FINAL_PRODUCTION_READINESS.md`
- `PNL_PHASE3_1_STAGING_VALIDATION.md` / `PNL_PHASE3_1_STAGING_PREP.md`
- `PNL_AUDIT_RECOVERY_GAP.md`

**Next authorized action:** provision approved staging → apply Phase 3 migration → run validator + scenario pack → UAT sign-off.  
**Not authorized:** production migration, production flags, Phase 4+ feature work under this freeze.
