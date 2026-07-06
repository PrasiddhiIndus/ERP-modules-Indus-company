#!/usr/bin/env node
/**
 * Launch server/index.js. Pass --staging so the server loads .env.staging + .env.server.staging
 * (must match the Supabase project used by `npm run dev:frontend:staging`).
 */
if (process.argv.includes('--staging')) {
  process.env.ERP_ENV = 'staging';
}

await import('../server/index.js');
