# Billing Module – Database (billing schema) & Security

All billing data lives in the **`billing`** schema. Tables: `billing.po_wo`, `billing.invoice`, etc. The app uses `supabase.schema('billing').from('po_wo')` to read and write. RLS limits access to admin, billing role/team, or users without a profile (so it works before profile setup).

---

## Schema: `billing`

| Table | Purpose |
|-------|--------|
| **billing.po_wo** | PO/WO Management – contract master (site, client, OC number, dates, approval status). |
| **billing.po_rate_category** | Rate per description for each PO. |
| **billing.po_contact_log** | Contact Log – contact name, number, from/to dates per PO. |
| **billing.invoice** | Invoice header – tax invoice number, client, amounts, e-invoice fields, PA status. |
| **billing.invoice_line_item** | Invoice lines – description, HSN/SAC, quantity, rate, amount. |
| **billing.invoice_attachment** | Attachments per invoice (e.g. attendance, document_2). |
| **billing.credit_debit_note** | Credit/Debit notes – type, amount, reason, linked to invoice. |
| **billing.payment_advice** | Payment advice per invoice – PA date, penalty, remarks. |

---

## Connection from the app

- **Service:** `src/services/billingApi.js` uses `supabase.schema('billing').from('po_wo')`, `.from('invoice')`, etc.
- **Context:** `src/contexts/BillingContext.jsx` loads from DB when `isBillingDbAvailable()` is true; otherwise uses localStorage.

### Required: Expose `billing` schema in Supabase

For the JS client to query the `billing` schema:

1. Open **Supabase Dashboard** → your project.
2. Go to **Settings** → **API**.
3. Under **Exposed schemas** (or **Schema**), add **`billing`** so the API can access it.
4. Save.

Without this, requests to the billing schema will fail (e.g. relation not found or permission denied).

---

## Security (RLS)

- **RLS is enabled** on all tables in the **billing** schema.
- **billing.current_user_has_billing_access()** (SECURITY DEFINER) checks **public.profiles**:
  - **Allow** if `profiles.role = 'admin'` or `'billing'`, or `profiles.team = 'billing'`, or `'billing'` in `profiles.allowed_modules`.
  - **Allow** if the user has **no profile** row (billing works before profiles exist).
  - **Allow** if the user has a profile but **role** and **team** are null and **allowed_modules** is empty (default for new users).
  - **Deny** otherwise (e.g. profile with `role = 'sales'` and no billing in allowed_modules).
- Each billing table has one policy using this function for **USING** and **WITH CHECK**.

---

## Migrations

1. **20250220000000_profiles_for_roles.sql** – creates **public.profiles** (role, team, allowed_modules). Required.
2. **20250312100000_billing_public_tables.sql** – creates **billing** schema, all billing tables, RLS, and grants. Run in SQL Editor or via `supabase db push`.

After running migrations, ensure **Exposed schemas** includes **billing** (see above). Then the app will load and save billing data in the `billing` schema with proper security.

---

## If data does not save to the DB

1. **Expose schema:** Supabase Dashboard → **Settings** → **API** → **Exposed schemas** → add **`billing`** and save.
2. **Run migration:** Ensure **20250312100000_billing_public_tables.sql** has been run (SQL Editor or `supabase db push`).
3. **Log in:** The app must be using a logged-in Supabase user (RLS uses `auth.uid()`). If you use anonymous or no auth, the RLS helper may deny access.
4. **Check the banner:** If save fails, an amber banner shows the error (e.g. "Billing schema not exposed" or "Permission denied (RLS)").
5. **Browser console:** Open DevTools → Console and look for "Billing DB save POs failed:" to see the raw error.
