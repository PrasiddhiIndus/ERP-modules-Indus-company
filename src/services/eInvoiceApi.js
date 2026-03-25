/**
 * E-Invoice API – ClearTax (Clear) / NIC IRP integration.
 *
 * Flow: ERP (frontend) → Your Backend → Clear API → IRP → IRN/QR/Ack → Save in ERP.
 * Never call Clear from the browser; use VITE_EINVOICE_API_URL to your backend.
 *
 * Clear API ref: https://cleartax.in/s/e-invoicing-api-system
 * Backend must: get Bearer token (Client ID/Secret), POST e-invoice JSON to Clear,
 * return { irn, ackNo, ackDt, signedQR } (signedQR = base64 or data URL of QR image).
 */

const EINVOICE_API_BASE = import.meta.env?.VITE_EINVOICE_API_URL || '/api/billing/e-invoice';

/** Format date as DD/MM/YYYY for NIC schema */
function formatDateNIC(d) {
  if (!d) return '';
  const dt = new Date(d);
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const year = dt.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Build e-invoice JSON as per NIC / Clear schema.
 * Use HSN 998536 for fire manpower services; place of supply must be correct for IRP.
 */
export function buildEInvoicePayload(bill, wopo = null) {
  const supplierGstin = import.meta.env?.VITE_SUPPLIER_GSTIN || '24AADCJ2182H1ZS';
  const supplierName = import.meta.env?.VITE_SUPPLIER_LEGAL_NAME || 'Indus Fire Safety Pvt Ltd';
  const supplierAddress = import.meta.env?.VITE_SUPPLIER_ADDRESS || 'Block No 501, Old NH-8, Opposite GSFC Main Gate, Vadodara, Dashrath, Vadodara';
  const supplierLoc = import.meta.env?.VITE_SUPPLIER_LOC || 'Vadodara';
  const supplierPin = Number(import.meta.env?.VITE_SUPPLIER_PIN) || 390010;
  const supplierStcd = import.meta.env?.VITE_SUPPLIER_STATE_CODE || '24';

  const buyerGstin = (bill.gstin && String(bill.gstin).trim()) ? String(bill.gstin).trim().toUpperCase() : 'URP';
  const buyerPos = buyerGstin !== 'URP' ? buyerGstin.slice(0, 2) : '24';

  const invDate = bill.invoice_date || bill.created_at || new Date().toISOString().slice(0, 10);
  const gstRate = Number(bill.cgstRate) + Number(bill.sgstRate) || 18;

  const ItemList = (bill.items || []).map((item, idx) => {
    const qty = Number(item.quantity) || 0;
    const rate = parseFloat(String(item.rate).replace(/[^0-9.]/g, '')) || 0;
    const totAmt = parseFloat(String(item.amount).replace(/[^0-9.]/g, '')) || 0;
    const hsn = (wopo && (wopo.hsn_sac || wopo.sacCode || wopo.hsnCode)) ? String(wopo.hsn_sac || wopo.sacCode || wopo.hsnCode).replace(/\D/g, '').slice(0, 6) : '998536';
    return {
      SlNo: String(idx + 1),
      PrdDesc: (item.description || item.designation || 'Fire manpower services').substring(0, 100),
      HsnCd: hsn || '998536',
      Qty: qty,
      Unit: 'NOS',
      UnitPrice: Math.round(rate * 100) / 100,
      TotAmt: Math.round(totAmt * 100) / 100,
      GstRt: gstRate,
    };
  });

  if (ItemList.length === 0) {
    const amt = Number(bill.calculatedInvoiceAmount ?? bill.totalAmount ?? 0);
    const taxable = Number(bill.taxableValue) || amt / (1 + gstRate / 100);
    ItemList.push({
      SlNo: '1',
      PrdDesc: 'Fire manpower / security services',
      HsnCd: '998536',
      Qty: 1,
      Unit: 'NOS',
      UnitPrice: Math.round(taxable * 100) / 100,
      TotAmt: Math.round(taxable * 100) / 100,
      GstRt: gstRate,
    });
  }

  const TotInvVal = ItemList.reduce((s, i) => s + (i.TotAmt || 0), 0);
  const AssVal = ItemList.reduce((s, i) => s + (i.TotAmt || 0), 0);

  return {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B' },
    DocDtls: {
      Typ: 'INV',
      No: (bill.bill_number || bill.taxInvoiceNumber || '').trim(),
      Dt: formatDateNIC(invDate),
    },
    SellerDtls: {
      Gstin: supplierGstin,
      LglNm: supplierName,
      Addr1: supplierAddress,
      Loc: supplierLoc,
      Pin: supplierPin,
      Stcd: supplierStcd,
    },
    BuyerDtls: {
      Gstin: buyerGstin,
      LglNm: (bill.client_name || bill.clientLegalName || 'Buyer').trim(),
      Pos: buyerPos,
      Addr1: (bill.client_address || bill.clientAddress || '').trim() || undefined,
    },
    ItemList,
    ValDtls: {
      AssVal: Math.round(AssVal * 100) / 100,
      TotInvVal: Math.round(TotInvVal * 100) / 100,
    },
    _meta: { billId: bill.id, oc_number: bill.oc_number },
  };
}

/**
 * Generate E-Invoice: POST payload to your backend. Backend calls Clear API and returns IRN, Ack, QR.
 * Response must include: irn, ackNo, ackDt, signedQR? (base64 or data URL for PDF QR).
 */
export async function generateEInvoice(bill, wopo = null) {
  const payload = buildEInvoicePayload(bill, wopo);

  try {
    const res = await fetch(`${EINVOICE_API_BASE}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billId: bill.id, payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return mapBackendResponse(data);
    }
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  } catch (e) {
    if (import.meta.env?.VITE_EINVOICE_API_URL) throw e;
    return mockResponse(bill);
  }
}

function mapBackendResponse(data) {
  const irn = data.irn || data.Irn || data.IRN;
  const ackNo = data.ackNo ?? data.AckNo ?? data.ack_no;
  const ackDt = data.ackDt ?? data.AckDt ?? data.ack_dt;
  let signedQR = data.signedQR ?? data.SignedQR ?? data.qr ?? data.QR;
  if (typeof signedQR === 'string' && signedQR.length > 0 && !signedQR.startsWith('data:')) {
    if (/^[A-Za-z0-9+/=]+$/.test(signedQR)) signedQR = `data:image/png;base64,${signedQR}`;
  }
  return { irn, ackNo, ackDt, signedQR: signedQR || null };
}

function mockResponse(bill) {
  return {
    irn: `MOCK-IRN-${(bill.bill_number || bill.id).toString().replace(/\s/g, '')}-${Date.now()}`,
    ackNo: String(Math.floor(100000000000000 + Math.random() * 900000000000000)).slice(0, 15),
    ackDt: new Date().toISOString().slice(0, 10),
    signedQR: null,
    message: 'E-Invoice (mock). Set VITE_EINVOICE_API_URL to your backend for Clear/IRP.',
  };
}

/**
 * Cancel E-Invoice (IRN). Backend should call Clear POST /einvoice/cancel.
 */
export async function cancelEInvoice(irn, reason = 'Cancelled') {
  try {
    const res = await fetch(`${EINVOICE_API_BASE}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ irn, reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  } catch (e) {
    if (import.meta.env?.VITE_EINVOICE_API_URL) throw e;
    return { success: true, message: 'Cancel (mock).' };
  }
}
