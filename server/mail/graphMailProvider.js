import {
  buildGraphMessagePayload,
  getMicrosoftGraphMailConfig,
  isMicrosoftGraphMailConfigured,
  MAIL_NOT_CONFIGURED_MESSAGE,
} from './mailConfig.js';
import { logMailError, logMailInfo, maskEmail } from './mailLogger.js';

const TOKEN_SCOPE = 'https://graph.microsoft.com/.default';
const TOKEN_URL_TEMPLATE = 'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token';

let tokenCache = {
  accessToken: '',
  expiresAt: 0,
  cacheKey: '',
};

function httpError(message, status = 500) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function createGraphClient(getToken) {
  let Client;
  try {
    ({ Client } = await import('@microsoft/microsoft-graph-client'));
  } catch {
    throw httpError(
      'Mail package is missing. Run npm install in the project root, then restart the API.',
      503
    );
  }
  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: getToken,
    },
  });
}

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(httpError(`${label} timed out after ${timeoutMs}ms`, 504));
      }, timeoutMs);
    }),
  ]);
}

function buildCacheKey(config) {
  return `${config.tenantId}:${config.clientId}:${config.notificationEmail}`;
}

async function fetchAccessToken(config) {
  const cacheKey = buildCacheKey(config);
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.cacheKey === cacheKey && now < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken;
  }

  const tokenUrl = TOKEN_URL_TEMPLATE.replace('{tenantId}', encodeURIComponent(config.tenantId));
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: TOKEN_SCOPE,
    grant_type: 'client_credentials',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    logMailInfo('graph.token.request', { tenantId: config.tenantId, clientId: config.clientId });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload.error_description || payload.error || `HTTP ${response.status}`;
      logMailError('graph.token.failed', { status: response.status, detail });
      throw httpError(`Microsoft identity token request failed: ${detail}`, 502);
    }

    const accessToken = String(payload.access_token || '').trim();
    if (!accessToken) {
      throw httpError('Microsoft identity token response did not include access_token.', 502);
    }

    const expiresIn = Math.max(60, Number(payload.expires_in) || 3600);
    tokenCache = {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
      cacheKey,
    };

    logMailInfo('graph.token.received', { expiresIn });
    return accessToken;
  } catch (err) {
    if (err?.name === 'AbortError') {
      logMailError('graph.token.timeout', { timeoutMs: config.timeoutMs });
      throw httpError('Microsoft identity token request timed out.', 504);
    }
    if (err.status) throw err;
    logMailError('graph.token.error', { message: err?.message || 'Unknown token error' });
    throw httpError(err?.message || 'Microsoft identity token request failed.', 502);
  } finally {
    clearTimeout(timer);
  }
}

function resolveReplyTo(from, notificationEmail) {
  const sender = String(from || '').trim().toLowerCase();
  if (!sender || sender === notificationEmail) {
    return { replyTo: null, replyToName: null };
  }
  return { replyTo: sender, replyToName: null };
}

/** True when Graph rejected the send because the message/attachments exceed ~3MB. */
export function isGraphMessageTooLargeError(graphStatus, graphCode, graphMessage) {
  const status = Number(graphStatus) || 0;
  const text = `${graphCode || ''} ${graphMessage || ''}`;
  return (
    status === 413 ||
    /RequestEntityTooLarge|ErrorMessageSizeExceeded|ErrorAttachmentSizeLimitExceeded|message.?size|too large|Request Body too large/i.test(
      text
    )
  );
}

/**
 * Send one message via Microsoft Graph (application permissions + dedicated mailbox).
 */
