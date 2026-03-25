# Billing Module – Changes & Process Guide

This document lists the changes made to the Billing module and explains the end-to-end process so anyone can understand and follow it.

---

## 1. Summary of Changes

### 1.1 Tax Invoice PDF Download (Generated E-Invoice)

**What was done**

- When you click the **Download** icon on the Generated E-Invoice screen (or "Download PDF" in the view modal), the app now generates and downloads a **Tax Invoice PDF** in the same structure and layout as the standard tax invoice (company header, seller/buyer details, item table, tax summary, bank details, terms, footer).

**Files changed/added**

| File | Change |
|------|--------|
| `src/utils/taxInvoicePdf.js` | **New.** PDF generator using `jspdf` and `jspdf-autotable`. Fills PDF with invoice data (client, items, amounts, tax, dates, PO/OC, payment terms). |
| `src/pages/billing/GeneratedEInvoice.jsx` | Download button calls `downloadTaxInvoicePdf(inv)`; view modal has a "Download PDF" button that does the same. |

**PDF content (data from Create Invoice / Manage Invoices)**

- Header: Company name, "Tax Invoice", "(ORIGINAL FOR RECIPIENT)"
- Seller: Name, address, GSTIN, state (Indus Fire Safety)
- Invoice details: Invoice No., Dated, Mode/Terms of Payment, Buyer’s Order No., Dated
- Consignee / Buyer: Client name, address, GSTIN, state, place of supply
- Item table: SI No., Description, HSN/SAC, Quantity, Rate, per, Disc. %, Amount; CGST/SGST rows; total
- Amount in words (e.g. "INR Two Thousand Three Hundred Sixty Only")
- Tax summary: HSN/SAC, Taxable Value, CGST & SGST (rate & amount), total tax, tax in words
- Terms & conditions, Customer’s Seal and Signature
- Bank details (account holder, bank name, A/c No., branch & IFSC, authorised signatory)
- Footer: Jurisdiction, phone, website, email, address

**Customisation**

- Seller and bank details are in `src/utils/taxInvoicePdf.js` (constants `SELLER`, `BANK`, `TERMS`, `FOOTER_*`). Update these to match your letterhead and bank details.

---

### 1.2 Default PO Data – End Dates Set to 2026

**What was done**

- All **end dates** in the default Commercial PO JSON (used when no data is in localStorage) were aligned to **2026** so default POs are valid for the same period.

**File changed**

| File | Change |
|------|--------|
| `src/data/billingStore.js` | In `getDefaultCommercialPOs()`: PO 2 `endDate` changed from `'2027-06-30'` to `'2026-06-30'`. Contact history (PO 1) first entry `to` date changed from `'2024-06-30'` to `'2026-06-30'`. PO 1 and PO 3 already had 2026 end dates. |

**Resulting default PO end dates**

- PO 1 (SITE-001): `endDate: '2026-12-31'`
- PO 2 (SITE-002): `endDate: '2026-06-30'`
- PO 3 (SITE-003): `endDate: '2026-08-31'`

**Note:** Existing data already saved in the browser (localStorage) is not changed. To see these defaults, clear the app’s localStorage or add new POs so they use the updated defaults.

---

## 2. End-to-End Process (How to Use the Billing Flow)

Follow this flow to create an invoice, generate e-invoice (if applicable), and download the Tax Invoice PDF.

### Step 1: Commercial – Create / Approve PO

1. Go to **Commercial** (or Sales) → **PO Entry**.
2. Create or edit a PO: site, client, OC number, PO/WO number, rates, start/end dates, payment terms, etc.
3. Set status so the PO is **“Sent for approval”** (or equivalent your app uses).
4. Only POs in this state appear in Billing → Create Invoice.

**Data used:** Commercial PO is the master; invoice will pull client name, address, GSTIN, rates, payment terms, etc.

---

### Step 2: Billing – Create Invoice

1. Go to **Billing** → **Create Invoice**.
2. Select a PO that is “Sent for approval” from the dropdown.
3. Set **Invoice Date**.
4. Review/edit **line items** (quantity, rate) – description and HSN/SAC come from the PO.
5. Upload required **attachments** (e.g. Attendance Sheet, Document 2).
6. Click **Save Invoice**.

**Result:** Invoice is created and stored (localStorage). You can see it under **Manage Invoices**.

---

### Step 3: Billing – Manage Invoices

1. Go to **Billing** → **Manage Invoices**.
2. View, filter, or edit existing invoices (e.g. by billing type: Monthly / Per Day / Lump Sum).
3. From here you can trigger **Generate E-Invoice** for an invoice (if that feature is enabled).

---

### Step 4: Billing – Generated E-Invoice

1. Go to **Billing** → **Generated E-Invoice**.
2. This list shows invoices for which an e-invoice (IRN) has been generated.
3. Use **Search** to find by invoice #, OC, client, or IRN.
4. **View (eye icon):** Open modal with invoice details and line items.
5. **Download (download icon):** Generates and downloads the **Tax Invoice PDF** with the same structure as your standard invoice, filled with the data you entered (Create Invoice / Manage Invoices).

**PDF file name:** `Tax_Invoice_<InvoiceNumber>.pdf` (e.g. `Tax_Invoice_INV-2025-0001.pdf`).

---

### Step 5: Other Billing Tabs (Reference)

- **Dashboard:** Overview of billing.
- **Credit/Debit Notes:** For credit/debit notes linked to invoices.
- **Reports:** Billing reports.
- **Tracking:** Payment advice / tracking.
- **Notifications:** Billing-related alerts.

---

## 3. Data Flow (Technical)

```
Commercial PO (billingStore: erp_commercial_pos)
    ↓
Create Invoice (select PO, add items, attachments) → saved to
    ↓
Invoices (billingStore: erp_invoices)
    ↓
Manage Invoices (view/edit) → Generate E-Invoice (IRN) if applicable
    ↓
Generated E-Invoice list → Download PDF (taxInvoicePdf.js)
```

- **BillingContext** (`src/contexts/BillingContext.jsx`) provides `invoices`, `commercialPOs`, etc., and syncs with `billingStore.js` (localStorage).
- **PDF generator** (`src/utils/taxInvoicePdf.js`) reads one invoice object and builds the PDF from its fields (e.g. `clientLegalName`, `items`, `taxableValue`, `cgstAmt`, `sgstAmt`, `invoiceDate`, `taxInvoiceNumber`).

---

## 4. Quick Reference – Where Things Are

| What | Where |
|------|--------|
| Default PO/invoice data | `src/data/billingStore.js` |
| Create Invoice form & seller details | `src/pages/billing/CreateInvoice.jsx` |
| Generated E-Invoice list & download button | `src/pages/billing/GeneratedEInvoice.jsx` |
| Tax Invoice PDF layout & company/bank details | `src/utils/taxInvoicePdf.js` |
| Billing tabs & routing | `src/pages/billing/Billing.jsx` |
| Billing state (invoices, POs) | `src/contexts/BillingContext.jsx` |

---

## 5. Related Documentation

- **Billing requirements:** `docs/BILLING_REQUIREMENTS.md`
- **E-Invoice API:** `docs/EINVOICE_API_INTEGRATION.md`
- **Project overview:** `PROJECT_DOCUMENTATION.md`

---

*Last updated: March 2026*
