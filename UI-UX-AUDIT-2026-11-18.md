# Indus One ERP — UI/UX Audit & Design-System Recommendation

**Date:** 2026-11-18 · **Branch inspected:** `commercial` · **Type:** Audit only. No code, CSS, components, data or workflows were changed.

---

## 0. Scope and method

| What was inspected | How |
|---|---|
| Design foundations | `src/theme/tokens.css`, `tokens.js`, `typography.css`, `tailwind.config.js`, `src/index.css`, `THEME.md`, `TYPOGRAPHY.md`, `UI-RETHEME-REPORT.md` |
| Shared UI kit | `src/components/erpUi/*` (primitives, actions, feedback), `ListTable`, `SortableTableHeader`, `CommandPalette`, date inputs |
| App shell & navigation | `src/contexts/Layout.jsx` (sidebar, top bar, breadcrumbs, overlays), `src/config/roles.js`, route inventory (330 routes, 33 module folders) |
| Module screens | Sampled Dashboard / Company Pulse, Marketing & Maintenance (Enquiry Master, Quotation Tracker), Billing, Sales PO Entry, Finance Site Ledger, Admin Ops |
| Live UI | Ran the frontend locally and reviewed the login screen at desktop and mobile (375 px) widths, in its default dark style |
| Pattern census | Repository-wide counts of class names and component usage (figures below are approximate grep counts across `src/`) |

**Limitation:** the authenticated screens were assessed from source, not visually, because signing in needs your real credentials. If you sign in inside the app's browser pane, a follow-up visual pass (screenshots at desktop, tablet and mobile, light and dark) can confirm or adjust the findings below.

### What is already good (keep it)

- **A real token layer exists.** CSS variables, a Tailwind mapping and a JS export cover surfaces, text, semantic states, charts, radius, shadow and motion. Many ERPs never get this far.
- **The typefaces are professional.** IBM Plex Sans and Mono are self-hosted, and numeric data uses tabular figures.
- **The shell has modern features:** a ⌘K command palette, a collapsible icon rail with hover flyouts, sidebar page search, a dark-mode toggle, breadcrumbs, a lazy-loaded route shell and an activity log drawer.
- **There is one icon family.** `lucide-react` is used in about 330 files; `react-icons` appears in only one.
- **There is one chart library** (Recharts), with a defined `CHART_SERIES` palette.
- **A shared kit is in use.** `erpUi` (PageTaskHeader, KpiTile, FilterBar, DenseTable, Modal, Drawer, EmptyState…) is imported by about 199 of 584 page files.

The main problem is not the absence of a design system. **It is only partly adopted, and several parallel systems still live beside it.** That leaves the ERP feeling like several products stitched together, which is the clearest gap compared with SAP Fiori, Oracle Redwood or Dynamics 365.

---

## 1. Executive summary — top 10 issues

| # | Issue | Priority |
|---|---|---|
| 1 | Two to three visual languages coexist: the token-based "INDUS OS" kit, legacy Tailwind pages (`bg-white shadow`, `text-3xl font-bold`, purple buttons) and a separate dark-glass login | **High** |
| 2 | Brand identity is inconsistent: "INDUS ERP" on login, "INDUS OS / Enterprise ERP" in the shell, "INDUS OS – Enterprise Operations Platform" in the tab, "Indus One ERP" in conversation | **High** |
| 3 | Typography is fragmented: about 2,300 arbitrary `text-[Npx]` sizes (about 80 of them below 9 px), alongside a 15-step official scale that itself goes down to 9 px | **High** |
| 4 | Tables have no common behaviour: about 289 raw `<table>` elements vs about 102 `DenseTable`s, sorting in only 4 files, the shared pager used about 13 times, no shared column chooser, saved views or bulk actions | **High** |
| 5 | Modals and overlays are ad hoc: about 130 hand-built `fixed inset-0` overlays; the shared `Modal` lacks `role="dialog"`, Esc-to-close, focus trap and scroll lock | **High** |
| 6 | Navigation has two sources of truth: the 2,300-line hand-written sidebar JSX vs `NAV_MODULE_TREE` in `roles.js`. URLs are inconsistent, and the module grouping does not match the mental model | **High** |
| 7 | Page structure is inconsistent: 54 pages use legacy bold H1s, about 61 use nested `h-screen` scroll containers inside the shell, and header and action placement differ per module | **Medium-High** |
| 8 | Dark mode is retrofitted: it depends on Tailwind palette remapping, 45 global dark overrides and 99 `!important` rules, with only about 21 explicit `dark:` uses | **Medium** |
| 9 | Loading, empty and error states vary: spinner plus "Loading…" in about 117 files vs skeletons in about 12; empty states differ per page | **Medium** |
| 10 | Duplicated module screens (Marketing vs Maintenance Enquiry / Quotation / Expo / Follow-up) drift apart visually and functionally | **Medium** |

