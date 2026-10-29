/**
 * Modular outbound mail facade — business code imports from here (or mailDispatch.js shim).
 * Provider: Microsoft Graph (OAuth 2.0 client credentials).
 */

import * as graphMailProvider from './graphMailProvider.js';
import { isMicrosoftGraphMailConfigured, MAIL_NOT_CONFIGURED_MESSAGE } from './mailConfig.js';

const ACTIVE_PROVIDER = graphMailProvider;

export function isMailDispatchConfigured() {
  return isMicrosoftGraphMailConfigured();
}

/**
 * Send one outbound ERP notification email.
 * Preserves legacy sendOutboundMail signature used by CRM outreach and future callers.
 */
export async function sendOutboundMail({
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
  return ACTIVE_PROVIDER.sendMail({
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
  });
}

export { MAIL_NOT_CONFIGURED_MESSAGE, isMicrosoftGraphMailConfigured, getMicrosoftGraphMailConfig } from './mailConfig.js';
export { graphMailProvider as microsoftGraphMailProvider };

/** Word Online (Graph) docx→pdf — preferred on Linux/production for layout fidelity. */
export async function convertDocxToPdfViaGraph(docxBuffer, baseName = 'letter') {
  return graphMailProvider.convertDocxToPdf({ docxBuffer, baseName });
}
