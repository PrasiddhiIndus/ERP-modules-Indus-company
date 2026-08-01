# FONT-ROLLOUT-REPORT

**Date:** 2026-08-01  
**Scope:** Typography only (families, sizes, weights, tracking, transforms, numeric features). No colour, spacing, layout, API, or copy changes.

---

## Deliverables

| Item | Status |
|------|--------|
| Self-hosted WOFF2 (Sans 400/500/600 + Mono 400/500, latin + latin-ext) | `public/fonts/` |
| `@font-face` + scale utilities | `src/theme/typography.css` |
| Global base / tables / auth / print | `src/index.css` |
| Tailwind font aliases | `tailwind.config.js` |
| Preload (no Google Fonts) | `index.html` |
| Guide | `TYPOGRAPHY.md` |
| This report | `FONT-ROLLOUT-REPORT.md` |

---

## Route / surface checklist

| Area | Status | Notes |
|------|--------|-------|
| Global app shell | Done | `html`/`body` → `--font-sans`; table headers → mono-caption; numeric cells → mono + tabular-nums |
| Sidebar / nav (`Layout.jsx`) | Done | Section captions `type-mono-micro`; labels `type-body-medium` / `type-meta`; truncate |
| Dashboard / Command Center | Done | KPI `type-figure`; badges `type-mono-caption`; actions/alerts typed |
| Auth (Login + related) | Done | Brand `type-display`; tagline `type-mono-micro`; card `type-section-title`; labels mono-caption; OTP Mono 20; footer mono-micro |
| AdminUi primitives | Done | Page/card titles, KPI figures |
| Finance module | Done | Segoe/Cascadia stacks → `--font-sans` / `--font-mono`; KPIs mono |
| Marketing / Maintenance dashboards | Done | Rupee icon Arial → `--font-sans` |
| Billing invoice HTML preview | Done | Times/Courier → sans/mono tokens |
| Quotation print | Done | Times → sans; preview CSS uses token stacks |
| HR / Attendance / Payroll / Compliance / Admin / Commercial / Ops / Projects / Procurement / Settings | Done | Inherit global shell + remapped `font-sans`/`font-mono`; tables via `erp-app-shell` |

Every authenticated route under `main.erp-app-shell` inherits table/header/numeric typography. Auth screens use `.login-page` rules.

---

## Remaining hard-coded font declarations

**Target for interactive UI: zero alternate families.**

| Location | Finding |
|----------|---------|
| `src/pages/maintenance/utils/pdfTextSanitize.js` | Comments only mentioning Helvetica WinAnsi sanitisation — no font load |
| `src/pages/marketing/utils/pdfTextSanitize.js` | Same |
| jsPDF default built-in faces | PDF generators that call jsPDF without embedding custom fonts still use library defaults at draw time; screen/HTML preview uses tokens. Embedding WOFF into jsPDF is a follow-up if binary PDF output must match exactly offline |

No Google Fonts `<link>` remains. No Inter / Montserrat / Segoe / Arial brand stacks remain in UI code.

---

## Judgement calls

| Topic | Decision |
|-------|----------|
| Rupee `₹` glyph helpers | Kept as span; family switched from Arial to `--font-sans` (Plex includes the glyph in the loaded subsets / fallback). |
| Auth brand size | Spec `display` 28/600 for auth brand name (was 22) — applied; line-height 1.2 to limit reflow. |
| Nav section captions | `mono-micro` (9 / uppercase) per scale — smaller than previous 10px semibold sans. |
| Finance labels that were title-case 12px | Mapped to mono-caption uppercase via CSS only (stored strings unchanged). |
| Quotation print | Replaced Times New Roman with `--font-sans` / mono for numbers to meet “only two families”; legal letterhead look shifts from serif to Plex. |
| Screen floor vs mono-caption/micro | Spec scale explicitly defines 9–9.5px mono tokens for badges/captions; sans prose floor remains 11.5px (`meta`). |
| `p { max-width: 76ch }` | Not applied globally (would reflow cards); use `.type-prose` for long-form help copy only. |

---

## Deliberately untouched

- Backend, APIs, models, validation, permissions, calculations, state.
- Routes, menu structure, copy strings (uppercase is CSS-only).
- Colour, padding, margin, radius, shadow, component structure.
- jsPDF binary font embedding (would require bundling font binaries into PDF pipeline beyond CSS).

---

## Verification

- Fonts load from `/fonts/*.woff2` with `font-display: swap`.
- Offline / air-gapped: no fonts.googleapis / fonts.gstatic requests.
- Italics suppressed globally for `i`, `em`, `.italic`, `.font-italic`.
- Tabular nums on `.tabular-nums`, `.kpi-value`, `.type-figure*`, `.type-num`, numeric table cells.
