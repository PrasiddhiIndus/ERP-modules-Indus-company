#!/usr/bin/env node
/**
 * CI security audit — verifies critical hardening patterns in code (not env values).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const failures = [];

function read(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    failures.push(`Missing required file: ${rel}`);
    return '';
  }
  return fs.readFileSync(p, 'utf8');
}

function mustInclude(rel, patterns, label) {
  const text = read(rel);
  for (const pat of patterns) {
    if (!text.includes(pat)) {
      failures.push(`${label}: ${rel} must include "${pat}"`);
    }
  }
}

function mustNotInclude(rel, patterns, label) {
  const text = read(rel);
  for (const pat of patterns) {
    if (text.includes(pat)) {
      failures.push(`${label}: ${rel} must not include "${pat}"`);
    }
  }
}

// Auth middleware present
mustInclude('server/authMiddleware.js', ['createAuthMiddleware', 'requireBillingAccess'], 'Auth middleware');

// Protected Express routes
mustInclude(
  'server/index.js',
  [
    "app.post('/api/billing/e-invoice/generate', einvoiceRateLimit, requireBillingAccess",
    "app.post('/api/billing/e-invoice/cancel', einvoiceRateLimit, requireBillingAccess",
    "app.get('/api/admin/attendance/punches', requireHrOrAdmin",
    "import helmet from 'helmet'",
    'helmet({',
  ],
  'Express hardening'
);

// No public register in production build
mustInclude('src/App.jsx', ['!import.meta.env.PROD'], 'Register gated in production');

// Profile escalation guard migration
mustInclude(
  'supabase/migrations/20260704120000_production_security_hardening.sql',
  ['guard_profiles_self_update', 'current_user_has_hr_payroll_access', 'REVOKE EXECUTE ON FUNCTION public.get_profile_role'],
  'Security migration'
);

// AuthContext must not trust metadata role for navigation
mustNotInclude('src/contexts/AuthContext.jsx', ['rahul.ifspl@gmail.com', 'VITE_SUPER_ADMIN_EMAILS'], 'Auth bypass removed');

if (failures.length) {
  console.error('Security check failed:\n');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}

console.log('Security check passed (%d assertions).', 12);
