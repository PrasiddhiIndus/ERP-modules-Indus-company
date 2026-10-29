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
  const notificationName = String(process.env.MICROSOFT_NOTIFICATION_NAME || '').trim();
  // Admin Salary (CTC details / payslips) shared From — not the company notifications mailbox.
  const salaryOutboundEmail = String(
    process.env.SALARY_OUTBOUND_FROM_EMAIL || 'shilpa@indusfire.com'
  )
    .trim()
    .toLowerCase();
  const salaryOutboundName = String(
    process.env.SALARY_OUTBOUND_FROM_NAME || 'HR Department'
  ).trim();
  // Extra mailboxes the app may send as (Graph Mail.Send must cover them in Exchange).
  const allowedSenders = String(process.env.MICROSOFT_ALLOWED_SENDERS || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes('@'));
  if (salaryOutboundEmail.includes('@') && !allowedSenders.includes(salaryOutboundEmail)) {
    allowedSenders.push(salaryOutboundEmail);
  }
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
    notificationName,
    salaryOutboundEmail,
    salaryOutboundName,
    allowedSenders,
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

  // Ensure Office files keep a real extension so clients do not "convert" / reflow them.
  let finalName = name || 'attachment';
  const lowerType = contentType.toLowerCase();
  if (lowerType.includes('wordprocessingml') && !/\.docx$/i.test(finalName)) {
    finalName = `${finalName.replace(/\.(doc|docx)?$/i, '')}.docx`;
  }
  if (lowerType === 'application/pdf' && !/\.pdf$/i.test(finalName)) {
    finalName = `${finalName.replace(/\.pdf$/i, '')}.pdf`;
  }

  return {
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: finalName,
    contentType,
    contentBytes: String(contentBytes),
    isInline: false,
  };
}

export function buildGraphMessagePayload({
  to,
  cc,
  bcc,
  subject,
  text,
  html,
  replyTo,
  replyToName,
  attachments,
  fromAddress,
  fromName,
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

  const ccList = (Array.isArray(cc) ? cc : [])
    .map((addr) => String(addr || '').trim())
    .filter(Boolean);
  if (ccList.length) {
    message.ccRecipients = ccList.map((address) => ({ emailAddress: { address } }));
  }

  const bccList = (Array.isArray(bcc) ? bcc : [])
    .map((addr) => String(addr || '').trim())
    .filter(Boolean);
  if (bccList.length) {
    message.bccRecipients = bccList.map((address) => ({ emailAddress: { address } }));
  }

  if (fromAddress) {
    message.from = {
      emailAddress: {
        address: String(fromAddress).trim(),
        name: String(fromName || '').trim() || undefined,
      },
    };
  }

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
