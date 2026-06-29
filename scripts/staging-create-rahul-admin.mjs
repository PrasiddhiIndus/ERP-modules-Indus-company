#!/usr/bin/env node
/**
 * Create / reset rahul.ifspl@gmail.com on STAGING Supabase with email confirmed.
 *
 * Usage (PowerShell):
 *   $env:STAGING_SUPABASE_SERVICE_ROLE_KEY="paste from Dashboard → API → service_role (staging project)"
 *   npm run staging:create-rahul-admin
 *
 * Project: xjzhlbpgnpcmbdlufhwo only. Never use production service_role key.
 */

import { createClient } from '@supabase/supabase-js';

const STAGING_URL = 'https://xjzhlbpgnpcmbdlufhwo.supabase.co';
const EMAIL = 'rahul.ifspl@gmail.com';
const PASSWORD = process.env.STAGING_ADMIN_PASSWORD || '123456';

const serviceKey = String(process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!serviceKey) {
  console.error(
    'Missing STAGING_SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Supabase Dashboard → project xjzhlbpgnpcmbdlufhwo → Settings → API → service_role key'
  );
  process.exit(1);
}

const admin = createClient(STAGING_URL, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const profilePayload = {
  email: EMAIL,
  username: 'rahul',
  team: 'admin',
  role: 'super_admin_pro',
  allowed_modules: [
    'marketing', 'admin', 'billing', 'settings', 'hr', 'operations', 'projects',
    'commercialMt', 'commercialRm', 'finance', 'procurement', 'amc', 'compliance',
    'fireTender', 'itIs', 'tracking',
  ],
};

async function findUserByEmail() {
  let page = 1;
  const perPage = 200;
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const hit = users.find((u) => String(u.email || '').toLowerCase() === EMAIL);
    if (hit) return hit;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

async function main() {
  let user = await findUserByEmail();

  if (user) {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'super_admin_pro', team: 'admin' },
    });
    if (error) throw error;
    user = data.user;
    console.log('Updated existing auth user:', user.id);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'super_admin_pro', team: 'admin' },
    });
    if (error) throw error;
    user = data.user;
    console.log('Created auth user:', user.id);
  }

  const { error: profileErr } = await admin.from('profiles').upsert(
    { id: user.id, ...profilePayload },
    { onConflict: 'id' }
  );
  if (profileErr) throw profileErr;

  console.log('Profile set to super_admin_pro.');
  console.log(`Login at staging with: ${EMAIL} / ${PASSWORD}`);
  console.log('Then run staging_fix_403.sql if profile read fails.');
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
