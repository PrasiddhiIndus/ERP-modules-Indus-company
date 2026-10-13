import { normalizeAppRole, ROLES } from '../../../config/roles';

const APPROVER_ROLES = new Set([ROLES.MANAGER, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SUPER_ADMIN_PRO]);

/** Manager / Admin / Super Admin: delete enquiries directly, decide deletion requests, see every overdue alert. */
export function isEnquiryApprover(profile) {
  return APPROVER_ROLES.has(normalizeAppRole(profile?.role));
}

const nameKey = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const codeKey = (value) => {
  const s = String(value || '').trim();
  return /^\d+$/.test(s) ? String(Number(s)) : s.toLowerCase();
};

/**
 * Assigned To Person names that refer to this user: their own name, plus the
 * Employee Master name listed against their employee code.
 */
export function namesForUser(profile, assigneeOptions = []) {
  const names = new Set();
  const own = nameKey(profile?.username || profile?.full_name);
  if (own) names.add(own);
  const myCode = codeKey(profile?.employee_code);
  if (myCode) {
    for (const opt of assigneeOptions) {
      if (opt?.employee_code && codeKey(opt.employee_code) === myCode && opt.value) names.add(nameKey(opt.value));
    }
  }
  return names;
}

export function isAssignedToAny(assignedTo, names) {
  const key = nameKey(assignedTo);
  return Boolean(key) && names.has(key);
}
