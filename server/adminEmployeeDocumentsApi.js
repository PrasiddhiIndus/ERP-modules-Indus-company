/**
 * Employee Master document collection API (mirrors recruitment document upload portal).
 * Does not modify recruitment routes or tables.
 */
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';
import {
  getMicrosoftGraphMailConfig,
  isMailDispatchConfigured,
  MAIL_NOT_CONFIGURED_MESSAGE,
  sendOutboundMail,
} from './mail/index.js';
import { canUseSenderMailbox, userEmailsFromRequest } from './mail/senderAccess.js';
import { resolvePortalTokenParam, sealPortalToken } from './portalLinkCrypto.js';

const KEY_PREFIX = 'admin-employee-docs/';
const ALLOWED_EXT = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx']);
const PRESIGN_SECONDS = 600;
const DEFAULT_PUBLIC_URL = 'https://indus-erp.in';
const DEFAULT_LINK_DAYS = 14;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function fileExt(name) {
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function sanitizeFileName(name) {
  return (
    String(name || 'file')
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 120) || 'file'
  );
}

const CONTENT_TYPES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function dbError(error, fallback = 'Request failed.') {
  if (!error) return httpError(500, fallback);
  const code = String(error.code || '');
  const message = String(error.message || fallback);
  if (code === '42501') return httpError(403, message.includes('permission') ? message : 'You do not have permission for this action.');
  if (code === '40001') return httpError(409, message);
  if (code === 'P0001') return httpError(400, message);
  if (code === 'PGRST202' || code === '42883') {
    console.error('[admin-employee-docs] workflow function missing:', message);
    return httpError(503, 'Employee documents are being updated. Please try again shortly.');
  }
  console.error('[admin-employee-docs] database error:', code, message);
  return httpError(500, fallback);
}

async function rpc(db, fn, args, fallback) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw dbError(error, fallback);
  return data;
}

function sendError(res, err, fallback) {
  const status = Number(err?.status) || 500;
  const message = status >= 500 && !err?.status ? fallback : err?.message || fallback;
  res.status(status).json({ message, error: message });
}

