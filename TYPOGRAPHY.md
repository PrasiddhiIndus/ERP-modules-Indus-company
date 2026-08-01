# INDUS OS Typography

Two-family system only. Colours, spacing, and layout are out of scope here — see `THEME.md` for the palette.

## Families

| Role | CSS variable | Stack | Weights |
|------|--------------|-------|---------|
| Language / UI | `--font-sans` | IBM Plex Sans → ui-sans-serif → system-ui → sans-serif | 400, 500, 600 |
| Data / codes | `--font-mono` | IBM Plex Mono → ui-monospace → SFMono-Regular → monospace | 400, 500 |

**Self-hosted** WOFF2 files live in `/public/fonts/` (latin + latin-ext). Loaded via `@font-face` in `src/theme/typography.css` with `font-display: swap`. Preload the two 400-weight latin files from `index.html`.

No Google Fonts runtime requests. No italics — emphasis is weight or colour (`i` / `em` / `.italic` forced to `font-style: normal`).

---

## Which family where

**Mono** — figures, identifiers, dates/times, status badges/chips, uppercase table headers and field labels, chart axis labels, pagination, OTP, code/audit/log output, version/env footers.

**Sans** — page/card titles, nav labels, body copy, descriptions, table text cells, form helper text, buttons, menus, tooltips, toasts, empty states, modal prose.

Never mix families inside one word or number. Amount cells are mono including the currency symbol; a prose sentence that contains a number stays sans.

---

## Scale tokens (§3)

Use the `.type-*` utility classes (preferred) or matching Tailwind `text-*` / `font-*` aliases.

| Token | Class | Family / size / weight | Tracking | Use |
|-------|-------|------------------------|----------|-----|
| display | `.type-display` | Sans 28 / 600 | -0.01em | Auth brand headings |
| page-title | `.type-page-title` | Sans 22 / 600 | -0.01em | Page H1 |
| section-title | `.type-section-title` | Sans 18 / 600 | 0 | Modal / major sub-section |
| card-title | `.type-card-title` | Sans 14 / 600 | 0 | Card / panel headers |
| caption | `.type-caption` | Sans 12 / 600 UPPERCASE | 0.06em | Group headings |
| body | `.type-body` | Sans 13 / 400 | 0 | Default UI |
| body-medium | `.type-body-medium` | Sans 13 / 500 | 0 | Nav labels, primary buttons |
| table-cell | `.type-table-cell` | Sans 12.5 / 400 | 0 | Table / list text |
| meta | `.type-meta` | Sans 11.5 / 400 | 0 | Helpers, sub-labels |
| figure-lg | `.type-figure-lg` | Mono 28 / 400 | 0 | Hero KPI |
| figure | `.type-figure` | Mono 21 / 400 | 0 | Card KPI |
| num | `.type-num` | Mono 12.5 / 400 | 0 | Numeric table cells |
| code-meta | `.type-code-meta` | Mono 10.5 / 400 | 0 | Refs / dates in rows |
| mono-caption | `.type-mono-caption` | Mono 9.5 / 500 UPPERCASE | 0.10em | Headers, badges, field labels |
| mono-micro | `.type-mono-micro` | Mono 9 / 400 UPPERCASE | 0.12em | Nav section captions, footers |

Line heights: prose 1.62 (`.type-prose`) · UI 1.45 · titles/figures 1.2 · badges 1.0.

Uppercase via CSS `text-transform` only — never mutate stored strings.

---

## Numeric / rendering rules

- `font-variant-numeric: tabular-nums` on every numeric column, KPI, and mono string.
- `font-feature-settings: "liga" 1` by default; `"liga" 0` via `.type-code` / `.type-log` / `.type-audit` / `[data-font-liga='0']`.
- Right-align numeric columns; left-align text; centre badge columns only.
- Body: `-webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility`.
- `text-wrap: pretty` on paragraphs and multi-line cells; `text-wrap: balance` on titles.
- Single-line labels: `.type-truncate` (`ellipsis`).

---

## Files

| Path | Role |
|------|------|
| `public/fonts/*.woff2` | Self-hosted faces |
| `src/theme/typography.css` | `@font-face` + scale utilities |
| `src/index.css` | Global base, tables, auth, print |
| `tailwind.config.js` | `fontFamily` / `fontSize` aliases |
| `index.html` | Preload 400-weight latin files |

---

## Adding new UI

1. Pick a §3 token — do not invent sizes or families.
2. Data → mono token; language → sans token.
3. Floor: do not ship sans body below `meta` (11.5px). Mono caption/micro tokens are the only intentional exceptions for badges and nav captions.
4. Print: sans 10.5–12pt body, mono for figures/ids, headings 14–18pt, never below 12pt intent for prose.
5. Email templates (if any): stack `IBM Plex Sans, Helvetica, Arial, sans-serif` / `IBM Plex Mono, monospace` — clients cannot self-host.

Do not hard-code `font-family`, `font-size`, or tracking outside these tokens.