export async function sendMail({
  from,
  fromName,
  to,
  cc,
  bcc,
  subject,
  text,
  html,
  replyTo,
  attachments,
}) {
  const config = getMicrosoftGraphMailConfig();
  if (!config) {
    throw httpError(MAIL_NOT_CONFIGURED_MESSAGE, 503);
  }

  const toMail = String(to || '').trim();
  if (!toMail || !toMail.includes('@')) {
    throw httpError('Recipient email is required.', 400);
  }

  const requestedSender = String(from || '').trim().toLowerCase();
  const salaryFrom = String(config.salaryOutboundEmail || '').trim().toLowerCase();
  // Admin Salary CTC / payslip mail must send as the salary From (shilpa@…), not notifications@.
  const sendAsSender =
    Boolean(requestedSender) &&
    (config.allowedSenders.includes(requestedSender) ||
      (Boolean(salaryFrom) && requestedSender === salaryFrom));
  const mailbox = sendAsSender ? requestedSender : config.notificationEmail;

  // Allowed senders send from their own mailbox, so replies reach them without a Reply-To.
  const reply = replyTo
    ? { replyTo: String(replyTo).trim(), replyToName: fromName || null }
    : sendAsSender
      ? { replyTo: null, replyToName: null }
      : resolveReplyTo(from, config.notificationEmail);

  if (reply.replyTo && !reply.replyToName && fromName) {
    reply.replyToName = fromName;
  }

  const payload = buildGraphMessagePayload({
    to: toMail,
    cc,
    bcc,
    subject,
    text,
    html,
    replyTo: reply.replyTo,
    replyToName: reply.replyToName,
    attachments,
    fromAddress: mailbox,
    fromName: sendAsSender ? String(fromName || '').trim() : config.notificationName,
  });

  logMailInfo('graph.send.attempt', {
    mailbox,
    to: maskEmail(toMail),
    ccCount: payload.message.ccRecipients?.length || 0,
    bccCount: payload.message.bccRecipients?.length || 0,
    subject: String(subject || '').slice(0, 120),
    attachmentCount: payload.message.attachments?.length || 0,
    replyTo: reply.replyTo ? maskEmail(reply.replyTo) : null,
  });

  try {
    const accessToken = await fetchAccessToken(config);
    const client = await createGraphClient(async () => accessToken);
    const sendPath = `/users/${encodeURIComponent(mailbox)}/sendMail`;

    await withTimeout(
      client.api(sendPath).post(payload),
      config.timeoutMs,
      'Microsoft Graph sendMail'
    );

    logMailInfo('graph.send.success', {
      mailbox,
      to: maskEmail(toMail),
    });

    return { ok: true, messageId: null, provider: 'microsoft-graph', mailbox };
  } catch (err) {
    const graphStatus = Number(err?.statusCode || err?.status) || 0;
    const graphCode = String(err?.code || err?.body?.error?.code || '').trim();
    const graphMessage = String(
      err?.body?.error?.message || err?.message || 'Mail delivery failed'
    ).trim();

    logMailError('graph.send.failed', {
      mailbox,
      to: maskEmail(toMail),
      status: graphStatus || 502,
      code: graphCode || null,
      message: graphMessage,
    });

    if (err.status && err.code === 'MAILBOX_SEND_DENIED') throw err;
    if (err.status && !graphStatus) throw err;

    const mailboxDenied =
      sendAsSender &&
      (graphStatus === 403 ||
        graphStatus === 404 ||
        /AccessDenied|MailboxNotEnabledForRESTAPI|ErrorItemNotFound|ErrorInvalidUser|ErrorSendAsDenied/i.test(
          `${graphCode} ${graphMessage}`
        ));

    if (mailboxDenied) {
      const denied = httpError(
        `Microsoft 365 did not allow sending as ${mailbox}. Ask IT to grant the ERP mail app access to this mailbox.`,
        502
      );
      denied.code = 'MAILBOX_SEND_DENIED';
      denied.mailbox = mailbox;
      throw denied;
    }

    if (isGraphMessageTooLargeError(graphStatus, graphCode, graphMessage)) {
      const sizeErr = httpError(
        'The email attachments are too large for Microsoft 365 to send in one message.',
        413
      );
      sizeErr.code = 'MAIL_MESSAGE_TOO_LARGE';
      throw sizeErr;
    }

    throw httpError(graphMessage || 'Mail delivery failed.', 502);
  }
}

function resolveSendMailbox(config, from) {
  const requestedSender = String(from || '').trim().toLowerCase();
  const salaryFrom = String(config.salaryOutboundEmail || '').trim().toLowerCase();
  const sendAsSender =
    Boolean(requestedSender) &&
    (config.allowedSenders.includes(requestedSender) ||
      (Boolean(salaryFrom) && requestedSender === salaryFrom));
  return sendAsSender ? requestedSender : config.notificationEmail;
}

function graphMessagePath(userPath, messageId) {
  // Graph message ids are base64 and often contain `/`, `+`, `=` — must be path-encoded.
  return `${userPath}/messages/${encodeURIComponent(String(messageId || '').trim())}`;
}

function odataQuote(value) {
  return String(value || '').replace(/'/g, "''");
}

async function readGraphError(err) {
  let body = err?.body;
  if (body && typeof body.getReader === 'function') {
    try {
      const text = await new Response(body).text();
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
  } else if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      /* keep string */
    }
  }
  const message = String(
    (body && typeof body === 'object' ? body?.error?.message : null) ||
      err?.message ||
      'Mail delivery failed'
  ).trim();
  const code = String(
    (body && typeof body === 'object' ? body?.error?.code : null) || err?.code || ''
  ).trim();
  const status = Number(err?.statusCode || err?.status) || 0;
  return { message: message || 'Mail delivery failed', code, status };
}

