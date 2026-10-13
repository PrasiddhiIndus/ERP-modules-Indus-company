import { getEnquiryFieldValue } from '../../../services/projectsApi';
import { normalizeToIsoDate } from '../../../utils/dateDisplay';
import { getRowStatusValue } from './enquiryStatusStyles';

/** Target date = assigned on date + this many working days (Monday–Saturday). */
export const TARGET_WORKING_DAYS = 7;

/** Target date is counted from this field. */
export const TARGET_BASIS_KEY = 'assigned_on_date';

/** Display order for the assignment fields (others keep their configured order). */
const ASSIGNMENT_FIELD_ORDER = ['assigned_on_date', 'target_date', 'assigned_to_person'];

export function orderAssignmentFields(list) {
  const items = list || [];
  const firstIdx = items.findIndex((f) => ASSIGNMENT_FIELD_ORDER.includes(f.field_key));
  if (firstIdx < 0) return items;
  const group = ASSIGNMENT_FIELD_ORDER.map((key) => items.find((f) => f.field_key === key)).filter(Boolean);
  const rest = items.filter((f) => !ASSIGNMENT_FIELD_ORDER.includes(f.field_key));
  return [...rest.slice(0, firstIdx), ...group, ...rest.slice(firstIdx)];
}

/** Returns the form with target_date recalculated from the assigned-on date (if both exist). */
export function withAutoTargetDate(form) {
  if (!form || !('target_date' in form) || !form[TARGET_BASIS_KEY]) return form;
  const target = addWorkingDays(form[TARGET_BASIS_KEY]);
  return target ? { ...form, target_date: target } : form;
}

/** Open enquiries with this many days or fewer to the target date are "due soon". */
export const DUE_SOON_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Rows edited within this window of creation are treated as never edited (e.g. imports). */
const EDIT_GRACE_MS = 60 * 1000;

export function toLocalDate(value) {
  const iso = normalizeToIsoDate(value);
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d));
}

function toIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayIso() {
  return toIso(new Date());
}

export function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/** Adds working days (Sundays skipped) to an ISO / dd-mm-yyyy date. Returns ISO or ''. */
export function addWorkingDays(value, days = TARGET_WORKING_DAYS) {
  const date = toLocalDate(value);
  if (!date) return '';
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0) added += 1;
  }
  return toIso(date);
}

export function isClosedStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === 'completed' || s === 'regret';
}

export function isCompletedStatus(status) {
  return String(status || '').trim().toLowerCase() === 'completed';
}

/** Whole calendar days from today to the target date (negative = overdue), or null. */
export function getDaysLeft(row, today = startOfToday()) {
  const target = toLocalDate(getEnquiryFieldValue(row, 'target_date'));
  if (!target) return null;
  return Math.round((target - today) / DAY_MS);
}

/**
 * Completion date: recorded when saved as Completed; otherwise the last edit
 * (only if the row was edited after it was created).
 */
export function getCompletionDate(row) {
  const recorded = toLocalDate(row?.data?.completed_on);
  if (recorded) return recorded;
  const created = Date.parse(row?.created_at || '');
  const updated = Date.parse(row?.updated_at || '');
  if (!Number.isFinite(updated)) return null;
  if (Number.isFinite(created) && updated - created < EDIT_GRACE_MS) return null;
  const d = new Date(updated);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isOverdueOpen(row, today = startOfToday()) {
  if (isClosedStatus(getRowStatusValue(row))) return false;
  const daysLeft = getDaysLeft(row, today);
  return daysLeft != null && daysLeft < 0;
}

export function isDueSoon(row, today = startOfToday()) {
  if (isClosedStatus(getRowStatusValue(row))) return false;
  const daysLeft = getDaysLeft(row, today);
  return daysLeft != null && daysLeft >= 0 && daysLeft <= DUE_SOON_DAYS;
}

export function isCompletedAfterTarget(row) {
  if (!isCompletedStatus(getRowStatusValue(row))) return false;
  const target = toLocalDate(getEnquiryFieldValue(row, 'target_date'));
  const completed = getCompletionDate(row);
  return Boolean(target && completed && completed > target);
}

/**
 * Dashboard boxes: every enquiry lands in exactly one box, first match wins —
 * Regret, Overdue & Completed, Completed (on time), Overdue, Due soon,
 * Unassigned, Not Started, In Progress (any other open status).
 */
export function dashboardBucket(row, today = startOfToday()) {
  const status = String(getRowStatusValue(row) || '').trim().toLowerCase();
  if (status === 'regret') return 'regret';
  if (status === 'completed') return isCompletedAfterTarget(row) ? 'completedLate' : 'completed';
  if (isOverdueOpen(row, today)) return 'overdue';
  if (isDueSoon(row, today)) return 'dueSoon';
  if (!String(getEnquiryFieldValue(row, 'assigned_to_person') ?? '').trim()) return 'unassigned';
  if (status === '' || status === 'not started') return 'notStarted';
  return 'wip';
}

/** Colour + label for the Days left column. */
export function daysLeftBadge(row, today = startOfToday()) {
  if (isClosedStatus(getRowStatusValue(row))) {
    return { label: 'Closed', className: 'bg-slate-100 text-slate-500', title: 'Enquiry is closed' };
  }
  const days = getDaysLeft(row, today);
  if (days == null) {
    return { label: '—', className: 'text-slate-400', title: 'No target date' };
  }
  if (days < 0) {
    const n = Math.abs(days);
    return { label: `${n} day${n === 1 ? '' : 's'} overdue`, className: 'bg-red-100 text-red-800', title: 'Past target date' };
  }
  if (days === 0) {
    return { label: 'Due today', className: 'bg-red-100 text-red-800', title: 'Target date is today' };
  }
  const label = `${days} day${days === 1 ? '' : 's'}`;
  if (days <= 2) return { label, className: 'bg-orange-100 text-orange-800', title: 'Due very soon' };
  if (days <= 5) return { label, className: 'bg-amber-100 text-amber-800', title: 'Due soon' };
  return { label, className: 'bg-emerald-100 text-emerald-800', title: 'On track' };
}
