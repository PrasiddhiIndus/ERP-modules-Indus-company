import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';
import {
  etimeCfg,
  fetchEtimePunchDataMerged,
  fetchEtimePunchesForIsoRange,
  normalizeEtimeDate,
  runAttendanceOverlapSync,
  startAttendanceSyncCron,
  uniqueEtimePunchEndpoints,
} from './attendanceEtime.js';
import { adminUpdateProfile } from './adminProfileApi.js';
import { adminCreateUser } from './adminCreateUserApi.js';
import { adminBulkCreateUsers } from './adminBulkCreateUserApi.js';
import { adminBulkDeleteUsers } from './adminBulkDeleteUserApi.js';
import { createAuthMiddleware } from './authMiddleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

/**
 * Merge env files so an empty `KEY=` in one file does not block a real value in another.
 * Later files override earlier when the new value is non-empty after trim.
 */
function normalizeEnvValue(val) {
  let s = String(val ?? '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function mergeDotenvFiles() {
  const isStaging = String(process.env.ERP_ENV || '').toLowerCase() === 'staging';
  const envSearchPaths = [
    path.join(repoRoot, '.env'),
    path.join(repoRoot, '.env.local'),
  ];
  if (isStaging) {
    envSearchPaths.push(path.join(repoRoot, '.env.staging'));
    envSearchPaths.push(path.join(repoRoot, '.env.server.staging'));
  }
  envSearchPaths.push(
    path.join(repoRoot, '.envserver'),
    path.join(repoRoot, '.env.server'),
    path.join(__dirname, '.env.server')
  );
  for (const filePath of envSearchPaths) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = dotenv.parse(fs.readFileSync(filePath, 'utf8'));
      for (const [key, value] of Object.entries(parsed)) {
        const normalized = normalizeEnvValue(value);
        if (normalized === '') continue;
        process.env[key] = normalized;
      }
    } catch {
      /* ignore missing or unreadable env files */
    }
  }
}

mergeDotenvFiles();

function getSupabaseProjectRefFromUrl(url) {
  const m = String(url || '').match(/https?:\/\/([^.]+)\.supabase\.co/i);
  return m ? m[1] : '';
}

function getSupabaseProjectRefFromJwt(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return '';
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const fromRef = String(payload?.ref || '').trim();
    if (fromRef) return fromRef;
    const iss = String(payload?.iss || '').trim();
    const fromIss = iss.match(/https?:\/\/([^.]+)\.supabase\.co/i);
    return fromIss ? fromIss[1] : '';
  } catch {
    return '';
  }
}

/** Live website (indus-erp.in) — must never share the staging Supabase project. */
const PRODUCTION_SUPABASE_PROJECT_REF = 'wbyzhknaqcjqqtwopupl';
const STAGING_SUPABASE_PROJECT_REF = 'xjzhlbpgnpcmbdlufhwo';

function serviceRoleMatchesUrl(url, svcKey) {
  if (!url || !svcKey || !isSupabaseServiceRoleKey(svcKey)) return false;
  const urlRef = getSupabaseProjectRefFromUrl(url);
  const keyRef = getSupabaseProjectRefFromJwt(svcKey);
  return Boolean(urlRef && keyRef && urlRef === keyRef);
}

/** Staging dev: frontend uses .env.staging; prevent production SUPABASE_* in .env.server from winning. */
function applyStagingSupabaseOverrides() {
  if (String(process.env.ERP_ENV || '').toLowerCase() !== 'staging') return;
  const url = normalizeEnvValue(process.env.VITE_SUPABASE_URL);
  const anon = normalizeEnvValue(process.env.VITE_SUPABASE_ANON_KEY);
  if (url) process.env.SUPABASE_URL = url;
  if (anon) process.env.SUPABASE_ANON_KEY = anon;
}

