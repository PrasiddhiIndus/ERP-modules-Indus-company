/**
 * CRM & Outreach — In-House (employee) mail helpers shared by the API server and the UI.
 * Pure functions only (no Supabase / network).
 */

export const INHOUSE_MERGE_TOKENS = [
  '{{employee_name}}',
  '{{first_name}}',
  '{{employee_email}}',
  '{{department}}',
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

/** Legacy alias still personalises old templates that used {{team}}. */
const LEGACY_PERSONAL_TOKENS = ['{{team}}'];

/** True when subject/body contain a per-employee token, so each employee needs their own copy. */
export function usesPersonalTokens(...texts) {
  const tokens = [...INHOUSE_MERGE_TOKENS, ...LEGACY_PERSONAL_TOKENS];
  return texts.some((text) => tokens.some((token) => String(text || '').includes(token)));
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

/** Prefer Employee Master full name, then profile username / full_name, then email local-part. */
export function employeeDisplayName(profile, master = null) {
  const name = String(master?.full_name || profile?.username || profile?.full_name || '').trim();
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

/** Linked Employee Master row for a login profile (by user_id, then employee code). */
export function lookupEmployeeMaster(profile, masterIndex) {
  if (!masterIndex || !profile) return null;
  return (
    masterIndex.byUserId.get(profile.id) ||
    masterIndex.byCode.get(normEmpCode(profile.employee_code)) ||
    null
  );
}

/**
 * 'active' | 'inactive' | 'left' | 'not_employee' for one profile.
 * Active = login enabled AND linked Employee Master row is Active with no past leaving date.
 */
export function employeeActiveState(profile, masterIndex, today = new Date().toISOString().slice(0, 10)) {
  if (profile?.is_active === false) return 'inactive';
  if (!masterIndex) return 'active';
  const master = lookupEmployeeMaster(profile, masterIndex);
  if (!master) return 'not_employee';
  if (String(master.status || '').trim().toLowerCase() === 'inactive') return 'inactive';
  const leaving = String(master.date_of_leaving || '').slice(0, 10);
  if (leaving && leaving < today) return 'left';
  return 'active';
}

/**
 * Build a mailable employee directory from raw profile rows.
 * - only active employees (login enabled + Active in Employee Master when `masterIndex` is given)
 * - name, department, designation come from Employee Master
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
    const master = lookupEmployeeMaster(row, masterIndex);
    employees.push({
      id: row.id,
      name: employeeDisplayName(row, master),
      email,
      department: String(master?.department || '').trim(),
      designation: String(master?.designation || '').trim(),
      employeeCode: String(master?.employee_code || row.employee_code || '').trim(),
    });
  }

  employees.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { employees, stats };
}

export function renderInHouseTokens(text, employee) {
  if (!text) return '';
  const name = String(employee?.name || '').trim();
  const firstName = name.split(/\s+/)[0] || '';
  const department = String(employee?.department || employee?.team || '').trim();
  return String(text)
    .replaceAll('{{employee_name}}', name)
    .replaceAll('{{first_name}}', firstName)
    .replaceAll('{{employee_email}}', String(employee?.email || ''))
    .replaceAll('{{department}}', department)
    .replaceAll('{{team}}', department)
    .replaceAll('{{employee_code}}', String(employee?.employeeCode || ''));
}

export function inHouseCampaignStatus({ delivered = 0, failed = 0, skipped = 0, remaining = 0 }) {
  if (remaining > 0) return 'Sending';
  if (delivered === 0) return 'Failed';
  if (failed > 0 || skipped > 0) return 'Partial';
  return 'Delivered';
}