---

## 2. Detailed findings and recommendations

Format: **Issue** → evidence → **Improvement** → priority → reference.

### A. Brand and visual identity

**A1. Product name differs per surface.** — **High**
- Evidence: the login shows "INDUS **ERP** · Enterprise Resource Platform", with "ERP" in green in the header and blue in the card. The sidebar shows "INDUS OS · Enterprise ERP". The browser tab reads "INDUS OS – Enterprise Operations Platform".
- Improvement: choose one name (for example **Indus One**) and one descriptor. Store them in `src/constants/branding.js` and use that everywhere: login, sidebar, tab title, PDFs, emails and favicon.
- Reference: SAP uses one shell-bar product title on every Fiori app; Dynamics 365 shows one app name in its navigation bar.

**A2. The login screen uses a different design language from the app.** — **High**
- Evidence: the login has a dark glass card, a saturated blue "Sign In" button, a red accent underline, a decorative bar-chart strip and a photographic background. The app uses a desaturated sage accent (`--accent #4A6B63`), and THEME.md rules out bright blue and gradients. Users go from a "marketing site" into a "different product".
- Improvement: rebuild the login with the same tokens as the app: an accent-coloured primary button, surface card and IBM Plex type scale. Keep the photo, but behind a neutral scrim. Remove the decorative bar strip, which carries no information.
- Reference: Oracle Redwood and Microsoft Entra sign-in pages are calm and match the brand palette of the product behind them.

**A3. The primary colour is ambiguous.** — **High**
- Evidence: the documented primary is sage (`bg-accent`, about 362 uses). Legacy pages use `bg-purple-600` (48 files), `bg-blue-600` (about 66), `bg-red-600` (about 78) and `bg-green-600` (about 44) as primary CTAs. Because Tailwind palettes are remapped, purple renders as *info* blue-grey and red renders as *critical*. As a result, "Save" or "Add" often looks like an error or an info chip.
- Improvement: there should be one primary action colour (accent). Red should be reserved for destructive actions. Map every CTA to `PrimaryButton`, `SecondaryButton`, `GhostButton` or `DangerButton`.
- Reference: Fluent 2 has exactly one "primary" appearance per view, and SAP Fiori has one "Emphasized" button per page or toolbar.

**A4. Sign Out is styled as a solid critical (red) button in the sidebar footer.** — **Low**
- Improvement: move it into an avatar/profile menu in the top bar along with Profile, Theme, Help and Shortcuts. Sign-out is routine, not dangerous.
- Reference: the SAP shell-bar user menu and the Dynamics 365 "Account manager" flyout.

### B. Navigation and information architecture

**B1. Two sources of truth for navigation.** — **High**
- Evidence: `NAV_MODULE_TREE` in `roles.js` defines modules and pages for access control, while `Layout.jsx` (about 2,334 lines) hard-codes every `NavLink`, icon and flyout by hand. Labels, order and icons can disagree, and adding a page means editing two places.
- Improvement: render the sidebar, command palette, breadcrumbs and mobile menu from **one navigation config** containing label, icon, path, permission key, group and keywords. This is a UI-only refactor; permissions stay as they are.
- Reference: Dynamics 365 model-driven apps generate navigation from the "site map"; SAP uses Launchpad catalog/space definitions.

**B2. The module grouping does not reflect business domains, and the sidebar is long.** — **Medium**
- Evidence: there are 13+ top-level groups ("IN-House HR/Admin", "HR Site", "Site Operations", "FT Costing", "R&M", "AMC Management"…) plus loose top-level links (API Health, Activity history, Settings, User Management). Naming mixes abbreviations (M&M, R&M, FT, IEV) and title styles.
- Improvement:
  1. Group modules into 5–7 domains: **People** (HR, Attendance, Payroll, Compliance), **Commercial** (Enquiry → Quotation → Contract), **Operations** (Sites, Projects, Fire Tender, Fleet), **Supply** (Procurement, Store, Gate), **Finance** (Billing, Ledger, Reports) and **Admin** (Users, Settings, API Health, Audit).
  2. Spell out abbreviations, keeping the short form as a tooltip or keyword.
  3. Use sentence case throughout.
  4. Add a **Favourites / Recent** section at the top of the rail.
- Reference: SAP Fiori Launchpad "Spaces & Pages"; Redwood "Navigator"; Dynamics 365 "Recent / Pinned".