function getSupabaseUrlForServer() {
  return normalizeEnvValue(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
}

function getSupabaseServiceRoleKeyForServer() {
  const raw = normalizeEnvValue(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SERVICE_ROLE_KEY
  );
  const url = getSupabaseUrlForServer();
  if (raw && url && !serviceRoleMatchesUrl(url, raw)) return '';
  return raw;
}

function getSupabaseAnonKeyForServer() {
  return normalizeEnvValue(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY);
}

applyStagingSupabaseOverrides();

/** Supabase API keys are JWTs; service_role can read `profiles`, anon cannot (RLS). */
function isSupabaseServiceRoleKey(key) {
  try {
    const parts = String(key || '').split('.');
    if (parts.length < 2) return false;
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json);
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

/**
 * Prefer service_role for presign auth (can read profiles). If unset, fall back to anon key +
 * JWT user_metadata.role (same anon key already exposed to the browser via Vite).
 */
function getSupabaseAuthKeyForR2Presign() {
  const svc = getSupabaseServiceRoleKeyForServer();
  if (svc && isSupabaseServiceRoleKey(svc)) {
    return { key: svc, canQueryProfiles: true };
  }
  const anon = getSupabaseAnonKeyForServer();
  if (anon) {
    return { key: anon, canQueryProfiles: false };
  }
  if (svc) {
    return { key: svc, canQueryProfiles: false };
  }
  return { key: '', canQueryProfiles: false };
}

let r2AnonAuthFallbackWarned = false;

class HttpError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = Number(status) || 500;
    this.details = details;
  }
}

const app = express();
const PORT = Number(process.env.PORT || process.env.SERVER_PORT || 8787);
const IS_PRODUCTION = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const debugInvoiceSnapshots = new Map();
const DEBUG_SNAPSHOT_MAX = 200;

const corsOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isLocalDevOrigin(origin) {
  if (!origin) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(origin).trim());
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(
  cors({
    origin: corsOrigins.length
      ? (origin, cb) => {
          if (!origin || corsOrigins.includes(origin)) cb(null, true);
          else if (!IS_PRODUCTION && isLocalDevOrigin(origin)) cb(null, true);
          else cb(new Error('CORS not allowed'));
        }
      : true,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));

const { requireAuth, requireAdmin, requireBillingAccess, requireHrOrAdmin, requireAttendanceAdmin } =
  createAuthMiddleware({
  getSupabaseUrl: getSupabaseUrlForServer,
  getServiceRoleKey: getSupabaseServiceRoleKeyForServer,
  getAnonKey: getSupabaseAnonKeyForServer,
  HttpError,
});

const apiRateLimit = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
const einvoiceRateLimit = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiRateLimit);

/** R2 object keys for software-subscriptions page; presign-get only signs keys under this prefix. */
const R2_SOFTWARE_SUB_KEY_PREFIX = 'software-subscriptions/';
const R2_PRESIGN_GET_EXPIRES_SEC = 600;
const R2_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const R2_ALLOWED_EXT = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'xlsx', 'xls', 'doc', 'docx']);
const R2_EXT_TO_CONTENT_TYPE = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

let r2S3Client = null;

function getR2S3Client() {
  if (r2S3Client) return r2S3Client;
  const endpoint = String(process.env.R2_ENDPOINT || '').trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new HttpError(500, 'R2 is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY on the server.');
  }
  r2S3Client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  return r2S3Client;
}

/** Bucket name in Cloudflare (not a path prefix; uploads use keys like software-subscriptions/...). */
const R2_DEFAULT_BUCKET = 'indus-erp-uploads';

function getR2BucketName() {
  const b = String(process.env.R2_BUCKET || process.env.R2_BUCKET_NAME || R2_DEFAULT_BUCKET).trim();
  return b || R2_DEFAULT_BUCKET;
}

function sanitizeR2UploadFileName(name) {
  return String(name || 'file')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
}

function fileExtFromName(name) {
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function resolveR2ContentType(fileName, contentType) {
  const ext = fileExtFromName(fileName);
  if (!R2_ALLOWED_EXT.has(ext)) {
    throw new HttpError(400, `File type not allowed. Allowed: ${[...R2_ALLOWED_EXT].join(', ')}`);
  }
  const trimmed = String(contentType || '').trim().toLowerCase();
  if (trimmed && trimmed !== 'application/octet-stream') {
    return trimmed;
  }
  return R2_EXT_TO_CONTENT_TYPE[ext] || 'application/octet-stream';
}

const r2InvoiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: R2_MAX_ATTACHMENT_BYTES },
});

