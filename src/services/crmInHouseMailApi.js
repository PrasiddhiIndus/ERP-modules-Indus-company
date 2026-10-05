import { supabase } from '../lib/supabase';
import { fetchApiWithAuth } from '../lib/apiBase';

const TEMPLATES = 'crm_inhouse_mail_templates';
const GROUPS = 'crm_inhouse_mail_groups';
const GROUP_MEMBERS = 'crm_inhouse_mail_group_members';
const CAMPAIGNS = 'crm_inhouse_mail_campaigns';
const RECIPIENTS = 'crm_inhouse_mail_campaign_recipients';

const MEMBER_CHUNK = 500;

async function currentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

function apiError(res, fallback) {
  return new Error(res?.error || res?.data?.message || fallback);
}

export function mapInHouseTemplateRow(row) {
  return {
    id: row.id,
    name: row.name || '',
    category: row.category || 'General Update',
    subject: row.subject || '',
    body: row.body || '',
    updatedAt: row.updated_at || null,
  };
}

export function mapInHouseCampaignRow(row) {
  return {
    id: row.id,
    name: row.name || '',
    template: row.template_name || 'Custom',
    sender: row.sender_mail || '',
    groups: Array.isArray(row.group_names) ? row.group_names : [],
    total: row.total_recipients ?? 0,
    delivered: row.delivered_count ?? 0,
    failed: row.failed_count ?? 0,
    skipped: row.skipped_count ?? 0,
    status: row.status,
    sentAt: row.sent_at || null,
  };
}

// ---------------------------------------------------------------------------
// Employees (server reads public.profiles; non-admin users cannot list profiles via RLS)
// ---------------------------------------------------------------------------
export async function fetchInHouseEmployees() {
  const res = await fetchApiWithAuth('/api/crm-outreach/inhouse/employees', { method: 'GET' });
  if (!res.ok) throw apiError(res, 'Could not load employees.');
  return {
    employees: res.data?.employees || [],
    stats: res.data?.stats || null,
  };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
export async function fetchInHouseTemplates() {
  const { data, error } = await supabase.from(TEMPLATES).select('*').order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapInHouseTemplateRow);
}

export async function saveInHouseTemplate(payload, id = null) {
  const userId = await currentUserId();
  const row = {
    name: String(payload.name || '').trim(),
    category: payload.category || 'General Update',
    subject: payload.subject || '',
    body: payload.body || '',
    updated_by: userId,
  };
  if (!row.name) throw new Error('Template name is required.');

  const query = id
    ? supabase.from(TEMPLATES).update(row).eq('id', id)
    : supabase.from(TEMPLATES).insert([{ ...row, created_by: userId }]);
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return mapInHouseTemplateRow(data);
}

