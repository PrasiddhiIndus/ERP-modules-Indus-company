import { AlertTriangle } from 'lucide-react';
import { ROLES, canSeeSubModule, normalizeAppRole } from '../config/roles';
import { formatDateDdMmYyyy } from '../utils/dateDisplay';

const FLEET_DOCUMENTS_ROUTE = '/app/fire-tender-vehicle-management';

/** Users who can open Fleet Management (Operations module or fleet sub-module). */
export function hasFleetModuleAccess(accessibleModules, profile = null, userMetadata = null) {
  if (accessibleModules?.has('operations')) return true;
  return canSeeSubModule(profile, accessibleModules, 'operations.fleet', userMetadata);
}

/**
 * Who receives fleet document-dues bell + once-per-day popup:
 * admins, or users with fleet management access — never super admins.
 */
export function canReceiveFleetDueNotifications(accessibleModules, profile = null, userMetadata = null) {
  const role = normalizeAppRole(profile?.role);
  if (role === ROLES.SUPER_ADMIN || role === ROLES.SUPER_ADMIN_PRO) return false;
  if (role === ROLES.ADMIN) return true;
  return hasFleetModuleAccess(accessibleModules, profile, userMetadata);
}

function todayIsoLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoDateOnly(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Whole days until expiry (negative = overdue). */
export function daysUntilExpiryDate(expiryDate) {
  const due = parseIsoDateOnly(expiryDate);
  if (!due) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

/**
 * Build fleet due notifications from document expiry_date.
 * Red: overdue or due within 7 days. Yellow: due within 8–15 days.
 */
export function buildFleetDueNotifications(documents = []) {
  const notifications = [];

  for (const doc of documents || []) {
    const days = daysUntilExpiryDate(doc.expiry_date);
    if (days == null) continue;
    if (days > 15) continue;

    const level = days <= 7 ? 'red' : 'yellow';
    const reg =
      doc.operations_fire_tender_vehicle_master?.registration_number ||
      doc.registration_number ||
      'Vehicle';
    const docType = doc.document_type || 'Document';
    const expiryLabel = formatDateDdMmYyyy(doc.expiry_date) || doc.expiry_date;

    let title;
    let message;
    if (days < 0) {
      title = 'Fleet document overdue';
      message = `${reg} · ${docType} · ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue (expired ${expiryLabel})`;
    } else if (days === 0) {
      title = 'Fleet document due today';
      message = `${reg} · ${docType} · expires today (${expiryLabel})`;
    } else {
      title = level === 'red' ? 'Fleet document due within 7 days' : 'Fleet document due within 15 days';
      message = `${reg} · ${docType} · ${days} day${days === 1 ? '' : 's'} left (expires ${expiryLabel})`;
    }

    notifications.push({
      key: `fleet-due:${doc.id}:${doc.expiry_date}:${level}`,
      at: `${String(doc.expiry_date).slice(0, 10)}T00:00:00`,
      source: 'fleet',
      level,
      days,
      icon: AlertTriangle,
      iconClass: level === 'red' ? 'text-red-700 bg-red-100' : 'text-amber-700 bg-amber-100',
      title,
      message,
      route: FLEET_DOCUMENTS_ROUTE,
    });
  }

  return notifications.sort((a, b) => {
    const da = a.days ?? 999;
    const db = b.days ?? 999;
    if (da !== db) return da - db;
    return String(a.message || '').localeCompare(String(b.message || ''));
  });
}

export async function fetchFleetDocumentsForDueAlerts(supabase) {
  const { data, error } = await supabase
    .from('operations_fire_tender_vehicle_documents')
    .select(`
      id,
      document_type,
      expiry_date,
      operations_fire_tender_vehicle_master ( registration_number )
    `)
    .not('expiry_date', 'is', null)
    .order('expiry_date', { ascending: true });

  if (error) throw error;
  return data || [];
}

function popupDismissedStorageKey(userId) {
  return `fleet_due_popup_dismissed_day:${userId || 'anonymous'}`;
}

/** Returns true if the once-per-day fleet popup was already dismissed today. */
export function isFleetDuePopupDismissedToday(userId) {
  try {
    return window.localStorage.getItem(popupDismissedStorageKey(userId)) === todayIsoLocal();
  } catch {
    return false;
  }
}

export function markFleetDuePopupDismissedToday(userId) {
  try {
    window.localStorage.setItem(popupDismissedStorageKey(userId), todayIsoLocal());
  } catch {
    /* ignore */
  }
}

export function summarizeFleetDueNotifications(notifications = []) {
  const fleet = (notifications || []).filter((n) => n.source === 'fleet');
  const red = fleet.filter((n) => n.level === 'red').length;
  const yellow = fleet.filter((n) => n.level === 'yellow').length;
  return { total: fleet.length, red, yellow, items: fleet };
}