/** Software subscriptions UI is super-admin-only; presign only requires a valid Supabase session. */
async function requireSessionForSoftwareSubscriptionsR2(req) {
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!jwt) throw new HttpError(401, 'Missing Authorization Bearer token.');

  const supabaseUrl = getSupabaseUrlForServer();
  const { key: supabaseKey, canQueryProfiles } = getSupabaseAuthKeyForR2Presign();
  if (!supabaseUrl) {
    throw new HttpError(
      500,
      'Server missing Supabase URL. Set SUPABASE_URL or VITE_SUPABASE_URL in the project root .env or .env.server.'
    );
  }
  if (!supabaseKey) {
    throw new HttpError(
      500,
      'Server missing a Supabase API key for presign. Set SUPABASE_SERVICE_ROLE_KEY in .env.server (recommended), or set VITE_SUPABASE_ANON_KEY in .env for local dev (role from JWT metadata only).'
    );
  }
  if (!canQueryProfiles && !r2AnonAuthFallbackWarned) {
    r2AnonAuthFallbackWarned = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[server] R2 presign auth: SUPABASE_SERVICE_ROLE_KEY not set; using anon key. Role comes from JWT user_metadata only. Add service_role to .env.server if you rely on the profiles table for roles.'
    );
  }

  const client = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data: userData, error } = await client.auth.getUser(jwt);
  if (error || !userData?.user) throw new HttpError(401, 'Invalid or expired session.');
  return userData.user;
}

/** Fleet (vehicle documents, drivers): R2 keys under fleet/{documents|drivers}/{userId}/{segment}/… */
const R2_FLEET_KEY_PREFIX = 'fleet/';

function normalizeFleetUploadSegment(raw) {
  const s = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 80);
  return s.length >= 4 ? s : '';
}

function getFleetKeyPrefixForScope(scope) {
  if (scope === 'documents') return 'fleet/documents/';
  if (scope === 'drivers') return 'fleet/drivers/';
  return null;
}

function assertFleetObjectKeyAllowedForUser(objectKey, userId) {
  const key = String(objectKey || '').trim();
  if (!key.startsWith(R2_FLEET_KEY_PREFIX) || key.includes('..') || key.includes('//')) {
    throw new HttpError(400, 'Invalid object key.');
  }
  const parts = key.split('/').filter(Boolean);
  if (parts.length < 4 || parts[0] !== 'fleet') {
    throw new HttpError(400, 'Invalid object key.');
  }
  if (!['documents', 'drivers'].includes(parts[1])) {
    throw new HttpError(400, 'Invalid object key.');
  }
  const owner = parts[2];
  if (owner !== String(userId)) {
    throw new HttpError(403, 'Not allowed to access this object.');
  }
}

function getRequiredEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new HttpError(500, `Missing required server env: ${name}`);
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

function hasNonEmptyErrorDetails(data) {
  const ed = data?.ErrorDetails || data?.errorDetails;
  if (!Array.isArray(ed) || !ed.length) return false;
  return ed.some((e) => e && (e.ErrorMessage || e.message || e.ErrorCode));
}

function looksLikeStatusDescErrorJson(data) {
  const s = String(data?.status_desc ?? '').trim();
  return s.startsWith('[') && s.includes('ErrorCode');
}

function normalizeNicIrn(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || /\s/.test(s)) return null;
  if (s.toUpperCase().startsWith('MOCK-IRN-')) return null;
  // NIC IRN is typically 64 chars; allow URL/base64-safe characters (providers vary slightly).
  if (s.length < 8 || s.length > 128) return null;
  if (!/^[\w\-+/=]+$/.test(s)) return null;
  return s;
}

function isProviderSuccess(data) {
  if (hasNonEmptyErrorDetails(data)) return false;
  if (looksLikeStatusDescErrorJson(data)) return false;
  if (normalizeNicIrn(pickRawIrnFromWhitebooks(data))) return true;
  const gstnData = data?.data;
  if (
    gstnData &&
    typeof gstnData === 'object' &&
    (gstnData.LegalName != null || gstnData.TradeName != null || gstnData.StateCode != null)
  ) {
    return true;
  }
  const code = String(data?.status_cd ?? '').trim().toLowerCase();
  if (code === '0' || code === '2' || code === 'error' || code === 'e') return false;
  if (code === '1') return true;
  const desc = String(data?.status_desc ?? '').toLowerCase();
  if (desc && (desc.includes('token generated') || desc.includes('authentication successful'))) return true;
  return code === 'success' || code === 'sucess' || desc.includes('succeeds');
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
    throw new HttpError(
      502,
      data?.status_desc || data?.message || `Whitebooks authentication failed (${res.status}).`,
      { providerResponse: data }
    );
  }
  const token = data?.data?.AuthToken || data?.AuthToken || data?.token;
  if (!token) {
    throw new HttpError(502, 'Whitebooks authentication succeeded, but AuthToken missing.', {
      providerResponse: data,
    });
  }
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

/** Prefer documented paths (root / data / Data) before DFS — avoids wrong `Irn` inside nested error payloads. */
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
  return deepFind(data, ['Irn', 'IRN', 'irn']) || null;
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
  return deepFind(data, ['AckNo', 'ackNo', 'ack_no']) || null;
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
  return deepFind(data, ['AckDt', 'ackDt', 'ack_dt']) || null;
}

