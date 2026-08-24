import { isMailDispatchConfigured, sendOutboundMail } from './mailDispatch.js';

const PREVIEW_DEFAULTS = {
  event_name: 'Indus Fire Safety Expo 2026',
  event_date: '14 October 2026',
  venue: 'Mahatma Mandir, Gandhinagar',
};

function renderTokens(text, client, sample = PREVIEW_DEFAULTS) {
  if (!text) return '';
  return String(text)
    .replaceAll('{{client_name}}', client?.name || '')
    .replaceAll('{{contact_person}}', client?.contact || '')
    .replaceAll('{{event_name}}', sample?.event_name || PREVIEW_DEFAULTS.event_name)
    .replaceAll('{{event_date}}', sample?.event_date || PREVIEW_DEFAULTS.event_date)
    .replaceAll('{{venue}}', sample?.venue || PREVIEW_DEFAULTS.venue);
}

function parseContactEmails(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  const text = String(raw).trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [text];
  } catch {
    return [text];
  }
}

function clientEmailFromRow(row) {
  const emails = parseContactEmails(row.contact_emails);
  return String(row.contact_email || emails[0] || '').trim();
}

function mapClientRow(row) {
  return {
    id: row.id,
    name: row.client_name || '',
    contact: row.primary_contact_person || '',
    email: clientEmailFromRow(row),
  };
}

function httpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function resolveVerifiedSenderMailbox(supabaseAdmin, senderMailboxId, senderMail) {
  if (!senderMailboxId && !senderMail) {
    throw httpError('Select a sender mailbox before sending.');
  }

  let query = supabaseAdmin.from('sender_mailboxes').select('*');
  if (senderMailboxId) {
    query = query.eq('id', senderMailboxId);
  } else {
    query = query.eq('mail', String(senderMail || '').trim().toLowerCase());
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw httpError('Sender mailbox not found.');

  if (data.status === 'Disabled') {
    throw httpError(`Sender ${data.mail} is disabled. Choose another mailbox in Sender Mailboxes.`);
  }
  if (data.status !== 'Verified') {
    throw httpError(
      `Sender ${data.mail} is not verified yet (${data.status}). Mark it Verified in Sender Mailboxes before sending.`
    );
  }

  return data;
}

/**
 * Send outreach campaign via ERP Microsoft Graph mail — persists campaign log + marketing_notifications.
 */
export async function sendCrmOutreachCampaign({
  supabaseAdmin,
  userId,
  subject,
  bodyTemplate,
  senderMailboxId,
  senderMail,
  templateId,
  templateName,
  recipientClientIds,
  previewSample,
}) {
  if (!supabaseAdmin) throw httpError('Server database client is not configured.', 500);
  if (!userId) throw httpError('Authenticated user is required.', 401);
  if (!subject?.trim()) throw httpError('Subject is required.');
  if (!bodyTemplate?.trim()) throw httpError('Message body is required.');
  if (!Array.isArray(recipientClientIds) || recipientClientIds.length === 0) {
    throw httpError('Select at least one client.');
  }
  if (!isMailDispatchConfigured()) {
    throw httpError(
      'Outbound mail is not configured on the server. Set MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_NOTIFICATION_EMAIL in .env.server.',
      503
    );
  }

  const senderMailbox = await resolveVerifiedSenderMailbox(
    supabaseAdmin,
    senderMailboxId,
    senderMail
  );

  const sample = { ...PREVIEW_DEFAULTS, ...(previewSample || {}) };
  const uniqueIds = [...new Set(recipientClientIds.filter(Boolean))];

  const { data: clientRows, error: clientErr } = await supabaseAdmin
    .from('crm_outreach_clients')
    .select('id, client_name, primary_contact_person, contact_email, contact_emails')
    .in('id', uniqueIds);
  if (clientErr) throw clientErr;

  const clientsById = Object.fromEntries((clientRows || []).map((r) => [r.id, mapClientRow(r)]));

  const recipientRows = [];
  const notifications = [];
  let delivered = 0;
  let failed = 0;
  let skipped = 0;
  const today = new Date().toISOString().slice(0, 10);
  const sentAt = new Date().toISOString();

  for (const clientId of uniqueIds) {
    const client = clientsById[clientId];
    if (!client) {
      skipped += 1;
      recipientRows.push({
        client_id: clientId,
        client_email: '',
        client_name: '',
        rendered_subject: subject,
        rendered_body: '',
        status: 'Skipped',
        error_message: 'Client not found',
      });
      continue;
    }

    if (!client.email) {
      skipped += 1;
      recipientRows.push({
        client_id: clientId,
        client_email: '',
        client_name: client.name,
        rendered_subject: subject,
        rendered_body: '',
        status: 'Skipped',
        error_message: 'No email on client record',
      });
      continue;
    }

    const renderedSubject = renderTokens(subject, client, sample);
    const renderedBody = renderTokens(bodyTemplate, client, sample);

    try {
      const sendResult = await sendOutboundMail({
        from: senderMailbox.mail,
        fromName: senderMailbox.display_name,
        to: client.email,
        subject: renderedSubject,
        text: renderedBody,
      });

      delivered += 1;
      recipientRows.push({
        client_id: clientId,
        client_email: client.email,
        client_name: client.name,
        rendered_subject: renderedSubject,
        rendered_body: renderedBody,
        status: 'Delivered',
        sent_at: sentAt,
        error_message: sendResult.messageId ? `messageId:${sendResult.messageId}` : null,
      });

      notifications.push({
        type: 'crm_outreach',
        title: renderedSubject,
        message: renderedBody.slice(0, 2000),
        created_by: userId,
      });
    } catch (err) {
      failed += 1;
      recipientRows.push({
        client_id: clientId,
        client_email: client.email,
        client_name: client.name,
        rendered_subject: renderedSubject,
        rendered_body: renderedBody,
        status: 'Failed',
        error_message: err?.message || 'Mail delivery failed',
      });
    }
  }

  const campaignStatus =
    delivered === 0 ? 'Failed' : failed > 0 || skipped > 0 ? 'Partial' : 'Delivered';

  const { data: campaign, error: campaignErr } = await supabaseAdmin
    .from('mail_campaigns')
    .insert([
      {
        name: subject.trim(),
        template_id: templateId || null,
        template_name: templateName || 'Custom',
        sender_mailbox_id: senderMailbox.id,
        sender_mail: senderMailbox.mail,
        subject: subject.trim(),
        body_template: bodyTemplate,
        recipient_count: delivered,
        status: campaignStatus,
        created_by: userId,
      },
    ])
    .select('*')
    .single();
  if (campaignErr) throw campaignErr;

  const withCampaignId = recipientRows.map((r) => ({
    ...r,
    campaign_id: campaign.id,
  }));

  if (withCampaignId.length) {
    const { error: recipErr } = await supabaseAdmin
      .from('mail_campaign_recipients')
      .insert(withCampaignId);
    if (recipErr) throw recipErr;
  }

  if (notifications.length) {
    const { error: notifErr } = await supabaseAdmin
      .from('marketing_notifications')
      .insert(notifications);
    if (notifErr) {
      console.warn('[crm-outreach/send] marketing_notifications insert failed:', notifErr.message);
    }
  }

  const contactedIds = recipientRows
    .filter((r) => r.status === 'Delivered' && r.client_id)
    .map((r) => r.client_id);

  if (contactedIds.length) {
    const { error: touchErr } = await supabaseAdmin
      .from('crm_outreach_clients')
      .update({ last_contacted_at: today, updated_by: userId })
      .in('id', contactedIds);
    if (touchErr) {
      console.warn('[crm-outreach/send] last_contacted_at update failed:', touchErr.message);
    }
  }

  return {
    ok: delivered > 0,
    campaignId: campaign.id,
    status: campaignStatus,
    delivered,
    failed,
    skipped,
    deliveryMode: 'microsoft-graph',
    senderMail: senderMailbox.mail,
    failures: recipientRows
      .filter((r) => r.status === 'Failed')
      .map((r) => ({
        clientId: r.client_id,
        clientName: r.client_name,
        email: r.client_email,
        error: r.error_message,
      })),
  };
}
