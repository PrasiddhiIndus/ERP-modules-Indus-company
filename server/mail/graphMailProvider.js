import { Client } from '@microsoft/microsoft-graph-client';
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

function createGraphClient(getToken) {
  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: getToken,
    },
  });
}

function resolveReplyTo(from, notificationEmail) {
  const sender = String(from || '').trim().toLowerCase();
  if (!sender || sender === notificationEmail) {
    return { replyTo: null, replyToName: null };
  }
  return { replyTo: sender, replyToName: null };
}

/**
 * Send one message via Microsoft Graph (application permissions + dedicated mailbox).
 */
export async function sendMail({
  from,
  fromName,
  to,
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

  const reply = replyTo
    ? { replyTo: String(replyTo).trim(), replyToName: fromName || null }
    : resolveReplyTo(from, config.notificationEmail);

  if (reply.replyTo && !reply.replyToName && fromName) {
    reply.replyToName = fromName;
  }

  const payload = buildGraphMessagePayload({
    to: toMail,
    subject,
    text,
    html,
    replyTo: reply.replyTo,
    replyToName: reply.replyToName,
    attachments,
  });

  logMailInfo('graph.send.attempt', {
    mailbox: config.notificationEmail,
    to: maskEmail(toMail),
    subject: String(subject || '').slice(0, 120),
    attachmentCount: payload.message.attachments?.length || 0,
    replyTo: reply.replyTo ? maskEmail(reply.replyTo) : null,
  });

  try {
    const accessToken = await fetchAccessToken(config);
    const client = createGraphClient(async () => accessToken);
    const sendPath = `/users/${encodeURIComponent(config.notificationEmail)}/sendMail`;

    await withTimeout(
      client.api(sendPath).post(payload),
      config.timeoutMs,
      'Microsoft Graph sendMail'
    );

    logMailInfo('graph.send.success', {
      mailbox: config.notificationEmail,
      to: maskEmail(toMail),
    });

    return { ok: true, messageId: null, provider: 'microsoft-graph' };
  } catch (err) {
    logMailError('graph.send.failed', {
      mailbox: config.notificationEmail,
      to: maskEmail(toMail),
      status: err?.status || 502,
      message: err?.message || 'Mail delivery failed',
    });

    if (err.status) throw err;
    throw httpError(err?.message || 'Mail delivery failed.', 502);
  }
}

export function isConfigured() {
  return isMicrosoftGraphMailConfigured();
}

/** @deprecated Use isConfigured */
export const isGraphMailConfigured = isConfigured;
