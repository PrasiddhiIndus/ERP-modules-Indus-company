import { adminCreateUser } from './adminCreateUserApi.js';

const API_VERSION = 'server-bulk-create-1';
export const BULK_USER_MAX_BATCH = 100;

export async function adminBulkCreateUsers(body, jwt, supabaseUrl, serviceRoleKey, anonKey) {
  const users = Array.isArray(body?.users) ? body.users : [];
  if (!users.length) {
    const err = new Error('users array is required');
    err.status = 400;
    err.version = API_VERSION;
    throw err;
  }
  if (users.length > BULK_USER_MAX_BATCH) {
    const err = new Error(`Maximum ${BULK_USER_MAX_BATCH} users per batch.`);
    err.status = 400;
    err.version = API_VERSION;
    throw err;
  }

  const results = [];
  let created = 0;
  let failed = 0;

  for (let i = 0; i < users.length; i++) {
    const rowNum = Number(users[i]?.row) > 0 ? Number(users[i].row) : i + 2;
    const emailHint = String(users[i]?.email ?? '').trim().toLowerCase();
    try {
      const outcome = await adminCreateUser(users[i], jwt, supabaseUrl, serviceRoleKey, anonKey);
      created += 1;
      results.push({
        row: rowNum,
        ok: true,
        email: outcome.email,
        user_id: outcome.user_id,
        restored: outcome.restored,
      });
    } catch (e) {
      failed += 1;
      results.push({
        row: rowNum,
        ok: false,
        email: emailHint || undefined,
        error: e?.message || 'Could not create user',
      });
    }
  }

  return {
    ok: true,
    version: API_VERSION,
    results,
    summary: { total: users.length, created, failed },
  };
}
