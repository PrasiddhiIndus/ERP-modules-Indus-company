# UI Retheme Report — INDUS OS subtle palette

**Date:** 2026-08-01  
**Scope:** Presentation layer only (CSS variables, Tailwind theme, class/style colour props, chart palettes, auth chrome).  
**Branch context:** applied on current working tree.

---

## Deliverables

| Item | Path | Status |
|------|------|--------|
| Token CSS | `src/theme/tokens.css` | Done |
| Token JS | `src/theme/tokens.js` | Done |
| Tailwind mapping | `tailwind.config.js` | Done |
| Global base / tables / auth CSS | `src/index.css` | Done |
| Fonts | `index.html` → IBM Plex Sans + Mono | Done |
| Theme guide | `THEME.md` | Done |
| This report | `UI-RETHEME-REPORT.md` | Done |

---

## Approach

1. Introduced a single token layer (CSS + JS) and remapped Tailwind default palettes (`red`/`blue`/`green`/`amber`/`gray`/`slate`/…) onto desaturated semantic tokens so existing utilities stop rendering bright chrome.
2. Rebuilt auth visual shell (Login + Forgot / Reset / Register) to the §3 split layout without changing auth handlers.
3. Updated shared shell (`Layout.jsx`, `AdminUi.jsx`) and chart/status maps to `CHART_SERIES` / `TOKENS`.
4. Ran mechanical hex → token remappers across `src/`, then mopped navy leftovers and finance CSS vars.
5. Preserved local dark remaps via `[data-theme="dark"]` / `.theme-dark` in `tokens.css`; print media forces white surfaces.

---

## Route / module checklist

Status key: **Done** = renders on new palette via tokens and/or remapped utilities. **Partial** = interactive UI done; PDF/print HTML still holds literal colours (see remaining hits).

| Area | Status | Notes |
|------|--------|-------|
| Auth — Login | Done | §3 split: 46% brand panel, 400px card, soft alerts |
| Auth — Forgot / Reset / Register | Done | Same visual language |
| App shell / sidebar / access denied | Done | `Layout.jsx` accent rail, sunken rail |
| Dashboard / Command centre | Done | Charts → `CHART_SERIES` |
| HR / attendance / leave / payroll UI | Done | Register marks via `TOKENS`; salary admin mopped |
| Compliance | Done | Via remapped utilities + shared chrome |
| Admin Ops / store / gate / PPE | Done | AdminUi primitives + pages |
| Commercial (MT & RM) | Done | Contact log / PO entry chrome |
| Marketing | Done | Product catalog + dashboards |
| Maintenance | Done | Product catalog + trackers |
| Billing (screens) | Done | Create invoice chrome |
| Billing (invoice HTML preview) | Partial | See remaining hex — print letterhead |
| Operations / Dahej | Done | Charts + grids |
| Projects / enquiry / quotation UI | Done | Status styles + dashboards |
| Projects quotation print | Partial | Print CSS/JS literals retained for print fidelity |
| Procurement / store | Done | |
| Finance / Site Ledger | Done | Local CSS vars aliased to global tokens |
| API monitoring | Done | Charts use theme vars; dark toggle remapped |
| Settings / users / 403 shell | Done | Access-denied card restyled |
| Cross-cutting components | Done | List tables inherit shell table CSS |

Every authenticated route inherits `main.erp-app-shell` table/scrollbar theming and remapped Tailwind colours. No routes were added, removed, or renamed.

---

## Remaining hard-coded colour hits (outside token layer)

**Target for interactive UI: zero.** Remaining literals are print/PDF surfaces deliberately left with concrete colours so jsPDF / print HTML keep working without CSS variable resolution:

| File | ~Hits | Reason left alone |
|------|------:|-------------------|
| `src/pages/billing/components/InvoiceHtmlPreview.jsx` | ~114 | Standalone invoice HTML/PDF preview; needs absolute colours for print |
| `src/pages/projects/quotation/quotationPrint.css` | 4 | Print stylesheet |
| `src/pages/projects/quotation/quotationPrint.js` | 3 | Print/PDF popup HTML |
| `src/lib/exportNodeToPdf.js` | 2 | Canvas/PDF export defaults |
| `src/utils/taxInvoicePdf.js` | 1 | Tax invoice PDF |

**Follow-up (optional):** migrate those files to `PDF_RGB` / `TOKENS` from `src/theme/tokens.js` so hex lives only in the token module while PDF still receives concrete RGB.

Canonical hex **allowed** only in:

- `src/theme/tokens.css`
- `src/theme/tokens.js`

---

## Judgement calls

| Topic | Decision |
|-------|----------|
| Legacy `bg-red-600` CTAs | Remapped Tailwind `red` scale → critical/soft tones; primary actions should prefer `bg-accent` / `.erp-btn-primary`. Nav active states explicitly use accent-soft, not critical. |
| Brand `indus-red` / `erp-accent` | Aliased to `--accent` / `--accent-deep` (sage), not retained as bright red. |
| Auth metrics grid / gradient bar | Removed from Login chrome per §3 (restrained brand panel). Rotating live stats retained as mono caption. |
| Attendance mark fills | Kept distinct semantic hues via `TOKENS` / `CHART_SERIES` so marks stay distinguishable; no bright Tailwind greens/reds. |
| Finance “green” token that was historically red | Remapped to palette accent/success via Site Ledger CSS var aliases. |
| Decorative gradients | Removed from auth and major salary/dashboard chrome; remapped utilities no longer produce saturated gradient headers. |
| PDF / invoice letterhead | Left with literals (see above) to avoid breaking print colour resolution. |

---

## Deliberately untouched (would risk logic or non-UI contracts)

- Controllers, services, Supabase RPCs, migrations, permissions, payroll calculations, workflow/SLA rules.
- Route paths, menu structure, column sets, filters, actions, payload shapes.
- Login / OTP / session handlers — only classNames and layout chrome changed.
- `pizzip` unresolved build warning — pre-existing dependency resolution issue, unrelated to theme.
- Email template server content (if any outside `src/`) — not present as a front-end colour island in this pass.

---

## Accessibility

- Body/primary text uses `--text` on `--canvas` / `--surface` (≥ 4.5:1 intent).
- Meta uses `--text-muted` / `--text-secondary` (≥ 4.0:1 intent).
- Borders use `--border` / `--border-strong` for non-text contrast.
- Focus ring restored globally via `:focus-visible` and `.erp-input` / auth inputs.
- Status chips keep text labels; severity is soft fill + foreground (not colour-only).

---

## How to extend

See `THEME.md`. New UI must use token utilities or `TOKENS` / `CHART_SERIES`. Do not add hex literals in pages.

Mechanical helpers (optional, already used):

- `scripts/retheme-hex-to-tokens.mjs`
- `scripts/fix-tailwind-var-classes.mjs`