**B3. URL structure is inconsistent.** — **Medium**
- Evidence: Commercial MT routes mix `/app/manpower`, `/app/manpower/quotation` and `/app/commercial/manpower-training/po-entry`.
- Improvement: use a predictable `/app/<domain>/<module>/<page>[/:id]` scheme, with redirects from old paths so bookmarks keep working. Users notice URLs when sharing links and in breadcrumbs.

**B4. The breadcrumb repeats the page title and its first crumb goes to the global dashboard.** — **Medium**
- Evidence: the top bar shows `Eyebrow / Title`, then repeats `Title` in bold underneath. The eyebrow link always goes to `/app/dashboard`, not the module's home.
- Improvement: show the breadcrumb as `Domain / Module / Page`, with each crumb linking to its own level. Show the page title **once**, in the page header (see D1), not in the top bar.

**B5. Small polish items in the shell.** — **Low**
- The mobile menu button is a "☰" text glyph instead of an icon button, so it looks inconsistent with the rest.
- The ⌘K hint is shown on Windows; display "Ctrl K" there.
- One module icon is coloured `text-green-700` while the others use the sidebar accent.
- Several items reuse the same icon (`Calendar` and `CalendarDays` appear four times in HR).
- Improvement: one icon per concept, with an icon map kept in the navigation config.

### C. Top bar, notifications and global actions

**C1. Notifications are fragmented.** — **Medium**
- Evidence: the top bar has `PoApprovalBell`. Other alert components (`AdminLeaveLimitBell`, `AdminPurplePresentBell`) live elsewhere. Projects shows up to three floating popups stacked bottom-right (`z-[900]`).
- Improvement: one **notification centre** (bell plus count) with tabs for *Approvals*, *Alerts* and *System*, plus one toast system for transient messages. Each module registers its items there instead of adding its own popups.
- Reference: the Fiori Launchpad notification panel; Dynamics 365 in-app notifications; the Redwood notification drawer.

**C2. There is no unified approvals inbox.** — **Medium**
- Evidence: approvals (PO sign-off, leave, CN/DN, probation reviews) each sit inside their own module.
- Improvement: add a "My Inbox / Tasks" page that lists every pending approval with consistent Approve / Reject / Open actions. This is the single biggest perceived-quality win in enterprise ERPs.
- Reference: the SAP Fiori "My Inbox" app; the Oracle "Worklist"; Dynamics "Approvals" via Power Automate.

### D. Page layout and structure

**D1. Page headers are inconsistent.** — **High**
- Evidence: there are 54 page files with legacy `<h1 class="text-2xl/3xl font-bold">` and white header cards, against about 83 using `PageTaskHeader` or the `type-page-title` token. Subtitles, action placement (left, right, below) and export buttons vary.
- Improvement: every page uses **one header template**:
  1. Breadcrumb.
  2. Title (22/600) and an optional one-line description.
  3. Status and key metadata.
  4. Right-aligned action group: primary, secondary, overflow "⋯".
  5. Optional tabs row.
- Reference: Fiori **Dynamic Page** header (collapses on scroll); Dynamics 365 form header plus command bar.

**D2. Nested full-height scroll containers.** — **Medium-High**
- Evidence: about 61 page files use `h-screen` inside the shell's already-scrolling `<main>`. That causes double scrollbars, a clipped bottom of the page and sticky headers that stop sticking. Example: Marketing Enquiry Master wraps itself in `w-full h-screen overflow-y-auto`.
- Improvement: the shell owns scrolling. Pages use `PageShell` and grow naturally. Only data grids get an internal scroll area, with a sticky header.

**D3. Very large single-screen forms.** — **Medium**
- Evidence: Site Ledger (about 6.5k lines), Sales PO Entry (about 4.9k), Create Invoice (about 4.8k), Salary Processing (about 3.3k). Large components are a reliable sign of long, dense pages that mix capture, calculation and review.
- Improvement: use an **Object Page** layout. It has a header summary, anchored section navigation (General · Items · Taxes · Terms · Attachments · History) and a **sticky footer action bar** (Save draft · Submit · Cancel) that always shows validation counts. For guided creation (invoice, PO), use a 3–5 step **wizard** with a review step.
- Reference: the Fiori Object Page and Wizard floorplans; Dynamics 365 tabbed forms with a business process flow bar.

**D4. Spacing and density vary.** — **Medium**
- Evidence: page padding varies between `p-2 / p-3 / p-4 / p-6 / px-5 sm:px-8`. Card radius is mostly `rounded-lg` (about 2,549 uses) vs the token `rounded-card` (65) and `rounded-control` (129). Shadows mostly use `shadow-xl/2xl` (about 131) vs `shadow-card` (70).
- Improvement: use a 4-px spacing scale with named layout tokens (page gutter, section gap, card padding). Offer **two density modes** (Comfortable / Compact) as a user preference rather than hard-coding them per page.
- Reference: SAP "Cozy vs Compact" content density; Fluent 2 spacing ramp.

