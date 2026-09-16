/**
 * Official letters + probation reviews API and date helpers.
 */
import { supabase } from './supabase';
import { normalizeToIsoDate } from '../utils/dateDisplay';
import { EMPLOYMENT_TYPES, normalizeEmploymentType } from '../utils/employeeMasterReminders';

export const LETTERS_TABLE = 'admin_official_letters';
export const REVIEWS_TABLE = 'admin_probation_reviews';

export const PROBATION_MILESTONES = [
  { key: 'm2', label: '2-month review', months: 2, days: 0 },
  { key: 'm4', label: '4-month review', months: 4, days: 0 },
  { key: 'm55', label: '5.5-month review', months: 5, days: 15 },
];

const MILESTONE_ORDER = { m2: 1, m4: 2, m55: 3 };

const EMPLOYEE_SELECT = [
  'id',
  'employee_code',
  'full_name',
  'department',
  'designation',
  'date_of_joining',
  'confirmation_date',
  'employment_type',
  'status',
].join(',');

function addMonthsAndDays(iso, months, days) {
  const normalized = normalizeToIsoDate(iso);
  if (!normalized) return null;
  const [y, m, d] = normalized.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCMonth(dt.getUTCMonth() + Number(months || 0));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return dt.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromIso, toIso) {
  const a = normalizeToIsoDate(fromIso);
  const b = normalizeToIsoDate(toIso);
  if (!a || !b) return null;
  const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  return Math.round(ms / 86400000);
}

export function isMissingOfficialLettersTableError(err) {
  const msg = `${err?.message || ''} ${err?.details || ''} ${err?.code || ''}`;
  return /schema cache|does not exist|could not find the table|42p01|pgrst205/i.test(msg);
}

export function friendlyOfficialLettersError(err, fallback) {
  if (isMissingOfficialLettersTableError(err)) {
    return 'Official Letters is not available yet. Ask IT to apply the latest database update.';
  }
  return err?.message || fallback;
}

/** Schedule milestones from DOJ. */
export function buildProbationSchedule(dateOfJoining) {
  const doj = normalizeToIsoDate(dateOfJoining);
  if (!doj) return [];
  return PROBATION_MILESTONES.map((m) => ({
    milestone: m.key,
    label: m.label,
    scheduled_date: addMonthsAndDays(doj, m.months, m.days),
  }));
}

/** True when employee master marks the person as permanent (or already confirmed). */
export function isEmployeePermanent(employee) {
  const employmentType = normalizeEmploymentType(employee?.employment_type);
  if (employmentType === EMPLOYMENT_TYPES.PERMANENT) return true;
  return Boolean(normalizeToIsoDate(employee?.confirmation_date));
}

export function isOfficialLetterAcknowledged(letter) {
  return Boolean(letter?.agreed) && Boolean(letter?.acknowledged_at);
}

export function officialLetterAckStatusLabel(letter) {
  return isOfficialLetterAcknowledged(letter) ? 'Acknowledged' : 'Awaiting acknowledgment';
}

/**
 * Derive list-stage chip for an employee.
 * @returns {{ stage: string, severity: string, nextDue: string|null, nextMilestone: string|null }}
 */
