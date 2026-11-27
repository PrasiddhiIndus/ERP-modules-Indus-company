# P&L / Site Ledger — Production Readiness Checklist

**Date:** 2026-11-27  
**RC:** `PNL-RC-2026-11-27`  
**Active strategy:** **Production UI-only release** (no backend migration)  
**Phase 3 / flags:** Remain **OFF** and **not** part of this production cut  
**Overall UI-only status:** **COMPATIBILITY PASS** — deploy not authorized until ops approval  
**Primary report:** [`PNL_PRODUCTION_UI_ONLY_COMPATIBILITY_REPORT.md`](./PNL_PRODUCTION_UI_ONLY_COMPATIBILITY_REPORT.md)

---

## Verdict

| Track | Status |
|-------|--------|
| **A. Production UI modernization** | Compatibility **PASS**; awaiting **explicit deploy authorization** |
| **B. Phase 3 schema + atomic flags** | **Deferred** — not required for UI-only; staging/Phase 3.1 remains separate |

Do **not** apply production migrations. Do **not** enable `explicitFigureSave` or `atomicConcurrency`.

---

## Checklist (UI-only)

| # | Gate | Status |
|---|------|--------|
| 1 | RC redesign frozen | Yes |
| 2 | Production Vite build | **PASS** (9.87s this session) |
| 3 | Local regression (203) | **PASS** |
| 4 | Flags default OFF in build | **PASS** |
| 5 | Legacy save path with flags OFF | **PASS** (code + tests) |
| 6 | No DB objects required for UI path | **PASS** |
| 7 | Deploy/rollback plan documented | **PASS** (compatibility report §6–7) |
| 8 | Production migration apply | **0 — forbidden for this release** |
| 9 | Browser smoke on production URL | **Pending** post-deploy authorization |
| 10 | Explicit production frontend deploy approval | **NOT GRANTED YET** |

---

## Preserved production backend contracts

`loadLedgerStore` · `savePeriodRecord` (autosave + `replace_period_entry_lines`) · `saveSiteSetupChanges` (diff / legacy structure) · Fire/Safety UI filter · existing routes · formulas unchanged
