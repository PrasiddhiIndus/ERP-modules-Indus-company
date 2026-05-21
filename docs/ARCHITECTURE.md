# ERP frontend architecture

This document describes how the Indus ERP React app is organized. **URLs, module flows, and business steps are unchanged** — this is structure and performance only.

## Entry & routing

| Path | Role |
|------|------|
| `src/main.tsx` | App bootstrap |
| `src/App.jsx` | Route definitions (same paths as before) |
| `src/routes/lazyPages.jsx` | Lazy-loaded page components (code splitting) |
| `src/contexts/Layout.jsx` | Shell: sidebar, header, `<Outlet />` + `Suspense` |

Each module page loads **only when its route is opened**, which reduces initial bundle size and speeds up first paint.

## Folder layout

```
src/
  components/       Shared UI (PageLoader, drawers, …)
  config/           roles.js, quickActionRoutes.js
  constants/        Branding, shared constants
  contexts/         Auth, Layout shell, audit, access config
  lib/              Supabase, API helpers
  pages/            Feature modules (by domain)
    admin/          Legacy admin screens
    adminOperations/ Unified admin ops module
    billing/
    hr/
    marketing/
    manpowerProject/
    projects/
    …
  routes/           lazyPages.jsx (central code-split map)
```

### `pages/` convention

- One folder per **business domain** (e.g. `marketing/`, `adminOperations/`).
- Module dashboards, lists, and forms live under that domain.
- Large modules may use subfolders (`payroll/`, `employee/`, `configuration/`).

## Performance practices in use

1. **Route-level lazy loading** — `src/routes/lazyPages.jsx`
2. **Suspense fallback** — `src/components/PageLoader.jsx` in `Layout`
3. **Vendor chunk splitting** — `vite.config.ts` `manualChunks`
4. **Debounced date-input observer** — `App.jsx` (avoids DOM scan on every mutation)

## Quick actions

- Command center: `src/config/quickActionRoutes.js` + `Dashboard` → existing `/app/...` routes
- Admin ops header: same config (`ADMIN_OPS_QUICK_ACTIONS`)

## Adding a new page

1. Create the page under the correct `src/pages/<domain>/` folder.
2. Add a `lazy(() => import(...))` export in `src/routes/lazyPages.jsx`.
3. Register the **same** path as today in `App.jsx` (no URL changes unless product asks).
