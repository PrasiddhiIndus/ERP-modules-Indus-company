# ERP-modules-Indus-company

**INDUS ERP CORE** – Modular ERP for Indus Company (HR, Compliance, Admin, Sales, Marketing, Billing, Operations, Projects, Procurement, AMC, Finance, Fire Tender).

## Quick start

- **Requirements:** Node.js, npm. Supabase project (URL + anon key in `.env`).
- **Setup:** Copy `.env.example` to `.env`, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then `npm install` and `npm run dev`.

## Documentation

- **Full project documentation (with version control, goals, what works, routes, setup):**
  - [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md) – Markdown
  - [PROJECT_DOCUMENTATION.txt](./PROJECT_DOCUMENTATION.txt) – Plain text (for sharing/printing)

- **Module-specific docs:** See `docs/` (Billing, E-Invoice), `VEHICLE_MANAGEMENT_README.md`, `IFSPL_EMPLOYEE_MASTER_README.md`, `QUOTATION_REVISION_FEATURES.md`.
- **Billing – changes & process:** [docs/BILLING_CHANGES_AND_PROCESS.md](./docs/BILLING_CHANGES_AND_PROCESS.md) – Lists recent changes (e.g. Tax Invoice PDF download, default PO end dates) and the step-by-step Billing process for anyone to follow.