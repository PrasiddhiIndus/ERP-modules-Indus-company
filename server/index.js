import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import QRCode from 'qrcode';

dotenv.config({ path: '.env.server' });
dotenv.config();

const app = express();
// Render/Railway/Fly set PORT; local dev uses SERVER_PORT or 8787.
const PORT = Number(process.env.PORT || process.env.SERVER_PORT || 8787);
const debugInvoiceSnapshots = new Map();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

function getRequiredEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`Missing required server env: ${name}`);
  }
  return String(v).trim();
}

function cfg() {
  return {
    baseUrl: (process.env.WHITEBOOKS_BASE_URL || 'https://api.whitebooks.in').trim(),
    email: getRequiredEnv('WHITEBOOKS_EMAIL'),
    username: getRequiredEnv('WHITEBOOKS_USERNAME'),
    password: getRequiredEnv('WHITEBOOKS_PASSWORD'),
    ipAddress: getRequiredEnv('WHITEBOOKS_IP_ADDRESS'),
    clientId: getRequiredEnv('WHITEBOOKS_CLIENT_ID'),
    clientSecret: getRequiredEnv('WHITEBOOKS_CLIENT_SECRET'),
    gstin: getRequiredEnv('WHITEBOOKS_GSTIN'),
  };
}

function authHeaders(authToken = null) {
  const c = cfg();
  const headers = {
    username: c.username,
    ip_address: c.ipAddress,
    client_id: c.clientId,
    client_secret: c.clientSecret,
    gstin: c.gstin,
  };
  if (authToken) headers['auth-token'] = authToken;
  return headers;
}

function isAuthSuccess(data) {
  const code = String(data?.status_cd ?? '').toLowerCase();
  const desc = String(data?.status_desc ?? '').toLowerCase();
  return code === '1' || code === 'success' || code === 'sucess' || desc.includes('succeeds') || desc.includes('success');
}

function isProviderSuccess(data) {
  const code = String(data?.status_cd ?? '').toLowerCase();
  const desc = String(data?.status_desc ?? '').toLowerCase();
  return code === '1' || code === 'success' || code === 'sucess' || desc.includes('succeeds') || desc.includes('success');
}

function extractProviderErrors(data) {
  const list = data?.ErrorDetails || data?.errorDetails || data?.errors || data?.Error || [];
  if (!Array.isArray(list)) return [];
  return list
    .map((e) => e?.ErrorMessage || e?.message || e?.error || JSON.stringify(e))
    .filter(Boolean);
}