export async function deleteInHouseTemplate(id) {
  const { error } = await supabase.from(TEMPLATES).delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------
export async function fetchInHouseGroups() {
  const [groupsRes, membersRes] = await Promise.all([
    supabase.from(GROUPS).select('*').order('name', { ascending: true }),
    supabase.from(GROUP_MEMBERS).select('group_id, profile_id'),
  ]);
  if (groupsRes.error) throw groupsRes.error;
  if (membersRes.error) throw membersRes.error;

  const membersByGroup = new Map();
  for (const m of membersRes.data || []) {
    if (!membersByGroup.has(m.group_id)) membersByGroup.set(m.group_id, []);
    membersByGroup.get(m.group_id).push(m.profile_id);
  }
  return (groupsRes.data || []).map((g) => ({
    id: g.id,
    name: g.name || '',
    description: g.description || '',
    memberIds: membersByGroup.get(g.id) || [],
  }));
}

async function syncGroupMembers(groupId, memberIds, userId) {
  const { data: existing, error: loadErr } = await supabase
    .from(GROUP_MEMBERS)
    .select('profile_id')
    .eq('group_id', groupId);
  if (loadErr) throw loadErr;

  const current = new Set((existing || []).map((r) => r.profile_id));
  const next = new Set(memberIds);
  const toRemove = [...current].filter((id) => !next.has(id));
  const toAdd = [...next].filter((id) => !current.has(id));

  for (let i = 0; i < toRemove.length; i += MEMBER_CHUNK) {
    const { error } = await supabase
      .from(GROUP_MEMBERS)
      .delete()
      .eq('group_id', groupId)
      .in('profile_id', toRemove.slice(i, i + MEMBER_CHUNK));
    if (error) throw error;
  }
  for (let i = 0; i < toAdd.length; i += MEMBER_CHUNK) {
    const rows = toAdd.slice(i, i + MEMBER_CHUNK).map((profileId) => ({
      group_id: groupId,
      profile_id: profileId,
      added_by: userId,
    }));
    const { error } = await supabase.from(GROUP_MEMBERS).insert(rows);
    if (error) throw error;
  }
}

export async function saveInHouseGroup(payload, id = null) {
  const userId = await currentUserId();
  const row = {
    name: String(payload.name || '').trim(),
    description: String(payload.description || '').trim() || null,
    updated_by: userId,
  };
  if (!row.name) throw new Error('Group name is required.');

  const query = id
    ? supabase.from(GROUPS).update(row).eq('id', id)
    : supabase.from(GROUPS).insert([{ ...row, created_by: userId }]);
  const { data, error } = await query.select('*').single();
  if (error) {
    if (error.code === '23505') throw new Error('A group with this name already exists.');
    throw error;
  }

  const memberIds = [...new Set((payload.memberIds || []).filter(Boolean))];
  await syncGroupMembers(data.id, memberIds, userId);
  return {
    id: data.id,
    name: data.name || '',
    description: data.description || '',
    memberIds,
  };
}

export async function deleteInHouseGroup(id) {
  const { error } = await supabase.from(GROUPS).delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Campaign history
// ---------------------------------------------------------------------------
export async function fetchInHouseCampaigns() {
  const { data, error } = await supabase
    .from(CAMPAIGNS)
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []).map(mapInHouseCampaignRow);
}

export async function fetchInHouseCampaignRecipients(campaignId) {
  const { data, error } = await supabase
    .from(RECIPIENTS)
    .select('id, recipient_name, recipient_email, status, error_message, sent_at')
    .eq('campaign_id', campaignId)
    .order('recipient_name', { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    name: r.recipient_name || '',
    email: r.recipient_email || '',
    status: r.status,
    error: r.error_message || '',
    sentAt: r.sent_at || null,
  }));
}

// ---------------------------------------------------------------------------
// Sending (Node API → Microsoft Graph)
// ---------------------------------------------------------------------------
export async function startInHouseCampaign(payload) {
  const res = await fetchApiWithAuth('/api/crm-outreach/inhouse/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw apiError(res, 'Failed to start the mail.');
  return res.data;
}

export async function sendInHouseCampaignBatch(campaignId) {
  const res = await fetchApiWithAuth(
    `/api/crm-outreach/inhouse/campaigns/${encodeURIComponent(campaignId)}/send-batch`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
  );
  if (!res.ok) throw apiError(res, 'Failed to send mail.');
  return res.data;
}

function friendlySetupError(err) {
  const missingTable = err?.code === 'PGRST205' || /schema cache|does not exist/i.test(String(err?.message || ''));
  if (!missingTable) return err;
  console.error('[crm-outreach/inhouse] setup incomplete:', err?.message);
  return new Error('In-House mail is not set up yet. Ask an administrator to apply the latest system update.');
}

export async function loadInHouseSnapshot() {
  let results;
  try {
    results = await Promise.all([
      fetchInHouseEmployees(),
      fetchInHouseTemplates(),
      fetchInHouseGroups(),
      fetchInHouseCampaigns(),
    ]);
  } catch (err) {
    throw friendlySetupError(err);
  }
  const [employeesResult, templates, groups, campaigns] = results;
  return {
    employees: employeesResult.employees,
    employeeStats: employeesResult.stats,
    templates,
    groups,
    campaigns,
  };
}
