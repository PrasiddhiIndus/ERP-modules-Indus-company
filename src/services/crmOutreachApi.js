import { supabase } from '../lib/supabase';
import { fetchApiWithAuth } from '../lib/apiBase';
import { normalizeClientSiteName } from '../lib/crmOutreachClientBulkImport';
import { PREVIEW_SAMPLE } from '../pages/crmOutreach/data/outreachConstants';

export function crmOutreachErrorMsg(err, fallback = 'Something went wrong.') {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  return err.message || err.error || fallback;
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

export function mapOutreachClientRow(row) {
  if (!row) return null;
  const emails = parseContactEmails(row.contact_emails);
  return {
    id: row.id,
    name: row.client_name || '',
    contact: row.primary_contact_person || '',
    email: row.contact_email || emails[0] || '',
    emails,
    module: row.business_module || 'fire',
    city: row.city || '',
    state: row.state || '',
    primaryDesignation: row.primary_contact_designation || '',
    primaryMobile: row.primary_contact_mobile || '',
    secondaryName: row.secondary_contact_name || '',
    secondaryDesignation: row.secondary_contact_designation || '',
    secondaryMobile: row.secondary_contact_mobile || '',
    secondaryEmail: row.secondary_contact_email || '',
    manpowerRequired: row.manpower_required ?? null,
    siteStatus: row.site_status || '',
    status: row.outreach_status || 'Active',
    remarks: row.remarks || '',
    rawNotes: row.raw_notes || '',
    lastContact: row.last_contacted_at || null,
  };
}

/** @deprecated Use mapOutreachClientRow */
export const mapMarketingClientRow = mapOutreachClientRow;

export function mapSenderRow(row) {
  return {
    id: row.id,
    mail: row.mail,
    name: row.display_name,
    used: row.used_for || '',
    status: row.status,
  };
}

export function mapTemplateRow(row, sendersById = {}) {
  const mailbox = row.default_sender_mailbox_id
    ? sendersById[row.default_sender_mailbox_id]
    : null;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    sender: mailbox?.mail || '',
    senderMailboxId: row.default_sender_mailbox_id || null,
    subject: row.subject || '',
    body: row.body || '',
  };
}

export function mapCampaignRow(row) {
  return {
    id: row.id,
    name: row.name,
    template: row.template_name || 'Custom',
    sender: row.sender_mail || '',
    recipients: row.recipient_count ?? 0,
    sent: row.sent_at ? String(row.sent_at).slice(0, 10) : '',
    status: row.status,
  };
}

export function renderOutreachTokens(text, client, sample = PREVIEW_SAMPLE) {
  if (!text) return '';
  return text
    .replaceAll('{{client_name}}', client?.name || '')
    .replaceAll('{{contact_person}}', client?.contact || '')
    .replaceAll('{{event_name}}', sample?.event_name || '')
    .replaceAll('{{event_date}}', sample?.event_date || '')
    .replaceAll('{{venue}}', sample?.venue || '');
}

async function currentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

const OUTREACH_CLIENTS_TABLE = 'crm_outreach_clients';

function outreachClientDbRow(payload, userId, { forInsert = false } = {}) {
  const emails = (payload.emails || []).filter((e) => String(e || '').trim());
  const row = {
    client_name: payload.name?.trim(),
    primary_contact_person: payload.contact?.trim() || null,
    primary_contact_designation: payload.primaryDesignation?.trim() || null,
    primary_contact_mobile: payload.primaryMobile?.trim() || null,
    secondary_contact_name: payload.secondaryName?.trim() || null,
    secondary_contact_designation: payload.secondaryDesignation?.trim() || null,
    secondary_contact_mobile: payload.secondaryMobile?.trim() || null,
    secondary_contact_email: payload.secondaryEmail?.trim() || null,
    city: payload.city?.trim() || null,
    state: payload.state?.trim() || null,
    contact_email: payload.email?.trim() || emails[0] || null,
    contact_emails: emails.length ? JSON.stringify(emails) : null,
    manpower_required:
      payload.manpowerRequired === null || payload.manpowerRequired === undefined || payload.manpowerRequired === ''
        ? null
        : Number(payload.manpowerRequired),
    site_status: payload.siteStatus?.trim() || null,
    remarks: payload.remarks?.trim() || null,
    raw_notes: payload.rawNotes?.trim() || null,
    business_module: payload.module || 'fire',
    outreach_status: payload.status || 'Active',
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };

  if (forInsert) {
    row.created_by = userId;
  }

  return row;
}

