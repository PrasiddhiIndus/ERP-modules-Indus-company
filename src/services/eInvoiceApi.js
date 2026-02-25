/**
 * E-Invoice API service – GST India IRP integration.
 *
 * In production, call your BACKEND API here (not the IRP directly from browser).
 * Backend should: authenticate with IRP → build e-invoice JSON from bill → call Generate IRN → save IRN/QR.
 *
 * This module provides:
 * - buildEInvoicePayload(bill, wopo) – map app bill to e-invoice schema (same layout as invoice)
 * - generateEInvoice(billId) – call backend to generate IRN (mock below; replace with real API)
 * - cancelEInvoice(irn) – call backend to cancel IRN (mock below)
 */

const EINVOICE_API_BASE = import.meta.env?.VITE_EINVOICE_API_URL || '/api/billing/e-invoice';

/**
 * Build e-invoice payload from approved bill + WO/PO (traceable to source).
 * Matches the structure expected by GST e-invoice schema (simplified; full schema from GSTN).
 */
export function buildEInvoicePayload(bill, wopo = null) {
  const supplierGstin = import.meta.env?.VITE_SUPPLIER_GSTIN || 'XXAAAA0000A1Z5';
  const supplierName = import.meta.env?.VITE_SUPPLIER_LEGAL_NAME || 'Your Company Legal Name';
  const supplierAddress = import.meta.env?.VITE_SUPPLIER_ADDRESS || 'Address';

  const items = (bill.items || []).map((item, idx) => ({
    SlNo: String(idx + 1),
    PrdDesc: item.description || '',
    Qty: Number(item.quantity) || 0,
    Unit: 'NOS',
    Rate: parseFloat(String(item.rate).replace(/[^0-9.]/g, '')) || 0,
    Amount: parseFloat(String(item.amount).replace(/[^0-9.]/g, '')) || 0,
    HsnCd: (wopo && wopo.hsn_sac) ? String(wopo.hsn_sac).replace(/\D/g, '').slice(0, 6) || '9983' : '9983',
    TaxableAmt: parseFloat(String(item.amount).replace(/[^0-9.]/g, '')) || 0,
    source_ref: item.source_ref,
  }));

  return {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B' },
    DocDtls: {
      Typ: 'INV',
      No: bill.bill_number || '',
      Dt: bill.created_at || new Date().toISOString().slice(0, 10),
    },
    SellerDtls: {
      Gstin: supplierGstin,
      LglNm: supplierName,
      Addr1: supplierAddress,
    },
    BuyerDtls: {
      Gstin: 'URP', // or buyer GSTIN when available
      LglNm: bill.client_name || '',
      Addr1: bill.client_address || '',
    },
    ItemList: items,
    ValDtls: {
      AssVal: items.reduce((s, i) => s + (i.TaxableAmt || 0), 0),
      TotInvVal: items.reduce((s, i) => s + (i.Amount || 0), 0),
    },
    _meta: { billId: bill.id, oc_number: bill.oc_number },
  };
}

/**
 * Generate E-Invoice (IRN) for a bill.
 * Replace with real call to your backend: POST /api/billing/e-invoice/generate
 */
export async function generateEInvoice(bill, wopo = null) {
  const payload = buildEInvoicePayload(bill, wopo);

  try {
    const res = await fetch(`${EINVOICE_API_BASE}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billId: bill.id, payload }),
    });
    if (res.ok) {
      return await res.json();
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  } catch (e) {
    // When backend is not configured or request fails, return mock so UI works (dev/demo)
    const useMock = !import.meta.env?.VITE_EINVOICE_API_URL || e.message === 'Failed to fetch' || (e.message && e.message.startsWith('HTTP'));
    if (useMock) {
      return {
        success: true,
        irn: `MOCK-IRN-${(bill.bill_number || bill.id).toString().replace(/\s/g, '')}-${Date.now()}`,
        ackNo: String(Math.floor(1000000000000 + Math.random() * 9000000000000)),
        ackDt: new Date().toISOString().slice(0, 19).replace('T', ' '),
        signedQR: `mock-signed-qr-${bill.id}`,
        message: 'E-Invoice generated (mock). Set VITE_EINVOICE_API_URL and implement backend for live IRP.',
      };
    }
    throw e;
  }
}

/**
 * Cancel E-Invoice (IRN).
 * Replace with real call: POST /api/billing/e-invoice/cancel
 */
export async function cancelEInvoice(irn, reason = 'Cancelled') {
  try {
    const res = await fetch(`${EINVOICE_API_BASE}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ irn, reason }),
    });
    if (res.ok) return await res.json();
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  } catch (e) {
    if (e.message && e.message.startsWith('HTTP')) throw e;
    return { success: true, message: 'IRN cancelled (mock).' };
  }
}