async function getMessageMeta(client, userPath, messageId) {
  const id = String(messageId || '').trim();
  if (!id) return null;
  try {
    return await withTimeout(
      client
        .api(graphMessagePath(userPath, id))
        .header('Prefer', 'IdType="ImmutableId"')
        .select('id,conversationId,internetMessageId,subject,sentDateTime')
        .get(),
      20_000,
      'Microsoft Graph get message'
    );
  } catch {
    return null;
  }
}

/** Latest Sent Items message in a conversation — used after replyAll (202, no body) and for recovery. */
async function findLatestSentInConversation(client, userPath, conversationId) {
  const cid = String(conversationId || '').trim();
  if (!cid) return null;
  try {
    const res = await withTimeout(
      client
        .api(`${userPath}/mailFolders/sentitems/messages`)
        .header('Prefer', 'IdType="ImmutableId"')
        .filter(`conversationId eq '${odataQuote(cid)}'`)
        .orderby('sentDateTime desc')
        .top(1)
        .select('id,conversationId,internetMessageId,subject,sentDateTime')
        .get(),
      20_000,
      'Microsoft Graph sentitems lookup'
    );
    return res?.value?.[0] || null;
  } catch (err) {
    const detail = await readGraphError(err);
    logMailError('graph.thread.sentitems_lookup_failed', {
      status: detail.status,
      message: detail.message,
    });
    return null;
  }
}

async function resolveAnchorMessage(client, userPath, { messageId, conversationId }) {
  const byId = await getMessageMeta(client, userPath, messageId);
  if (byId?.id) return byId;
  return findLatestSentInConversation(client, userPath, conversationId);
}

/**
 * One conversation for PO At Glance updates.
 * Root: create draft → send → store Sent Items id.
 * Later: replyAll on that Sent Items message (keeps Outlook/Graph conversation).
 * createReply is wrong for mail we ourselves sent (it targets the sender = us).
 */
