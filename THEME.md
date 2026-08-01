# INDUS OS Design Theme

Single source of truth for presentation colors, typography, and component chrome across the ERP web app.

**Hard rule:** application UI must consume tokens — never introduce new hard-coded hex/rgb colors in pages or components. Put new values in `src/theme/tokens.css` + `src/theme/tokens.js` first.

---

## Token files

| File | Role |
|------|------|
| `src/theme/tokens.css` | CSS custom properties (`:root`, dark remap, print) |
| `src/theme/tokens.js` | JS exports (`TOKENS`, `CHART_SERIES`, `STATUS_TONES`, `PDF_RGB`) |
| `tailwind.config.js` | Maps utilities onto CSS variables; remaps legacy `red`/`blue`/`green` scales |
| `src/index.css` | Global base, table shell, auth, component helper classes |

Import path for JS: `import { TOKENS, CHART_SERIES } from '../theme/tokens'` (adjust relative depth).

---

## Neutrals / surfaces

| Token | Hex | Use |
|-------|-----|-----|
| `--canvas` | `#F5F7FA` | App background + navbar (cool blue-white) |
| `--surface` | `#F8FAFC` | Cards, tables, modals (near canvas, not stark white) |
| `--surface-raised` | `#F5F7FA` | Card headers / toolbars (matches canvas) |
| `--surface-sunken` | `#E8EEF5` | Table headers, disabled fields |
| `--border` | `#C5CED9` | Card and input outlines |
| `--border-strong` | `#AEB8C6` | Rail edge, active input |
| `--divider` | `#DDE3EB` | Row separators |

Text / accent are contrast-bumped (`--text` `#12151A`, `--accent` `#3D5C56`).

Tailwind: `bg-canvas`, `bg-surface`, `bg-surface-raised`, `bg-surface-sunken`, `border-border`, `border-border-strong`, `border-divider`.

---

## Text

| Token | Hex | Use |
|-------|-----|-----|
| `--text` | `#1F2320` | Headings, primary cells |
| `--text-strong` | `#24271F` | Nav labels, emphasis |
| `--text-secondary` | `#5A5F57` | Body copy |
| `--text-muted` | `#6B7068` | Meta, placeholders |
| `--text-caption` | `#5D6259` | Uppercase mono captions |
| `--text-disabled` | `#A2A69B` | Disabled / empty dashes |

Tailwind: `text-ink`, `text-ink-strong`, `text-ink-secondary`, `text-ink-muted`, `text-ink-caption`, `text-ink-disabled`.

---

## Accent

| Token | Hex | Use |
|-------|-----|-----|
| `--accent` | `#4A6B63` | Primary buttons, links, focus, active rail, chart-1 |
| `--accent-deep` | `#3F5C55` | Brand mark, primary hover |
| `--accent-soft` | `#ECF1EA` | Success/live chips, selected row |
| `--accent-border` | `#D6DFD8` | Selected/active borders |

---

## Semantic (desaturated)

| Token | Hex | Soft bg | Use |
|-------|-----|---------|-----|
| `--critical` | `#9C5B4E` | `#F5E9E6` | Critical, overdue, destructive, errors |
| `--warning` | `#8A6A34` | `#F5EEE2` | High priority, due today, pending |
| `--neutral-state` | `#7A7F76` | `#F1F0EB` | Draft, idle, cancelled |
| `--success` | `#5C7355` | `#ECF1EA` | Approved, closed, healthy |
| `--info` | `#4F6480` | `#E9EDF3` | Informational, chart-2 |

Never use bright red / blue / yellow for status. Severity = soft fill + matching foreground + label/icon (not color alone).

---

## Charts

Ordered series only (`CHART_SERIES` / `--chart-1`…`--chart-6`):

`#4A6B63`, `#4F6480`, `#A08046`, `#9C5B4E`, `#7A7F76`, `#5C7355`

