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

/** Tracked templates that must never carry a usable credential. */
const ENV_TEMPLATES = [
  '.env.example',
  '.env.server.example',
  '.env.staging.example',
  '.env.server.staging.example',
];

/** Keys whose value in a template must stay a placeholder. */
const SECRET_ENV_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'WHITEBOOKS_PASSWORD',
  'WHITEBOOKS_CLIENT_ID',
  'WHITEBOOKS_CLIENT_SECRET',
  'ETIME_AUTH_CREDENTIALS',
  'ETIME_SYNC_SECRET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'MICROSOFT_CLIENT_SECRET',
];

function isPlaceholderValue(value) {
  const v = value.replace(/^["']|["']$/g, '').trim();
  if (!v) return true;
  if (/YOUR_|_HERE\b/i.test(v)) return true;
  return /^(change-?me|placeholder|todo|xxx+|<.*>)$/i.test(v);
}

/**
 * Blocks the 2026-08 leak class: a live JWT or provider secret committed in an
 * *.example file, which deploy scripts then seed into a real .env.server.
 */
function checkEnvTemplatesHaveNoSecrets() {
  for (const rel of ENV_TEMPLATES) {
    const text = read(rel);
    if (!text) continue;
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      if (/\beyJ[A-Za-z0-9_-]{10,}/.test(trimmed)) {
        failures.push(`Env template secret: ${rel}:${i + 1} contains a JWT (starts with "eyJ")`);
      }
      if (/\bsb_secret_[A-Za-z0-9_-]{6,}/.test(trimmed)) {
        failures.push(`Env template secret: ${rel}:${i + 1} contains a Supabase secret key`);
      }
      const m = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) return;
      const [, key, rawValue] = m;
      if (SECRET_ENV_KEYS.includes(key) && !isPlaceholderValue(rawValue)) {
        failures.push(
          `Env template secret: ${rel}:${i + 1} sets ${key} to a non-placeholder value — use YOUR_${key}_HERE`
        );
      }
    });
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
    "app.get('/api/admin/attendance/punches', requireAttendanceAdmin",
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

// Committed templates must never hold usable credentials
checkEnvTemplatesHaveNoSecrets();

// Deploy must never copy a key out of a committed template into a live .env.server
mustNotInclude(
  'scripts/deploy.sh',
  ['EXAMPLE_SRK'],
  'Deploy must not seed secrets from .env.server.example'
);
mustNotInclude(
  '.github/workflows/deploy.yml',
  ['EXAMPLE_SRK', 'debug: true'],
  'Deploy workflow must not seed secrets or echo debug output'
);

if (failures.length) {
  console.error('Security check failed:\n');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}

console.log('Security check passed.');