export async function sendThreadedMail({
  from,
  fromName,
  toList,
  subject,
  html,
  replyToMessageId,
  conversationId,
  mailboxHint,
}) {
  const config = getMicrosoftGraphMailConfig();
  if (!config) throw httpError(MAIL_NOT_CONFIGURED_MESSAGE, 503);

  const recipients = [];
  const seen = new Set();
  for (const row of Array.isArray(toList) ? toList : []) {
    const email = String(row?.email || row || '').trim();
    if (!email.includes('@')) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push({ email, name: String(row?.name || '').trim() });
  }
  if (!recipients.length) throw httpError('Recipient email is required.', 400);

  // Prefer the mailbox that owns the prior message so replyAll finds it.
  const hinted = String(mailboxHint || '').trim().toLowerCase();
  const mailbox =
    (hinted &&
    (config.allowedSenders.includes(hinted) ||
      hinted === String(config.notificationEmail || '').toLowerCase() ||
      hinted === String(config.salaryOutboundEmail || '').toLowerCase())
      ? hinted
      : null) || resolveSendMailbox(config, from);

  const toRecipients = recipients.map((row) => ({
    emailAddress: { address: row.email, name: row.name || undefined },
  }));
  const messageSubject = String(subject || '').trim();
  const htmlBody = String(html || '');
  const accessToken = await fetchAccessToken(config);
  const client = await createGraphClient(async () => accessToken);
  const userPath = `/users/${encodeURIComponent(mailbox)}`;

  const sendDraftMessage = async (draftId) => {
    await withTimeout(
      client.api(`${graphMessagePath(userPath, draftId)}/send`).post({}),
      config.timeoutMs,
      'Microsoft Graph send'
    );
  };

  const replyPayload = {
    message: {
      // Do not override subject — Graph keeps Re: / conversationIndex for threading.
      body: { contentType: 'HTML', content: htmlBody },
      toRecipients,
    },
  };

  const finishThreadedSend = async (anchorId, priorConversationId, mode) => {
    let sentMeta = null;
    for (let attempt = 0; attempt < 4 && !sentMeta; attempt += 1) {
      if (attempt) await new Promise((r) => setTimeout(r, 400 * attempt));
      sentMeta = await findLatestSentInConversation(client, userPath, priorConversationId);
      if (sentMeta?.id && sentMeta.id === anchorId) sentMeta = null;
    }
    // If Sent Items cannot be read, keep replying to the same anchor — still one conversation.
    if (!sentMeta) {
      sentMeta = {
        id: anchorId,
        conversationId: priorConversationId,
      };
    }
    logMailInfo(`graph.thread.${mode}`, {
      mailbox,
      toCount: recipients.length,
      subject: messageSubject.slice(0, 120),
      conversationId: sentMeta.conversationId || priorConversationId,
    });
    return {
      ok: true,
      messageId: sentMeta.id,
      conversationId: sentMeta.conversationId || priorConversationId,
      mailbox,
      threaded: true,
    };
  };

  const tryReplyAll = async (anchor) => {
    const anchorId = String(anchor?.id || '').trim();
    if (!anchorId) return null;
    const priorConversationId = String(anchor.conversationId || conversationId || '').trim() || null;

    await withTimeout(
      client
        .api(`${graphMessagePath(userPath, anchorId)}/replyAll`)
        .header('Prefer', 'IdType="ImmutableId"')
        .post(replyPayload),
      config.timeoutMs,
      'Microsoft Graph replyAll'
    );
    return finishThreadedSend(anchorId, priorConversationId, 'replyAll');
  };

  const tryCreateReplyAll = async (anchor) => {
    const anchorId = String(anchor?.id || '').trim();
    if (!anchorId) return null;
    const priorConversationId = String(anchor.conversationId || conversationId || '').trim() || null;

    const draft = await withTimeout(
      client
        .api(`${graphMessagePath(userPath, anchorId)}/createReplyAll`)
        .header('Prefer', 'IdType="ImmutableId"')
        .post(replyPayload),
      config.timeoutMs,
      'Microsoft Graph createReplyAll'
    );
    await sendDraftMessage(draft.id);
    const newId = draft.id || anchorId;
    const newConversationId = draft.conversationId || priorConversationId;
    const resolved = await finishThreadedSend(newId, newConversationId, 'createReplyAll');
    // Prefer the draft/sent id we just created when Sent Items lookup is unavailable.
    if (resolved.messageId === anchorId && draft.id) {
      return { ...resolved, messageId: draft.id, conversationId: newConversationId };
    }
    return resolved;
  };

  const wantsThread = Boolean(String(replyToMessageId || '').trim() || String(conversationId || '').trim());
  if (wantsThread) {
    const anchor =
      (await resolveAnchorMessage(client, userPath, {
        messageId: replyToMessageId,
        conversationId,
      })) ||
      // Mail.Read may be missing — still try replyAll against the stored id.
      (String(replyToMessageId || '').trim()
        ? { id: String(replyToMessageId).trim(), conversationId: conversationId || null }
        : null);

    if (anchor?.id) {
      try {
        const replied = await tryReplyAll(anchor);
        if (replied) return replied;
      } catch (err) {
        const detail = await readGraphError(err);
        logMailError('graph.thread.replyAll_failed', {
          status: detail.status,
          code: detail.code || null,
          message: detail.message,
        });
      }
      try {
        const replied = await tryCreateReplyAll(anchor);
        if (replied) return replied;
      } catch (err) {
        const detail = await readGraphError(err);
        logMailError('graph.thread.createReplyAll_failed', {
          status: detail.status,
          code: detail.code || null,
          message: detail.message,
        });
      }
      logMailInfo('graph.thread.reply_fallback_root', { mailbox });
    } else {
      logMailError('graph.thread.anchor_missing', {
        mailbox,
        hasMessageId: Boolean(String(replyToMessageId || '').trim()),
        hasConversationId: Boolean(String(conversationId || '').trim()),
      });
    }
  }

  try {
    const draft = await withTimeout(
      client
        .api(`${userPath}/messages`)
        .header('Prefer', 'IdType="ImmutableId"')
        .post({
          subject: messageSubject,
          body: { contentType: 'HTML', content: htmlBody },
          toRecipients,
          from: {
            emailAddress: {
              address: mailbox,
              name: String(fromName || '').trim() || undefined,
            },
          },
        }),
      config.timeoutMs,
      'Microsoft Graph create message'
    );
    const draftConversationId = draft.conversationId || null;
    await sendDraftMessage(draft.id);

    let sentMeta = await getMessageMeta(client, userPath, draft.id);
    if (!sentMeta?.id) {
      sentMeta = await findLatestSentInConversation(client, userPath, draftConversationId);
    }
    const messageId = sentMeta?.id || draft.id;
    const finalConversationId = sentMeta?.conversationId || draftConversationId;

    logMailInfo('graph.thread.root', {
      mailbox,
      toCount: recipients.length,
      subject: messageSubject.slice(0, 120),
      conversationId: finalConversationId,
      threadedFallback: wantsThread,
    });
    return {
      ok: true,
      messageId,
      conversationId: finalConversationId,
      mailbox,
      threaded: false,
    };
  } catch (err) {
    const detail = await readGraphError(err);
    logMailError('graph.thread.root_failed', {
      status: detail.status,
      code: detail.code || null,
      message: detail.message,
    });
    throw httpError(detail.message, detail.status >= 400 ? detail.status : 502);
  }
}