async function authenticate() {
  const c = cfg();
  const url = `${c.baseUrl}/einvoice/authenticate?email=${encodeURIComponent(c.email)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      ...authHeaders(),
      password: c.password,
      accept: '*/*',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !isAuthSuccess(data)) {
    throw new Error(data?.status_desc || data?.message || `Whitebooks authentication failed (${res.status}).`);
  }
  const token = data?.data?.AuthToken || data?.AuthToken || data?.token;
  if (!token) throw new Error('Whitebooks authentication succeeded, but AuthToken missing.');
  return token;
}

function deepFind(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  const target = keys.map((k) => k.toLowerCase());
  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    for (const [k, v] of Object.entries(cur)) {
      if (target.includes(k.toLowerCase())) return v;
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return undefined;
}

async function asQrDataUrl(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('data:image/')) return value;
  if (/^[A-Za-z0-9+/=]+$/.test(value)) return `data:image/png;base64,${value}`;
  return QRCode.toDataURL(value, { margin: 1, width: 240 });
}

function mapGenerateResponse(data) {
  const irn = deepFind(data, ['Irn', 'IRN', 'irn']) || null;
  const ackNo = deepFind(data, ['AckNo', 'ackNo', 'ack_no']) || null;
  const ackDt = deepFind(data, ['AckDt', 'ackDt', 'ack_dt']) || null;
  const signedInvoice = deepFind(data, ['SignedInvoice', 'signedInvoice']) || null;
  const rawSignedQr = deepFind(data, ['SignedQRCode', 'SignedQR', 'signedQR', 'QRCode', 'qr']) || null;
  return { irn, ackNo, ackDt, signedInvoice, rawSignedQr };
}

function normalizeStateCode(v) {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  return s.padStart(2, '0');
}

function normalizePin(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  const pin = Math.trunc(n);
  if (pin < 100000 || pin > 999999) return undefined;
  return pin;
}

const STATE_DEFAULT_PIN = {
  '01': 190001, '02': 171001, '03': 141001, '04': 134109, '06': 122001, '07': 110001,
  '08': 302001, '09': 226001, '10': 800001, '11': 190001, '12': 791001, '13': 797001,
  '14': 795001, '15': 796001, '16': 799001, '17': 793001, '18': 781001, '19': 700001,
  '20': 834001, '21': 751001, '22': 492001, '23': 462001, '24': 391740, '26': 396230,
  '27': 400001, '29': 562001, '30': 682001, '33': 600001, '36': 500001, '37': 520001,
};

const STATE_PIN_RANGES = {
  '01': [190001, 194999], '02': [171001, 177999], '03': [140001, 152999], '04': [160001, 160999],
  '06': [121001, 136999], '07': [110001, 110999], '08': [301001, 345999], '09': [201001, 285999],
  '10': [800001, 854999], '11': [737101, 737199], '12': [790001, 792999], '13': [797001, 798999],
  '14': [795001, 795999], '15': [796001, 796999], '16': [799001, 799999], '17': [793001, 794999],
  '18': [781001, 788999], '19': [700001, 743999], '20': [814101, 835999], '21': [751001, 769999],
  '22': [490001, 497999], '23': [450001, 488999], '24': [360001, 396999], '26': [396001, 396999],
  '27': [400001, 445999], '29': [560000 + 1, 591999], '30': [670001, 695999], '33': [600001, 643999],
  '36': [500001, 509999], '37': [500001, 535999],
};

function resolveFallbackBuyerPin(stateCode) {
  const sc = normalizeStateCode(stateCode);
  if (sc) {
    const stateSpecific = normalizePin(process.env[`WHITEBOOKS_FALLBACK_BUYER_PIN_STATE_${sc}`]);
    if (stateSpecific) return stateSpecific;
    if (STATE_DEFAULT_PIN[sc]) return STATE_DEFAULT_PIN[sc];
  }
  return normalizePin(process.env.WHITEBOOKS_FALLBACK_BUYER_PIN) || 391740;
}

function resolveStatePinnedBuyerPin(stateCode, preferredPin) {
  const sc = normalizeStateCode(stateCode);
  const stateFallback = resolveFallbackBuyerPin(sc);
  // For IRN generation stability, always pin by buyer GSTIN state.
  // This avoids repeated NIC 3039 state/pincode mismatch errors from stale form data.
  if (sc) return stateFallback;
  return normalizePin(preferredPin) || stateFallback;
}

function pinMatchesState(pin, stateCode) {
  const sc = normalizeStateCode(stateCode);
  const p = normalizePin(pin);
  if (!sc || !p) return false;
  const range = STATE_PIN_RANGES[sc];
  if (!range) return true;
  return p >= range[0] && p <= range[1];
}

function parseStatusDescErrors(statusDesc) {
  if (!statusDesc || typeof statusDesc !== 'string') return [];
  const s = statusDesc.trim();
  if (!s.startsWith('[')) return [];
  try {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((e) => e?.ErrorMessage || e?.message || '')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function extractErrorCodes(data) {
  const parsed = parseStatusDescErrors(data?.status_desc);
  const codes = [];
  if (Array.isArray(parsed) && parsed.length) {
    try {
      const arr = JSON.parse(String(data?.status_desc || '[]'));
      if (Array.isArray(arr)) {
        arr.forEach((e) => {
          if (e?.ErrorCode) codes.push(String(e.ErrorCode));
        });
      }
    } catch {
      // ignore
    }
  }
  const direct = data?.ErrorDetails || data?.errorDetails || [];
  if (Array.isArray(direct)) {
    direct.forEach((e) => {
      if (e?.ErrorCode) codes.push(String(e.ErrorCode));
    });
  }
  return Array.from(new Set(codes));
}

function pinFromText(...parts) {
  const joined = parts
    .filter(Boolean)
    .map((p) => String(p))
    .join(' ');
  const match = joined.match(/\b\d{6}\b/);
  return match ? normalizePin(match[0]) : undefined;
}

function requiresBuyerEnrichment(payload) {
  const buyer = payload?.BuyerDtls || {};
  const gstin = String(buyer?.Gstin || '').trim().toUpperCase();
  if (!gstin || gstin === 'URP') return false;
  const pin = normalizePin(buyer?.Pin);
  return !pin || pin === 999999;
}

async function fetchGstinDetails(token, gstin) {
  const c = cfg();
  const url = `${c.baseUrl}/einvoice/type/GSTNDETAILS/version/V1_03?param1=${encodeURIComponent(
    gstin
  )}&email=${encodeURIComponent(c.email)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      ...authHeaders(token),
      accept: '*/*',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !isProviderSuccess(data)) {
    throw new Error(data?.status_desc || data?.message || `GSTNDETAILS failed (${res.status}).`);
  }
  const details = data?.data || {};
  return {
    legalName: details?.LegalName || details?.TradeName || undefined,
    tradeName: details?.TradeName || details?.LegalName || undefined,
    addr1: [details?.AddrBno, details?.AddrBnm].filter(Boolean).join(' ').trim() || undefined,
    addr2: details?.AddrSt || undefined,
    loc: details?.AddrLoc || undefined,
    pin: normalizePin(details?.AddrPncd),
    stcd: normalizeStateCode(details?.StateCode),
  };
}

