# ERP Modules – Indus Company | Project Documentation

**Document Version:** 1.0  
**Last Updated:** 2026-02-26  
**Project Name:** ERP-modules-Indus-company (INDUS ERP CORE)

---

## 1. Version Control

| Item | Value |
|------|--------|
| **Repository** | ERP-modules-Indus-company (local/remote) |
| **Current Branch** | `main` |
| **Other Branches** | `billing`, `remotes/origin/main`, `remotes/origin/billing` |
| **Latest Commit** | `d7792f2a41bd017555014e2ee118371d87088a65` |
| **Commit Date** | 2026-02-25 10:56:08 +0530 |
| **Latest Commit Message** | Merge pull request #1 from PrasiddhiIndus/billing |

**Version control practices:**
- Use `main` for stable integration; feature branches (e.g. `billing`) for module work.
- Tag releases when delivering milestones (e.g. `v1.0.0`).
- Keep `.env` out of version control; use `.env.example` for required variables.

---

## 2. Project Overview & Goals

### 2.1 What This Project Is
A **modular ERP (Enterprise Resource Planning)** web application for **Indus Company** (INDUS ERP CORE). It covers HR, compliance, admin, sales, marketing, billing, operations, projects, procurement, AMC, finance, and fire-tender workflows—all behind **role-based access** and **Supabase** backend.

### 2.2 Goals
- **Centralize operations:** Single app for HR, attendance, payroll, compliance, admin, sales, marketing, billing, operations, projects, procurement, AMC, and finance.
- **Role-based access:** Executive (team-only), Manager (team + selected modules), Admin (full access). Sidebar and routes respect user role/team/allowed modules.
- **Fire Tender lifecycle:** From costing and configuration to tenders, quotations, and manufacturing.
- **Marketing & sales:** Enquiry master, quotation tracker, follow-ups, client master, product catalog, purchase orders, expo/seminar, GST docs.
- **Billing & compliance:** WO/PO management, invoice creation, credit notes, e-invoice readiness, reports, notifications; compliance tracking (IFSPL + general).
- **Vehicle/fleet:** Vehicle master, trips, maintenance, documents, drivers (Fire Tender/Vehicle Management).
- **Audit & traceability:** Auth state, optional audit console; billing designed for reverse engineering (data traceable to WO/PO).

---

## 3. What Works (Implemented Features)

### 3.1 Authentication & Authorization
- **Login / Register** – Email/password via Supabase Auth; session persistence and refresh.
- **Profiles** – `profiles` table: `id`, `email`, `username`, `team`, `role`, `allowed_modules`. Source of truth for access.
- **Roles:** `executive`, `manager`, `admin`. Executives see only their team; managers get team + checklist modules; admins see all.
- **Route guard** – Unauthorized paths redirect to `/app/dashboard`.
- **User Management** – Admin-only; manage users, roles, teams, allowed modules.

### 3.2 Core Modules (Working)
- **Overview (Dashboard)** – Landing after login; role-aware.
- **HR** – HR Management, Attendance, Payroll, People Management.
- **Compliance** – IFSPL Employee Compliance, General Compliance.
- **Admin** – IFSPL Employee Master, Attendance, Payroll, Leaves, Store/Inventory, Gate Pass.
- **Sales** – Manpower Enquiry, Enquiry List, Internal Quotation (list/form).
- **Marketing** – Dashboard, Enquiry Master, Quotation Tracker, Costing sheets, Internal Quotation, Follow-up Planner, Client Master, Product Catalog, Purchase Orders, Expo & Seminar, GST Upload, Mail Templates.
- **Billing** – Dashboard, WO/PO Management, Create Invoice, Credit Notes, E-invoice, Reports, Notifications.
- **Operations** – Fire Tender/Vehicle Management, Operations.
- **Projects** – Projects Management, Projects Billing.
- **Fire Tender** – Costing, Tender List, Costing Sheet, Quotation list/detail, Configuration (Main Component, Manual Sub-Category, Mail Template, Price Master, Accessories, Final Components, Vehicle Type), Fire Tender Manufacturing.
- **Procurement** – Procurement module.
- **AMC** – AMC module.
- **Finance/Accounts** – Accounts/Finance.
- **Settings** – User settings (role-aware).

### 3.3 Key Technical Behaviors
- **Supabase** – All persistent data and auth (client in `src/lib/supabase.js`).
- **Sidebar** – Renders only modules the user can access (`config/roles.js` + `getAccessibleModules`).
- **Billing context** – Shared state for billing flows (`BillingContext.jsx`).
- **Audit console** – Optional audit UI (`AuditConsoleContext.jsx`).
- **Error handling** – Centralized Supabase error handling (`supabaseErrorHandler.js`).
- **Exports** – PDF (jsPDF), Excel (xlsx), CSV (PapaParse) where implemented.

---

## 4. Technology Stack

| Layer | Technology |
|-------|------------|
| **Framework** | React 18 |
| **Build** | Vite 5 |
| **Language** | JavaScript (JSX); TypeScript config present |
| **Routing** | React Router DOM v6 |
| **Backend / Auth / DB** | Supabase (PostgreSQL, Auth, Storage) |
| **Styling** | Tailwind CSS |
| **Icons** | Lucide React, React Icons |
| **PDF** | jspdf, jspdf-autotable |
| **Excel/CSV** | xlsx, papaparse |

---

## 5. Architecture Summary

### 5.1 Entry & Routing
- **Entry:** `index.html` → `src/main.jsx` → `App.jsx`.
- **Providers:** `AuthProvider` → `AuditConsoleProvider` → `Router`.
- **Public routes:** `/` (Login), `/register`.
- **Protected routes:** All under `/app`; wrapped in `ProtectedRoute` and `Layout`; nested routes for dashboard and every module.

