# E-Invoice API Integration (GST India)

This guide explains how to create e-invoices with **API integration** to the Government e-invoice portal (IRP – Invoice Registration Portal).

## 1. Overview

- **Portal:** [e-Invoice IRP](https://einvoice6.gst.gov.in/) (IRIS and other IRPs)
- **Purpose:** Generate **IRN** (Invoice Reference Number) and signed JSON/QR for B2B, B2G, export, and reverse-charge invoices.
- **Layout:** Invoices, E-Invoices, and Credit Notes in your app must use the **exact same layout**; the API only needs the standard e-invoice JSON payload.

## 2. Ways to Integrate

| Option | Best for | How |
|--------|----------|-----|
| **Direct API** | Large volume, in-house IT | Register as API Integrator, use GSTIN(s), call IRP APIs directly. |
| **GSP/ASP** | Quick go-live | Use a GST Suitability Provider / Application Service Provider who already has IRP access. |

## 3. Core APIs (IRP)

1. **Authentication** – Get OAuth/token using your credentials (as per IRP documentation).
2. **Generate IRN** – POST invoice payload (JSON schema); returns IRN, signed JSON, QR code data.
3. **Cancel IRN** – Cancel an already generated IRN (within allowed time window).
4. **Get IRN by IRN number** – Fetch details of a generated IRN.

Base URL (sandbox): use the URL provided in the [e-Invoice API Integration / Sandbox](https://einvoice6.gst.gov.in/content/api-integration/) portal.

## 4. E-Invoice JSON Schema (Summary)

Your backend must build a JSON that conforms to the **e-invoice schema** published by GSTN. Main sections:

- **Version** – Schema version (e.g. 1.1).
- **Supplier / Seller** – GSTIN, legal name, address, etc.
- **Buyer** – GSTIN (if registered), legal name, address.
- **Document** – Invoice number, date, type (INV, CN, DN), currency, etc.
- **Item list** – Description, quantity, unit, rate, amount, HSN/SAC, tax rate, taxable value, CGST/SGST/IGST, etc.
- **Value** – Total taxable value, total invoice value, tax totals.

Map your **approved bill** (and WO/PO) fields to these sections so every value is traceable to source (reverse engineering).

## 5. Implementation Steps in Your App

1. **Backend (recommended)**  
   - Do **not** call the IRP from the browser (CORS, credentials).  
   - Create a backend service (Node, Python, etc.) that:  
     - Authenticates with the IRP (using credentials stored securely).  
     - Accepts your internal bill/invoice ID or payload.  
     - Maps bill → e-invoice JSON (same logic as your invoice layout).  
     - Calls **Generate IRN** (and Cancel if needed).  
     - Saves IRN, signed JSON, QR in your DB and returns to frontend.

2. **Frontend (this repo)**  
   - E-Invoice page lists **approved bills** (from Create Invoice).  
   - User clicks **Generate E-Invoice** for a bill.  
   - Frontend calls **your backend API** (e.g. `POST /api/billing/e-invoice/generate` with `billId`).  
   - Backend builds e-invoice JSON, calls IRP, stores result, returns IRN/QR/link.  
   - Frontend shows IRN, status, and optionally PDF/QR (same layout as invoice).

3. **Credit Notes**  
   - Same flow: build e-invoice payload with document type **Credit Note**, link to original IRN.  
   - Use **Cancel IRN** only when the entire invoice is cancelled; for partial reversal use Credit Note.

## 6. Security & Credentials

- Store IRP credentials (client id/secret or certificate) in **environment variables or secret manager** on the server.
- Use **HTTPS** for all API calls.
- Do not expose IRP tokens or credentials to the browser.

## 7. Sandbox / Testing

- Use the official e-invoice **sandbox** for testing (see portal links above).
- Test with sample GSTINs and invoice data; validate response (IRN, QR) before going live.

## 8. References

- [e-Invoice Portal – API Integration](https://einvoice6.gst.gov.in/content/api-integration/)
- [IRIS IRP – Generate IRN](https://einvoice6.gst.gov.in/content/kb/generate-irn/)
- [Core APIs – IRIS IRP](https://einvoice6.gst.gov.in/content/core-apis-wiki/)
