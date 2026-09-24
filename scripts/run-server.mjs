#!/usr/bin/env node
/**
 * Launch server/index.js. Loads `.env` / `.env.server` (production Supabase only).
 */
await import('../server/index.js');
