import QRCode from 'qrcode';
import { resolveBuyerStateAndPin } from '../utils/gstStatePin';

/**
 * E-Invoice API integration.
 *
 * Backend-only mode:
 * Frontend always calls our backend endpoint; backend talks to Whitebooks.
 * This keeps credentials server-side and avoids provider calls from browser.
 */

const EINVOICE_API_BASE = import.meta.env?.VITE_EINVOICE_API_URL || '/api/billing/e-invoice';
const EINVOICE_PROVIDER = 'backend';
const WHITEBOOKS_BASE_URL = import.meta.env?.VITE_WHITEBOOKS_BASE_URL || 'https://api.whitebooks.in';

/** Format date as DD/MM/YYYY for NIC schema */
function formatDateNIC(d) {
  if (!d) return '';
  const dt = new Date(d);
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const year = dt.getFullYear();
  return `${day}/${month}/${year}`;
}

function extractPinFromText(...parts) {
  const joined = parts
    .filter(Boolean)
    .map((p) => String(p))
    .join(' ');
  const m = joined.match(/\b\d{6}\b/);
  return m ? Number(m[0]) : null;
}

function pickFirstValidPin(...values) {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 100000 && n <= 999999) return n;
  }
  return null;
}

function normalizeHsn6(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 6) return digits;
  // For NIC/Whitebooks B2B, 6-digit HSN is required for eligible taxpayers.
  // Use valid services fallback when incoming value is missing/short.
  return '998536';
}

function normalizeGstin(v) {
  const s = String(v || '').trim().toUpperCase();
  return /^[0-9A-Z]{15}$/.test(s) ? s : '';
}

function resolveBuyerGstin(bill, supplierGstin) {
  const candidates = [
    bill.buyerGstin,
    bill.buyer_gstin,
    bill.clientGstin,
    bill.client_gstin,
    bill.billToGstin,
    bill.bill_to_gstin,
    bill.gstin,
  ]
    .map(normalizeGstin)
    .filter(Boolean);
  const supplier = normalizeGstin(supplierGstin);
  const nonSupplier = candidates.find((g) => g !== supplier);
  return nonSupplier || candidates[0] || 'URP';
}

/**
 * Build e-invoice JSON as per NIC / Clear schema.
 * Use HSN 998536 for fire manpower services; place of supply must be correct for IRP.
 */