### E. Typography

**E1. Arbitrary font sizes are widespread.** — **High**
- Evidence: about 2,297 `text-[Npx]` classes: `text-[11px]` ×1,427, `text-[10px]` ×592 and **about 81 below 9 px** (9, 8.5, 8, 7.5, 7 px). This sits next to about 6,500 plain `text-xs` / `text-sm` uses and the official `.type-*` scale.
- Improvement: allow only the scale tokens and enforce this with a lint rule (see §5.6). **Minimum 11 px for any UI text and 12 px for table body text.** The current 9 / 9.5 px "mono-caption / mono-micro" tokens should become 11 px.
- Reference: Fluent 2's smallest body text is 12 px (Caption 1). IBM Carbon's smallest is 12 px (`label-01`).

**E2. Overuse of uppercase monospace.** — **Medium**
- Evidence: TYPOGRAPHY.md prescribes uppercase mono for table headers, field labels, badges, pagination and captions. Combined with small sizes, this lowers readability and makes screens look "technical" rather than professional.
- Improvement: use mono **only for data values** (IDs, amounts, dates, codes). Labels and headers should be sans, sentence case, at 12–13 px / 500 weight.
- Reference: SAP, Oracle and Microsoft all use sentence-case sans labels; mono is for code only.

**E3. Heading weights are inconsistent.** — **Low**
- Evidence: `font-bold` appears about 662 times next to the documented 600 weight.
- Improvement: allow only 400, 500 and 600.

### F. Colour and tokens

**F1. Remapping Tailwind palettes hides intent.** — **Medium**
- Evidence: `tailwind.config.js` rewrites `red/rose/pink/fuchsia → critical`, `purple/indigo/violet/sky/cyan → info`, `blue-600 → accent` and so on. It worked as an emergency retheme, but `bg-purple-600` no longer means purple. Developers cannot predict the rendered colour, and new code keeps adding raw palette classes.
- Improvement: phase it out. Migrate classes to semantic names (`bg-accent`, `text-critical`, `bg-surface`). Then turn the remap off, so any raw-palette class that remains becomes visible and fails lint.

**F2. Gradients and heavy shadows contradict the theme rules.** — **Low**
- Evidence: `bg-gradient-*` appears in 44 page files (Billing dashboard, Create Invoice, reports…), although THEME.md says "no gradients on chrome".
- Improvement: use flat surfaces, keep elevation to three levels only, and allow gradients only in data visualisation.

**F3. Hard-coded colours remain.** — **Low**
- Evidence: there are about 166 hex literals in 16 `.jsx` files, mostly invoice and print previews, and about 867 inline `style={{…}}` objects.
- Improvement: keep literal colours only in print/PDF modules and source them from `PDF_RGB`. Inline styles should be limited to dynamic sizing.

**F4. THEME.md contradicts itself.** — **Low**
- Evidence: the text-colour table lists `--text #1F2320`, while the note says `#12151A`. `--canvas` and `--surface-raised` are the same value, so card headers have no visible separation.
- Improvement: generate the documentation from the token file so it cannot drift.

### G. Tables and lists (the most-used surface in an ERP)

**G1. Table behaviour is not standardised.** — **High**
- Evidence: there are about 289 raw `<table>` elements vs about 102 `DenseTable`s and 6 `ListTable`s. `SortableTableHeader` is used in 4 files and `PaginationBar` about 13 times. The shared `DenseTable` itself has no sorting, pagination, selection, column chooser, empty state or loading state.
- Improvement: build a single **DataGrid** component with:
  - a toolbar (search, filter button, active-filter chips, view selector, density, column chooser, export);
  - sortable headers;
  - a sticky header and first column;
  - row selection with a **bulk-action bar**;
  - pagination or virtual scroll showing "1–50 of 1,240";
  - right-aligned tabular numbers and status chips;
  - row actions in a trailing "⋯" menu;
  - built-in empty, loading (skeleton rows) and error states.
- Reference: IBM **Carbon Data Table** (toolbar, batch actions, expansion), which fits naturally since you already use IBM Plex; the Fiori **List Report** with "Smart Table"; the Dynamics 365 **editable grid** and views.

**G2. There are no saved views or personalisation.** — **Medium**
- Improvement: let users save a combination of filters, columns and sort as a named view ("My open enquiries", "Overdue invoices"). Mark one as the default, and allow sharing views with a team.
- Reference: SAP **Variant Management**; Dynamics 365 **personal views**.

