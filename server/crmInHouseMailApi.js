import { getMicrosoftGraphMailConfig, isMailDispatchConfigured, sendOutboundMail } from './mailDispatch.js';
import {
  INHOUSE_BULK_BCC_LIMIT,
  INHOUSE_PERSONAL_BATCH_SIZE,
  INHOUSE_PERSONAL_CONCURRENCY,
  buildEmployeeDirectory,
  employeeActiveState,
  employeeDisplayName,
  inHouseCampaignStatus,
  indexEmployeeMaster,
  isValidEmployeeEmail,
  normalizeEmployeeEmail,
  renderInHouseTokens,
  usesPersonalTokens,
} from '../shared/crmInHouseMail.mjs';
import { emailHtmlForSending, escapeTokenValues, looksLikeHtmlEmail } from '../shared/emailHtml.mjs';

const PROFILE_COLUMNS = 'id, email, username, team, employee_code, is_active';
const PROFILE_PAGE_SIZE = 1000;
const IN_CHUNK = 200;
const INSERT_CHUNK = 500;

const CAMPAIGNS = 'crm_inhouse_mail_campaigns';
const RECIPIENTS = 'crm_inhouse_mail_campaign_recipients';

function httpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function requireDb(supabaseAdmin) {
  if (!supabaseAdmin) throw httpError('Server database client is not configured.', 500);
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function uniqueIds(list) {
  return [...new Set((Array.isArray(list) ? list : []).map((v) => String(v || '').trim()).filter(Boolean))];
}

async function fetchAllProfiles(supabaseAdmin) {
  const rows = [];
  for (let from = 0; ; from += PROFILE_PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .order('id', { ascending: true })
      .range(from, from + PROFILE_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PROFILE_PAGE_SIZE) break;
  }
  return rows;
}

async function fetchProfilesByIds(supabaseAdmin, ids) {
  const rows = [];
  for (const part of chunk(ids, IN_CHUNK)) {
    const { data, error } = await supabaseAdmin.from('profiles').select(PROFILE_COLUMNS).in('id', part);
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

function senderLabel() {
  const config = getMicrosoftGraphMailConfig();
  if (!config) return '';
  return config.notificationName
    ? `${config.notificationName} <${config.notificationEmail}>`
    : config.notificationEmail;
}

async function fetchEmployeeMasterIndex(supabaseAdmin) {
  const rows = [];
  for (let from = 0; ; from += PROFILE_PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('admin_ifsp_employee_master')
      .select('user_id, employee_code, status, date_of_leaving')
      .order('employee_code', { ascending: true })
      .range(from, from + PROFILE_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PROFILE_PAGE_SIZE) break;
  }
  return indexEmployeeMaster(rows);
}

/** Mailable directory: active employees (login + Employee Master) with valid, de-duplicated emails. */
export async function listInHouseEmployees({ supabaseAdmin }) {
  requireDb(supabaseAdmin);
  const [profiles, masterIndex] = await Promise.all([
    fetchAllProfiles(supabaseAdmin),
    fetchEmployeeMasterIndex(supabaseAdmin),
  ]);
  return buildEmployeeDirectory(profiles, { masterIndex });
}

const INACTIVE_SKIP_REASON = {
  inactive: 'Inactive employee',
  left: 'Employee has left',
  not_employee: 'Not an active employee in Employee Master',
};

async function resolveGroups(supabaseAdmin, groupIds) {
  if (!groupIds.length) return { groups: [], memberIds: [] };
  const { data: groups, error: groupErr } = await supabaseAdmin
    .from('crm_inhouse_mail_groups')
    .select('id, name')
    .in('id', groupIds);
  if (groupErr) throw groupErr;

  const memberIds = [];
  for (const part of chunk(groupIds, IN_CHUNK)) {
    const { data, error } = await supabaseAdmin
      .from('crm_inhouse_mail_group_members')
      .select('profile_id')
      .in('group_id', part);
    if (error) throw error;
    memberIds.push(...(data || []).map((r) => r.profile_id));
  }
  return { groups: groups || [], memberIds };
}

/**
 * Create an In-House campaign and queue its recipients (resolved server-side from profiles).
 * Mail is sent afterwards by processInHouseCampaignBatch so the UI can show progress.
 */
export async function startInHouseCampaign({
  supabaseAdmin,
  userId,
  subject,
  bodyTemplate,
  templateId,
  templateName,
  recipientProfileIds,
  groupIds,
}) {
  requireDb(supabaseAdmin);
  if (!userId) throw httpError('Authenticated user is required.', 401);
  if (!String(subject || '').trim()) throw httpError('Subject is required.');
  if (!String(bodyTemplate || '').trim()) throw httpError('Message body is required.');

  const directIds = uniqueIds(recipientProfileIds);
  const groupIdList = uniqueIds(groupIds);
  if (!directIds.length && !groupIdList.length) {
    throw httpError('Select at least one employee or group.');
  }
  if (!isMailDispatchConfigured()) {
    throw httpError(
      'Outbound mail is not configured on the server. Set MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_NOTIFICATION_EMAIL in .env.server.',
      503
    );
  }

  const { groups, memberIds } = await resolveGroups(supabaseAdmin, groupIdList);
  const allIds = uniqueIds([...directIds, ...memberIds]);
  const [profiles, masterIndex] = await Promise.all([
    fetchProfilesByIds(supabaseAdmin, allIds),
    fetchEmployeeMasterIndex(supabaseAdmin),
  ]);
  const profilesById = new Map(profiles.map((p) => [p.id, p]));

  const subjectText = String(subject).trim();
  const queued = [];
  const skipped = [];
  const seenEmails = new Set();

  for (const id of allIds) {
    const profile = profilesById.get(id);
    if (!profile) {
      skipped.push({ profile_id: null, recipient_email: '', recipient_name: '', error_message: 'Employee not found' });
      continue;
    }
    const name = employeeDisplayName(profile);
    const email = normalizeEmployeeEmail(profile.email);
    const state = employeeActiveState(profile, masterIndex);
    if (state !== 'active') {
      skipped.push({ profile_id: id, recipient_email: email, recipient_name: name, error_message: INACTIVE_SKIP_REASON[state] });
      continue;
    }
    if (!email) {
      skipped.push({ profile_id: id, recipient_email: '', recipient_name: name, error_message: 'No email on employee profile' });
      continue;
    }
    if (!isValidEmployeeEmail(email)) {
      skipped.push({ profile_id: id, recipient_email: email, recipient_name: name, error_message: 'Invalid email address' });
      continue;
    }
    if (seenEmails.has(email)) continue;
    seenEmails.add(email);
    queued.push({ profile_id: id, recipient_email: email, recipient_name: name });
  }

  if (!queued.length) {
    throw httpError('None of the selected people are active employees with a valid email address.');
  }

  const { data: campaign, error: campaignErr } = await supabaseAdmin
    .from(CAMPAIGNS)
    .insert([
      {
        name: subjectText,
        template_id: templateId || null,
        template_name: templateName || 'Custom',
        sender_mail: senderLabel(),
        subject: subjectText,
        body_template: String(bodyTemplate),
        group_ids: groups.map((g) => g.id),
        group_names: groups.map((g) => g.name),
        total_recipients: queued.length + skipped.length,
        skipped_count: skipped.length,
        status: 'Sending',
        created_by: userId,
      },
    ])
    .select('*')
    .single();
  if (campaignErr) throw campaignErr;

  const rows = [
    ...queued.map((r) => ({ ...r, campaign_id: campaign.id, rendered_subject: subjectText, status: 'Queued' })),
    ...skipped.map((r) => ({ ...r, campaign_id: campaign.id, rendered_subject: subjectText, status: 'Skipped' })),
  ];
  for (const part of chunk(rows, INSERT_CHUNK)) {
    const { error } = await supabaseAdmin.from(RECIPIENTS).insert(part);
    if (error) throw error;
  }

  console.info('[crm-outreach/inhouse] campaign queued', {
    campaignId: campaign.id,
    queued: queued.length,
    skipped: skipped.length,
    groups: groups.length,
  });

  return {
    campaignId: campaign.id,
    status: 'Sending',
    total: queued.length + skipped.length,
    queued: queued.length,
    skipped: skipped.length,
    delivered: 0,
    failed: 0,
    remaining: queued.length,
  };
}

async function countByStatus(supabaseAdmin, campaignId, status) {
  const { count, error } = await supabaseAdmin
    .from(RECIPIENTS)
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', status);
  if (error) throw error;
  return count || 0;
}

const UPDATE_ID_CHUNK = 100;

/** HTML templates go out as HTML; plain-text bodies keep the existing text path. */
function mailBody(body) {
  return looksLikeHtmlEmail(body) ? { html: emailHtmlForSending(body) } : { text: body };
}

async function claimQueuedRecipients(supabaseAdmin, campaignId, limit) {
  const { data: nextRows, error: nextErr } = await supabaseAdmin
    .from(RECIPIENTS)
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('status', 'Queued')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (nextErr) throw nextErr;

  const claimed = [];
  for (const part of chunk((nextRows || []).map((r) => r.id), UPDATE_ID_CHUNK)) {
    const { data, error } = await supabaseAdmin
      .from(RECIPIENTS)
      .update({ status: 'Sending' })
      .in('id', part)
      .eq('status', 'Queued')
      .select('id, profile_id, recipient_email, recipient_name');
    if (error) throw error;
    claimed.push(...(data || []));
  }
  return claimed;
}

async function updateRecipients(supabaseAdmin, ids, update) {
  for (const part of chunk(ids, UPDATE_ID_CHUNK)) {
    const { error } = await supabaseAdmin.from(RECIPIENTS).update(update).in('id', part);
    if (error) console.warn('[crm-outreach/inhouse] recipient status update failed:', error.message);
  }
}

function batchResult(row, update) {
  return {
    name: row.recipient_name || '',
    email: row.recipient_email,
    status: update.status,
    error: update.status === 'Failed' ? update.error_message : null,
  };
}

/** One message to the whole batch — employees are in BCC so they never see each other. */
async function sendBulkBccMail(supabaseAdmin, campaign, rows) {
  const config = getMicrosoftGraphMailConfig();
  let update;
  try {
    await sendOutboundMail({
      to: config.notificationEmail,
      bcc: rows.map((r) => r.recipient_email),
      subject: campaign.subject,
      ...mailBody(campaign.body_template),
    });
    update = { status: 'Delivered', sent_at: new Date().toISOString(), error_message: null };
  } catch (err) {
    update = { status: 'Failed', error_message: String(err?.message || 'Mail delivery failed').slice(0, 500) };
  }
  await updateRecipients(supabaseAdmin, rows.map((r) => r.id), update);
  return rows.map((row) => batchResult(row, update));
}

/** Individual messages (per-employee tokens), several in flight at once. */
async function sendPersonalMails(supabaseAdmin, campaign, rows) {
  const profileIds = uniqueIds(rows.map((r) => r.profile_id));
  const profiles = profileIds.length ? await fetchProfilesByIds(supabaseAdmin, profileIds) : [];
  const profilesById = new Map(profiles.map((p) => [p.id, p]));

  const results = new Array(rows.length);
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const index = next;
      next += 1;
      const row = rows[index];
      const profile = profilesById.get(row.profile_id);
      const employee = {
        name: row.recipient_name || '',
        email: row.recipient_email,
        team: String(profile?.team || '').trim(),
        employeeCode: String(profile?.employee_code || '').trim(),
      };
      const renderedSubject = renderInHouseTokens(campaign.subject, employee);
      const renderedBody = looksLikeHtmlEmail(campaign.body_template)
        ? renderInHouseTokens(campaign.body_template, escapeTokenValues(employee))
        : renderInHouseTokens(campaign.body_template, employee);
      let update;
      try {
        await sendOutboundMail({ to: row.recipient_email, subject: renderedSubject, ...mailBody(renderedBody) });
        update = { status: 'Delivered', rendered_subject: renderedSubject, sent_at: new Date().toISOString(), error_message: null };
      } catch (err) {
        update = {
          status: 'Failed',
          rendered_subject: renderedSubject,
          error_message: String(err?.message || 'Mail delivery failed').slice(0, 500),
        };
      }
      const { error } = await supabaseAdmin.from(RECIPIENTS).update(update).eq('id', row.id);
      if (error) console.warn('[crm-outreach/inhouse] recipient status update failed:', error.message);
      results[index] = batchResult(row, update);
    }
  };
  await Promise.all(Array.from({ length: Math.min(INHOUSE_PERSONAL_CONCURRENCY, rows.length) }, worker));
  return results;
}

/** Send the next batch of queued recipients for a campaign, then refresh its totals. */
export async function processInHouseCampaignBatch({ supabaseAdmin, userId, campaignId }) {
  requireDb(supabaseAdmin);
  if (!userId) throw httpError('Authenticated user is required.', 401);
  if (!campaignId) throw httpError('Campaign is required.');

  const { data: campaign, error: campaignErr } = await supabaseAdmin
    .from(CAMPAIGNS)
    .select('*')
    .eq('id', campaignId)
    .maybeSingle();
  if (campaignErr) throw campaignErr;
  if (!campaign) throw httpError('Campaign not found.', 404);
  if (campaign.created_by && campaign.created_by !== userId) {
    throw httpError('Only the person who started this campaign can continue sending it.', 403);
  }

  const batch = [];
  if (campaign.status === 'Sending') {
    if (!isMailDispatchConfigured()) {
      throw httpError('Outbound mail is not configured on the server.', 503);
    }

    const personal = usesPersonalTokens(campaign.subject, campaign.body_template);
    const claimed = await claimQueuedRecipients(
      supabaseAdmin,
      campaignId,
      personal ? INHOUSE_PERSONAL_BATCH_SIZE : INHOUSE_BULK_BCC_LIMIT
    );

    if (claimed.length) {
      const results = personal
        ? await sendPersonalMails(supabaseAdmin, campaign, claimed)
        : await sendBulkBccMail(supabaseAdmin, campaign, claimed);
      batch.push(...results);
    }

    if (!claimed.length) {
      // Nothing left to claim: rows still marked Sending were interrupted mid-send.
      const { error: staleErr } = await supabaseAdmin
        .from(RECIPIENTS)
        .update({ status: 'Failed', error_message: 'Sending was interrupted' })
        .eq('campaign_id', campaignId)
        .eq('status', 'Sending');
      if (staleErr) console.warn('[crm-outreach/inhouse] stale recipient cleanup failed:', staleErr.message);
    }
  }

  const [queuedLeft, inFlight, delivered, failed, skipped] = await Promise.all([
    countByStatus(supabaseAdmin, campaignId, 'Queued'),
    countByStatus(supabaseAdmin, campaignId, 'Sending'),
    countByStatus(supabaseAdmin, campaignId, 'Delivered'),
    countByStatus(supabaseAdmin, campaignId, 'Failed'),
    countByStatus(supabaseAdmin, campaignId, 'Skipped'),
  ]);
  const remaining = queuedLeft + inFlight;
  const status = inHouseCampaignStatus({ delivered, failed, skipped, remaining });

  const campaignUpdate = {
    delivered_count: delivered,
    failed_count: failed,
    skipped_count: skipped,
    status,
  };
  if (status !== 'Sending' && !campaign.completed_at) {
    campaignUpdate.completed_at = new Date().toISOString();
  }
  const { error: updErr } = await supabaseAdmin.from(CAMPAIGNS).update(campaignUpdate).eq('id', campaignId);
  if (updErr) throw updErr;

  if (status !== 'Sending' && campaign.status === 'Sending') {
    console.info('[crm-outreach/inhouse] campaign finished', { campaignId, status, delivered, failed, skipped });
  }

  return {
    campaignId,
    status,
    total: campaign.total_recipients,
    delivered,
    failed,
    skipped,
    remaining,
    batch,
  };
}