### 5.2 Role & Access
- **Config:** `src/config/roles.js` – `ROLES`, `TEAMS`, `MODULES`, `MODULE_PATH_PREFIXES`, `getAccessibleModules()`, `isPathAllowed()`.
- **Auth context:** `AuthContext.jsx` – `user`, `userProfile` (from `profiles`), `accessibleModules`, `signIn`, `signOut`, `register`, etc.
- **Layout:** `Layout.jsx` – Sidebar built from `accessibleModules`; redirects if path not allowed.

### 5.3 Key Directories
- `src/pages/` – Page components per module (e.g. `billing/`, `marketing/`, `projects/`, `admin/`, `fireTenderVehicle/`).
- `src/contexts/` – `AuthContext`, `AuditConsoleContext`, `BillingContext`, `Layout`.
- `src/lib/` – `supabase.js`, `supabaseErrorHandler.js`, `auditLogger.js`.
- `src/config/` – `roles.js`.
- `src/components/` – e.g. `ProtectedRoute.jsx`.
- `supabase/migrations/` – DB migrations (e.g. `20250220000000_profiles_for_roles.sql`).

---

## 6. Environment & Setup

### 6.1 Required Environment Variables
Create a `.env` file (do not commit it). Use `.env.example` as reference:

```
VITE_SUPABASE_URL=<your-project-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

### 6.2 Commands
- **Install:** `npm install`
- **Development:** `npm run dev`
- **Build:** `npm run build`
- **Preview (production build):** `npm run preview`
- **Lint:** `npm run lint`

### 6.3 Supabase
- Backend: Supabase project (URL and anon key in `.env`).
- Tables used: `profiles` (and many module-specific tables). RLS and migrations in `supabase/migrations/` and various `.sql` files in repo root for reference.

---

## 7. Module-to-Route Quick Reference

| Module | Path(s) |
|--------|---------|
| Login | `/` |
| Register | `/register` |
| Dashboard | `/app/dashboard` |
| HR | `/app/hr`, `/app/attendance`, `/app/payroll`, `/app/people-management` |
| Compliance | `/app/ifsp-employee-compliance`, `/app/general-compliance` |
| Admin | `/app/ifsp-employee-master`, `/app/ifsp-employee-attendance`, `/app/ifsp-employee-payroll`, `/app/ifsp-employee-leaves`, `/app/store-inventory`, `/app/gate-pass` |
| Sales (Manpower) | `/app/manpower`, `/app/manpower/list`, `/app/manpower/internal-quotation`, etc. |
| Marketing | `/app/marketing`, `/app/marketing/enquiry-master`, `/app/marketing/quotation-tracker`, etc. |
| Billing | `/app/billing`, `/app/billing/wopo`, `/app/billing/create-invoice`, etc. |
| Operations | `/app/operations`, `/app/fire-tender-vehicle-management` |
| Projects | `/app/projects-management`, `/app/projects-billing` |
| Fire Tender | `/app/fire-tender`, `/app/fire-tender/list`, `/app/fire-tender/costing`, `/app/fire-tender-manufacturing`, etc. |
| Procurement | `/app/procurement` |
| AMC | `/app/amc` |
| Finance | `/app/accounts-finance` |
| User Management | `/app/user-management` |
| Settings | `/app/settings` |

---

## 8. Existing Documentation (In Repo)

| Document | Purpose |
|----------|---------|
| `docs/BILLING_REQUIREMENTS.md` | Billing workflow, OC auto-fetch, WO/PO, approval, e-invoice, credit notes, reports, alerts. |
| `docs/EINVOICE_API_INTEGRATION.md` | E-invoice IRP integration (GST India), API options, JSON schema, implementation steps. |
| `QUOTATION_REVISION_FEATURES.md` | Quotation revisions, follow-up planner sync, marketing dashboard notifications. |
| `VEHICLE_MANAGEMENT_README.md` | Fire Tender/Vehicle Management: dashboard, vehicle master, trips, documents, maintenance, drivers, schema. |
| `IFSPL_EMPLOYEE_MASTER_README.md` | IFSPL Employee Master: Excel-like view, fields, status, import/export. |

---

## 9. Database & SQL Notes

- **Profiles/roles:** `supabase/migrations/20250220000000_profiles_for_roles.sql`.
- **Vehicle management:** `vehicle_management_schema.sql`, `operations_fire_tender_vehicle_schema.sql`, etc.
- **Marketing:** `marketing_*` and related `.sql` files for enquiries, quotations, costing, site visits, mail templates, etc.
- **IFSPL Employee:** `ifsp_employee_master_schema.sql`, `admin_ifsp_employee_master_schema.sql`, etc.
- **Billing:** See `docs/BILLING_REQUIREMENTS.md` and `docs/EINVOICE_API_INTEGRATION.md` for data and integration needs.

---

## 10. Summary

- **Project:** INDUS ERP CORE – multi-module ERP for Indus Company.
- **Version control:** Git; `main` + `billing`; latest merge from billing; document version and commit hash above for traceability.
- **What works:** Full auth and role-based UI, all listed modules with routes and sidebar, Supabase-backed data where implemented, billing/marketing/vehicle/IFSPL docs describe implemented or planned behavior.
- **Goals:** Single place for company operations, secure role-based access, fire tender lifecycle, marketing/sales, billing with e-invoice readiness, fleet management, and audit/traceability.

For detailed feature specs, always refer to the docs in **Section 8** and the SQL files in the repo root and `supabase/migrations/`.