**G3. Fixed giant table widths.** — **Low**
- Evidence: there are about 20 `min-w-[1xxxpx]` tables and about 648 `min-w-[…]` uses.
- Improvement: give columns priorities. On narrow screens, hide low-priority columns into an expandable row or a detail drawer instead of forcing horizontal scroll.

### H. Forms

**H1. There are three date-input patterns and two select patterns.** — **Medium**
- Evidence: there are about 97 native `type="date"` inputs, 131 `FormDateInput`s and 14 `DateInput`s. There are about 489 native `<select>`s alongside `TinySelect`. Calendar look, keyboard behaviour and date format (dd-mm-yyyy vs browser locale) therefore differ by page.
- Improvement: use one `DatePicker` and one `DateRangePicker` with presets (Today, This month, Last FY, Custom) and a fixed **DD-MMM-YYYY** display format. For long lists (clients, employees, sites), use one `Select` and a searchable `Combobox`.

**H2. Field layout and validation are not standardised.** — **Medium**
- Evidence: the shared `FormField` is used about 39 times vs about 1,741 raw `<label>`s. Required markers, help text and error placement vary.
- Improvement: every field goes through `FormField`, which provides:
  - the label on top;
  - a required asterisk *plus* "(optional)" convention;
  - inline help;
  - an error message under the field, linked with `aria-describedby`;
  - an error summary at the top or in the sticky footer on submit.

  Use 2-column grids on desktop and 1 column on mobile. Group fields into titled sections.
- Reference: Fluent 2 Field; Carbon Form; Fiori Form and SimpleForm guidelines.

**H3. Number and currency entry.** — **Low**
- Improvement: apply one formatter for INR with lakh/crore grouping (₹ 12,34,567.00). Right-align numbers in inputs and tables, and show units as suffixes (₹, %, km, hrs).

### I. Filters and search

**I1. Filter bars differ by module.** — **Medium**
- Evidence: `FilterBar` is a layout wrapper only. Pages compose their own search, date dropdowns (several use a full-screen `fixed inset-0` click-catcher) and export buttons with differing order and styles.
- Improvement: one **Filter Bar pattern**:
  1. keyword search;
  2. 3–5 most-used filters inline;
  3. "More filters" opening a drawer;
  4. applied filters shown as removable chips;
  5. "Clear all";
  6. filter state kept in the URL, so links and Back work.
- Reference: Fiori **Filter Bar** with "Adapt Filters"; Redwood "Smart Filters"; Dynamics 365 grid column filters.

**I2. Global search is navigation-only.** — **Low/Medium**
- Improvement: extend ⌘K to also find **records** (an invoice number, PO number, employee code or client name) and recent items, grouped by type.
- Reference: Dynamics 365 Dataverse search; SAP Enterprise Search in the shell bar.

### J. Dashboards and data visualisation

**J1. Dashboard patterns are inconsistent across about 33 dashboards.** — **Medium**
- Evidence: Company Pulse has its own CSS (`companyPulse.css`, about 811 lines). Module dashboards use `KpiTile`, gradient cards or custom panels. Period selectors differ per dashboard.
- Improvement: one **Overview Page** template:
  1. a global period selector (FY / month range) at the top right;
  2. a KPI row of 4–6 tiles, each with value, change vs previous period, a sparkline and a click-through to the filtered list;
  3. a 12-column card grid of charts;
  4. an "Attention needed" list (overdue, pending approvals).

  Every number should **drill down** to the list it came from.
- Reference: the Fiori **Overview Page** and **Analytical List Page**; Dynamics 365 dashboards with interactive streams.

**J2. Chart conventions need rules.** — **Low**
- Improvement: label axes with units; use INR short formats (₹1.2 Cr, ₹45 L); show tooltips with exact values; use direct labels instead of legends where possible; and give every chart an "empty for this period" state. Keep the existing `CHART_SERIES` palette, but check it for colour-blind safety: the sage and olive series are close in hue.

### K. Feedback: loading, empty, errors, confirmations

**K1. Loading states vary.** — **Medium**
- Evidence: spinner plus "Loading…" text in about 117 page files vs `Skeleton` / `LoadingBlock` in about 12.
- Improvement: use skeletons that match the final layout for tables, cards and forms. Use a spinner only inside buttons during an action ("Saving…"). For anything over about 10 s (payroll runs, imports), show a progress bar or background job.

**K2. Empty and error states are ad hoc.** — **Medium**
- Improvement: use `EmptyState` everywhere, with three variants:
  - *No data yet*: explain and offer a primary action.
  - *No results for these filters*: offer "Clear filters".
  - *Error*: give a plain-language reason, a Retry button and a support reference ID.