export async function fetchOutreachClients(options = {}) {
  const { search = '', module, status, city, state, siteStatus, manpowerFilter } = options;
  let query = supabase
    .from(OUTREACH_CLIENTS_TABLE)
    .select('*')
    .order('client_name', { ascending: true });

  const q = String(search || '').trim();
  if (q) {
    query = query.or(
      `client_name.ilike.%${q}%,primary_contact_person.ilike.%${q}%,contact_email.ilike.%${q}%,city.ilike.%${q}%,state.ilike.%${q}%`
    );
  }
  if (module && module !== 'all') {
    query = query.eq('business_module', module);
  }
  if (status && status !== 'all') {
    query = query.eq('outreach_status', status);
  }
  if (city && city !== 'all') {
    query = query.eq('city', city);
  }
  if (state && state !== 'all') {
    query = query.eq('state', state);
  }
  if (siteStatus && siteStatus !== 'all') {
    query = query.eq('site_status', siteStatus);
  }
  if (manpowerFilter === 'with') {
    query = query.not('manpower_required', 'is', null).gt('manpower_required', 0);
  } else if (manpowerFilter === 'without') {
    query = query.or('manpower_required.is.null,manpower_required.eq.0');
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapOutreachClientRow);
}

export async function saveOutreachClient(payload, id = null) {
  const userId = await currentUserId();
  const row = outreachClientDbRow(payload, userId, { forInsert: !id });

  if (!row.client_name) throw new Error('Client name is required.');

  if (id) {
    const { data, error } = await supabase
      .from(OUTREACH_CLIENTS_TABLE)
      .update(row)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return mapOutreachClientRow(data);
  }

  const { data, error } = await supabase
    .from(OUTREACH_CLIENTS_TABLE)
    .insert([row])
    .select('*')
    .single();
  if (error) throw error;
  return mapOutreachClientRow(data);
}

export async function importOutreachClients(records) {
  const userId = await currentUserId();
  const { data: existing, error: loadErr } = await supabase
    .from(OUTREACH_CLIENTS_TABLE)
    .select('*');
  if (loadErr) throw loadErr;

  const byName = new Map(
    (existing || []).map((row) => [normalizeClientSiteName(row.client_name), row])
  );

  const results = [];
  let added = 0;
  let updated = 0;
  let failed = 0;

  for (const payload of records) {
    const key = normalizeClientSiteName(payload.name);
    const sourceRows = payload.sourceRows || [];
    try {
      const existingRow = byName.get(key);
      const row = outreachClientDbRow(payload, userId, { forInsert: !existingRow });

      if (existingRow) {
        const { data, error } = await supabase
          .from(OUTREACH_CLIENTS_TABLE)
          .update(row)
          .eq('id', existingRow.id)
          .select('*')
          .single();
        if (error) throw error;
        byName.set(key, data);
        updated += 1;
        results.push({
          ok: true,
          action: 'updated',
          clientName: payload.name,
          sourceRows,
        });
      } else {
        const { data, error } = await supabase
          .from(OUTREACH_CLIENTS_TABLE)
          .insert([row])
          .select('*')
          .single();
        if (error) throw error;
        byName.set(key, data);
        added += 1;
        results.push({
          ok: true,
          action: 'added',
          clientName: payload.name,
          sourceRows,
        });
      }
    } catch (err) {
      failed += 1;
      results.push({
        ok: false,
        action: 'failed',
        clientName: payload.name,
        sourceRows,
        error: crmOutreachErrorMsg(err, 'Import failed.'),
      });
    }
  }

  return {
    summary: {
      added,
      updated,
      failed,
      total: records.length,
    },
    results,
  };
}

export async function fetchSenderMailboxes() {
  const { data, error } = await supabase
    .from('sender_mailboxes')
    .select('*')
    .order('mail', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapSenderRow);
}