async function enrichPayloadForB2B(payload, token) {
  if (!requiresBuyerEnrichment(payload)) return payload;
  const safe = JSON.parse(JSON.stringify(payload));
  const buyer = safe.BuyerDtls || {};
  const gstin = String(buyer?.Gstin || '').trim().toUpperCase();
  const gstinState = gstin && gstin !== 'URP' ? normalizeStateCode(gstin.slice(0, 2)) : undefined;
  const buyerState = gstinState || normalizeStateCode(buyer?.Stcd);
  let details = {};
  try {
    details = await fetchGstinDetails(token, gstin);
  } catch {
    // keep proceeding with available buyer payload + fallbacks
    details = {};
  }
  const computedPin =
    normalizePin(buyer?.Pin) ||
    details.pin ||
    pinFromText(buyer?.Addr1, buyer?.Addr2, buyer?.Loc);
  safe.BuyerDtls = {
    ...buyer,
    LglNm: buyer?.LglNm || details.legalName || buyer?.TrdNm || 'Buyer',
    TrdNm: buyer?.TrdNm || details.tradeName || buyer?.LglNm || undefined,
    Addr1: buyer?.Addr1 || details.addr1 || 'Address not available',
    Addr2: buyer?.Addr2 || details.addr2 || undefined,
    Loc: buyer?.Loc || details.loc || undefined,
    Pin: computedPin,
    // For B2B, state must match GSTIN state to avoid ErrorCode 2265.
    Stcd: buyerState || details.stcd,
    Pos: buyerState || details.stcd,
  };
  return safe;
}

function normalizeBuyerForB2B(payload, sellerGstin) {
  const safe = payload || {};
  const buyer = safe.BuyerDtls || {};
  const buyerGstin = String(buyer?.Gstin || '').trim().toUpperCase();
  const seller = String(sellerGstin || '').trim().toUpperCase();
  if (!buyerGstin || buyerGstin === 'URP') return safe;
  const buyerState = normalizeStateCode(buyerGstin.slice(0, 2)) || normalizeStateCode(buyer?.Stcd);
  const textPin = pinFromText(buyer?.Addr1, buyer?.Addr2, buyer?.Loc);
  const pin = normalizePin(buyer?.Pin) || textPin;
  safe.BuyerDtls = {
    ...buyer,
    Gstin: buyerGstin,
    Stcd: buyerState || buyer?.Stcd,
    Pos: buyerState || buyer?.Pos,
    Pin: pin,
  };
  return safe;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'whitebooks-einvoice-proxy' });
});