**K3. Confirmations and toasts.** — **Low**
- Evidence: `AppDialogHost` and `AppToaster` exist (good; no `window.alert` found).
- Improvement: standardise the copy. Destructive confirmations name the object ("Delete invoice INV-0042?") and the button names the action ("Delete invoice", not "OK"). Success toasts can include "Undo" where possible.

### L. Modals, drawers and overlays

**L1. Overlays are inconsistent and have accessibility gaps.** — **High**
- Evidence: there are about 130 hand-built `fixed inset-0` overlays vs 93 uses of the shared `Modal`. `role="dialog"` / `aria-modal` appear in only about 20 files. The shared `Modal` has no Esc handling, no focus trap, no scroll lock (the `Drawer` has one) and an unlabeled "×" close button. Z-index values are improvised (`z-[60]` … `z-[9999]`, 64 uses).
- Improvement: provide one `Dialog` (sizes S/M/L/XL, header, body, sticky footer) and one `Sheet/Drawer` (right side, for record previews and filters), both with focus trap, Esc, scroll lock, return-focus and ARIA. Define a **z-index scale** token (dropdown 1000, sticky 1100, drawer 1200, modal 1300, toast 1400).
- Rule of thumb: use a modal only for short decisions. Edit records in a drawer or full page.

### M. Dark mode

**M1. Dark mode is retrofitted rather than designed.** — **Medium**
- Evidence: there are only about 21 `dark:` utilities. Dark mode works through palette remapping, about 45 `[data-theme="dark"]` overrides and 99 `!important` rules in `index.css`, a "global readability layer" that patches literal colours. Document surfaces need opt-in classes (`erp-paper`, `erp-light-scope`).
- Improvement:
  1. Define a **complete dark token set** (surfaces at 3 elevation steps, text, borders, every semantic pair), designed and contrast-checked as its own palette.
  2. Remove the `!important` patch layer once pages use semantic tokens.
  3. Default to "System" and offer Light / Dark / System in the profile menu.
  4. Keep printable documents always light, as today.
- Reference: Fluent 2 and Carbon (Gray 90/100) ship full dark token sets; Dynamics 365 dark mode is token-driven.

### N. Responsiveness

**N1. The desktop shell is good, but pages are not designed for tablets.** — **Medium**
- Evidence: the shell handles mobile (off-canvas sidebar) and the login reflows well at 375 px. Pages rely on wide tables (`min-w-[…]`), hard-coded widths (`w-[…]` about 1,398) and full-screen overlays.
- Improvement: set target breakpoints at **1440 / 1280 / 1024 / 768**. Treat tablet as a *supported* form factor for field and site roles (attendance, gate pass, store issue, approvals). On those screens, show tables as cards below 768 px. Use full-screen sheets for forms on mobile, and 44 px touch targets.
- Reference: Fiori "responsive by default" (phone, tablet, desktop); the Dynamics 365 mobile app.

### O. Accessibility

**O1. Accessibility is partial.** — **Medium**
- Positive: there are about 470 `aria-label`s, a global `:focus-visible` ring and text-plus-colour status chips.
- Gaps:
  - dialog semantics (see L1);
  - micro font sizes (see E1);
  - "×" and "☰" glyph buttons;
  - native date inputs with mixed formats;
  - icon-only actions relying on `title=` tooltips, which keyboard and touch users cannot reach.
- Improvement: target **WCAG 2.2 AA** as an acceptance criterion for the kit: keyboard-only walkthroughs of the top 10 flows, axe checks in CI and a contrast check on both themes.

### P. Cross-module consistency and governance

**P1. Twelve module-local UI kits.** — **Medium**
- Evidence: `AmcUi`, `FinanceUi`, `StoreUi`, `OperationsUi`, `MarketingReportsUi`, `MaintenanceReportsUi`, `CommandCenterUi`, `ApiMonitoringUi`, `RulesUi`, `RecruitmentUi`, `deductionsUi` and `AdminUi`, plus page-level CSS files (Login 862 lines, Company Pulse 811, Quotation Maker 1,221, Probation Review 662).
- Improvement: fold any repeated pattern into `erpUi`. Module kits may only *compose* `erpUi` components; they must not restyle them.

**P2. Duplicated module screens.** — **Medium**
- Evidence: the Marketing and Maintenance folders each carry `EnquiryMaster`, `QuotationTracker`, `ExpoSeminar` and `FollowUpPlanner`. After normalising names, the two Enquiry Masters differ by about 340 lines out of about 1,800.
- Improvement: as a UI-only step, extract the shared screen into one component parameterised by module (labels, routes, data source). Both modules then look and behave the same.

---

## 3. Prioritised roadmap

### High — do first (largest perceived quality gain)