async function asQrDataUrl(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('data:image/')) return value;
  if (/^[A-Za-z0-9+/=]+$/.test(value)) return `data:image/png;base64,${value}`;
  return QRCode.toDataURL(value, { margin: 1, width: 240 });
}

function mapGenerateResponse(data) {
  const rawIrn = pickRawIrnFromWhitebooks(data);
  const irn = normalizeNicIrn(rawIrn);
  const ackNo = pickAckNoFromWhitebooks(data);
  const ackDt = pickAckDtFromWhitebooks(data);
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
  const supabaseUrl = getSupabaseUrlForServer();
  const serviceRoleKey = getSupabaseServiceRoleKeyForServer();
  const anonKey = getSupabaseAnonKeyForServer();
  const projectRef = getSupabaseProjectRefFromUrl(supabaseUrl);
  const erpEnv = String(process.env.ERP_ENV || '').toLowerCase() || null;
  const corsHasProductionSite = corsOrigins.some((o) => /indus-erp\.in/i.test(o));
  const projectMismatchWarning =
    corsHasProductionSite && projectRef === STAGING_SUPABASE_PROJECT_REF
      ? 'API CORS includes indus-erp.in but SUPABASE_URL is the staging project. Fix .env.server SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to production (wbyzhknaqcjqqtwopupl) and restart.'
      : corsHasProductionSite &&
          projectRef &&
          projectRef !== PRODUCTION_SUPABASE_PROJECT_REF
        ? `API CORS includes indus-erp.in but SUPABASE_URL project is "${projectRef}" (expected ${PRODUCTION_SUPABASE_PROJECT_REF}).`
        : null;
  // Always expose non-secret readiness flags (needed to debug prod vs local auth mismatches).
  const body = {
    ok: true,
    service: 'indus-erp-api',
    erp_env: erpEnv,
    supabase_project: projectRef || null,
    supabase_url: supabaseUrl ? 'set' : 'missing',
    service_role_key: isSupabaseServiceRoleKey(serviceRoleKey) ? 'ok' : 'missing_or_invalid',
    anon_key: anonKey ? 'set' : 'missing',
    warning: projectMismatchWarning,
  };
  if (IS_PRODUCTION) {
    return res.json({
      ok: true,
      service: body.service,
      erp_env: body.erp_env,
      supabase_project: body.supabase_project,
      service_role_key: body.service_role_key,
      warning: body.warning,
    });
  }
  return res.json(body);
});

/** User Management profile save — service role on server; avoids edge JWT / RLS issues in local dev. */
app.post('/api/admin/update-profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
    if (!jwt) return res.status(401).json({ error: 'Missing Authorization Bearer token' });

    const supabaseUrl = getSupabaseUrlForServer();
    const serviceRoleKey = getSupabaseServiceRoleKeyForServer();
    const anonKey = getSupabaseAnonKeyForServer();
    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({
        error: 'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.server)',
      });
    }

    const result = await adminUpdateProfile(req.body, jwt, supabaseUrl, serviceRoleKey, anonKey);
    return res.json(result);
  } catch (err) {
    const status = Number(err?.status) || 500;
    if (status >= 500) {
      // eslint-disable-next-line no-console
      console.error('[api/admin/update-profile]', err?.message || err);
    }
    return res.status(status).json({
      error: err?.message || String(err),
      hint: err?.hint ?? null,
      version: err?.version ?? 'server-api-5',
    });
  }
});

/** User Management create user — service role on server; avoids edge JWT / RLS issues in local dev. */
app.post('/api/admin/create-user', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
    if (!jwt) return res.status(401).json({ error: 'Missing Authorization Bearer token' });

    const supabaseUrl = getSupabaseUrlForServer();
    const serviceRoleKey = getSupabaseServiceRoleKeyForServer();
    const anonKey = getSupabaseAnonKeyForServer();
    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({
        error: 'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.server)',
      });
    }

    const result = await adminCreateUser(req.body, jwt, supabaseUrl, serviceRoleKey, anonKey);
    return res.json(result);
  } catch (err) {
    const status = Number(err?.status) || 500;
    if (status >= 500) {
      // eslint-disable-next-line no-console
      console.error('[api/admin/create-user]', err?.message || err);
    }
    return res.status(status).json({
      ok: false,
      error: err?.message || String(err),
      hint: err?.hint ?? null,
      version: err?.version ?? 'server-create-2',
    });
  }
});

