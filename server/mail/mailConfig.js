/**
 * Microsoft Graph mail configuration (server / Edge Function only — never expose to frontend).
 */

export function getMicrosoftGraphMailConfig() {
  const tenantId = String(process.env.MICROSOFT_TENANT_ID || '').trim();
  const clientId = String(process.env.MICROSOFT_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.MICROSOFT_CLIENT_SECRET || '').trim();
  const notificationEmail = String(process.env.MICROSOFT_NOTIFICATION_EMAIL || '')
    .trim()
    .toLowerCase();
  const timeoutMs = Math.max(
    5000,
    Number(process.env.MICROSOFT_GRAPH_TIMEOUT_MS || 30000) || 30000
  );

  if (!tenantId || !clientId || !clientSecret || !notificationEmail) {
    return null;
  }

  return {
    tenantId,
    clientId,
    clientSecret,
    notificationEmail,
    timeoutMs,
  };
}

export function isMicrosoftGraphMailConfigured() {
  return Boolean(getMicrosoftGraphMailConfig());
}

export const MAIL_NOT_CONFIGURED_MESSAGE =
  'Outbound mail is not configured on the server. Set MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_NOTIFICATION_EMAIL in .env.server.';

export function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function textToHtml(text) {
  return escapeHtml(text).replace(/\r?\n/g, '<br>\n');
}

export function normalizeAttachment(attachment) {
  if (!attachment) return null;
  const name = String(attachment.filename || attachment.name || 'attachment').trim();
  const contentType = String(attachment.contentType || attachment.mimeType || 'application/octet-stream').trim();

  let contentBytes = attachment.contentBytes || attachment.contentBase64 || null;
  if (!contentBytes && attachment.content != null) {
    contentBytes =
      typeof attachment.content === 'string'
        ? attachment.content
        : Buffer.from(attachment.content).toString('base64');
  }

  if (!contentBytes) return null;

  return {
    '@odata.type': '#microsoft.graph.fileAttachment',
    name,
    contentType,
    contentBytes: String(contentBytes),
  };
}

export function buildGraphMessagePayload({
  to,
  subject,
  text,
  html,
  replyTo,
  replyToName,
  attachments,
}) {
  const bodyText = String(text || '');
  const bodyHtml =
    html ||
    `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${textToHtml(bodyText)}</div>`;

  const graphAttachments = (attachments || [])
    .map(normalizeAttachment)
    .filter(Boolean);

  const message = {
    subject: String(subject || '').trim(),
    body: {
      contentType: 'HTML',
      content: bodyHtml,
    },
    toRecipients: [
      {
        emailAddress: {
          address: String(to || '').trim(),
        },
      },
    ],
  };

  if (replyTo) {
    message.replyTo = [
      {
        emailAddress: {
          address: String(replyTo).trim(),
          name: String(replyToName || '').trim() || undefined,
        },
      },
    ];
  }

  if (graphAttachments.length) {
    message.attachments = graphAttachments;
  }

  return {
    message,
    saveToSentItems: true,
  };
}