| ID | Action | Effort |
|---|---|---|
| A1, A2 | Unify product name and bring the login onto app tokens | S |
| A3 | Single primary-action colour; button set Primary / Secondary / Ghost / Danger | M |
| B1 | Generate sidebar, palette and breadcrumbs from one navigation config | M |
| D1 | Single page-header template on every page | M |
| E1 | Lock typography to the scale; 11 px minimum, 12 px table body | M |
| G1 | One DataGrid (sort, pagination, selection and bulk actions, column chooser, states) | L |
| L1 | Accessible Dialog and Drawer, plus a z-index scale; replace ad-hoc overlays | M |

### Medium — next wave

| ID | Action | Effort |
|---|---|---|
| B2, B3, B4 | Regroup modules into domains, clean URLs, fix breadcrumbs, add Favourites / Recent | M |
| C1, C2 | Unified notification centre and "My Inbox" approvals | M–L |
| D2, D3, D4 | Remove nested `h-screen`, Object Page plus sticky action bar for large forms, density modes | M–L |
| E2 | Restrict mono to data values; sentence-case sans labels | S |
| F1 | Migrate off palette remapping to semantic classes | M |
| G2 | Saved views | M |
| H1, H2 | One DatePicker/Combobox; FormField everywhere with consistent validation | M |
| I1 | Standard filter bar with chips, a "More filters" drawer and URL state | M |
| J1 | Overview Page template with drill-down for dashboards | M |
| K1, K2 | Skeletons; three empty-state variants | S–M |
| M1 | Full dark token set; remove the `!important` patch layer | M |
| N1, O1 | Tablet targets for field roles; WCAG 2.2 AA gate | M |
| P1, P2 | Fold module kits into `erpUi`; merge the duplicated Marketing/Maintenance screens | M |

### Low — polish

A4 (profile menu), B5 (icon and shortcut polish), E3 (weights), F2 (gradients and shadows), F3 (hex and inline styles), F4 (generated docs), G3 (column priority), H3 (INR formatting), I2 (record search in ⌘K), J2 (chart rules), K3 (confirmation and toast copy).

**Suggested sequencing:** foundations and lint rules (2 weeks) → shell, navigation and header (2 weeks) → DataGrid, Dialog and Form kit (3–4 weeks) → migrate modules in priority order: Commercial, Billing, HR/Attendance, Admin Ops, then the rest (ongoing, about 1 module per sprint) → dark mode and responsive hardening.

---

## 4. Design references

| Need | Reference to study |
|---|---|
| Page floorplans | **SAP Fiori**: List Report, Object Page, Overview Page, Worklist, Wizard, Dynamic Page header |
| Tables, filters, saved views | Fiori Filter Bar and Variant Management; **IBM Carbon** Data Table (batch actions, toolbar); **Dynamics 365** views and editable grid |
| Tokens and dark mode | **Microsoft Fluent 2** (tokens, type ramp, dark theme); **IBM Carbon** (themes White / G10 / G90 / G100, which pair naturally with IBM Plex) |
| Enterprise visual tone | **Oracle Redwood** (calm surfaces, generous whitespace, clear page templates) |
| Approvals and inbox | SAP Fiori "My Inbox", Oracle Worklist |
| Navigation | Fiori Launchpad Spaces and Pages, Dynamics 365 site map with Recent / Pinned |
| Accessibility | WCAG 2.2 AA; Carbon and Fluent component accessibility notes |

**Recommendation:** base the Indus system on **IBM Carbon's structure** (you already ship IBM Plex, and Carbon's data-dense patterns suit an ERP), use **SAP Fiori floorplans** for page templates, and keep the **Indus sage palette** as the brand layer.

---

## 5. Recommended design system — "Indus One DS"

### 5.1 Foundations (tokens)

| Category | Recommendation |
|---|---|
| Colour | Brand: accent / accent-hover / accent-soft. Neutrals: canvas, surface-1/2/3, border, border-strong, divider. Text: primary, secondary, muted, disabled, on-accent. Semantic: success, warning, critical, info, neutral (each fg / bg / border). **Separate, designed light and dark sets.** No raw palette classes. |
| Typography | IBM Plex Sans for UI, IBM Plex Mono **only** for data values. Scale (px): 28 display · 22 page title · 18 section · 15 card title · 14 body-large · 13 body · 12 label / table · 11 caption (minimum). Weights 400 / 500 / 600. Sentence case. |
| Spacing | 4-px base: 4, 8, 12, 16, 20, 24, 32, 40, 48. Page gutter 24 (desktop) / 16 (tablet) / 12 (mobile). |
| Density | Comfortable (row 40 px) and Compact (row 32 px), set as a user preference. |
| Radius | 4 controls · 8 cards / dialogs · 999 chips / avatars. |
| Elevation | 0 flat · 1 card · 2 popover / dropdown · 3 dialog / drawer. Nothing else. |
| Motion | 120 ms (hover), 200 ms (open/close), standard easing; respect `prefers-reduced-motion`. |
| Z-index | dropdown 1000 · sticky 1100 · drawer 1200 · modal 1300 · toast 1400. |
| Breakpoints | 768 / 1024 / 1280 / 1440. |
| Formats | Dates DD-MMM-YYYY (14-Nov-2026); INR with lakh/crore grouping; FY Apr–Mar labels; relative time for activity. |

