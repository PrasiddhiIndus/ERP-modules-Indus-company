/**
 * Admin In-house Recruitment API.
 *
 * Workflow rules live in the database workflow functions; this module adds what the
 * database cannot do on its own: file storage (R2), letter PDFs, email delivery through
 * the existing mail infrastructure, the candidate secure-link portal and reminders.
 */
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { isMailDispatchConfigured, sendOutboundMail, MAIL_NOT_CONFIGURED_MESSAGE } from './mail/index.js';
import { emailHtmlForSending, escapeTokenValues, looksLikeHtmlEmail } from '../shared/emailHtml.mjs';

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

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `Rs. ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function longDate(value) {
  if (!value) return '-';
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

function todayLong() {
  return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/** Standard PDF fonts only cover Latin-1; keep letters readable instead of failing. */
function pdfSafe(text) {
  return String(text ?? '')
    .replace(/₹/g, 'Rs.')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?');
}

// ---------------------------------------------------------------------------
// Letter PDFs
// ---------------------------------------------------------------------------
async function buildLetterPdf({ title, companyName, reference, candidateName, paragraphs, facts, terms, closing }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize = [595.28, 841.89];
  const margin = 56;
  const width = pageSize[0] - margin * 2;
  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;

  const ensure = (needed) => {
    if (y - needed < margin) {
      page = pdf.addPage(pageSize);
      y = pageSize[1] - margin;
    }
  };
  const wrap = (text, f, size) => {
    const lines = [];
    for (const para of pdfSafe(text).split(/\r?\n/)) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(next, size) > width && line) {
          lines.push(line);
          line = word;
        } else {
          line = next;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  const write = (text, { f = font, size = 10.5, gap = 4, color = rgb(0.12, 0.12, 0.12) } = {}) => {
    for (const line of wrap(text, f, size)) {
      ensure(size + gap);
      page.drawText(line, { x: margin, y: y - size, size, font: f, color });
      y -= size + gap;
    }
  };
  const space = (h) => {
    y -= h;
  };

  page.drawRectangle({ x: 0, y: pageSize[1] - 6, width: pageSize[0], height: 6, color: rgb(0.72, 0.11, 0.11) });
  write(companyName, { f: bold, size: 15, color: rgb(0.72, 0.11, 0.11) });
  space(10);
  write(title, { f: bold, size: 13 });
  space(6);
  write(`Ref: ${reference}`, { size: 9.5, color: rgb(0.35, 0.35, 0.35) });
  write(`Date: ${todayLong()}`, { size: 9.5, color: rgb(0.35, 0.35, 0.35) });
  space(12);
  write(`Dear ${candidateName},`);
  space(6);
  for (const p of paragraphs) {
    write(p);
    space(6);
  }
  if (facts.length) {
    space(2);
    for (const [label, value] of facts) {
      ensure(16);
      page.drawText(pdfSafe(label), { x: margin, y: y - 10.5, size: 10.5, font: bold });
      page.drawText(pdfSafe(value), { x: margin + 170, y: y - 10.5, size: 10.5, font });
      y -= 16;
    }
    space(8);
  }
  if (terms) {
    write('Terms and conditions', { f: bold });
    space(2);
    write(terms, { size: 10 });
    space(8);
  }
  for (const p of closing) {
    write(p);
    space(4);
  }
  space(18);
  write(`For ${companyName}`, { f: bold });
  space(28);
  write('Authorised Signatory');
  space(30);
  ensure(60);
  write('Candidate acceptance', { f: bold });
  write('I have read and accept the terms set out in this letter.');
  space(18);
  write('Signature: ______________________          Date: ______________');

  return Buffer.from(await pdf.save());
}

function offerLetterContent(offer, candidate, companyName) {
  return {
    title: 'OFFER OF EMPLOYMENT',
    companyName,
    reference: offer.offer_ref,
    candidateName: candidate.full_name,
    paragraphs: [
      `We are pleased to offer you the position of ${offer.designation}${offer.department ? ` in the ${offer.department} department` : ''} at ${companyName}. The key details of this offer are set out below.`,
    ],
    facts: [
      ['Designation', offer.designation || '-'],
      ['Department', offer.department || '-'],
      ['Location', offer.location || '-'],
      ['Employment type', offer.employment_type || '-'],
      ['Monthly gross salary', money(offer.monthly_gross)],
      ['Annual CTC', money(offer.annual_ctc)],
      ['Proposed joining date', longDate(offer.joining_date)],
      ['Offer valid until', longDate(offer.valid_until)],
    ],
    terms: offer.terms || '',
    closing: [
      'Please confirm your acceptance before the validity date using the secure link sent to you by email. A detailed appointment letter will follow once you accept this offer.',
      'We look forward to welcoming you to the team.',
    ],
  };
}

function appointmentLetterContent(appt, offer, candidate, companyName) {
  return {
    title: 'LETTER OF APPOINTMENT',
    companyName,
    reference: appt.appointment_ref,
    candidateName: candidate.full_name,
    paragraphs: [
      `With reference to your acceptance of our offer${offer?.offer_ref ? ` ${offer.offer_ref}` : ''}, we are pleased to appoint you as ${appt.designation} with ${companyName} with effect from ${longDate(appt.joining_date)}.`,
      appt.reporting_to ? `You will report to ${appt.reporting_to}.` : '',
    ].filter(Boolean),
    facts: [
      ['Designation', appt.designation || '-'],
      ['Department', appt.department || '-'],
      ['Location', appt.location || '-'],
      ['Employment type', appt.employment_type || '-'],
      ['Monthly gross salary', money(appt.monthly_gross)],
      ['Date of joining', longDate(appt.joining_date)],
    ],
    terms:
      appt.terms ||
      'Your employment is governed by the company policies in force from time to time. Please carry original copies of your identity, address, education and previous employment documents on the date of joining.',
    closing: [
      'Please sign this letter and upload the signed copy using the secure link sent to you by email.',
    ],
  };
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
    const cmd = new GetObjectCommand({
      Bucket: getR2Bucket(),
      Key: objectKey,
      ...(download ? { ResponseContentDisposition: `attachment; filename="${sanitizeFileName(fileName || objectKey.split('/').pop())}"` } : {}),
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
      svc.from('admin_recruitment_candidates').select('id, full_name').eq('id', row.candidate_id).maybeSingle(),
      svc.from('admin_recruitment_settings').select('company_name').maybeSingle(),
    ]);
    const companyName = settings?.company_name || 'Indus Fire Safety Private Limited';
    let content;
    if (kind === 'offer') {
      content = offerLetterContent(row, candidate, companyName);
    } else {
      const { data: offer } = await svc.from('admin_recruitment_offers').select('offer_ref').eq('id', row.offer_id).maybeSingle();
      content = appointmentLetterContent(row, offer, candidate, companyName);
    }
    const pdf = await buildLetterPdf(content);
    const ref = String(kind === 'offer' ? row.offer_ref : row.appointment_ref).replace(/[^A-Za-z0-9]+/g, '-');
    const fileName = `${kind === 'offer' ? 'Offer' : 'Appointment'}-${ref}.pdf`;
    const objectKey = `${KEY_PREFIX}${row.candidate_id}/${kind}/${Date.now()}-${fileName}`;
    await putObject(objectKey, pdf, 'application/pdf');
    const file = { objectKey, fileName, contentType: 'application/pdf', size: pdf.length };
    await rpc(svc, 'admin_recruitment_letter_attach_generated', { p_kind: kind, p_id: id, p_file: file }, 'Could not save the letter.');
    return file;
  }

  // ---- email sending -----------------------------------------------------
  async function sendCommunication(db, input, { trigger = 'manual', baseUrl }) {
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
        portalLink = `${baseUrl}/candidate-portal/${token}`;
      }

      // The stored copy keeps {{portal_link}} so a retry issues a fresh link and no token is logged.
      const isHtml = looksLikeHtmlEmail(comm.body);
      const storedSubject = renderTokens(comm.subject, values).replace(/\s+/g, ' ').trim();
      const storedBody = renderTokens(comm.body, isHtml ? escapeTokenValues(values) : values);
      const subject = renderTokens(storedSubject, { portal_link: portalLink });
      const body = renderTokens(storedBody, { portal_link: portalLink });

      const attachments = [];
      const attachmentMeta = [];
      if (prepared.letter?.objectKey) {
        const buf = await readObject(prepared.letter.objectKey);
        attachments.push({ filename: prepared.letter.fileName || 'letter.pdf', contentType: 'application/pdf', content: buf });
        attachmentMeta.push({ fileName: prepared.letter.fileName, objectKey: prepared.letter.objectKey });
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

      try {
        await sendOutboundMail({
          to: comm.recipient,
          subject,
          ...(isHtml ? { html: emailHtmlForSending(body) } : { text: body }),
          attachments,
        });
      } catch (err) {
        const done = await rpc(svc, 'admin_recruitment_comm_complete', {
          p_id: comm.id,
          p_success: false,
          p_error: String(err?.message || 'Delivery failed').slice(0, 500),
        });
        return { communication: done, delivered: false };
      }
      const done = await rpc(svc, 'admin_recruitment_comm_complete', { p_id: comm.id, p_success: true, p_error: null });
      return { communication: done, delivered: true };
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

  app.post('/api/admin-recruitment/communications/send', requireAuth, async (req, res) => {
    try {
      const b = req.body || {};
      if (!isUuid(b.candidateId)) throw httpError(400, 'Candidate is required.');
      if (!String(b.templateKey || '').trim()) throw httpError(400, 'Choose an email template.');
      const idempotencyKey = String(b.idempotencyKey || '').trim() || `manual:${crypto.randomUUID()}`;
      const out = await sendCommunication(
        userClient(req),
        {
          candidateId: b.candidateId,
          templateKey: String(b.templateKey).trim(),
          relatedType: b.relatedType || null,
          relatedId: isUuid(b.relatedId) ? b.relatedId : null,
          subject: b.subject,
          body: b.body,
          idempotencyKey: idempotencyKey.slice(0, 200),
        },
        { trigger: b.trigger === 'workflow' ? 'workflow' : 'manual', baseUrl: publicBaseUrl(req) }
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
    const token = String(req.params.token || '').trim();
    if (!/^[A-Za-z0-9_-]{30,100}$/.test(token)) throw httpError(404, 'This link has expired or is no longer valid. Please contact the recruitment team.');
    return hashToken(token);
  };
  const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim().slice(0, 80);
  const portalError = (res, err, fallback) => {
    const status = Number(err?.status) || 500;
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
      const svc = serviceClient();
      const info = await rpc(svc, 'admin_recruitment_portal_resolve', { p_token_hash: hash });
      const category = kind === 'document' ? 'document' : kind === 'offer_signed' ? 'offer' : 'appointment';
      const file = await storeUpload(info.candidateId, category, req.file, req.body?.fileName);
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
      res.redirect(302, await presign(file.objectKey, file.fileName, req.query.download === '1'));
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
