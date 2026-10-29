/**
 * Admin In-house Recruitment API.
 *
 * Workflow rules live in the database workflow functions; this module adds what the
 * database cannot do on its own: file storage (R2), letter Word docs, email delivery through
 * the existing mail infrastructure, the candidate secure-link portal and reminders.
 */
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';
import { isMailDispatchConfigured, sendOutboundMail, MAIL_NOT_CONFIGURED_MESSAGE } from './mail/index.js';
import { emailHtmlForSending, escapeTokenValues, looksLikeHtmlEmail } from '../shared/emailHtml.mjs';
import { canUseSenderMailbox } from './mail/senderAccess.js';
import {
  buildAppointmentLetterDocx,
  buildOfferLetterDocx,
  convertDocxBufferToPdf,
} from './adminRecruitmentLetterDocs.js';
import { resolvePortalTokenParam, sealPortalToken } from './portalLinkCrypto.js';

const KEY_PREFIX = 'admin-recruitment/';
const FILE_CATEGORIES = new Set(['resume', 'offer', 'appointment', 'document']);
const ALLOWED_EXT = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx']);
const PRESIGN_SECONDS = 600;
const AUTOMATION_INTERVAL_MS = 15 * 60 * 1000;
const AUTOMATION_MAX_ATTEMPTS = 3;
const DEFAULT_PUBLIC_URL = 'https://indus-erp.in';

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());
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

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** Turns database errors into user-facing HTTP errors (workflow messages are already business language). */
function dbError(error, fallback = 'Request failed.') {
  if (!error) return httpError(500, fallback);
  const code = String(error.code || '');
  const message = String(error.message || fallback);
  if (code === '42501') return httpError(403, message.includes('permission') ? message : 'You do not have permission for this action.');
  if (code === '40001') return httpError(409, message);
  if (code === 'P0001') return httpError(400, message);
  if (code === 'PGRST202' || code === '42883') {
    // eslint-disable-next-line no-console
    console.error('[admin-recruitment] workflow function missing:', message);
    return httpError(503, 'Recruitment is being updated. Please try again shortly.');
  }
  // eslint-disable-next-line no-console
  console.error('[admin-recruitment] database error:', code, message);
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

function renderTokens(text, values) {
  return String(text || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? '') : match
  );
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------
export function registerAdminRecruitmentRoutes(app, deps) {
  const { requireAuth, getSupabaseUrl, getServiceKey, getAnonKey, getR2Client, getR2Bucket, upload } = deps;

  const serviceClient = () => {
    const url = getSupabaseUrl();
    const key = getServiceKey();
    if (!url || !key) throw httpError(503, 'Recruitment server is not configured.');
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

  const publicBaseUrl = (req) => {
    const env = String(process.env.ERP_PUBLIC_URL || '').trim().replace(/\/+$/, '');
    if (env) return env;
    const origin = String(req?.headers?.origin || '').trim().replace(/\/+$/, '');
    if (/^https?:\/\//i.test(origin)) return origin;
    return DEFAULT_PUBLIC_URL;
  };

  const putObject = async (objectKey, body, contentType) => {
    await getR2Client().send(new PutObjectCommand({ Bucket: getR2Bucket(), Key: objectKey, Body: body, ContentType: contentType }));
  };

  const readObject = async (objectKey) => {
    const out = await getR2Client().send(new GetObjectCommand({ Bucket: getR2Bucket(), Key: objectKey }));
    const chunks = [];
    for await (const chunk of out.Body) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  };

  const presign = async (objectKey, fileName, download) => {
    const safeName = sanitizeFileName(fileName || objectKey.split('/').pop());
    const ext = fileExt(safeName);
    // Word/Office files are not previewable in-browser; always force download to avoid a blank tab.
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

  const storeUpload = async (candidateId, category, file, rawName) => {
    const name = String(rawName || file?.originalname || '').trim();
    if (!file?.buffer) throw httpError(400, 'Choose a file to upload.');
    const ext = fileExt(name);
    if (!ALLOWED_EXT.has(ext)) throw httpError(400, 'Upload a PDF, image (JPG, PNG, WEBP) or Word document.');
    const safe = sanitizeFileName(name);
    const objectKey = `${KEY_PREFIX}${candidateId}/${category}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`;
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    await putObject(objectKey, file.buffer, contentType);
    return { objectKey, fileName: safe, contentType, size: file.size || file.buffer.length };
  };

  const withUpload = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'The file is too large (max 25 MB).' });
      return res.status(400).json({ message: err.message || 'Upload failed.' });
    });
  };

  // ---- letter generation -------------------------------------------------
  async function generateLetter(db, kind, id) {
    const table = kind === 'offer' ? 'admin_recruitment_offers' : 'admin_recruitment_appointments';
    const { data: row, error } = await db.from(table).select('*').eq('id', id).maybeSingle();
    if (error) throw dbError(error, 'Could not load the letter.');
    if (!row) throw httpError(404, 'Letter not found.');
    const allowed = await rpc(db, 'admin_recruitment_can_access_files', {
      p_candidate_id: row.candidate_id,
      p_category: kind,
      p_write: true,
    });
    if (!allowed) throw httpError(403, 'You do not have permission to prepare this letter.');
    if (kind === 'offer' && !['generated', 'sent', 'viewed', 'accepted'].includes(row.status)) {
      throw httpError(400, 'Generate the offer before preparing the letter.');
    }
    if (kind === 'appointment' && !['generated', 'sent', 'viewed', 'signed'].includes(row.status)) {
      throw httpError(400, 'This appointment letter is no longer active.');
    }

    const svc = serviceClient();
    const [{ data: candidate }, { data: settings }] = await Promise.all([
      svc
        .from('admin_recruitment_candidates')
        .select('id, full_name, current_location, home_town, email')
        .eq('id', row.candidate_id)
        .maybeSingle(),
      svc.from('admin_recruitment_settings').select('company_name').maybeSingle(),
    ]);
    const companyName = settings?.company_name || 'INDUS FIRE SAFETY PVT LTD';
    let docx;
    if (kind === 'offer') {
      docx = await buildOfferLetterDocx(row, candidate || {}, companyName);
    } else {
      const { data: offer } = await svc
        .from('admin_recruitment_offers')
        .select('offer_ref, annual_ctc, monthly_gross, designation, department')
        .eq('id', row.offer_id)
        .maybeSingle();
      docx = await buildAppointmentLetterDocx(row, offer, candidate || {}, companyName);
    }
    const ref = String(kind === 'offer' ? row.offer_ref : row.appointment_ref).replace(/[^A-Za-z0-9]+/g, '-');
    const fileName = `${kind === 'offer' ? 'Offer' : 'Appointment'}-${ref}.docx`;
    const objectKey = `${KEY_PREFIX}${row.candidate_id}/${kind}/${Date.now()}-${fileName}`;
    const contentType = CONTENT_TYPES.docx;
    await putObject(objectKey, docx, contentType);
    const file = { objectKey, fileName, contentType, size: docx.length };
    await rpc(svc, 'admin_recruitment_letter_attach_generated', { p_kind: kind, p_id: id, p_file: file }, 'Could not save the letter.');
    return file;
  }

  async function listRecruitmentSenders(db, userEmails = []) {
    const { data, error } = await db
      .from('sender_mailboxes')
      .select('id, mail, display_name, status')
      .eq('status', 'Verified')
      .order('mail', { ascending: true });
    if (error) throw dbError(error, 'Could not load sender mailboxes.');
    return (data || [])
      .map((row) => ({
        id: row.id,
        mail: String(row.mail || '').trim().toLowerCase(),
        name: String(row.display_name || '').trim(),
        label: row.display_name ? `${row.display_name} <${row.mail}>` : String(row.mail || ''),
      }))
      .filter((row) => row.mail && canUseSenderMailbox(row.mail, userEmails));
  }

  async function resolveRecruitmentSender(db, senderMail, userEmails) {
    const senders = await listRecruitmentSenders(db, userEmails);
    if (!senders.length) {
      throw httpError(400, 'No verified sender mailboxes found. Add and verify an email in Mail Outreach → Sender Mailboxes.');
    }
    const requested = String(senderMail || '').trim().toLowerCase();
    const sender = requested ? senders.find((s) => s.mail === requested) : senders[0];
    if (!sender) throw httpError(400, 'Choose a verified From address from Mail Outreach.');
    return sender;
  }

  // ---- email sending -----------------------------------------------------
  async function sendCommunication(db, input, { trigger = 'manual', baseUrl, userEmails = [] }) {
    const toOverride = String(input.to || '').trim().toLowerCase();
    if (toOverride) {
      if (!toOverride.includes('@')) throw httpError(400, 'Enter a valid recipient email address.');
      // Ensure prepare can run when candidate email was blank, and keep profile in sync.
      const svcPre = serviceClient();
      await svcPre
        .from('admin_recruitment_candidates')
        .update({ email: toOverride, updated_at: new Date().toISOString() })
        .eq('id', input.candidateId);
    }

    const sender =
      trigger === 'manual'
        ? await resolveRecruitmentSender(serviceClient(), input.senderMail, userEmails)
        : null;

    const prepared = await rpc(
      db,
      'admin_recruitment_comm_prepare',
      {
        p_candidate_id: input.candidateId,
        p_template_key: input.templateKey,
        p_related_type: input.relatedType || null,
        p_related_id: input.relatedId || null,
        p_subject: input.subject || null,
        p_body: input.body || null,
        p_idempotency_key: input.idempotencyKey,
        p_trigger: trigger,
      },
      'Could not prepare the email.'
    );
    const comm = prepared?.communication;
    if (!comm) throw httpError(500, 'Could not prepare the email.');
    if (prepared.alreadyHandled) return { communication: comm, alreadyHandled: true };
    if (trigger === 'automation' && Number(comm.attempts || 0) >= AUTOMATION_MAX_ATTEMPTS) {
      return { communication: comm, skipped: true };
    }

    const svc = serviceClient();
    try {
      const values = { ...(prepared.context || {}) };
      delete values.portal_link;
      let portalLink = '';
      const usesLink = /\{\{\s*portal_link\s*\}\}/i.test(`${comm.subject}\n${comm.body}`);
      if (usesLink && prepared.portalPurpose) {
        const token = crypto.randomBytes(32).toString('base64url');
        await rpc(svc, 'admin_recruitment_portal_issue', {
          p_candidate_id: input.candidateId,
          p_purpose: prepared.portalPurpose,
          p_ref_id: prepared.portalRefId || null,
          p_token_hash: hashToken(token),
        });
        // Opaque sealed path — raw token and /candidate-portal are not shown in the mail.
        portalLink = `${baseUrl}/r/${sealPortalToken(token)}`;
      }

      // Stored history keeps {{portal_link}}; the outbound copy gets a cloaked HTML button (no raw URL).
      const storedSubject = renderTokens(comm.subject, values).replace(/\s+/g, ' ').trim();
      const templateIsHtml = looksLikeHtmlEmail(comm.body);
      const storedBody = renderTokens(comm.body, templateIsHtml ? escapeTokenValues(values) : values);
      const subject = renderTokens(storedSubject, { portal_link: 'secure link' });

      let body;
      let sendAsHtml = templateIsHtml;
      if (portalLink) {
        const linkLabel =
          prepared.portalPurpose === 'offer'
            ? 'Open secure offer link'
            : prepared.portalPurpose === 'appointment'
              ? 'Open secure appointment link'
              : 'Open secure document link';
        const cloaked = `<a href="${portalLink.replace(/"/g, '&quot;')}" style="display:inline-block;padding:10px 16px;background:#b01c1c;color:#ffffff;text-decoration:none;border-radius:4px;font-family:Arial,sans-serif;font-size:14px;">${linkLabel}</a>`;
        if (templateIsHtml) {
          body = renderTokens(storedBody, { portal_link: cloaked });
        } else {
          const escapedLines = String(storedBody)
            .replace(/\r\n/g, '\n')
            .split('\n')
            .map((line) => {
              if (/\{\{\s*portal_link\s*\}\}/i.test(line)) return cloaked;
              return String(line)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            });
          body = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${escapedLines.join('<br>\n')}</div>`;
        }
        sendAsHtml = true;
      } else {
        body = renderTokens(storedBody, { portal_link: '' });
      }

      const attachments = [];
      const attachmentMeta = [];
      if (prepared.letter?.objectKey) {
        const buf = await readObject(prepared.letter.objectKey);
        const rawName = String(prepared.letter.fileName || 'letter.docx').trim() || 'letter.docx';
        const baseName = rawName.replace(/\.(docx|doc|pdf)$/i, '') || 'letter';
        const isDocx =
          /\.docx$/i.test(rawName) ||
          String(prepared.letter.contentType || '').includes('wordprocessingml') ||
          !/\.pdf$/i.test(rawName);

        // Email must carry a PDF print of the Word letter (layout locked). Never attach .docx.
        if (isDocx && !/\.pdf$/i.test(rawName)) {
          const pdf = await convertDocxBufferToPdf(buf, baseName);
          if (!pdf) {
            throw httpError(
              503,
              'Could not create the PDF letter for email. Ensure Microsoft Word is available on the server and try again.'
            );
          }
          attachments.push({ filename: `${baseName}.pdf`, contentType: CONTENT_TYPES.pdf, content: pdf });
          attachmentMeta.push({ fileName: `${baseName}.pdf`, objectKey: prepared.letter.objectKey, source: 'docx-pdf' });
        } else {
          attachments.push({
            filename: /\.pdf$/i.test(rawName) ? rawName : `${baseName}.pdf`,
            contentType: CONTENT_TYPES.pdf,
            content: buf,
          });
          attachmentMeta.push({ fileName: `${baseName}.pdf`, objectKey: prepared.letter.objectKey });
        }
      }

      const claimed = await rpc(svc, 'admin_recruitment_comm_claim', {
        p_id: comm.id,
        p_subject: storedSubject,
        p_body: storedBody,
        p_attachments: attachmentMeta,
      });
      if (!claimed) {
        return { communication: comm, inProgress: true };
      }

      if (!isMailDispatchConfigured()) {
        const done = await rpc(svc, 'admin_recruitment_comm_complete', { p_id: comm.id, p_success: false, p_error: MAIL_NOT_CONFIGURED_MESSAGE });
        return { communication: done, delivered: false };
      }

      const recipient = toOverride || String(comm.recipient || '').trim();
      const mailOpts = {
        to: recipient,
        subject,
        ...(sendAsHtml ? { html: emailHtmlForSending(body) } : { text: body }),
        attachments,
      };
      if (sender?.mail) {
        mailOpts.from = sender.mail;
        mailOpts.fromName = sender.name || undefined;
        // Same message to the sender mailbox in CC (as requested for offer/appointment sends).
        if (sender.mail.toLowerCase() !== recipient.toLowerCase()) {
          mailOpts.cc = [sender.mail];
        }
      }

      try {
        await sendOutboundMail(mailOpts);
      } catch (err) {
        const done = await rpc(svc, 'admin_recruitment_comm_complete', {
          p_id: comm.id,
          p_success: false,
          p_error: String(err?.message || 'Delivery failed').slice(0, 500),
        });
        return { communication: done, delivered: false, from: sender?.mail || null };
      }
      const done = await rpc(svc, 'admin_recruitment_comm_complete', { p_id: comm.id, p_success: true, p_error: null });
      return {
        communication: done,
        delivered: true,
        from: sender?.mail || null,
        cc: mailOpts.cc || null,
        to: recipient,
      };
    } catch (err) {
      // Preparation failed after the message was recorded: keep it as failed so it can be retried.
      try {
        await svc.rpc('admin_recruitment_comm_complete', {
          p_id: comm.id,
          p_success: false,
          p_error: String(err?.message || 'Could not prepare the email').slice(0, 500),
        });
      } catch {
        /* the original error is more useful */
      }
      throw err;
    }
  }

  // ---- automation --------------------------------------------------------
  let automationRunning = false;
  async function runAutomation() {
    if (automationRunning) return { skipped: true };
    automationRunning = true;
    const summary = { expiredOffers: 0, sent: 0, failed: 0, skipped: 0 };
    try {
      const svc = serviceClient();
      summary.expiredOffers = Number(await rpc(svc, 'admin_recruitment_expire_offers', {})) || 0;
      const due = (await rpc(svc, 'admin_recruitment_automation_due', {})) || {};
      const jobs = [
        ...(due.interviewReminders || []).map((j) => ({
          candidateId: j.candidateId,
          templateKey: 'interview_reminder',
          relatedType: 'interview',
          relatedId: j.interviewId,
          idempotencyKey: `auto:interview_reminder:${j.interviewId}`,
        })),
        ...(due.offerReminders || []).map((j) => ({
          candidateId: j.candidateId,
          templateKey: 'offer_reminder',
          relatedType: 'offer',
          relatedId: j.offerId,
          idempotencyKey: `auto:offer_reminder:${j.offerId}:${j.seq}`,
        })),
        ...(due.documentReminders || []).map((j) => ({
          candidateId: j.candidateId,
          templateKey: 'document_reminder',
          relatedType: 'documents',
          idempotencyKey: `auto:document_reminder:${j.candidateId}:${j.seq}`,
        })),
        ...(due.joiningReminders || []).map((j) => ({
          candidateId: j.candidateId,
          templateKey: 'joining_reminder',
          relatedType: 'joining',
          idempotencyKey: `auto:joining_reminder:${j.candidateId}:${j.joiningDate}`,
        })),
      ];
      const baseUrl = publicBaseUrl(null);
      for (const job of jobs) {
        try {
          const out = await sendCommunication(svc, job, { trigger: 'automation', baseUrl });
          if (out.delivered) summary.sent += 1;
          else if (out.delivered === false) summary.failed += 1;
          else summary.skipped += 1;
        } catch (err) {
          summary.failed += 1;
          // eslint-disable-next-line no-console
          console.warn('[admin-recruitment] reminder not sent:', job.idempotencyKey, err?.message || err);
        }
      }
      return summary;
    } finally {
      automationRunning = false;
    }
  }

  // ---- staff routes ------------------------------------------------------
  app.post('/api/admin-recruitment/files/upload', withUpload, requireAuth, async (req, res) => {
    try {
      const candidateId = String(req.body?.candidateId || '').trim();
      const category = String(req.body?.category || '').trim();
      if (!isUuid(candidateId)) throw httpError(400, 'Candidate is required.');
      if (!FILE_CATEGORIES.has(category)) throw httpError(400, 'Unknown file type.');
      const db = userClient(req);
      const allowed = await rpc(db, 'admin_recruitment_can_access_files', { p_candidate_id: candidateId, p_category: category, p_write: true });
      if (!allowed) throw httpError(403, 'You do not have permission to upload this file.');
      const file = await storeUpload(candidateId, category, req.file, req.body?.fileName);
      res.json({ file });
    } catch (err) {
      sendError(res, err, 'Upload failed.');
    }
  });

  app.post('/api/admin-recruitment/files/presign', requireAuth, async (req, res) => {
    try {
      const candidateId = String(req.body?.candidateId || '').trim();
      const category = String(req.body?.category || '').trim();
      const objectKey = String(req.body?.objectKey || '').trim();
      if (!isUuid(candidateId) || !FILE_CATEGORIES.has(category)) throw httpError(400, 'Invalid file request.');
      if (!objectKey.startsWith(`${KEY_PREFIX}${candidateId}/`) || objectKey.includes('..')) throw httpError(400, 'Invalid file request.');
      const db = userClient(req);
      const allowed = await rpc(db, 'admin_recruitment_can_access_files', { p_candidate_id: candidateId, p_category: category, p_write: false });
      if (!allowed) throw httpError(403, 'You do not have permission to open this file.');
      const url = await presign(objectKey, req.body?.fileName, Boolean(req.body?.download));
      res.json({ url });
    } catch (err) {
      sendError(res, err, 'Could not open the file.');
    }
  });

  app.post('/api/admin-recruitment/letters/generate', requireAuth, async (req, res) => {
    try {
      const kind = String(req.body?.kind || '').trim();
      const id = String(req.body?.id || '').trim();
      if (!['offer', 'appointment'].includes(kind) || !isUuid(id)) throw httpError(400, 'Invalid letter request.');
      const file = await generateLetter(userClient(req), kind, id);
      res.json({ file });
    } catch (err) {
      sendError(res, err, 'Could not prepare the letter.');
    }
  });

  app.get('/api/admin-recruitment/communications/senders', requireAuth, async (req, res) => {
    try {
      const userEmails = [req.profile?.email, req.user?.email].filter(Boolean);
      const senders = await listRecruitmentSenders(serviceClient(), userEmails);
      res.json({ senders });
    } catch (err) {
      sendError(res, err, 'Could not load sender mailboxes.');
    }
  });

  app.post('/api/admin-recruitment/communications/send', requireAuth, async (req, res) => {
    try {
      const b = req.body || {};
      if (!isUuid(b.candidateId)) throw httpError(400, 'Candidate is required.');
      if (!String(b.templateKey || '').trim()) throw httpError(400, 'Choose an email template.');
      const to = String(b.to || '').trim();
      if (!to || !to.includes('@')) throw httpError(400, 'Enter the recipient email address before sending.');
      const idempotencyKey = String(b.idempotencyKey || '').trim() || `manual:${crypto.randomUUID()}`;
      const userEmails = [req.profile?.email, req.user?.email].filter(Boolean);
      const out = await sendCommunication(
        userClient(req),
        {
          candidateId: b.candidateId,
          templateKey: String(b.templateKey).trim(),
          relatedType: b.relatedType || null,
          relatedId: isUuid(b.relatedId) ? b.relatedId : null,
          subject: b.subject,
          body: b.body,
          to,
          senderMail: b.senderMail,
          idempotencyKey: idempotencyKey.slice(0, 200),
        },
        {
          trigger: b.trigger === 'workflow' ? 'workflow' : 'manual',
          baseUrl: publicBaseUrl(req),
          userEmails,
        }
      );
      res.json(out);
    } catch (err) {
      sendError(res, err, 'Could not send the email.');
    }
  });

  app.post('/api/admin-recruitment/communications/:id/retry', requireAuth, async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!isUuid(id)) throw httpError(400, 'Invalid message.');
      const db = userClient(req);
      const { data: comm, error } = await db.from('admin_recruitment_communications').select('*').eq('id', id).maybeSingle();
      if (error) throw dbError(error, 'Could not load the message.');
      if (!comm) throw httpError(404, 'Message not found.');
      if (comm.status === 'sent') return res.json({ communication: comm, alreadyHandled: true });
      const out = await sendCommunication(
        db,
        {
          candidateId: comm.candidate_id,
          templateKey: comm.template_key,
          relatedType: comm.related_type,
          relatedId: comm.related_id,
          idempotencyKey: comm.idempotency_key,
        },
        { trigger: comm.trigger === 'automation' ? 'manual' : comm.trigger, baseUrl: publicBaseUrl(req) }
      );
      res.json(out);
    } catch (err) {
      sendError(res, err, 'Could not resend the email.');
    }
  });

  app.post('/api/admin-recruitment/automation/run', requireAuth, async (req, res) => {
    try {
      const allowed = await rpc(userClient(req), 'admin_recruitment_can', { p_cap: 'settings' });
      if (!allowed) throw httpError(403, 'Only recruitment administrators can run reminders now.');
      res.json(await runAutomation());
    } catch (err) {
      sendError(res, err, 'Could not run reminders.');
    }
  });

  // ---- candidate portal (public, token based) ----------------------------
  const portalLimit = rateLimit({ windowMs: 60_000, max: 40, standardHeaders: true, legacyHeaders: false });
  const tokenHashFrom = (req) => {
    const raw = String(req.params.token || '').trim();
    // Accept sealed /r/ codes (longer) and legacy plain portal tokens.
    if (!/^[A-Za-z0-9_-]{20,300}$/.test(raw)) {
      throw httpError(404, 'This link has expired or is no longer valid. Please contact the recruitment team.');
    }
    const plain = resolvePortalTokenParam(raw);
    if (!plain || !/^[A-Za-z0-9_-]{20,100}$/.test(plain)) {
      throw httpError(404, 'This link has expired or is no longer valid. Please contact the recruitment team.');
    }
    return hashToken(plain);
  };
  const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim().slice(0, 80);
  const portalError = (res, err, fallback) => {
    const status = Number(err?.status) || 500;
    if (status >= 500) {
      // eslint-disable-next-line no-console
      console.error('[admin-recruitment] portal error:', err?.message || err);
    }
    res.status(status === 500 ? 500 : status).json({ message: status >= 500 && !err?.status ? fallback : err?.message || fallback });
  };

  app.get('/api/recruitment-portal/:token', portalLimit, async (req, res) => {
    try {
      const hash = tokenHashFrom(req);
      const svc = serviceClient();
      const data = await rpc(svc, 'admin_recruitment_portal_resolve', { p_token_hash: hash });
      await svc.rpc('admin_recruitment_portal_view', { p_token_hash: hash, p_ip: clientIp(req) });
      res.json(data);
    } catch (err) {
      portalError(res, err, 'This link could not be opened.');
    }
  });

  app.post('/api/recruitment-portal/:token/respond', portalLimit, async (req, res) => {
    try {
      const hash = tokenHashFrom(req);
      const response = String(req.body?.response || '').trim();
      if (!['accepted', 'declined'].includes(response)) throw httpError(400, 'Choose Accept or Decline.');
      const svc = serviceClient();
      await rpc(svc, 'admin_recruitment_portal_offer_respond', {
        p_token_hash: hash,
        p_response: response,
        p_note: String(req.body?.note || '').slice(0, 1000) || null,
        p_ip: clientIp(req),
        p_user_agent: String(req.headers['user-agent'] || '').slice(0, 400),
      });
      res.json(await rpc(svc, 'admin_recruitment_portal_resolve', { p_token_hash: hash }));
    } catch (err) {
      portalError(res, err, 'Your response could not be saved. Please try again.');
    }
  });

  app.post('/api/recruitment-portal/:token/upload', portalLimit, withUpload, async (req, res) => {
    try {
      const hash = tokenHashFrom(req);
      const kind = String(req.body?.kind || '').trim();
      if (!['appointment_signed', 'document', 'offer_signed'].includes(kind)) throw httpError(400, 'Unknown upload type.');
      if (!req.file?.buffer) throw httpError(400, 'Choose a file to upload.');
      const svc = serviceClient();
      const info = await rpc(svc, 'admin_recruitment_portal_resolve', { p_token_hash: hash });
      const candidateId = info?.candidateId || info?.candidate_id;
      if (!isUuid(candidateId)) throw httpError(400, 'This link could not be verified for upload.');
      const category = kind === 'document' ? 'document' : kind === 'offer_signed' ? 'offer' : 'appointment';
      const file = await storeUpload(candidateId, category, req.file, req.body?.fileName || req.file.originalname);
      await rpc(svc, 'admin_recruitment_portal_attach', {
        p_token_hash: hash,
        p_kind: kind,
        p_document_key: kind === 'document' ? String(req.body?.documentKey || '').trim() : null,
        p_file: file,
        p_ip: clientIp(req),
      });
      res.json(await rpc(svc, 'admin_recruitment_portal_resolve', { p_token_hash: hash }));
    } catch (err) {
      portalError(res, err, 'Upload failed. Please try again.');
    }
  });

  app.get('/api/recruitment-portal/:token/letter', portalLimit, async (req, res) => {
    try {
      const hash = tokenHashFrom(req);
      const file = await rpc(serviceClient(), 'admin_recruitment_portal_file', { p_token_hash: hash, p_which: 'letter' });
      const objectKey = String(file?.objectKey || '').trim();
      if (!objectKey) throw httpError(404, 'File not available.');
      const rawName = String(file.fileName || 'letter.docx').trim() || 'letter.docx';
      const baseName = rawName.replace(/\.(docx|doc|pdf)$/i, '') || 'letter';
      const buf = await readObject(objectKey);
      const alreadyPdf =
        /\.pdf$/i.test(rawName) ||
        String(file.contentType || '').toLowerCase().includes('pdf') ||
        (buf.length > 4 && String(buf.slice(0, 4)) === '%PDF');

      let pdfBuf = alreadyPdf ? buf : null;
      if (!pdfBuf) {
        pdfBuf = await convertDocxBufferToPdf(buf, baseName);
      }
      if (!pdfBuf) {
        throw httpError(503, 'Could not prepare the PDF letter. Please try again shortly.');
      }

      const downloadName = sanitizeFileName(`${baseName}.pdf`);
      res.setHeader('Content-Type', CONTENT_TYPES.pdf);
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
      res.setHeader('Content-Length', String(pdfBuf.length));
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(200).end(pdfBuf);
    } catch (err) {
      portalError(res, err, 'The letter could not be opened.');
    }
  });

  return { runAutomation };
}

export function startAdminRecruitmentAutomation({ runAutomation, getServiceKey }) {
  if (String(process.env.ADMIN_RECRUITMENT_AUTOMATION || '').toLowerCase() === 'off') {
    // eslint-disable-next-line no-console
    console.log('[admin-recruitment] reminders automation disabled (ADMIN_RECRUITMENT_AUTOMATION=off)');
    return null;
  }
  if (!getServiceKey()) {
    // eslint-disable-next-line no-console
    console.warn('[admin-recruitment] reminders automation not started — service role key missing');
    return null;
  }
  const tick = async () => {
    try {
      const out = await runAutomation();
      if (out && (out.sent || out.failed || out.expiredOffers)) {
        // eslint-disable-next-line no-console
        console.log('[admin-recruitment] automation:', JSON.stringify(out));
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[admin-recruitment] automation run failed:', err?.message || err);
    }
  };
  const first = setTimeout(tick, 60_000);
  const timer = setInterval(tick, AUTOMATION_INTERVAL_MS);
  first.unref?.();
  timer.unref?.();
  return timer;
}
