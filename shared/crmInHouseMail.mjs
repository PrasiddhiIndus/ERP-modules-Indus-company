/**
 * CRM & Outreach — In-House (employee) mail helpers shared by the API server and the UI.
 * Pure functions only (no Supabase / network).
 */

export const INHOUSE_MERGE_TOKENS = [
  '{{employee_name}}',
  '{{first_name}}',
  '{{employee_email}}',
  '{{team}}',
  '{{employee_code}}',
];

export const INHOUSE_TEMPLATE_CATEGORIES = [
  'Announcement',
  'HR Update',
  'Policy',
  'Event',
  'General Update',
];

/** Display only — the API always sends from the configured Microsoft Graph notifications mailbox. */
export const INHOUSE_SENDER_LABEL = 'Indus Fire & Safety <notifications@indusfire.com>';

/** One mail, everyone in BCC — stays under Exchange Online's 500-recipients-per-message limit. */
export const INHOUSE_BULK_BCC_LIMIT = 450;

/** Personalised mails (per-employee tokens) are individual messages, sent in parallel. */
export const INHOUSE_PERSONAL_BATCH_SIZE = 50;
export const INHOUSE_PERSONAL_CONCURRENCY = 5;

/** True when subject/body contain a per-employee token, so each employee needs their own copy. */
export function usesPersonalTokens(...texts) {
  return texts.some((text) => INHOUSE_MERGE_TOKENS.some((token) => String(text || '').includes(token)));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmployeeEmail(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

export function isValidEmployeeEmail(raw) {
  const email = normalizeEmployeeEmail(raw);
  return email.length > 3 && email.length <= 254 && EMAIL_RE.test(email);
}

function titleCaseWord(word) {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : '';
}

function nameFromEmail(email) {
  const local = String(email || '').split('@')[0] || '';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(titleCaseWord)
    .join(' ');
}

export function employeeDisplayName(profile) {
  const name = String(profile?.username || profile?.full_name || '').trim();
  if (name) return name;
  return nameFromEmail(normalizeEmployeeEmail(profile?.email)) || 'Employee';
}

function normEmpCode(code) {
  return String(code ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

/** Index Employee Master rows by login (user_id) and employee code. */
export function indexEmployeeMaster(masterRows) {
  const byUserId = new Map();
  const byCode = new Map();
  for (const row of masterRows || []) {
    if (row?.user_id) byUserId.set(row.user_id, row);
    const code = normEmpCode(row?.employee_code);
    if (code) byCode.set(code, row);
  }
  return { byUserId, byCode };
}

/**
 * 'active' | 'inactive' | 'left' | 'not_employee' for one profile.
 * Active = login enabled AND linked Employee Master row is Active with no past leaving date.
 */
export function employeeActiveState(profile, masterIndex, today = new Date().toISOString().slice(0, 10)) {
  if (profile?.is_active === false) return 'inactive';
  if (!masterIndex) return 'active';
  const master =
    masterIndex.byUserId.get(profile?.id) || masterIndex.byCode.get(normEmpCode(profile?.employee_code));
  if (!master) return 'not_employee';
  if (String(master.status || '').trim().toLowerCase() === 'inactive') return 'inactive';
  const leaving = String(master.date_of_leaving || '').slice(0, 10);
  if (leaving && leaving < today) return 'left';
  return 'active';
}

/**
 * Build a mailable employee directory from raw profile rows.
 * - only active employees (login enabled + Active in Employee Master when `masterIndex` is given)
 * - drops missing / invalid emails
 * - keeps one entry per email (first profile wins)
 */
export function buildEmployeeDirectory(profileRows, { masterIndex = null, today } = {}) {
  const employees = [];
  const seenEmails = new Set();
  const stats = { total: 0, inactive: 0, left: 0, notEmployee: 0, missingEmail: 0, invalidEmail: 0, duplicateEmail: 0 };

  for (const row of profileRows || []) {
    if (!row?.id) continue;
    stats.total += 1;
    const state = employeeActiveState(row, masterIndex, today);
    if (state === 'inactive') {
      stats.inactive += 1;
      continue;
    }
    if (state === 'left') {
      stats.left += 1;
      continue;
    }
    if (state === 'not_employee') {
      stats.notEmployee += 1;
      continue;
    }
    const email = normalizeEmployeeEmail(row.email);
    if (!email) {
      stats.missingEmail += 1;
      continue;
    }
    if (!isValidEmployeeEmail(email)) {
      stats.invalidEmail += 1;
      continue;
    }
    if (seenEmails.has(email)) {
      stats.duplicateEmail += 1;
      continue;
    }
    seenEmails.add(email);
    employees.push({
      id: row.id,
      name: employeeDisplayName(row),
      email,
      team: String(row.team || '').trim(),
      employeeCode: String(row.employee_code || '').trim(),
    });
  }

  employees.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { employees, stats };
}

export function renderInHouseTokens(text, employee) {
  if (!text) return '';
  const name = String(employee?.name || '').trim();
  const firstName = name.split(/\s+/)[0] || '';
  return String(text)
    .replaceAll('{{employee_name}}', name)
    .replaceAll('{{first_name}}', firstName)
    .replaceAll('{{employee_email}}', String(employee?.email || ''))
    .replaceAll('{{team}}', String(employee?.team || ''))
    .replaceAll('{{employee_code}}', String(employee?.employeeCode || ''));
}

export function inHouseCampaignStatus({ delivered = 0, failed = 0, skipped = 0, remaining = 0 }) {
  if (remaining > 0) return 'Sending';
  if (delivered === 0) return 'Failed';
  if (failed > 0 || skipped > 0) return 'Partial';
  return 'Delivered';
}