/** User Management bulk create — reuses adminCreateUser per row. */
app.post('/api/admin/bulk-create-users', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
    if (!jwt) return res.status(401).json({ error: 'Missing Authorization Bearer token' });

    const supabaseUrl = getSupabaseUrlForServer();
    const serviceRoleKey = getSupabaseServiceRoleKeyForServer();
    const anonKey = getSupabaseAnonKeyForServer();
    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({
        error: 'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.server)',
      });
    }

    const result = await adminBulkCreateUsers(req.body, jwt, supabaseUrl, serviceRoleKey, anonKey);
    return res.json(result);
  } catch (err) {
    const status = Number(err?.status) || 500;
    if (status >= 500) {
      // eslint-disable-next-line no-console
      console.error('[api/admin/bulk-create-users]', err?.message || err);
    }
    return res.status(status).json({
      ok: false,
      error: err?.message || String(err),
      version: err?.version ?? 'server-bulk-create-1',
    });
  }
});

/** User Management bulk delete — auth + profiles cleanup per row. */
app.post('/api/admin/bulk-delete-users', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
    if (!jwt) return res.status(401).json({ error: 'Missing Authorization Bearer token' });

    const supabaseUrl = getSupabaseUrlForServer();
    const serviceRoleKey = getSupabaseServiceRoleKeyForServer();
    const anonKey = getSupabaseAnonKeyForServer();
    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({
        error: 'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.server)',
      });
    }

    const result = await adminBulkDeleteUsers(req.body, jwt, supabaseUrl, serviceRoleKey, anonKey);
    return res.json(result);
  } catch (err) {
    const status = Number(err?.status) || 500;
    if (status >= 500) {
      // eslint-disable-next-line no-console
      console.error('[api/admin/bulk-delete-users]', err?.message || err);
    }
    return res.status(status).json({
      ok: false,
      error: err?.message || String(err),
      version: err?.version ?? 'server-bulk-delete-1',
    });
  }
});