export function buildEInvoicePayload(bill, wopo = null) {
  const supplierGstin =
    import.meta.env?.VITE_SUPPLIER_GSTIN ||
    import.meta.env?.VITE_WHITEBOOKS_GSTIN ||
    '24AADCI2182H1ZS';
  const supplierName = import.meta.env?.VITE_SUPPLIER_LEGAL_NAME || 'Indus Fire Safety Pvt Ltd';
  const supplierTradeName = import.meta.env?.VITE_SUPPLIER_TRADE_NAME || supplierName;
  const supplierAddress = import.meta.env?.VITE_SUPPLIER_ADDRESS || 'Block No 501, Old NH-8, Opposite GSFC Main Gate, Vadodara, Dashrath, Vadodara';
  const supplierAddress2 = import.meta.env?.VITE_SUPPLIER_ADDRESS2 || '';
  const supplierLoc = import.meta.env?.VITE_SUPPLIER_LOC || 'Vadodara';
  const supplierPin = Number(import.meta.env?.VITE_SUPPLIER_PIN) || 390010;
  const supplierStcd = import.meta.env?.VITE_SUPPLIER_STATE_CODE || '24';
  const supplierPhone = import.meta.env?.VITE_SUPPLIER_PHONE || '';
  const supplierEmail = import.meta.env?.VITE_SUPPLIER_EMAIL || import.meta.env?.VITE_WHITEBOOKS_EMAIL || '';

  const buyerGstin = resolveBuyerGstin(bill, supplierGstin);
  const buyerStateCode = buyerGstin !== 'URP' ? buyerGstin.slice(0, 2) : '24';
  const buyerPos = buyerStateCode;
  const buyerName = (bill.client_name || bill.clientLegalName || 'Buyer').trim();
  const buyerAddress1 =
    (bill.client_address || bill.clientAddress || '').trim() ||
    (bill.clientShippingAddress || bill.client_shipping_address || '').trim() ||
    'Address not provided';
  const buyerAddress2 = (bill.clientAddress2 || bill.client_address_2 || '').trim();
  const buyerLoc = (bill.clientCity || bill.client_city || 'N/A').trim();
  const buyerPinRaw = pickFirstValidPin(
    bill.buyerPin,
    bill.buyer_pin,
    bill.buyer?.pin,
    bill.buyer?.pinCode,
    bill.buyer?.pincode,
    bill.clientPincode,
    bill.client_pincode
  );
  const buyerPinFromAddress = extractPinFromText(
    bill.client_address || bill.clientAddress || '',
    bill.clientShippingAddress || bill.client_shipping_address || '',
    bill.clientAddress2 || bill.client_address_2 || ''
  );
  const derived = resolveBuyerStateAndPin({
    gstin: buyerGstin,
    placeOfSupply: bill.placeOfSupply || bill.place_of_supply,
    billingAddress: buyerAddress1,
    existingPin: buyerPinRaw || buyerPinFromAddress,
  });
  const buyerPin = derived.pin || null;
  const buyerPhone = String(bill.clientPhone || bill.client_phone || '').trim();
  const buyerEmail = String(bill.clientEmail || bill.client_email || '').trim();

  const invDate = bill.invoice_date || bill.created_at || new Date().toISOString().slice(0, 10);
  const cgstRate = Number(bill.cgstRate) || 0;
  const sgstRate = Number(bill.sgstRate) || 0;
  const igstRate = Number(bill.igstRate) || 0;
  const gstRate = cgstRate + sgstRate || igstRate || 18;
  const intraState = buyerStateCode === supplierStcd;

  const ItemList = (bill.items || []).map((item, idx) => {
    const qty = Number(item.quantity) || 0;
    const rate = parseFloat(String(item.rate).replace(/[^0-9.]/g, '')) || 0;
    const totAmt = parseFloat(String(item.amount).replace(/[^0-9.]/g, '')) || 0;
    const assAmt = Math.round(totAmt * 100) / 100;
    const cgstAmt = intraState ? Math.round((assAmt * cgstRate) / 100 * 100) / 100 : 0;
    const sgstAmt = intraState ? Math.round((assAmt * sgstRate) / 100 * 100) / 100 : 0;
    const igstAmt = intraState ? 0 : Math.round((assAmt * (igstRate || gstRate)) / 100 * 100) / 100;
    const totItemVal = Math.round((assAmt + cgstAmt + sgstAmt + igstAmt) * 100) / 100;
    const hsn = normalizeHsn6(
      item.hsnSac ||
      item.hsn_sac ||
      (wopo && (wopo.hsn_sac || wopo.sacCode || wopo.hsnCode))
    );
    return {
      SlNo: String(idx + 1),
      IsServc: 'Y',
      PrdDesc: (item.description || item.designation || 'Fire manpower services').substring(0, 100),
      HsnCd: hsn || '998536',
      Qty: qty,
      Unit: 'NOS',
      UnitPrice: Math.round(rate * 100) / 100,
      TotAmt: Math.round(totAmt * 100) / 100,
      AssAmt: assAmt,
      GstRt: gstRate,
      CgstAmt: cgstAmt,
      SgstAmt: sgstAmt,
      IgstAmt: igstAmt,
      TotItemVal: totItemVal,
    };
  });

  if (ItemList.length === 0) {
    const amt = Number(bill.calculatedInvoiceAmount ?? bill.totalAmount ?? 0);
    const taxable = Number(bill.taxableValue) || amt / (1 + gstRate / 100);
    ItemList.push({
      SlNo: '1',
      IsServc: 'Y',
      PrdDesc: 'Fire manpower / security services',
      HsnCd: normalizeHsn6('998536'),
      Qty: 1,
      Unit: 'NOS',
      UnitPrice: Math.round(taxable * 100) / 100,
      TotAmt: Math.round(taxable * 100) / 100,
      AssAmt: Math.round(taxable * 100) / 100,
      GstRt: gstRate,
      CgstAmt: intraState ? Math.round((taxable * cgstRate) / 100 * 100) / 100 : 0,
      SgstAmt: intraState ? Math.round((taxable * sgstRate) / 100 * 100) / 100 : 0,
      IgstAmt: intraState ? 0 : Math.round((taxable * (igstRate || gstRate)) / 100 * 100) / 100,
      TotItemVal: intraState
        ? Math.round((taxable + (taxable * cgstRate) / 100 + (taxable * sgstRate) / 100) * 100) / 100
        : Math.round((taxable + (taxable * (igstRate || gstRate)) / 100) * 100) / 100,
    });
  }

  const AssVal = Math.round(ItemList.reduce((s, i) => s + (i.AssAmt || i.TotAmt || 0), 0) * 100) / 100;
  const CgstVal = Math.round(ItemList.reduce((s, i) => s + (i.CgstAmt || 0), 0) * 100) / 100;
  const SgstVal = Math.round(ItemList.reduce((s, i) => s + (i.SgstAmt || 0), 0) * 100) / 100;
  const IgstVal = Math.round(ItemList.reduce((s, i) => s + (i.IgstAmt || 0), 0) * 100) / 100;
  const TotInvVal = Math.round((AssVal + CgstVal + SgstVal + IgstVal) * 100) / 100;

  return {
    Version: '1.1',
    TranDtls: {
      TaxSch: 'GST',
      SupTyp: buyerGstin === 'URP' ? 'B2C' : 'B2B',
      IgstOnIntra: intraState ? 'N' : 'Y',
    },
    DocDtls: {
      Typ: 'INV',
      No: (bill.bill_number || bill.taxInvoiceNumber || '').trim(),
      Dt: formatDateNIC(invDate),
    },
    SellerDtls: {
      Gstin: supplierGstin,
      LglNm: supplierName,
      TrdNm: supplierTradeName,
      Addr1: supplierAddress,
      Addr2: supplierAddress2 || undefined,
      Loc: supplierLoc,
      Pin: supplierPin,
      Stcd: supplierStcd,
      Ph: supplierPhone || undefined,
      Em: supplierEmail || undefined,
    },
    BuyerDtls: {
      Gstin: buyerGstin,
      LglNm: buyerName,
      TrdNm: buyerName,
      Pos: buyerPos,
      Addr1: buyerAddress1,
      Addr2: buyerAddress2 || undefined,
      Loc: buyerLoc || undefined,
      Pin: buyerPin || undefined,
      Stcd: buyerStateCode,
      Ph: buyerPhone || undefined,
      Em: buyerEmail || undefined,
    },
    ItemList,
    ValDtls: {
      AssVal,
      CgstVal,
      SgstVal,
      IgstVal,
      TotInvVal,
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
  const fallbackPinMeta = resolveBuyerStateAndPin({
    gstin: payload?.BuyerDtls?.Gstin || bill?.buyerGstin || bill?.clientGstin,
    placeOfSupply: bill?.placeOfSupply || bill?.place_of_supply,
    billingAddress: bill?.client_address || bill?.clientAddress,
    existingPin: payload?.BuyerDtls?.Pin,
  });
  if (!payload?.BuyerDtls) payload.BuyerDtls = {};
  if (!payload.BuyerDtls.Pin && fallbackPinMeta.pin) payload.BuyerDtls.Pin = fallbackPinMeta.pin;
  const payloadPin = Number(payload?.BuyerDtls?.Pin);
  if (!Number.isFinite(payloadPin) || payloadPin < 100000 || payloadPin > 999999) {
    throw new Error('Buyer PIN code is missing. Please update buyer details before generating e-invoice.');
  }

  try {
    if (EINVOICE_PROVIDER === 'whitebooks') {
      return await generateViaWhitebooks(payload);
    }

    const res = await fetch(`${EINVOICE_API_BASE}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billId: bill.id,
        payload,
        invoice: {
          buyerPin: bill.buyerPin ?? bill.clientPincode ?? bill.client_pincode,
          buyerCity: bill.clientCity ?? bill.client_city,
          buyerGstin: resolveBuyerGstin(bill, payload?.SellerDtls?.Gstin),
          buyer: {
            pin: bill.buyer?.pin ?? bill.clientPincode ?? bill.client_pincode,
            pinCode: bill.buyer?.pinCode ?? bill.clientPincode ?? bill.client_pincode,
            city: bill.buyer?.city ?? bill.clientCity ?? bill.client_city,
            gstin: bill.buyer?.gstin ?? bill.buyerGstin ?? bill.clientGstin ?? bill.client_gstin,
          },
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const mapped = mapBackendResponse(data);
      if (!mapped?.irn || String(mapped.irn).startsWith('MOCK-IRN-')) {
        throw new Error(
          data?.message ||
            data?.status_desc ||
            'IRN was not returned by backend/provider. Please check Whitebooks response and payload.'
        );
      }
      return mapped;
    }
    const errors = Array.isArray(data?.errors) ? data.errors.filter(Boolean) : [];
    const providerErrors = Array.isArray(data?.providerResponse?.ErrorDetails)
      ? data.providerResponse.ErrorDetails
          .map((e) => e?.ErrorMessage || e?.message || '')
          .filter(Boolean)
      : [];
    const finalMessage =
      errors[0] ||
      providerErrors[0] ||
      data.message ||
      data.error ||
      `HTTP ${res.status}`;
    throw new Error(finalMessage);
  } catch (e) {
    throw e;
  }
}

function whitebooksAuthHeaders(authToken = null) {
  const headers = {
    username: import.meta.env?.VITE_WHITEBOOKS_USERNAME || '',
    ip_address: import.meta.env?.VITE_WHITEBOOKS_IP_ADDRESS || '0.0.0.0',
    client_id: import.meta.env?.VITE_WHITEBOOKS_CLIENT_ID || '',
    client_secret: import.meta.env?.VITE_WHITEBOOKS_CLIENT_SECRET || '',
    gstin: import.meta.env?.VITE_WHITEBOOKS_GSTIN || '',
  };
  if (authToken) headers['auth-token'] = authToken;
  return headers;
}

function assertWhitebooksEnv() {
  const required = [
    'VITE_WHITEBOOKS_EMAIL',
    'VITE_WHITEBOOKS_USERNAME',
    'VITE_WHITEBOOKS_PASSWORD',
    'VITE_WHITEBOOKS_CLIENT_ID',
    'VITE_WHITEBOOKS_CLIENT_SECRET',
    'VITE_WHITEBOOKS_GSTIN',
  ];
  const missing = required.filter((k) => !import.meta.env?.[k] || String(import.meta.env?.[k]).trim() === '');
  if (missing.length) {
    throw new Error(`Missing Whitebooks env vars: ${missing.join(', ')}`);
  }
}

function normalizeQrData(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('data:')) return value;
  if (/^[A-Za-z0-9+/=]+$/.test(value)) return `data:image/png;base64,${value}`;
  return value;
}

async function buildQrImageDataUrl(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('data:image/')) return value;
  if (value.startsWith('data:')) return null;
  if (/^[A-Za-z0-9+/=]+$/.test(value)) return `data:image/png;base64,${value}`;
  try {
    return await QRCode.toDataURL(value, { margin: 1, width: 240 });
  } catch {
    return null;
  }
}

function deepFindValueByKeys(obj, candidateKeys) {
  if (!obj || typeof obj !== 'object') return undefined;
  const norm = candidateKeys.map((k) => k.toLowerCase());
  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    Object.entries(cur).forEach(([k, v]) => {
      if (norm.includes(String(k).toLowerCase())) {
        stack.length = 0;
        stack.push({ __found: v });
        return;
      }
      if (v && typeof v === 'object') stack.push(v);
    });
    const top = stack[stack.length - 1];
    if (top && typeof top === 'object' && Object.prototype.hasOwnProperty.call(top, '__found')) {
      return top.__found;
    }
  }
  return undefined;
}

function mapWhitebooksResponse(data) {
  const irn =
    deepFindValueByKeys(data, ['Irn', 'IRN', 'irn']) ||
    data?.irn ||
    data?.Irn;
  const ackNo =
    deepFindValueByKeys(data, ['AckNo', 'ackNo', 'ack_no']) ||
    data?.ackNo;
  const ackDt =
    deepFindValueByKeys(data, ['AckDt', 'ackDt', 'ack_dt']) ||
    data?.ackDt;
  const rawQr =
    deepFindValueByKeys(data, [
      'SignedQRCode',
      'SignedQrCode',
      'SignedQR',
      'signedQR',
      'QrCode',
      'QRCode',
      'qr',
      'QR',
    ]) || data?.signedQR;

  return {
    irn: irn || null,
    ackNo: ackNo || null,
    ackDt: ackDt || null,
    signedQR: normalizeQrData(rawQr),
    raw: data,
  };
}

function isWhitebooksAuthSuccess(data) {
  const code = String(data?.status_cd ?? '').toLowerCase();
  const desc = String(data?.status_desc ?? '').toLowerCase();
  return code === '1' || code === 'sucess' || code === 'success' || desc.includes('success');
}

async function generateViaWhitebooks(payload) {
  assertWhitebooksEnv();

  const email = import.meta.env?.VITE_WHITEBOOKS_EMAIL;
  const authUrl = `${WHITEBOOKS_BASE_URL}/einvoice/authenticate?email=${encodeURIComponent(email)}`;
  const authHeaders = {
    ...whitebooksAuthHeaders(),
    password: import.meta.env?.VITE_WHITEBOOKS_PASSWORD || '',
  };

  const authRes = await fetch(authUrl, { method: 'GET', headers: authHeaders });
  const authData = await authRes.json().catch(() => ({}));
  if (!authRes.ok || !isWhitebooksAuthSuccess(authData)) {
    throw new Error(authData?.status_desc || authData?.message || `Whitebooks auth failed (${authRes.status})`);
  }

  const authToken =
    authData?.data?.AuthToken ||
    authData?.AuthToken ||
    authData?.token;
  if (!authToken) {
    throw new Error('Whitebooks auth succeeded but auth token is missing.');
  }

  const generateUrl = `${WHITEBOOKS_BASE_URL}/einvoice/type/GENERATE/version/V1_03?email=${encodeURIComponent(email)}`;
  const generateRes = await fetch(generateUrl, {
    method: 'POST',
    headers: {
      ...whitebooksAuthHeaders(authToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const generateData = await generateRes.json().catch(() => ({}));
  if (!generateRes.ok) {
    throw new Error(generateData?.status_desc || generateData?.message || `Whitebooks generate failed (${generateRes.status})`);
  }

  const mapped = mapWhitebooksResponse(generateData);
  if (!mapped.signedQR) {
    const rawSignedQr =
      deepFindValueByKeys(generateData, ['SignedQRCode', 'SignedQR', 'signedQR', 'QRCode', 'qr']) ||
      null;
    mapped.signedQR = await buildQrImageDataUrl(rawSignedQr);
  }
  if (!mapped.irn) {
    throw new Error(generateData?.status_desc || 'Whitebooks response did not return IRN.');
  }
  return mapped;
}

function mapBackendResponse(data) {
  const irn =
    data?.irn ||
    data?.Irn ||
    data?.IRN ||
    data?.providerResponse?.data?.Irn ||
    data?.providerResponse?.data?.IRN ||
    data?.providerResponse?.Irn;
  const ackNo =
    data?.ackNo ??
    data?.AckNo ??
    data?.ack_no ??
    data?.providerResponse?.data?.AckNo ??
    data?.providerResponse?.AckNo;
  const ackDt =
    data?.ackDt ??
    data?.AckDt ??
    data?.ack_dt ??
    data?.providerResponse?.data?.AckDt ??
    data?.providerResponse?.AckDt;
  let signedQR =
    data?.signedQR ??
    data?.SignedQR ??
    data?.qr ??
    data?.QR ??
    data?.providerResponse?.data?.SignedQRCode ??
    data?.providerResponse?.data?.SignedQR ??
    data?.providerResponse?.SignedQRCode;
  if (typeof signedQR === 'string' && signedQR.length > 0 && !signedQR.startsWith('data:')) {
    if (/^[A-Za-z0-9+/=]+$/.test(signedQR)) signedQR = `data:image/png;base64,${signedQR}`;
  }
  return { irn, ackNo, ackDt, signedQR: signedQR || null };
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
    throw e;
  }
}