export function deriveProbationStage(employee, reviewsByMilestone = {}) {
  if (isEmployeePermanent(employee)) {
    return { stage: 'Confirmed', severity: 'info', nextDue: null, nextMilestone: null };
  }

  const confirmation = normalizeToIsoDate(employee?.confirmation_date);
  if (confirmation) {
    return { stage: 'Confirmed', severity: 'info', nextDue: null, nextMilestone: null };
  }

  const schedule = buildProbationSchedule(employee?.date_of_joining);
  if (!schedule.length) {
    return { stage: 'N/A', severity: 'neutral', nextDue: null, nextMilestone: null };
  }

  const today = todayIso();
  let next = null;

  for (const item of schedule) {
    const review = reviewsByMilestone[item.milestone];
    const done =
      review &&
      review.outcome &&
      review.outcome !== 'pending' &&
      (review.held_on || review.outcome === 'confirm');
    if (done) continue;
    next = item;
    break;
  }

  if (!next) {
    // All milestones logged without confirmation_date — treat as reviews complete
    return { stage: 'Reviews done', severity: 'info', nextDue: null, nextMilestone: null };
  }

  const delta = daysBetween(today, next.scheduled_date);
  if (delta == null) {
    return { stage: next.label, severity: 'warning', nextDue: next.scheduled_date, nextMilestone: next.milestone };
  }
  if (delta < 0) {
    return {
      stage: `Overdue · ${next.label}`,
      severity: 'high',
      nextDue: next.scheduled_date,
      nextMilestone: next.milestone,
    };
  }
  if (delta <= 14) {
    return {
      stage: `Due · ${next.label}`,
      severity: 'warning',
      nextDue: next.scheduled_date,
      nextMilestone: next.milestone,
    };
  }
  return {
    stage: `Upcoming · ${next.label}`,
    severity: 'neutral',
    nextDue: next.scheduled_date,
    nextMilestone: next.milestone,
  };
}

export function matchesProbationFilter(stageInfo, filter) {
  const f = String(filter || 'all').toLowerCase();
  if (f === 'all') return true;
  const stage = String(stageInfo?.stage || '');
  const today = todayIso();
  if (f === 'confirmed') return stage === 'Confirmed';
  if (f === 'overdue') return stage.startsWith('Overdue');
  if (f === 'due_now') return stage.startsWith('Due');
  if (f === 'upcoming_30') {
    if (!stageInfo?.nextDue) return false;
    const delta = daysBetween(today, stageInfo.nextDue);
    return delta != null && delta >= 0 && delta <= 30;
  }
  return true;
}

