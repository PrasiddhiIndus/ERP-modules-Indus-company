# Incident: P&L components disappearing from sites + misleading activity log (Finance · Site Ledger)

Date of fix: 2026-11-23 · Branch: `commercial` (uncommitted) · Scope: Finance → Site Ledger only (Site Setup, Enter Figures persistence) plus the shared activity-log interceptor.

## 1. Root cause

Site Setup was **autosaved from each browser tab's own in-memory copy of the ledger, using full-replace writes**. That copy was loaded once and never refreshed with other users' changes, so any later save from that tab overwrote the database with what the tab *thought* was there.

| # | Cause | Effect |
|---|-------|--------|
| RC1 | `displayStructure()` rebuilt a site's components only for parent heads listed in the tab's `PARENTS`. Groups under a parent the tab did not know about (one added by another user, a deactivated parent, a legacy key) were dropped. Every drag, remove, add or exclude on that site then saved the shortened list. | Whole groups of components vanished from a site on an unrelated edit, with no warning. |
| RC2 | Saves used `finance.replace_site_structure` (delete every component of the site, insert the tab's list). Spreads and budget versions not in the tab's list were deleted too. Saves were autosaved: 400 ms debounce, immediate on drag, and flushed when the browser tab was hidden or closed. | A tab opened before user B's change silently removed B's components, spreads or budget versions the next time anyone touched that site from it, often without clicking anything. |
| RC3 | (Mostly fixed on 22 Nov in `888f6c2`; still running in **already-open tabs** until they refresh.) A portfolio-wide autosave rewrote every site's structure, and head sync pruned every cost line missing from the tab's library. The prune (`detachChildHead`) also deleted that cost line's figures (`expense_entry_lines`), budget lines and spreads **on every site**. | Mass component loss across sites and possible loss of entered figures. |
| RC4 | `normalize()` invented default components for any site with no component rows in the database. | Sites looked configured when they were empty, and a save wrote the invented defaults over the real setup. |
| RC5 | Leaving the "new cost line" name empty (blur or Esc) removed the line from the site and saved immediately. | Accidental removals. |
| RC6 | Many saves (including a figure save that found a missing head) re-upserted **every** parent head, child head and revenue head from the tab's copy. | Other users' renames were reverted, and the activity log filled with "updated expense child head …" rows the user never made. |
| RC7 | The activity log marks a write as `user` if there was any click or keypress in the previous **120 s**. Debounced and background saves that run soon after a click were logged as the user's own action. | Logs showed users "updating" things they never touched. |

The actor on each log row was technically right: the request was sent with that person's login, from their open tab. What was misleading was that the tab acted on its own, from stale data.

## 2. Fixes implemented

**Site Setup: explicit save, diff-based** (`SiteLedgerApp.jsx`, `api/siteLedgerStore.js`, new `api/siteSetupDiff.js`)
- No autosave. Edits stay on screen, marked "Unsaved changes", until **Save changes**. **Discard** reloads from the database. A browser "leave page?" warning appears while edits are unsaved. Nothing is written when the tab is hidden or closed.
- Before saving, any removal (components, spreads, budget versions, library lines, parent heads) is listed in a confirmation dialog.
- A save sends only the **difference** from the copy the tab loaded (`baselineRef`):
  - New components are inserted.
  - Moved or reordered components are updated with UPDATE only, so a row another user removed is never re-created.
  - Removed components are deleted individually.
  - Changed spreads and budgets are written one by one.
  - Site columns are written only if they changed.
  - Anything the tab never saw is never touched. `replace_site_structure` is no longer used for existing sites.
- Heads are written only when they are new or actually edited. A library line or parent head is deleted only if **nothing anywhere** still references it (structure, figures, budget lines, spreads). Otherwise it is kept and the user is told.
- After a save the ledger reloads, so the screen and the new baseline include other users' changes.
- Save is blocked if the ledger failed to load. The old full-portfolio, `masters`, `sites` and `records` rewrite paths were removed.
- Modal actions (add/edit/renew site, activate/deactivate, budget modal Save, spread add/delete in Enter Figures) are explicit, so they save straight away through the same diff path and confirmation.
- `displayStructure()` keeps groups under unknown parents. On load, deactivated heads that are still used stay visible. Empty sites show a warning instead of invented defaults.

**Figures (Enter Figures)**
- A figure save never creates or rewrites a site, its structure or heads. It creates only a genuinely missing head.
- All Site Ledger writes run through one serialized queue. A debounced figure save that was never settled no longer hangs.

**Activity log** (`src/lib/supabase.js`, store)
- Every Site Ledger write carries a local-only `x-erp-activity` context: `{trigger: user|automatic, action, batch}`. The header is stripped before the request leaves the browser. The log stores `trigger` (declared, not guessed), `trigger_source`, `action_context` (`site_setup_save`, `figure_save`, `figure_autosave`, `figure_flush_on_leave`, `site_delete`) and one `batch_id` per Save.
- Flushes when the user leaves the page are logged as **automatic**. Saves and typing are logged as **user**.
- No-op head re-writes are gone, so the flood of false "updated" rows stops.

**Database migration** `20261123150000_finance_site_ledger_change_history_guard.sql` (rollback in `supabase/rollbacks/`)
- `finance.ledger_change_history`: before/after rows for sites, structure, heads, spreads and budget versions. The actor comes from the JWT (`auth.uid()`), and writes without one are marked `system`. It is readable by finance admins only.
- `finance.replace_site_structure` is now **non-destructive**. A tab still running the old bundle gets "This page is out of date… reload" instead of wiping components.

## 3. Affected sites / restored components / unrecoverable data

I had no production database access (only the public key; no service key, no SQL client). Production data was **not** read or modified. The lists come from the scripts in `supabase/recovery/finance_pl_2026-11-23/`, which a finance admin runs in the Supabase SQL editor **in this order**:

1. `01_backup.sql`: copies every finance ledger table and the finance activity-log rows into schema `finance_backup_20261123` and prints a count check. Also note the Supabase platform backup / PITR window.
2. `02_investigate.sql` (read-only):
   - **Q1** missing components per site with evidence and a confidence of `restore` / `review` / `skip`.
   - **Q2** affected-sites summary.
   - **Q3/Q3b** per-site structure-save timeline from the activity log, showing who and when components dropped and whether it was automatic.
   - **Q4** destructive deletes (figures, budget lines, spreads removed by the old prune).
   - **Q5** inactive heads that still have figures.
   - **Q6/Q7** misleading bulk "updated" entries per user.
3. `03_restore_preview.sql`: exactly what would be restored.
4. `04_restore_apply.sql`: inserts only the missing component rows with `restore` confidence (`ON CONFLICT DO NOTHING`), logs each one to `finance_backup_20261123.restore_log`, and includes undo SQL.
   - No figures, budgets, spreads, sites or existing components are changed. No values are invented: the parent is the line's own master parent and the position is appended.

**Recoverable:** component membership wherever the site still has figures, budget lines or spreads for that cost line.

**Not recoverable from the database alone:**
- The original display order of restored components.
- Components that were removed and never had a figure, budget or spread (the activity log kept only a component *count* per save; Q3 shows where and when).
- Figures, budget lines and spreads deleted by the old prune (Q4). Those values exist only in a Supabase platform backup or PITR restored to a separate project. They must not be retyped from memory.

The `review` rows (only older figures; possibly removed on purpose) need a finance decision per site.

### Results so far (production, 2026-11-23)

**Restored by `04_restore_apply.sql`** (logged in `finance_backup_20261123.restore_log`). The only evidence for all three is that the site's latest budget still has an amount for the line. None of them has entered figures or a spread. **Confirmed correct and kept (2026-11-23).**

| Site | Component | Parent head | Evidence |
|------|-----------|-------------|----------|
| BPCL Bina (`bpcl-bina`) | Penalty (`bpcl-bina_penalty`, site-specific) | adminMisc | In latest budget; site's last month 2026-10 |
| OPAL (`opal`) | Bonus (`bonus`) | salaryCost | In latest budget; site's last month 2026-07 |
| OPAL (`opal`) | Housekeeping salary & material (`housekeeping`) | empBenefit | In latest budget; site's last month 2026-07 |

No component with recent figures or a spread was missing from any site's setup.

**Q7: misleading activity entries (bulk head re-writes and automatic writes)**

| User | Logged as user | Logged as automatic | Head re-writes | Structure replaces |
|------|---------------:|--------------------:|---------------:|-------------------:|
| latha@indusfire.com | 257 | 26 | **2,613** | 324 |
| amitp.ifspl@gmail.com | 1,017 | **2,434** | 0 | 1,213 |
| businessanalyticsifspl@gmail.com | 145 | **863** | 0 | 350 |
| ba.sarathnair@gmail.com | 158 | 61 | 0 | 78 |
| aruntk@indusfire.com | 0 | 0 | 12 | 0 |

The 2,613 "updated cost head" entries under latha@ and the 12 under aruntk@ are side-effects of the old code re-writing every head on each save. They are not head edits those users made.

Still to collect: Q1 (the `review` / `skip` rows), Q2, Q3b and Q4.

## 4. Activity-log corrections

- Historical rows are append-only by design (the `erp_activity_log` integrity migration) and were **not edited**. Q3, Q6 and Q7 identify which historical entries were bulk or automatic side-effects rather than the user's own action. The backup schema holds a copy for the record.
- From deployment onward, entries record a declared trigger and action, plus a single batch per Save. Database-level history records the real actor per row.

## 5. Verification

- `tests/siteLedgerSetupSave.test.js` (14 tests) runs the real store against an in-memory database (`tests/helpers/fakeFinanceDb.js`):
  - two-tab concurrent edits: a stale tab's removal does not wipe another user's added component; a stale tab's site-details edit keeps a spread another user added; a stale tab's reorder does not re-create a component another user removed;
  - removing a library line still used elsewhere keeps it;
  - no-change saves write nothing;
  - components survive reload and a later unrelated save;
  - new-site creation;
  - Save blocked without a baseline;
  - audit tags: Save = user with one batch id; leave-page flush = automatic; figure Save = user and never touches setup tables.
- The existing `tests/siteLedgerPeriodSave.test.js` passes, and `vite build` compiles.
- The full suite has 46 failures, all in payroll, appointment-letter and IEV tests (ESIC and salary numbers). None import finance code, and those that use Supabase mock it. They are likely caused by the other uncommitted payroll edits in the working tree.
- **Not yet verified:** the UI in a signed-in browser, and the migration and recovery SQL against the real database.

## 6. Deployment steps

1. Run `01_backup.sql`.
2. Apply migration `20261123150000_…`.
3. Deploy the frontend.
4. Ask every Finance user to hard-refresh (Ctrl+F5) or close old tabs: old tabs still run the old code until then.
5. Run `02`, then review `03`, then run `04`.

## 7. Remaining risks / follow-ups

- Enter Figures still autosaves figures while typing (now labelled correctly). Two people editing the **same site-month** at the same time is still last-writer-wins for that month.
- The Finance "Expense Heads" master page still uses `safeDeleteChildHead`, which deletes a head's figures on all sites. It was left unchanged because it is out of scope.