export async function saveSenderMailbox(payload, id = null) {
  const userId = await currentUserId();
  const row = {
    mail: String(payload.mail || '').trim().toLowerCase(),
    display_name: String(payload.name || payload.mail || '').trim(),
    used_for: String(payload.used || '').trim() || null,
    status: payload.status || 'Pending Verification',
    updated_by: userId,
  };
  if (!row.mail) throw new Error('Mail ID is required.');

  if (id) {
    const { data, error } = await supabase
      .from('sender_mailboxes')
      .update(row)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return mapSenderRow(data);
  }

  const { data, error } = await supabase
    .from('sender_mailboxes')
    .insert([{ ...row, created_by: userId }])
    .select('*')
    .single();
  if (error) throw error;
  return mapSenderRow(data);
}

export async function deleteSenderMailbox(id) {
  const { error } = await supabase.from('sender_mailboxes').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchMailTemplates() {
  const [templatesRes, sendersRes] = await Promise.all([
    supabase.from('mail_templates').select('*').order('name', { ascending: true }),
    supabase.from('sender_mailboxes').select('id, mail'),
  ]);
  if (templatesRes.error) throw templatesRes.error;
  if (sendersRes.error) throw sendersRes.error;

  const sendersById = Object.fromEntries(
    (sendersRes.data || []).map((s) => [s.id, s])
  );
  return (templatesRes.data || []).map((row) => mapTemplateRow(row, sendersById));
}

export async function saveMailTemplate(payload, id = null) {
  const userId = await currentUserId();
  let senderMailboxId = payload.senderMailboxId || null;
  if (!senderMailboxId && payload.sender) {
    const senders = await fetchSenderMailboxes();
    const match = senders.find((s) => s.mail === payload.sender);
    senderMailboxId = match?.id || null;
  }
  const row = {
    name: String(payload.name || '').trim(),
    category: payload.category || 'General Update',
    default_sender_mailbox_id: senderMailboxId,
    subject: payload.subject || '',
    body: payload.body || '',
    updated_by: userId,
  };
  if (!row.name) throw new Error('Template name is required.');

  if (id) {
    const { data, error } = await supabase
      .from('mail_templates')
      .update(row)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    const senders = await fetchSenderMailboxes();
    const sendersById = Object.fromEntries(senders.map((s) => [s.id, s]));
    return mapTemplateRow(data, sendersById);
  }

  const { data, error } = await supabase
    .from('mail_templates')
    .insert([{ ...row, created_by: userId }])
    .select('*')
    .single();
  if (error) throw error;
  const senders = await fetchSenderMailboxes();
  const sendersById = Object.fromEntries(senders.map((s) => [s.id, s]));
  return mapTemplateRow(data, sendersById);
}

export async function deleteMailTemplate(id) {
  const { error } = await supabase.from('mail_templates').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchMailCampaigns() {
  const { data, error } = await supabase
    .from('mail_campaigns')
    .select('*')
    .order('sent_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapCampaignRow);
}

export async function fetchOutreachStats() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const since = thirtyDaysAgo.toISOString();

  const [clientsRes, campaignsRes] = await Promise.all([
    supabase.from(OUTREACH_CLIENTS_TABLE).select('id, outreach_status, business_module'),
    supabase
      .from('mail_campaigns')
      .select('recipient_count')
      .gte('sent_at', since),
  ]);
  if (clientsRes.error) throw clientsRes.error;
  if (campaignsRes.error) throw campaignsRes.error;

  const clients = clientsRes.data || [];
  const active = clients.filter((c) => c.outreach_status === 'Active').length;
  const modules = new Set(clients.map((c) => c.business_module).filter(Boolean)).size;
  const mails30d = (campaignsRes.data || []).reduce(
    (sum, c) => sum + (c.recipient_count || 0),
    0
  );

  return {
    total: clients.length,
    active,
    modules: modules || 0,
    mails30d,
  };
}

/**
 * Send campaign via Node API — Microsoft Graph dispatch from verified sender mailbox.
 */
export async function sendMailCampaign(payload) {
  const res = await fetchApiWithAuth('/api/crm-outreach/send-campaign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(res.error || 'Failed to send campaign.');
  }
  return res.data;
}

export async function loadCrmOutreachSnapshot(clientOptions = {}) {
  const [clients, templates, senders, campaigns, stats] = await Promise.all([
    fetchOutreachClients(clientOptions),
    fetchMailTemplates(),
    fetchSenderMailboxes(),
    fetchMailCampaigns(),
    fetchOutreachStats(),
  ]);
  return { clients, templates, senders, campaigns, stats };
}