export function registerAdminEmployeeDocumentsRoutes(app, deps) {
  const { requireAuth, getSupabaseUrl, getServiceKey, getAnonKey, getR2Client, getR2Bucket, upload } = deps;

  const serviceClient = () => {
    const url = getSupabaseUrl();
    const key = getServiceKey();
    if (!url || !key) throw httpError(503, 'Employee documents server is not configured.');
    return createClient(url, key, { auth: { persistSession: false } });
  };

  const userClient = (req) => {
    const url = getSupabaseUrl();
    const anon = getAnonKey() || getServiceKey();
    const jwt = req.auth?.jwt;
    if (!url || !anon || !jwt) throw httpError(401, 'Invalid or expired session.');
    return createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
  };

  /**
   * Same rule as recruitment portal emails: public https host for real recipients.
   * When Admin is testing on localhost, use that origin so /r/:token opens without login.
   */
  const publicBaseUrl = (req) => {
    const origin = String(req?.headers?.origin || '').trim().replace(/\/+$/, '');
    if (origin && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)) {
      return origin;
    }
    const env = String(process.env.ERP_PUBLIC_URL || '').trim().replace(/\/+$/, '');
    if (env && /^https:\/\//i.test(env) && !/localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/i.test(env)) {
      return env;
    }
    return DEFAULT_PUBLIC_URL;
  };

  const putObject = async (objectKey, body, contentType) => {
    await getR2Client().send(new PutObjectCommand({ Bucket: getR2Bucket(), Key: objectKey, Body: body, ContentType: contentType }));
  };

  const presign = async (objectKey, fileName, download) => {
    const safeName = sanitizeFileName(fileName || objectKey.split('/').pop());
    const ext = fileExt(safeName);
    const forceAttachment = Boolean(download) || ['doc', 'docx', 'xls', 'xlsx'].includes(ext);
    const cmd = new GetObjectCommand({
      Bucket: getR2Bucket(),
      Key: objectKey,
      ...(forceAttachment
        ? {
            ResponseContentDisposition: `attachment; filename="${safeName}"`,
            ResponseContentType: CONTENT_TYPES[ext] || 'application/octet-stream',
          }
        : {}),
    });
    return getSignedUrl(getR2Client(), cmd, { expiresIn: PRESIGN_SECONDS });
  };

  const storeUpload = async (employeeMasterId, file, rawName) => {
    const name = String(rawName || file?.originalname || '').trim();
    if (!file?.buffer) throw httpError(400, 'Choose a file to upload.');
    const ext = fileExt(name);
    if (!ALLOWED_EXT.has(ext)) throw httpError(400, 'Upload a PDF, image (JPG, PNG, WEBP) or Word document.');
    const safe = sanitizeFileName(name);
    const objectKey = `${KEY_PREFIX}${employeeMasterId}/document/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`;
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    await putObject(objectKey, file.buffer, contentType);
    return { objectKey, fileName: safe, contentType, size: file.size || file.buffer.length };
  };

  const withUpload = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (!err) return next();
      if (err?.code === 'LIMIT_FILE_SIZE') return sendError(res, httpError(400, 'File is too large.'), 'Upload failed.');
      return sendError(res, err, 'Upload failed.');
    });
  };

  const assertEmployeeObjectKey = (employeeMasterId, objectKey) => {
    const prefix = `${KEY_PREFIX}${employeeMasterId}/`;
    if (!String(objectKey || '').startsWith(prefix)) throw httpError(403, 'Invalid file reference.');
  };

  const portalLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Please try again later.' },
  });

  const tokenHashFrom = (req) => {
    const raw = String(req.params?.token || '').trim();
    if (!raw) throw httpError(404, 'This link has expired or is no longer valid. Please contact HR.');
    const plain = resolvePortalTokenParam(raw);
    if (!plain || !/^[A-Za-z0-9_-]{20,100}$/.test(plain)) {
      throw httpError(404, 'This link has expired or is no longer valid. Please contact HR.');
    }
    return hashToken(plain);
  };

  const portalError = (res, err, fallback) => {
    const status = Number(err?.status) || 500;
    if (status >= 500) console.error('[admin-employee-docs] portal error:', err?.message || err);
    res.status(status === 500 ? 500 : status).json({ message: status >= 500 && !err?.status ? fallback : err?.message || fallback });
  };

  // ---- Authenticated admin endpoints ----

  app.post('/api/admin-employee-documents/seed', requireAuth, async (req, res) => {
    try {
      const employeeMasterId = Number(req.body?.employeeMasterId);
      if (!Number.isFinite(employeeMasterId)) throw httpError(400, 'Employee is required.');
      const inserted = await rpc(userClient(req), 'admin_employee_document_seed', { p_employee_master_id: employeeMasterId }, 'Could not start document collection.');
      res.json({ inserted: Number(inserted) || 0 });
    } catch (err) {
      sendError(res, err, 'Could not start document collection.');
    }
  });

  app.post('/api/admin-employee-documents/files/upload', withUpload, requireAuth, async (req, res) => {
    try {
      const employeeMasterId = Number(req.body?.employeeMasterId);
      if (!Number.isFinite(employeeMasterId)) throw httpError(400, 'Employee is required.');
      const file = await storeUpload(employeeMasterId, req.file, req.body?.fileName);
      res.json({ file });
    } catch (err) {
      sendError(res, err, 'Upload failed.');
    }
  });

  app.post('/api/admin-employee-documents/files/presign', requireAuth, async (req, res) => {
    try {
      const employeeMasterId = Number(req.body?.employeeMasterId);
      const objectKey = String(req.body?.objectKey || '').trim();
      if (!Number.isFinite(employeeMasterId) || !objectKey) throw httpError(400, 'File reference is required.');
      assertEmployeeObjectKey(employeeMasterId, objectKey);
      const url = await presign(objectKey, req.body?.fileName, Boolean(req.body?.download));
      res.json({ url });
    } catch (err) {
      sendError(res, err, 'Could not open the file.');
    }
  });

  app.get('/api/admin-employee-documents/senders', requireAuth, async (req, res) => {
    try {
      if (!isMailDispatchConfigured()) throw httpError(503, MAIL_NOT_CONFIGURED_MESSAGE);
      const config = getMicrosoftGraphMailConfig();
      const userEmails = userEmailsFromRequest(req);
      const senders = [];
      if (config?.notificationEmail) {
        senders.push({
          mail: config.notificationEmail,
          name: config.notificationName || 'HR',
        });
      }
      for (const mail of config?.allowedSenders || []) {
        if (!canUseSenderMailbox(mail, userEmails)) continue;
        if (senders.some((s) => s.mail === mail)) continue;
        senders.push({ mail, name: mail });
      }
      res.json({ senders });
    } catch (err) {
      sendError(res, err, 'Could not load sender mailboxes.');
    }
  });

  app.post('/api/admin-employee-documents/send-link', requireAuth, async (req, res) => {
    try {
      const employeeMasterId = Number(req.body?.employeeMasterId);
      const to = String(req.body?.to || '').trim();
      const senderMail = String(req.body?.senderMail || '').trim().toLowerCase();
      const validDays = Math.max(1, Math.min(60, Number(req.body?.validDays) || DEFAULT_LINK_DAYS));
      if (!Number.isFinite(employeeMasterId)) throw httpError(400, 'Employee is required.');
      if (!to || !to.includes('@')) throw httpError(400, 'Enter the recipient email address before sending.');
      if (!isMailDispatchConfigured()) throw httpError(503, MAIL_NOT_CONFIGURED_MESSAGE);

      const userEmails = userEmailsFromRequest(req);
      const config = getMicrosoftGraphMailConfig();
      const from = senderMail || config?.notificationEmail;
      if (!from) throw httpError(503, MAIL_NOT_CONFIGURED_MESSAGE);
      if (!canUseSenderMailbox(from, userEmails)) {
        throw httpError(403, `${from} can only be used by its owner's login. Choose another From mailbox.`);
      }

      const db = userClient(req);
      const { data: emp, error: empErr } = await db
        .from('admin_ifsp_employee_master')
        .select('id, full_name, employee_code, employee_id, email_id')
        .eq('id', employeeMasterId)
        .maybeSingle();
      if (empErr) throw dbError(empErr, 'Could not load the employee.');
      if (!emp) throw httpError(404, 'Employee not found.');

      const token = crypto.randomBytes(32).toString('base64url');
      const issued = await rpc(
        db,
        'admin_employee_document_portal_issue',
        {
          p_employee_master_id: employeeMasterId,
          p_token_hash: hashToken(token),
          p_valid_days: validDays,
        },
        'Could not create the upload link.'
      );

      // Same public sealed path as recruitment (/r/:token) — no login wall.
      const portalLink = `${publicBaseUrl(req)}/r/${sealPortalToken(token)}`;
      const name = String(emp.full_name || 'Employee').trim() || 'Employee';
      const code = String(emp.employee_code || emp.employee_id || '').trim();
      const expiresLabel = issued?.expiresAt
        ? new Date(issued.expiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : `${validDays} days`;
      const subject = `Document upload request — ${name}${code ? ` (${code})` : ''}`;
      const cloaked = `<a href="${portalLink.replace(/"/g, '&quot;')}" style="display:inline-block;padding:10px 16px;background:#b01c1c;color:#ffffff;text-decoration:none;border-radius:4px;font-family:Arial,sans-serif;font-size:14px;">Open secure document upload link</a>`;
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">
<p>Dear ${name.replace(/</g, '&lt;')},</p>
<p>Please upload your required documents using the secure link below. This link is valid until <strong>${expiresLabel}</strong>.</p>
<p>${cloaked}</p>
<p>Accepted formats: PDF, JPG, PNG, WEBP or Word (max 25 MB).</p>
<p>Regards,<br/>HR Team<br/>Indus Fire Safety Private Limited</p>
</div>`;

      await sendOutboundMail({
        from,
        fromName: from === config?.notificationEmail ? config.notificationName || 'HR' : from,
        to,
        subject,
        html,
      });

      res.json({
        ok: true,
        expiresAt: issued?.expiresAt || null,
        to,
      });
    } catch (err) {
      sendError(res, err, 'Could not send the document upload link.');
    }
  });

  // ---- Public employee portal ----

  app.get('/api/employee-document-portal/:token', portalLimit, async (req, res) => {
    try {
      const hash = tokenHashFrom(req);
      const data = await rpc(serviceClient(), 'admin_employee_document_portal_resolve', { p_token_hash: hash }, 'This link could not be opened.');
      res.json(data);
    } catch (err) {
      portalError(res, err, 'This link could not be opened.');
    }
  });

  app.post('/api/employee-document-portal/:token/upload', portalLimit, withUpload, async (req, res) => {
    try {
      const hash = tokenHashFrom(req);
      const documentKey = String(req.body?.documentKey || '').trim();
      if (!documentKey) throw httpError(400, 'Choose which document you are uploading.');
      if (!req.file?.buffer) throw httpError(400, 'Choose a file to upload.');
      const svc = serviceClient();
      const info = await rpc(svc, 'admin_employee_document_portal_resolve', { p_token_hash: hash }, 'This link could not be verified for upload.');
      const employeeMasterId = Number(info?.employeeMasterId || info?.employee_master_id);
      if (!Number.isFinite(employeeMasterId)) throw httpError(400, 'This link could not be verified for upload.');
      const file = await storeUpload(employeeMasterId, req.file, req.body?.fileName || req.file.originalname);
      const data = await rpc(
        svc,
        'admin_employee_document_portal_attach',
        {
          p_token_hash: hash,
          p_document_key: documentKey,
          p_file: file,
        },
        'Upload failed. Please try again.'
      );
      res.json(data);
    } catch (err) {
      portalError(res, err, 'Upload failed. Please try again.');
    }
  });
}
