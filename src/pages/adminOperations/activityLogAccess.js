/** Top-level Internal Utilities module — Super Admin only. */
export const ACTIVITY_LOG_APP_PATH = '/app/activity-history'

export function isActivityLogAppPath(pathname) {
  const p = String(pathname || '').split('?')[0].replace(/\/+$/, '') || '/'
  return p === ACTIVITY_LOG_APP_PATH || p.startsWith(`${ACTIVITY_LOG_APP_PATH}/`)
}

/** Full activity history is Super Admin / Super Admin Pro only. */
export function canAccessActivityLog(profileOrIdentity) {
  const role = String(profileOrIdentity?.role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  return role === 'super_admin' || role === 'super_admin_pro' || role === 'superadmin' || role === 'superadmin_pro'
}
