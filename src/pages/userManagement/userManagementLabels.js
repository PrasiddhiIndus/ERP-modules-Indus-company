import { ROLES } from '../../config/roles';

export const roleLabel = (role) => {
  if (role === ROLES.SUPER_ADMIN_PRO) return 'Super Admin Pro';
  if (role === ROLES.SUPER_ADMIN) return 'Super Admin';
  if (role === ROLES.ADMIN) return 'Admin';
  if (role === ROLES.MANAGER) return 'Manager';
  if (role === ROLES.EXECUTIVE) return 'Executive';
  return role || '—';
};

export const teamLabel = (value) => value ?? '—';

export const canCreateUsers = (userProfile) =>
  userProfile?.role === ROLES.ADMIN ||
  userProfile?.role === ROLES.SUPER_ADMIN ||
  userProfile?.role === ROLES.SUPER_ADMIN_PRO;