export function isConfigured() {
  return isMicrosoftGraphMailConfigured();
}

/** @deprecated Use isConfigured */
export const isGraphMailConfigured = isConfigured;

/**
 * Convert a .docx to PDF using Microsoft 365 (Word Online engine).
 * Matches desktop Word layout far more closely than LibreOffice.
 * Requires application permission Files.ReadWrite.All (admin consent) so the
 * app can upload a temp file to the notification mailbox OneDrive.
 * Graph format conversion limit: 2 MB source file.
 */
export async function convertDocxToPdf({ docxBuffer, baseName = 'letter' } = {}) {
  const config = getMicrosoftGraphMailConfig();
  if (!config) return null;

  const buf = Buffer.isBuffer(docxBuffer) ? docxBuffer : Buffer.from(docxBuffer || []);
  if (buf.length < 100) return null;
  if (buf.length > 2 * 1024 * 1024) {
    logMailError('graph.docx_pdf.too_large', { bytes: buf.length });
    return null;
  }

  const safeBase = String(baseName || 'letter')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'letter';
  const remoteName = `${Date.now()}-${safeBase}.docx`;
  const remotePath = `IndusERP/letter-pdf-convert/${remoteName}`;
  const mailbox = config.notificationEmail;
  const driveRoot = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/drive`;

  let accessToken;
  try {
    accessToken = await fetchAccessToken(config);
  } catch (err) {
    logMailError('graph.docx_pdf.token_failed', { message: err?.message || String(err) });
    return null;
  }

  let itemId = null;
  try {
    const putRes = await withTimeout(
      fetch(`${driveRoot}/root:/${remotePath}:/content`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        body: buf,
      }),
      Math.max(config.timeoutMs, 60000),
      'Graph docx upload'
    );
    if (!putRes.ok) {
      const detail = await putRes.text().catch(() => '');
      logMailError('graph.docx_pdf.upload_failed', {
        status: putRes.status,
        detail: String(detail || '').slice(0, 400),
      });
      return null;
    }
    const item = await putRes.json().catch(() => ({}));
    itemId = String(item?.id || '').trim() || null;
    if (!itemId) {
      logMailError('graph.docx_pdf.upload_missing_id', {});
      return null;
    }

    // format=pdf returns 302 to a short-lived download URL (Word Online conversion).
    const convRes = await withTimeout(
      fetch(`${driveRoot}/items/${encodeURIComponent(itemId)}/content?format=pdf`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        redirect: 'manual',
      }),
      Math.max(config.timeoutMs, 90000),
      'Graph docx→pdf convert'
    );

    let pdfBuf = null;
    if (convRes.status === 301 || convRes.status === 302 || convRes.status === 303 || convRes.status === 307) {
      const location = convRes.headers.get('location') || convRes.headers.get('Location');
      if (!location) {
        logMailError('graph.docx_pdf.redirect_missing', { status: convRes.status });
        return null;
      }
      const pdfRes = await withTimeout(
        fetch(location, { method: 'GET', redirect: 'follow' }),
        Math.max(config.timeoutMs, 90000),
        'Graph pdf download'
      );
      if (!pdfRes.ok) {
        logMailError('graph.docx_pdf.download_failed', { status: pdfRes.status });
        return null;
      }
      pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
    } else if (convRes.ok) {
      pdfBuf = Buffer.from(await convRes.arrayBuffer());
    } else {
      const detail = await convRes.text().catch(() => '');
      logMailError('graph.docx_pdf.convert_failed', {
        status: convRes.status,
        detail: String(detail || '').slice(0, 400),
      });
      return null;
    }

    if (!pdfBuf || pdfBuf.length < 100 || String(pdfBuf.slice(0, 4)) !== '%PDF') {
      logMailError('graph.docx_pdf.invalid_pdf', { bytes: pdfBuf?.length || 0 });
      return null;
    }

    logMailInfo('graph.docx_pdf.success', {
      mailbox,
      docxBytes: buf.length,
      pdfBytes: pdfBuf.length,
    });
    return pdfBuf;
  } catch (err) {
    logMailError('graph.docx_pdf.error', { message: err?.message || String(err) });
    return null;
  } finally {
    if (itemId) {
      try {
        await fetch(`${driveRoot}/items/${encodeURIComponent(itemId)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}
