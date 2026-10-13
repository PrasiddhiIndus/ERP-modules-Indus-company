import { getEnquiryFieldValue } from '../../../services/projectsApi';
import { getRowStatusValue } from './enquiryStatusStyles';
import {
  getCompletionDate,
  isCompletedAfterTarget,
  isCompletedStatus,
  isOverdueOpen,
  startOfToday,
  toLocalDate,
} from './enquiryDeadlines';

export const UNASSIGNED_LABEL = 'Unassigned';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Date the person got the enquiry: assigned on date, else receipt date. */
export function getAssignedStartDate(row) {
  return (
    toLocalDate(getEnquiryFieldValue(row, 'assigned_on_date')) ||
    toLocalDate(getEnquiryFieldValue(row, 'enquiry_receipt_date'))
  );
}

/** Calendar days from assignment to completion, or null if unknown. */
export function getDaysToComplete(row) {
  if (!isCompletedStatus(getRowStatusValue(row))) return null;
  const start = getAssignedStartDate(row);
  const done = getCompletionDate(row);
  if (!start || !done) return null;
  return Math.max(0, Math.round((done - start) / DAY_MS));
}

export function getAssigneeName(row) {
  const name = String(getEnquiryFieldValue(row, 'assigned_to_person') || '').trim();
  return name || UNASSIGNED_LABEL;
}

function emptyBucket(name) {
  return {
    name,
    received: [],
    completed: [],
    overdue: [],
    completedLate: [],
    completedOnTime: [],
    daysTotal: 0,
    daysCount: 0,
  };
}

function finalize(b) {
  return {
    name: b.name,
    ids: {
      received: b.received,
      completed: b.completed,
      overdue: b.overdue,
      completedLate: b.completedLate,
      completedOnTime: b.completedOnTime,
    },
    received: b.received.length,
    completed: b.completed.length,
    overdue: b.overdue.length,
    completedLate: b.completedLate.length,
    completedOnTime: b.completedOnTime.length,
    avgDaysToComplete: b.daysCount ? b.daysTotal / b.daysCount : null,
    onTimeRate: b.completed.length ? b.completedOnTime.length / b.completed.length : null,
  };
}

function addRow(bucket, row, today) {
  bucket.received.push(row.id);
  if (isCompletedStatus(getRowStatusValue(row))) {
    bucket.completed.push(row.id);
    if (isCompletedAfterTarget(row)) bucket.completedLate.push(row.id);
    else bucket.completedOnTime.push(row.id);
    const days = getDaysToComplete(row);
    if (days != null) {
      bucket.daysTotal += days;
      bucket.daysCount += 1;
    }
  }
  if (isOverdueOpen(row, today)) bucket.overdue.push(row.id);
}

/** Per-person enquiry KPIs plus an overall total. People sorted by enquiries received. */
export function buildAssigneeKpis(rows, today = startOfToday()) {
  const byName = new Map();
  const total = emptyBucket('All people');
  for (const row of rows || []) {
    const name = getAssigneeName(row);
    if (!byName.has(name)) byName.set(name, emptyBucket(name));
    addRow(byName.get(name), row, today);
    addRow(total, row, today);
  }
  const people = [...byName.values()]
    .map(finalize)
    .sort((a, b) => {
      if (a.name === UNASSIGNED_LABEL) return 1;
      if (b.name === UNASSIGNED_LABEL) return -1;
      return b.received - a.received || a.name.localeCompare(b.name);
    });
  return { people, total: finalize(total) };
}
