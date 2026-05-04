import QRCode from 'qrcode';
import { resolveBuyerStateAndPin } from '../utils/gstStatePin';

/**
 * E-Invoice API integration.
 *
 * Backend-only mode (default): the frontend calls our backend endpoint; the backend talks to
 * Whitebooks so credentials stay server-side. Supported provider values include `backend` and
 * direct `whitebooks`; for production, avoid exposing secrets via VITE_* (they bundle into the browser).
 *
 * Product flow (example — Commercial / Manpower & Training):
 *   PO Entry → approved → Create Invoice → approved → Manage Invoices → open Tax Invoice view →
 *   "Generate E-Invoice" → browser calls our Node proxy → Whitebooks (https://api.whitebooks.in) →
 *   GST IRP (government). IRN, Ack No, and Ack Date come back in the API response and are stored on the invoice.
 *
 * If the console still shows: "IRN was not returned by backend/provider" from a file like
 * `index-CCdFfSbw.js`, that text is from an OLD production bundle — the current source no longer
 * contains it. Fix: `npm run build`, deploy the new `dist` assets, hard-refresh or clear site cache.
 * Then use DevTools → Network on `.../e-invoice/generate` — the JSON must be from your Node server
 * (not HTML). If the body shows `providerResponse` / `status_desc`, that is the NIC/Whitebooks
 * validation message to fix (GSTIN, HSN, buyer PIN vs state, etc.).
 */