- Grid: `--chart-grid` (`#F1F0EB`)
- Axis labels: `--chart-axis` (`#6B7068`)
- Area fill: series color at ~7% opacity
- Inactive bars: `--chart-inactive` (`#DFE4DD`)

---

## Typography

- UI / body: **IBM Plex Sans** 400 / 500 / 600
- Numbers, IDs, codes, dates, badges, captions: **IBM Plex Mono** 400 / 500
- Scale: page title 22/600 · card title 14/600 · section caption 12/600 uppercase 0.06em · body 13/400 · table cell 12.5/400 · meta 11.5/400 · mono caption 9–10.5 uppercase 0.10–0.12em
- `font-variant-numeric: tabular-nums` on KPI figures and numeric columns
- `text-wrap: pretty` on paragraphs and multi-line cells

Helper classes: `.erp-page-title`, `.erp-card-title`, `.erp-section-caption`, `.erp-mono-caption`, `.erp-badge`.

---

## Shape, depth, motion

- Radius: 10px cards/modals (`rounded-card`) · 7px controls (`rounded-control`) · 5px badges (`rounded-badge`) · 50% avatars
- Shadows: `shadow-card`, `shadow-popover`, `shadow-modal` only — no coloured or heavy shadows, **no gradients** on chrome
- Focus: `0 0 0 3px rgba(74,107,99,0.20)` + `border-color: var(--accent)` — never remove focus visibility
- Transitions: 120–160ms ease-out on colour/border/background (`duration-theme`)
- Density: page gutter ~32px · section gap ~28px · card body 22–24px · table cells ~11×16px — tokens `--space-*` / `.erp-card-body` / `.erp-page-stack`

---

## Component contract

### Buttons
- **Primary:** `.erp-btn-primary` / `bg-accent text-surface-raised` · hover `bg-accent-deep`
- **Secondary:** `.erp-btn-secondary` · surface + `border-border-strong` + `text-ink-secondary`
- **Ghost:** transparent · hover `bg-surface-sunken`
- **Destructive:** critical text on `critical-soft` + `critical-border` — never solid red fill
- **Disabled:** `surface-sunken` + `text-disabled`

### Badges / chips
`.erp-badge` + soft semantic pair (`bg-critical-soft text-critical border-critical-border`, etc.) or `STATUS_TONES` from `tokens.js`.

### Inputs
`.erp-input` · surface · border · 7px radius · muted placeholder · sunken when disabled · critical border + mono helper on error.

### Tables (`main.erp-app-shell`)
Header sunken · mono uppercase caption headers · divider row rules · hover `--row-hover` · selected `--accent-soft` · numeric columns mono tabular right-aligned.

### Sidebar / nav
Rail `surface-sunken` · edge `border-strong` · active: surface card + accent-border + 3px accent left rail + `shadow-nav-active` · rows `flex-none` inside scroll rail.

### Tabs
Inactive `text-ink-muted` · active `text-ink` + 2px accent underline — no pill fills.

### Modals / drawers
Surface · 10px radius · divider header/footer · scrim `rgba(31,35,32,0.32)`.

### Alerts
`.erp-alert-critical` / `-warning` / `-success` / `-info` — soft bg + 25% tone border + semantic text.

---

## Adding new UI

1. Pick tokens from this doc — do not invent hexes.
2. Prefer Admin Ops primitives in `src/pages/adminOperations/components/AdminUi.jsx`.
3. Charts: only `CHART_SERIES`.
4. PDF/canvas: `PDF_RGB` / `hexToRgb(TOKENS.*)` from `tokens.js`.
5. Contrast floor: body ≥ 4.5:1 · meta ≥ 4.0:1 · non-text boundaries ≥ 3:1.
6. Never signal state by colour alone.

---

## Dark / print

Local dark toggles (API monitoring / ops) should set `data-theme="dark"` or `.theme-dark` so `tokens.css` remaps surfaces. Print media forces white surfaces and disables elevation shadows.