app.get('/api/debug/invoice/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  const snap = id ? debugInvoiceSnapshots.get(id) : null;
  if (!snap) {
    return res.status(404).json({
      message: 'No debug snapshot found for this id. Generate e-invoice for this invoice id first.',
      id,
    });
  }
  return res.json(snap);
});

app.post('/api/billing/e-invoice/generate', async (req, res) => {
  try {
    const { payload, billId, invoice } = req.body || {};
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ message: 'Missing e-invoice payload body.' });
    }
    const invoicePin =
      Number(invoice?.buyerPin) || Number(invoice?.buyer?.pin) || Number(invoice?.buyer?.pinCode);
    // eslint-disable-next-line no-console
    console.log('Step1 - invoicePin from DB:', invoicePin);
    if (!payload.BuyerDtls || typeof payload.BuyerDtls !== 'object') {
      payload.BuyerDtls = {};
    }
    if (Number.isFinite(invoicePin) && invoicePin > 0) {
      payload.BuyerDtls.Pin = invoicePin;
    }
    const token = await authenticate();
    const finalPayload = await enrichPayloadForB2B(payload, token);
    // eslint-disable-next-line no-console
    console.log('Step2 - after enrichPayload Pin:', finalPayload.BuyerDtls?.Pin);
    const c = cfg();
    normalizeBuyerForB2B(finalPayload, finalPayload?.SellerDtls?.Gstin || c.gstin);
    // eslint-disable-next-line no-console
    console.log('Step3 - after normalizeBuyer Pin:', finalPayload.BuyerDtls?.Pin);

    // Force B2B recipient state consistency with GSTIN before generate call.
    const b = finalPayload?.BuyerDtls || {};
    const gst = String(b?.Gstin || '').trim().toUpperCase();
    if (gst && gst !== 'URP') {
      const gstState = normalizeStateCode(gst.slice(0, 2));
      if (gstState) {
        finalPayload.BuyerDtls = {
          ...b,
          Stcd: gstState,
          Pos: gstState,
          Pin: normalizePin(invoicePin) || normalizePin(b?.Pin),
        };
      }
    }

    if (!finalPayload.BuyerDtls?.Pin || finalPayload.BuyerDtls.Pin === 560001) {
      return res.status(422).json({
        message: 'Buyer PIN is missing or incorrect. Please update buyer details.',
      });
    }
    const finalBuyerState = normalizeStateCode(finalPayload?.BuyerDtls?.Stcd || String(gst || '').slice(0, 2));
    if (!pinMatchesState(finalPayload?.BuyerDtls?.Pin, finalBuyerState)) {
      const autoPinned = resolveStatePinnedBuyerPin(finalBuyerState, finalPayload?.BuyerDtls?.Pin);
      // eslint-disable-next-line no-console
      console.warn(
        `Buyer PIN ${finalPayload?.BuyerDtls?.Pin} mismatched state ${finalBuyerState}; auto-corrected to ${autoPinned}.`
      );
      finalPayload.BuyerDtls.Pin = autoPinned;
    }
    if (!pinMatchesState(finalPayload?.BuyerDtls?.Pin, finalBuyerState)) {
      return res.status(422).json({
        message: `Buyer PIN could not be resolved for buyer state ${finalBuyerState}. Please update buyer details.`,
      });
    }
    // eslint-disable-next-line no-console
    console.log('Step4 - FINAL Pin being sent:', finalPayload.BuyerDtls?.Pin);

    if (billId != null) {
      debugInvoiceSnapshots.set(String(billId), {
        buyerGstin: invoice?.buyerGstin || invoice?.buyer?.gstin || finalPayload?.BuyerDtls?.Gstin || null,
        buyerPin:
          invoice?.buyerPin ||
          invoice?.buyer?.pin ||
          invoice?.buyer?.pinCode ||
          finalPayload?.BuyerDtls?.Pin ||
          null,
        buyerCity: invoice?.buyerCity || invoice?.buyer?.city || finalPayload?.BuyerDtls?.Loc || null,
        rawBuyer: invoice?.buyer || null,
        rawInvoice: invoice || null,
        payloadBuyer: finalPayload?.BuyerDtls || null,
      });
    }

    const url = `${c.baseUrl}/einvoice/type/GENERATE/version/V1_03?email=${encodeURIComponent(c.email)}`;
    const sellerGstin = String(finalPayload?.SellerDtls?.Gstin || '').trim().toUpperCase();
    const buyerGstin = String(finalPayload?.BuyerDtls?.Gstin || '').trim().toUpperCase();
    if (sellerGstin && buyerGstin && sellerGstin === buyerGstin) {
      return res.status(422).json({
        message:
          'Buyer GSTIN cannot be same as Seller GSTIN. Please correct Buyer (Bill To) GSTIN in your invoice/PO data.',
      });
    }

    const callGenerate = async (bodyPayload) =>
      fetch(url, {
        method: 'POST',
        headers: {
          ...authHeaders(token),
          'Content-Type': 'application/json',
          accept: '*/*',
        },
        body: JSON.stringify(bodyPayload),
      });

    let wbRes = await callGenerate(finalPayload);
    let wbData = await wbRes.json().catch(() => ({}));

    // If token expires unexpectedly, refresh once and retry.
    if (wbRes.status === 401) {
      const retryToken = await authenticate();
      const retryHeaders = {
        ...authHeaders(retryToken),
        'Content-Type': 'application/json',
        accept: '*/*',
      };
      wbRes = await fetch(url, { method: 'POST', headers: retryHeaders, body: JSON.stringify(finalPayload) });
      wbData = await wbRes.json().catch(() => ({}));
    }

    if (!wbRes.ok || !isProviderSuccess(wbData)) {
      const providerErrors = [
        ...extractProviderErrors(wbData),
        ...parseStatusDescErrors(wbData?.status_desc),
      ];
      const errorCodes = extractErrorCodes(wbData);
      const sameGstinHint = errorCodes.includes('2211')
        ? 'Buyer GSTIN equals Seller GSTIN. Please fix Buyer GSTIN in invoice data.'
        : null;
      return res.status(wbRes.status).json({
        message:
          sameGstinHint ||
          providerErrors[0] ||
          wbData?.status_desc ||
          wbData?.message ||
          `Whitebooks generate failed (${wbRes.status})`,
        errors: providerErrors,
        providerResponse: wbData,
      });
    }
    const mapped = mapGenerateResponse(wbData);
    if (!mapped.irn) {
      return res.status(422).json({
        message: wbData?.status_desc || 'Whitebooks did not return IRN.',
        providerResponse: wbData,
      });
    }
    const signedQR = await asQrDataUrl(mapped.rawSignedQr);
    res.json({
      billId: billId ?? null,
      irn: mapped.irn,
      ackNo: mapped.ackNo,
      ackDt: mapped.ackDt,
      signedQR,
      signedInvoice: mapped.signedInvoice,
      providerResponse: wbData,
    });
  } catch (err) {
    res.status(500).json({ message: err?.message || 'Failed to generate IRN.' });
  }
});

app.post('/api/billing/e-invoice/cancel', async (req, res) => {
  try {
    const { irn, reason = 'Wrong entry', cancelReasonCode = '1' } = req.body || {};
    if (!irn) return res.status(400).json({ message: 'irn is required.' });
    const token = await authenticate();
    const c = cfg();
    const url = `${c.baseUrl}/einvoice/type/CANCEL/version/V1_03?email=${encodeURIComponent(c.email)}`;
    const wbRes = await fetch(url, {
      method: 'POST',
      headers: {
        ...authHeaders(token),
        'Content-Type': 'application/json',
        accept: '*/*',
      },
      body: JSON.stringify({
        Irn: irn,
        CnlRsn: String(cancelReasonCode),
        CnlRem: String(reason),
      }),
    });
    const wbData = await wbRes.json().catch(() => ({}));
    if (!wbRes.ok) {
      return res.status(wbRes.status).json({
        message: wbData?.status_desc || wbData?.message || `Whitebooks cancel failed (${wbRes.status})`,
        providerResponse: wbData,
      });
    }
    res.json(wbData);
  } catch (err) {
    res.status(500).json({ message: err?.message || 'Failed to cancel IRN.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`Whitebooks proxy listening on port ${PORT}`);
});

