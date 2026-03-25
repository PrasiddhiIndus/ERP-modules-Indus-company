# E-Invoice via ClearTax (Clear) – ERP Integration

This doc describes how to connect your Indus ERP to the government e-invoice system using **ClearTax (Clear)** as GSP, so that **Generate E-Invoice** from Manage Invoices calls Clear API and gets **IRN, Ack No, Ack Date, QR code** back.

---

## Step 1 – Legal & Clear setup

- Ensure your company is e-invoice applicable (turnover > ₹5 Cr) and registered on **GST Portal** and **e-Invoice IRP (NIC)**.
- Register with **Clear (ClearTax)** as GSP: [Clear e-Invoicing](https://cleartax.in/s/e-invoicing-api-system).
- Clear will provide:
  - **Client ID**
  - **Client Secret**
  - **API base URL** (e.g. `https://api.clear.in/einv/v2` or sandbox)
  - **Sandbox** for testing

---

## Step 2 – Architecture (never call Clear from frontend)

```
ERP (React)  →  Your Backend (Node/FastAPI)  →  Clear API  →  IRP  →  IRN/QR/Ack
```

- **Frontend** only calls **your backend** at `VITE_EINVOICE_API_URL`.
- **Your backend** holds Clear **Client ID / Client Secret**, gets a Bearer token, and calls Clear’s e-invoice APIs.  
  This keeps credentials and token off the browser.

---

## Step 3 – What the frontend sends

When the user clicks **Generate E-Invoice** in Manage Invoices, the app:

1. Builds e-invoice JSON via `buildEInvoicePayload(bill, wopo)` (NIC schema).
2. Sends **POST** to `{VITE_EINVOICE_API_URL}/generate` with body:

```json
{
  "billId": "<invoice-uuid>",
  "payload": {
    "Version": "1.1",
    "TranDtls": { "TaxSch": "GST", "SupTyp": "B2B" },
    "DocDtls": { "Typ": "INV", "No": "INV-2025-0001", "Dt": "16/03/2026" },
    "SellerDtls": { "Gstin": "...", "LglNm": "...", "Addr1": "...", "Loc": "...", "Pin": 390010, "Stcd": "24" },
    "BuyerDtls": { "Gstin": "...", "LglNm": "...", "Pos": "24" },
    "ItemList": [ { "SlNo": "1", "PrdDesc": "...", "HsnCd": "998536", "Qty": 1, "Unit": "NOS", "UnitPrice": 100000, "TotAmt": 100000, "GstRt": 18 } ],
    "ValDtls": { "AssVal": 100000, "TotInvVal": 100000 }
  }
}
```

- **HSN 998536** is used for fire manpower / security services.
- **Place of supply (Pos)** is taken from buyer GSTIN (first 2 digits) or default.

---

## Step 4 – What your backend must do

### 4.1 Get Clear token

Use Clear’s auth API (see Clear docs) with **Client ID** and **Client Secret** to get a **Bearer token**.

### 4.2 POST to Clear generate

- **Endpoint:** e.g. `POST https://api.clear.in/einv/v2/einvoice/generate` (confirm URL in Clear’s docs).
- **Headers:**  
  `Authorization: Bearer <token>`  
  `Content-Type: application/json`
- **Body:** The same `payload` object from the frontend (or map it to the exact format Clear expects).

### 4.3 Map Clear response → ERP format

Clear returns IRN, Ack No, Ack Date, and QR (often base64). Your backend must respond to the **frontend** with:

```json
{
  "irn": "<Invoice Reference Number from IRP>",
  "ackNo": "<Acknowledgment Number>",
  "ackDt": "<Acknowledgment Date, e.g. YYYY-MM-DD or ISO>",
  "signedQR": "<base64 string or data:image/png;base64,... for QR image>"
}
```

- **irn** – mandatory.  
- **ackNo**, **ackDt** – from Clear/IRP response.  
- **signedQR** – QR image for the PDF. If Clear returns base64 without `data:image/...`, the frontend will prefix `data:image/png;base64,` when needed for the PDF.

The frontend already maps these into the invoice and shows them in **Generated E-Invoice** and in the **PDF** (IRN, Ack No, Ack Date, QR at top).

---

## Step 5 – Cancel IRN

- Frontend calls **POST** `{VITE_EINVOICE_API_URL}/cancel` with body: `{ "irn": "<irn>", "reason": "Cancelled" }`.
- Your backend should call Clear’s cancel API (e.g. `POST /einvoice/cancel`) and return success/error.

---

## Step 6 – Env and lock after IRN

- In **.env** set:
  - `VITE_EINVOICE_API_URL=https://your-backend.com/api/billing/e-invoice`  
  (or your Supabase Edge Function / Node/FastAPI base path).
- Optional seller defaults (used by `buildEInvoicePayload` if you don’t override in backend):
  - `VITE_SUPPLIER_GSTIN`, `VITE_SUPPLIER_LEGAL_NAME`, `VITE_SUPPLIER_ADDRESS`, `VITE_SUPPLIER_LOC`, `VITE_SUPPLIER_PIN`, `VITE_SUPPLIER_STATE_CODE`

**Invoice lock:** Once an invoice has **IRN** (e-invoice generated), the ERP **disables Edit** for that invoice so the invoice is not changed after IRN.

---

## Step 7 – End-to-end flow in ERP

1. User creates/saves invoice in **Create Invoice** (no e-invoice yet).
2. In **Manage Invoices**, user clicks **Generate E-Invoice** (green icon).
3. Frontend builds NIC-style JSON, POSTs to your backend.
4. Backend gets Clear token → POSTs to Clear → gets IRN, Ack No, Ack Date, QR.
5. Backend returns `{ irn, ackNo, ackDt, signedQR }` to frontend.
6. Frontend saves these on the invoice (and to DB if using Supabase).
7. Invoice appears in **Generated E-Invoice**; **Edit** is disabled for it.
8. **Download PDF** from Generated E-Invoice shows **GST INVOICE** with IRN, Ack No, Ack Date, and QR at the top (government-style layout).

---

## HSN and place of supply

- **Fire manpower / security services:** use **998536** (already set in payload when no HSN from PO).
- **Place of supply:** Must be correct for IRP. Frontend derives **Pos** from buyer GSTIN (first 2 digits). Ensure buyer GSTIN is captured in Create Invoice and sent in `bill.gstin`.

---

## Clear pricing and support

- Typically **₹2–₹5 per invoice** (volume-dependent).  
- For exact API endpoints, request/response schema, and auth: use Clear’s official docs and the link above.