app.get('/api/debug/invoice/:id', requireAdmin, (req, res) => {
  if (IS_PRODUCTION) {
    return res.status(404).json({ message: 'Not found.' });
  }
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

app.get('/api/admin/attendance/status', (_req, res) => {
  try {
    const c = etimeCfg(getRequiredEnv);
    res.json({
      ok: true,
      service: 'eTimeOffice',
      etimeConfigured: true,
      baseUrl: c.baseUrl,
      punchEndpoint: c.punchEndpoint,
      mergeEndpoints: c.mergeEndpoints,
      fallbackEndpoints: uniqueEtimePunchEndpoints(c.punchEndpoint).filter((e) => e !== c.punchEndpoint),
      timeoutMs: c.timeoutMs,
      syncOverlapHours: c.overlapHours,
      syncLookbackDays: c.lookbackDays,
      syncTimezone: c.syncTimezone,
      cronEnabled: String(process.env.ETIME_SYNC_CRON_ENABLED || '').toLowerCase() === 'true',
    });
  } catch (err) {
    const status = Number(err?.status) || 500;
    res.status(status).json({
      ok: false,
      etimeConfigured: false,
      message: err?.message || 'eTimeOffice is not configured on the server.',
    });
  }
});

app.get('/api/admin/attendance/punches', requireAttendanceAdmin, async (req, res) => {
  try {
    const c = etimeCfg(getRequiredEnv);
    const empCode = String(req.query.empCode || req.query.Empcode || 'ALL').trim() || 'ALL';
    const fromIso = String(req.query.fromDate || req.query.FromDate || '').trim();
    const toIso = String(req.query.toDate || req.query.ToDate || '').trim();

    let records;
    let endpointsUsed;
    let fromDate;
    let toDate;

    if (/^\d{4}-\d{2}-\d{2}$/.test(fromIso) && /^\d{4}-\d{2}-\d{2}$/.test(toIso)) {
      const fetchResult = await fetchEtimePunchesForIsoRange(c, empCode, fromIso, toIso);
      records = fetchResult.records;
      endpointsUsed = fetchResult.endpointsUsed;
      fromDate = fromIso;
      toDate = toIso;
    } else {
      fromDate = normalizeEtimeDate(fromIso || '2024-01-01', false);
      toDate = normalizeEtimeDate(toIso || '2026-05-12', true);
      const result = await fetchEtimePunchDataMerged(c, empCode, fromDate, toDate);
      if (!result.providerRes?.ok) {
        const providerStatus = Number(result.providerRes?.status) || 502;
        return res.status(providerStatus >= 500 ? 502 : providerStatus).json({
          message:
            result.providerData?.Msg ||
            result.providerData?.Message ||
            result.providerData?.message ||
            `eTimeOffice attendance fetch failed (${providerStatus}).`,
          providerStatus,
        });
      }
      records = result.records || [];
      endpointsUsed = result.endpointsUsed || [result.endpoint];
    }

    res.json({
      source: 'eTimeOffice',
      providerEndpoints: endpointsUsed,
      empCode,
      fromDate,
      toDate,
      count: records.length,
      records,
    });
  } catch (err) {
    const status = Number(err?.status) || 500;
    // eslint-disable-next-line no-console
    console.error('[attendance/punches]', status, err?.message || err);
    res.status(status).json({
      message: err?.message || 'Failed to fetch eTimeOffice attendance.',
      providerStatus: err?.details?.providerStatus,
    });
  }
});

app.post('/api/admin/attendance/sync', requireAttendanceAdmin, async (req, res) => {
  try {
    const secret = String(process.env.ETIME_SYNC_SECRET || '').trim();
    if (!secret) {
      return res.status(503).json({ message: 'Attendance sync is not configured (ETIME_SYNC_SECRET missing).' });
    }
    const provided = String(req.headers['x-etime-sync-secret'] || req.body?.secret || '').trim();
    if (provided !== secret) {
      return res.status(401).json({ message: 'Invalid attendance sync secret.' });
    }

    const empCode = String(req.body?.empCode || req.query?.empCode || 'ALL').trim() || 'ALL';
    const fromDate = String(req.body?.fromDate || req.query?.fromDate || '').trim() || null;
    const toDate = String(req.body?.toDate || req.query?.toDate || '').trim() || null;

    const summary = await runAttendanceOverlapSync({
      getRequiredEnv,
      getSupabaseUrl: getSupabaseUrlForServer,
      getServiceKey: getSupabaseServiceRoleKeyForServer,
      empCode,
      fromDate,
      toDate,
    });

    res.json(summary);
  } catch (err) {
    const status = Number(err?.status) || 500;
    res.status(status).json({
      message: err?.message || 'Attendance sync failed.',
      details: err?.details || null,
      partialUpserted: err?.partialUpserted ?? null,
    });
  }
});

app.post('/api/billing/e-invoice/generate', einvoiceRateLimit, requireBillingAccess, async (req, res) => {
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
      if (debugInvoiceSnapshots.size >= DEBUG_SNAPSHOT_MAX) {
        const firstKey = debugInvoiceSnapshots.keys().next().value;
        if (firstKey) debugInvoiceSnapshots.delete(firstKey);
      }
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
    let buyerGstin = String(finalPayload?.BuyerDtls?.Gstin || '').trim().toUpperCase();
    if (sellerGstin && buyerGstin && sellerGstin === buyerGstin) {
      // Invoice/PO data sometimes has seller GSTIN in buyer fields — generate as B2C (URP).
      // eslint-disable-next-line no-console
      console.warn(`Buyer GSTIN matched seller (${sellerGstin}); using B2C unregistered buyer (URP).`);
      finalPayload.BuyerDtls = {
        ...finalPayload.BuyerDtls,
        Gstin: 'URP',
      };
      finalPayload.TranDtls = {
        ...(finalPayload.TranDtls || {}),
        TaxSch: finalPayload.TranDtls?.TaxSch || 'GST',
        SupTyp: 'B2C',
      };
      buyerGstin = 'URP';
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
      const hasValidationError = providerErrors.length > 0 || errorCodes.length > 0;
      const statusForClient = wbRes.ok
        ? (hasValidationError ? 422 : 502)
        : (wbRes.status >= 400 ? wbRes.status : 502);
      return res.status(statusForClient).json({
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
    const status = Number(err?.status) || 500;
    const message = err?.message || 'Failed to generate IRN.';
    const providerResponse = err?.details?.providerResponse;
    const errors = Array.isArray(err?.details?.errors) ? err.details.errors : undefined;
    res.status(status).json({
      message,
      ...(errors ? { errors } : {}),
      ...(providerResponse ? { providerResponse } : {}),
    });
  }
});

app.post('/api/billing/e-invoice/cancel', einvoiceRateLimit, requireBillingAccess, async (req, res) => {
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
    const status = Number(err?.status) || 500;
    const message = err?.message || 'Failed to cancel IRN.';
    const providerResponse = err?.details?.providerResponse;
    res.status(status).json({
      message,
      ...(providerResponse ? { providerResponse } : {}),
    });
  }
});

// Uploads: browser -> Express -> R2 (avoids R2 bucket CORS on PUT). Opens still use presign-get.
app.post(
  '/api/software-subscriptions/r2/upload',
  (req, res, next) => {
    r2InvoiceUpload.single('file')(req, res, (err) => {
      if (!err) {
        next();
        return;
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ message: `File too large (max ${R2_MAX_ATTACHMENT_BYTES} bytes).` });
        return;
      }
      res.status(400).json({ message: err.message || 'Upload failed.' });
    });
  },
  async (req, res) => {
    try {
      await requireSessionForSoftwareSubscriptionsR2(req);
      const bucket = getR2BucketName();

      const sid = String(req.body?.subscriptionId || '').trim();
      if (!isUuidLike(sid)) {
        return res.status(400).json({ message: 'subscriptionId must be a UUID.' });
      }

      const rawName = String(req.body?.fileName || '').trim();
      if (!rawName) {
        return res.status(400).json({ message: 'fileName is required.' });
      }

      if (!req.file?.buffer) {
        return res.status(400).json({ message: 'file is required (multipart field name: file).' });
      }

      const contentTypeHint = String(req.body?.contentType || req.file.mimetype || '').trim();
      const resolvedType = resolveR2ContentType(rawName, contentTypeHint || null);
      const safeName = sanitizeR2UploadFileName(rawName);
      const objectKey = `${R2_SOFTWARE_SUB_KEY_PREFIX}${sid}/${Date.now()}-${safeName}`;

      const client = getR2S3Client();
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: req.file.buffer,
          ContentType: resolvedType,
        })
      );

      res.json({ objectKey, bucket, contentType: resolvedType });
    } catch (err) {
      const status = Number(err?.status) || 500;
      res.status(status).json({ message: err?.message || 'Upload failed.' });
    }
  }
);

