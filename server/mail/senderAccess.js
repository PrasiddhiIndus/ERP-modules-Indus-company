/**
 * Who may send as which mailbox. The company notification mailbox is shared;
 * each extra mailbox in MICROSOFT_ALLOWED_SENDERS belongs to the login with the same email.
 */
import { getMicrosoftGraphMailConfig } from './mailConfig.js';

/** Login emails for the signed-in user (profile + auth account), lower-cased. */
export function userEmailsFromRequest(req) {
  return [req?.profile?.email, req?.user?.email]
    .map((e) => String(e || '').trim().toLowerCase())
    .filter(Boolean);
}

export function isPersonalSenderMailbox(mail) {
  const config = getMicrosoftGraphMailConfig();
  const address = String(mail || '').trim().toLowerCase();
  if (!config || !address) return false;
  // Shared company / HR salary From — any allowed login may send as these.
  if (address === config.notificationEmail) return false;
  if (address === config.salaryOutboundEmail) return false;
  return config.allowedSenders.includes(address);
}

export function canUseSenderMailbox(mail, userEmails) {
  if (!isPersonalSenderMailbox(mail)) return true;
  const address = String(mail || '').trim().toLowerCase();
  return (Array.isArray(userEmails) ? userEmails : []).includes(address);
}

export function personalSenderMailboxes() {
  const config = getMicrosoftGraphMailConfig();
  if (!config) return [];
  return config.allowedSenders.filter(
    (mail) => mail !== config.notificationEmail && mail !== config.salaryOutboundEmail
  );
}

/** Personal mailboxes this user may not pick (used to hide them in the UI). */
export function restrictedSenderMailboxes(userEmails) {
  const config = getMicrosoftGraphMailConfig();
  if (!config) return [];
  return config.allowedSenders.filter((mail) => !canUseSenderMailbox(mail, userEmails));
}

export function senderNotAllowedMessage(mail) {
  return `${mail} can only be used by its owner's login. Choose another "From" mailbox.`;
}