const EINVOICE_API_BASE = import.meta.env?.VITE_EINVOICE_API_URL || '/api/billing/e-invoice';
const EINVOICE_PROVIDER = String(import.meta.env?.VITE_EINVOICE_PROVIDER || 'backend').toLowerCase();
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
    const rawText = await res.text();
    let data = {};
    try {
      data = rawText && rawText.trim() ? JSON.parse(rawText) : {};
    } catch {
      if (res.ok && /^\s*</.test(rawText)) {
        throw new Error(
          `E-invoice API returned a web page (HTML) instead of JSON. The browser called ${EINVOICE_API_BASE}/generate — on production, reverse-proxy /api to the Node e-invoice server, or set VITE_EINVOICE_API_URL to the full API base URL.`
        );
      }
      throw new Error(
        `E-invoice API returned invalid JSON (HTTP ${res.status}). ${rawText?.slice(0, 200) || 'Empty body.'}`
      );
    }
    if (res.ok) {
      const mapped = mapBackendResponse(data);
      if (!mapped?.irn || String(mapped.irn).startsWith('MOCK-IRN-')) {
        const detail = extractEInvoiceFailureDetail(data);
        const fromProvider =
          deepFindValueByKeys(data?.providerResponse || {}, ['status_desc', 'StatusDesc']) ||
          data?.providerResponse?.status_desc;
        const nicMsg =
          deepFindValueByKeys(data?.providerResponse || {}, ['ErrorMessage', 'errorMessage']) || '';
        const keysHint =
          data && typeof data === 'object'
            ? ` (response fields: ${Object.keys(data).join(', ') || 'none'})`
            : '';
        throw new Error(
          detail ||
            data?.message ||
            fromProvider ||
            data?.status_desc ||
            nicMsg ||
            (Object.keys(data).length === 0
              ? `Empty response from ${EINVOICE_API_BASE}/generate. Check that the API server is running and CORS/proxy is correct.`
              : `E-invoice: no IRN in the response.${keysHint}. In DevTools → Network, open the generate call and read JSON: fix any NIC/Whitebooks error in providerResponse, or ensure /api is proxied to the Node server (or set VITE_EINVOICE_API_URL to https://api.whitebooks.in flow via your backend).`)
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
    if (EINVOICE_PROVIDER === 'whitebooks') throw e;
    if (import.meta.env?.VITE_EINVOICE_API_URL) throw e;
    return mockResponse(bill);
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

/** NIC IRN is typically 64 chars; reject mocks and accidental DFS hits (same rules as server). */
function normalizeNicIrn(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || /\s/.test(s)) return null;
  if (s.toUpperCase().startsWith('MOCK-IRN-')) return null;
  if (s.length < 8 || s.length > 128) return null;
  if (!/^[\w\-+/=]+$/.test(s)) return null;
  return s;
}

/** Same path priority as server `pickRawIrnFromWhitebooks` (Whitebooks root/data/Data + DFS fallback). */
function pickRawIrnFromWhitebooks(data) {
  if (!data || typeof data !== 'object') return null;
  const tryVals = [
    data.irn,
    data.Irn,
    data.IRN,
    data.data?.Irn,
    data.data?.IRN,
    data.data?.irn,
    data.Data?.Irn,
    data.Data?.IRN,
    Array.isArray(data.data) ? data.data[0]?.Irn : undefined,
    Array.isArray(data.data) ? data.data[0]?.IRN : undefined,
  ];
  for (const v of tryVals) {
    if (v != null && String(v).trim() !== '') return v;
  }
  return deepFindValueByKeys(data, ['Irn', 'IRN', 'irn']) ?? null;
}

/** Builds one readable reason from backend JSON when IRN is missing (NIC/WB errors). */
function extractEInvoiceFailureDetail(data) {
  if (!data || typeof data !== 'object') return '';
  const chunks = [];
  const push = (s) => {
    const t = s != null ? String(s).trim() : '';
    if (t) chunks.push(t);
  };
  push(data.message);
  push(data.status_desc);
  const pr = data.providerResponse;
  if (pr && typeof pr === 'object') {
    push(pr.message);
    push(pr.status_desc);
    const ed = pr.ErrorDetails || pr.errorDetails;
    if (Array.isArray(ed)) {
      ed.forEach((e) => push(e?.ErrorMessage || e?.message));
    }
    const sd = pr.status_desc;
    if (typeof sd === 'string' && sd.trim().startsWith('[')) {
      try {
        const arr = JSON.parse(sd.trim());
        if (Array.isArray(arr)) {
          arr.forEach((e) => push(e?.ErrorMessage || e?.message));
        }
      } catch {
        push(sd);
      }
    }
  }
  return [...new Set(chunks)].join(' — ');
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

function pickAckNoFromWhitebooks(data) {
  if (!data || typeof data !== 'object') return null;
  const tryVals = [
    data.AckNo,
    data.ackNo,
    data.ack_no,
    data.data?.AckNo,
    data.data?.ackNo,
    data.data?.ack_no,
    data.Data?.AckNo,
    Array.isArray(data.data) ? data.data[0]?.AckNo : undefined,
  ];
  for (const v of tryVals) {
    if (v != null && String(v).trim() !== '') return v;
  }
  return deepFindValueByKeys(data, ['AckNo', 'ackNo', 'ack_no']) ?? null;
}

function pickAckDtFromWhitebooks(data) {
  if (!data || typeof data !== 'object') return null;
  const tryVals = [
    data.AckDt,
    data.ackDt,
    data.ack_dt,
    data.data?.AckDt,
    data.data?.ackDt,
    data.data?.ack_dt,
    data.Data?.AckDt,
    Array.isArray(data.data) ? data.data[0]?.AckDt : undefined,
  ];
  for (const v of tryVals) {
    if (v != null && String(v).trim() !== '') return v;
  }
  return deepFindValueByKeys(data, ['AckDt', 'ackDt', 'ack_dt']) ?? null;
}

function mapWhitebooksResponse(data) {
  const rawIrn = pickRawIrnFromWhitebooks(data);
  const irn = normalizeNicIrn(rawIrn);
  const ackNo = pickAckNoFromWhitebooks(data);
  const ackDt = pickAckDtFromWhitebooks(data);
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
  if (!data || typeof data !== 'object') {
    return { irn: null, ackNo: null, ackDt: null, signedQR: null };
  }
  const pr = data?.providerResponse;
  const nested = data?.data && typeof data.data === 'object' && !Array.isArray(data.data) ? data.data : null;
  const rawIrn =
    pickRawIrnFromWhitebooks(data) ||
    (pr && pickRawIrnFromWhitebooks(pr)) ||
    nested?.Irn ||
    nested?.irn ||
    nested?.IRN ||
    deepFindValueByKeys(data, ['Irn', 'IRN', 'irn']) ||
    (pr && deepFindValueByKeys(pr, ['Irn', 'IRN', 'irn']));
  const irn = normalizeNicIrn(rawIrn);
  const ackNo =
    pickAckNoFromWhitebooks(data) ||
    (pr && pickAckNoFromWhitebooks(pr)) ||
    nested?.AckNo ||
    nested?.ackNo;
  const ackDt =
    pickAckDtFromWhitebooks(data) ||
    (pr && pickAckDtFromWhitebooks(pr)) ||
    nested?.AckDt ||
    nested?.ackDt;
  let signedQR =
    data?.signedQR ??
    data?.SignedQR ??
    data?.qr ??
    data?.QR ??
    deepFindValueByKeys(data, [
      'SignedQRCode',
      'SignedQR',
      'signedQR',
      'QRCode',
      'qr',
    ]) ??
    (pr &&
      deepFindValueByKeys(pr, ['SignedQRCode', 'SignedQR', 'signedQR', 'QRCode', 'qr']));
  if (typeof signedQR === 'string' && signedQR.length > 0 && !signedQR.startsWith('data:')) {
    if (/^[A-Za-z0-9+/=]+$/.test(signedQR)) signedQR = `data:image/png;base64,${signedQR}`;
  }
  return { irn: irn || null, ackNo: ackNo || null, ackDt: ackDt || null, signedQR: signedQR || null };
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