app.post('/api/software-subscriptions/r2/presign-get', async (req, res) => {
  try {
    await requireSessionForSoftwareSubscriptionsR2(req);
    const bucket = getR2BucketName();

    const objectKey = String(req.body?.objectKey || '').trim();
    if (!objectKey.startsWith(R2_SOFTWARE_SUB_KEY_PREFIX) || objectKey.includes('..') || objectKey.includes('//')) {
      return res.status(400).json({ message: 'Invalid object key.' });
    }

    const client = getR2S3Client();
    const getCmd = new GetObjectCommand({ Bucket: bucket, Key: objectKey });
    const getUrl = await getSignedUrl(client, getCmd, { expiresIn: R2_PRESIGN_GET_EXPIRES_SEC });
    res.json({ getUrl });
  } catch (err) {
    const status = Number(err?.status) || 500;
    res.status(status).json({ message: err?.message || 'Presign GET failed.' });
  }
});

app.post('/api/software-subscriptions/r2/delete', async (req, res) => {
  try {
    await requireSessionForSoftwareSubscriptionsR2(req);
    const bucket = getR2BucketName();

    const objectKey = String(req.body?.objectKey || '').trim();
    if (!objectKey.startsWith(R2_SOFTWARE_SUB_KEY_PREFIX) || objectKey.includes('..') || objectKey.includes('//')) {
      return res.status(400).json({ message: 'Invalid object key.' });
    }

    const client = getR2S3Client();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
    res.json({ ok: true, objectKey });
  } catch (err) {
    const status = Number(err?.status) || 500;
    res.status(status).json({ message: err?.message || 'Delete failed.' });
  }
});

// Fleet management: Cloudflare R2 (same bucket; keys under fleet/documents/… and fleet/drivers/…).
app.post(
  '/api/fleet/r2/upload',
  (req, res, next) => {
    r2InvoiceUpload.single('file')(req, res, (err) => {
      if (!err) {
        next();
        return;
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ message: `File too large (max ${R2_MAX_ATTACHMENT_BYTES} bytes).` });
        return;
      }
      res.status(400).json({ message: err.message || 'Upload failed.' });
    });
  },
  async (req, res) => {
    try {
      const user = await requireSessionForSoftwareSubscriptionsR2(req);
      const bucket = getR2BucketName();

      const scope = String(req.body?.scope || '').trim();
      const basePrefix = getFleetKeyPrefixForScope(scope);
      if (!basePrefix) {
        return res.status(400).json({ message: 'scope must be documents or drivers.' });
      }

      const segment = normalizeFleetUploadSegment(req.body?.segment);
      if (!segment) {
        return res.status(400).json({ message: 'segment is required (min 4 safe characters after sanitization).' });
      }

      const rawName = String(req.body?.fileName || '').trim();
      if (!rawName) {
        return res.status(400).json({ message: 'fileName is required.' });
      }

      if (!req.file?.buffer) {
        return res.status(400).json({ message: 'file is required (multipart field name: file).' });
      }

      const contentTypeHint = String(req.body?.contentType || req.file.mimetype || '').trim();
      const resolvedType = resolveR2ContentType(rawName, contentTypeHint || null);
      const safeName = sanitizeR2UploadFileName(rawName);
      const objectKey = `${basePrefix}${user.id}/${segment}/${Date.now()}-${safeName}`;

      const client = getR2S3Client();
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: req.file.buffer,
          ContentType: resolvedType,
        })
      );

      res.json({ objectKey, bucket, contentType: resolvedType });
    } catch (err) {
      const status = Number(err?.status) || 500;
      res.status(status).json({ message: err?.message || 'Upload failed.' });
    }
  }
);