### 5.2 Core components (all in `src/components/erpUi`)

- **Actions:** Button (Primary / Secondary / Ghost / Danger; sizes S/M; loading state), IconButton (with required `aria-label`), SplitButton, OverflowMenu.
- **Inputs:** TextField, NumberField / CurrencyField, Select, Combobox (searchable, async), DatePicker, DateRangePicker (with FY presets), Checkbox, Radio, Switch, FileUpload (drag-drop, progress), FormField wrapper, FormSection.
- **Data:** DataGrid (see G1), KeyValue list, StatusChip (fixed status vocabulary per entity), Badge, Avatar, Tag, Timeline, Attachment list.
- **Containers:** PageHeader, Card, Tabs, Accordion, Dialog, Drawer/Sheet, Popover, Tooltip.
- **Feedback:** Toast, InlineAlert, Banner (system-wide), Skeleton, ProgressBar, EmptyState (3 variants), ErrorState.
- **Navigation:** SideNav (config-driven), Breadcrumbs, CommandPalette (pages plus records), Pagination, Stepper.
- **Charts:** KpiTile (value, delta, sparkline, drill-down), ChartCard (title, period, empty state), plus standard Recharts wrappers.

### 5.3 Page templates

1. **List Report**: header, filter bar, DataGrid, bulk-action bar.
2. **Object / Record Page**: header summary with status and key fields, section anchors, sticky footer actions, side panel for activity and attachments.
3. **Create / Edit**: sectioned form or wizard, with an error summary and sticky Save / Submit.
4. **Overview / Dashboard**: period selector, KPI row, chart grid, "attention needed" list.
5. **Approval Inbox**: master-detail list, with approve / reject and comments.
6. **Settings / Masters**: left sub-navigation with forms on the right.

### 5.4 Patterns

- **Status vocabulary:** one shared list (Draft, Submitted, In Review, Approved, Rejected, On Hold, Closed, Cancelled), each with a fixed colour and icon.
- **Approvals:** a timeline of who, when and comments, shown in the same place on every record.
- **Filtering:** chips, URL state and saved views.
- **Bulk actions:** select rows, then a contextual bar with a count and actions.
- **Destructive actions:** confirm with the object name, a Danger button and Undo where possible.
- **Export:** one "Export" menu (Excel / CSV / PDF) placed in the grid toolbar.

### 5.5 Content guidelines

- Sentence case everywhere ("Create invoice", not "CREATE INVOICE" or "Create Invoice").
- Buttons use verb + noun ("Save draft", "Submit for approval").
- Avoid internal abbreviations in labels (show "R&M" as "Repair & Maintenance (R&M)" on first use or in tooltips).
- Error messages say what happened and what to do next ("GSTIN must be 15 characters. Check the client master.").

### 5.6 Governance (so it stays consistent)

1. **Lint rules (ESLint plus a Tailwind plugin)** that block:
   - `text-[Npx]`;
   - raw palette classes (`bg-purple-600` and the like);
   - hex literals outside the token and PDF modules;
   - `fixed inset-0` outside `erpUi`;
   - `h-screen` in pages.
2. **Storybook** (or a `/app/design-system` route) showing every component in light and dark, with usage do's and don'ts.
3. **Visual regression tests** for the top 20 screens.
4. **A UI-review checklist** in pull requests: uses a template, uses only kit components, passes the keyboard check, works in dark mode and at 1024 px.
5. **An adoption metric:** the share of page files on `erpUi` and templates, tracked monthly (today about 34%; target 90%).
6. **One owner** (design lead or front-end lead) approves additions to `erpUi`.

---

## 6. Next steps for approval

1. Confirm the product name (A1) and the primary-colour decision (A3). Everything else depends on these.
2. Approve the High-priority list (§3) as phase 1.
3. Optional: sign in inside the app's browser pane so a visual pass can attach screenshots of each finding (light and dark, desktop and tablet) before implementation planning.

*No application code, styles, components, database objects or workflows were modified while producing this audit.*