export async function fetchOfficialLetterEmployees() {
  const { data, error } = await supabase
    .from('admin_ifsp_employee_master')
    .select(EMPLOYEE_SELECT)
    .order('employee_code', { ascending: true, nullsFirst: false })
    .order('full_name', { ascending: true });
  if (error) throw error;
  return data || [];
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function fetchLettersForEmployees(employeeIds = []) {
  const ids = [...new Set((employeeIds || []).filter(Boolean))];
  if (!ids.length) return [];
  const all = [];
  for (const batch of chunk(ids, 200)) {
    const { data, error } = await supabase
      .from(LETTERS_TABLE)
      .select('*')
      .in('employee_master_id', batch)
      .order('created_at', { ascending: false });
    if (error) throw error;
    all.push(...(data || []));
  }
  return all;
}

export async function fetchLettersForEmployee(employeeMasterId) {
  const { data, error } = await supabase
    .from(LETTERS_TABLE)
    .select('*')
    .eq('employee_master_id', employeeMasterId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchReviewsForEmployees(employeeIds = []) {
  const ids = [...new Set((employeeIds || []).filter(Boolean))];
  if (!ids.length) return [];
  const all = [];
  for (const batch of chunk(ids, 200)) {
    const { data, error } = await supabase
      .from(REVIEWS_TABLE)
      .select('*')
      .in('employee_master_id', batch);
    if (error) throw error;
    all.push(...(data || []));
  }
  return all;
}

export async function fetchReviewsForEmployee(employeeMasterId) {
  const { data, error } = await supabase
    .from(REVIEWS_TABLE)
    .select('*')
    .eq('employee_master_id', employeeMasterId);
  if (error) throw error;
  return data || [];
}

export async function insertOfficialLetter(payload) {
  const { data, error } = await supabase
    .from(LETTERS_TABLE)
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function upsertProbationReview(payload) {
  const { data, error } = await supabase
    .from(REVIEWS_TABLE)
    .upsert(payload, { onConflict: 'employee_master_id,milestone' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

function reviewHeldDate(review) {
  return normalizeToIsoDate(review?.held_on) || normalizeToIsoDate(review?.scheduled_date);
}

/** Latest milestone with a logged outcome drives employee master updates. */
export function authoritativeProbationReview(reviewsByMilestone = {}) {
  return Object.entries(reviewsByMilestone || {})
    .map(([milestone, row]) => ({ milestone, ...(row || {}) }))
    .filter((row) => row.outcome && row.outcome !== 'pending')
    .sort(
      (a, b) =>
        (MILESTONE_ORDER[b.milestone] || 0) - (MILESTONE_ORDER[a.milestone] || 0)
    )[0] || null;
}

/**
 * Map probation review outcomes to employee master fields.
 * Uses the latest milestone with a non-pending outcome.
 */
export function deriveEmployeeMasterUpdatesFromProbationReviews(
  reviewsByMilestone = {},
  employee = {}
) {
  const review = authoritativeProbationReview(reviewsByMilestone);
  if (!review) return null;

  const heldIso = reviewHeldDate(review);
  const notes = String(review.notes || '').trim();

  switch (review.outcome) {
    case 'confirm':
      return {
        employment_type: 'permanent',
        status: 'Active',
        confirmation_date:
          heldIso || normalizeToIsoDate(employee.confirmation_date) || todayIso(),
        date_of_leaving: null,
        status_reason: null,
      };
    case 'exit':
      return {
        status: 'Inactive',
        date_of_leaving:
          heldIso || normalizeToIsoDate(employee.date_of_leaving) || todayIso(),
        status_reason: notes || 'Probation review — exit / separate',
      };
    case 'continue':
    case 'extend':
      return {
        employment_type: 'probation',
        status: 'Active',
        confirmation_date: null,
        date_of_leaving: null,
        status_reason: null,
      };
    default:
      return null;
  }
}

/** Persist employee master fields derived from probation reviews. */
export async function syncEmployeeMasterFromProbationReviews(
  employeeMasterId,
  reviewsByMilestone = {},
  employee = {},
  { actorEmail } = {}
) {
  const derived = deriveEmployeeMasterUpdatesFromProbationReviews(
    reviewsByMilestone,
    employee
  );
  if (!derived) return null;

  const update = {
    ...derived,
    updated_at: new Date().toISOString(),
  };
  if (actorEmail) {
    update.updated_by = actorEmail;
    if (derived.status) {
      update.status_changed_by = actorEmail;
      update.status_changed_at = new Date().toISOString();
    }
  }

  const { data, error } = await supabase
    .from('admin_ifsp_employee_master')
    .update(update)
    .eq('id', employeeMasterId)
    .select(
      'id, status, employment_type, confirmation_date, date_of_leaving, status_reason'
    )
    .single();
  if (error) throw error;
  return data;
}

/** Stamp confirmation on employee master (confirmation letter or review). */
export async function stampEmployeeConfirmationDate(
  employeeMasterId,
  confirmationDate,
  { actorEmail } = {}
) {
  const iso = normalizeToIsoDate(confirmationDate) || todayIso();
  const update = {
    confirmation_date: iso,
    employment_type: 'permanent',
    status: 'Active',
    updated_at: new Date().toISOString(),
  };
  if (actorEmail) {
    update.updated_by = actorEmail;
  }

  const { data, error } = await supabase
    .from('admin_ifsp_employee_master')
    .update(update)
    .eq('id', employeeMasterId)
    .select('id, confirmation_date, employment_type, status')
    .single();
  if (error) throw error;
  return data;
}

export function lettersIssuedThisMonthCount(letters) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return (letters || []).filter((row) => {
    const created = row.created_at || row.letter_date;
    if (!created) return false;
    const d = new Date(created);
    return d.getUTCFullYear() === y && d.getUTCMonth() === m;
  }).length;
}

export function confirmedThisYearCount(employees) {
  const y = new Date().getUTCFullYear();
  return (employees || []).filter((e) => {
    const c = normalizeToIsoDate(e.confirmation_date);
    return c && Number(c.slice(0, 4)) === y;
  }).length;
}
