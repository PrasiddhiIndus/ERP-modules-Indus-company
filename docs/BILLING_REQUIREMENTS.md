# Billing Module – Core Requirements

## 2. Core Workflow & Logic

- **OC Number → Auto-fetch:** When a user enters an OC Number, the system must auto-fetch all associated Client/Commercial data for that site.
- **Bill Templates under Work Order:** Bill Templates are a sub of Work Order (WO); templates are defined per WO.
- **Input rules:** Users may edit **only the "Quantity"** field when creating/editing bill lines. All rates, taxes, and formulas are **locked** and sourced from WO/PO.
- **Billing Method:** Before invoice generation, the user must select a method: **Per Day / Monthly / Lump Sum**.
- **Reverse engineering / Traceability:** Every data point on the final invoice must be traceable back to its source (WO/PO, line, rate, tax rule).

## 3. Critical Features & Controls

- **E-Invoicing:** Direct API integration with the Government portal. Invoices, E-Invoices, and Credit Notes must use the **exact same layout**.
- **Approval matrix:** Standard bills follow a basic approval flow.
- **Hard stop:** Any change in rates due to "Minimum Wages" or "Billing Methods" requires **senior-level approval** before the invoice can be generated.
- **Credit Note:** The "Create Credit Note" button is **disabled by default**. It unlocks only **after a manager approves** the credit-note request (prevents excessive generation).
- **Audit trail:** Cancelled bills are **moved to Billing History**, not deleted from the database.
- **Attachments:** Ability to upload/link **PDF/Excel attendance sheets** to specific invoices.

## 4. Reporting & Alerts

- **Report:** Compare **Estimated Revenue vs Actual Billed**, filterable by **Month**, **Year**, or **Specific Sites**.
- **Automated red-flag alerts:**
  - **PO Expiry:** Alert X days before the Work Order expires.
  - **Quantity Breach:** Alert if Billed Qty > Work Order Qty.
  - **Additional Billing:** Alert for any additional payment.