app.post('/api/fleet/r2/presign-get', async (req, res) => {
  try {
    const user = await requireSessionForSoftwareSubscriptionsR2(req);
    const bucket = getR2BucketName();

    const objectKey = String(req.body?.objectKey || '').trim();
    assertFleetObjectKeyAllowedForUser(objectKey, user.id);

    const client = getR2S3Client();
    const getCmd = new GetObjectCommand({ Bucket: bucket, Key: objectKey });
    const getUrl = await getSignedUrl(client, getCmd, { expiresIn: R2_PRESIGN_GET_EXPIRES_SEC });
    res.json({ getUrl });
  } catch (err) {
    const status = Number(err?.status) || 500;
    res.status(status).json({ message: err?.message || 'Presign GET failed.' });
  }
});

const httpServer = app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`Whitebooks proxy listening on port ${PORT}`);
  const svcKey = getSupabaseServiceRoleKeyForServer();
  // eslint-disable-next-line no-console
  console.log(
    `[server] Supabase URL: ${getSupabaseUrlForServer() ? 'set' : 'MISSING'}; service_role key: ${
      isSupabaseServiceRoleKey(svcKey) ? 'ok' : 'MISSING or not service_role — authenticated /api/admin/* will fail session checks'
    }`
  );
  const supabaseRef = getSupabaseProjectRefFromUrl(getSupabaseUrlForServer());
  const erpEnvLabel = String(process.env.ERP_ENV || '').toLowerCase();
  if (supabaseRef) {
    // eslint-disable-next-line no-console
    console.log(`[server] Supabase project: ${supabaseRef}${erpEnvLabel === 'staging' ? ' (staging)' : ''}`);
  }
  const rawSvc = normalizeEnvValue(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SERVICE_ROLE_KEY
  );
  if (rawSvc && getSupabaseUrlForServer() && !serviceRoleMatchesUrl(getSupabaseUrlForServer(), rawSvc)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[server] SUPABASE_SERVICE_ROLE_KEY project (${getSupabaseProjectRefFromJwt(rawSvc) || '?'}) does not match SUPABASE_URL (${supabaseRef || '?'}). Key ignored — fix .env.server and restart.`
    );
  }
  const corsHasProductionSite = corsOrigins.some((o) => /indus-erp\.in/i.test(o));
  if (corsHasProductionSite && supabaseRef === STAGING_SUPABASE_PROJECT_REF) {
    // eslint-disable-next-line no-console
    console.error(
      `[server] CRITICAL: CORS allows indus-erp.in but SUPABASE_URL is staging (${STAGING_SUPABASE_PROJECT_REF}). ` +
        `Raw Attendance /admin APIs will 401 for production logins. Set SUPABASE_URL=https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co ` +
        `and matching SUPABASE_SERVICE_ROLE_KEY in .env.server, unset ERP_ENV=staging if set, then restart.`
    );
  }
  try {
    const etime = etimeCfg(getRequiredEnv);
    // eslint-disable-next-line no-console
    console.log(`[server] eTimeOffice: configured (${etime.punchEndpoint})`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[server] eTimeOffice: NOT configured — ${err?.message || err}`);
  }
  startAttendanceSyncCron({
    getRequiredEnv,
    getSupabaseUrl: getSupabaseUrlForServer,
    getServiceKey: getSupabaseServiceRoleKeyForServer,
  });
});

httpServer.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error(`API server failed on port ${PORT}:`, err?.message || err);
  if (err?.code === 'EADDRINUSE') {
    // eslint-disable-next-line no-console
    console.error('Port already in use. Stop the other process or change SERVER_PORT in .env.server.');
  }
  process.exit(1);
});

