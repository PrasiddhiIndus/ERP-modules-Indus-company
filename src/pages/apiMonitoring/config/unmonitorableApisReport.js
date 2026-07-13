/**
 * APIs identified in the codebase that cannot be fully health-checked from the
 * monitoring dashboard (browser) without credentials, side effects, or dynamic URLs.
 */

export const UNMONITORABLE_APIS = [
  {
    id: "debug-invoice-snapshot",
    name: "Debug Invoice Snapshot",
    endpoint: "GET /api/debug/invoice/:id",
    reason: "Dynamic path parameter (:id) and requires prior e-invoice generation to return data. Admin-only debug route.",
    sourceFiles: ["server/index.js:927"],
    module: "Billing",
  },
  {
    id: "r2-presigned-get-urls",
    name: "Cloudflare R2 Presigned GET URLs",
    endpoint: "Time-limited signed URLs returned by presign-get",
    reason: "URLs are generated at runtime per object key; cannot probe a stable endpoint without uploading a test object first.",
    sourceFiles: ["server/index.js", "src/pages/SoftwareSubscriptions.jsx", "src/lib/fleetR2.js"],
    module: "IT/IS / Operations",
  },
  {
    id: "multipart-r2-upload",
    name: "R2 Multipart File Upload",
    endpoint: "POST /api/*/r2/upload",
    reason: "Requires multipart file body and valid subscription/fleet scope. Probing with empty body only validates route reachability (covered by presign probe).",
    sourceFiles: ["server/index.js:1277", "server/index.js:1374"],
    module: "IT/IS / Operations",
  },
  {
    id: "whitebooks-direct-browser",
    name: "Whitebooks Direct (Browser)",
    endpoint: "https://api.whitebooks.in (direct from browser)",
    reason: "CORS blocks browser calls; credentials (WHITEBOOKS_*) are server-only. Health inferred via Node e-invoice proxy reachability.",
    sourceFiles: ["src/services/eInvoiceApi.js"],
    module: "Billing",
  },
  {
    id: "etimeoffice-direct",
    name: "eTimeOffice Direct (Browser)",
    endpoint: "https://api.etimeoffice.com/api",
    reason: "Provider credentials are server-only (ETIME_AUTH_CREDENTIALS). Browser cannot call provider; indirect status via /api/admin/attendance/status.",
    sourceFiles: ["server/attendanceEtime.js"],
    module: "HR",
  },
  {
    id: "supabase-service-role",
    name: "Supabase Service Role Operations",
    endpoint: "Server-side Supabase admin SDK",
    reason: "SUPABASE_SERVICE_ROLE_KEY must never be exposed to the browser. Monitored indirectly via Node /api/health and Edge Functions.",
    sourceFiles: ["server/index.js", "supabase/functions/**"],
    module: "Platform",
  },
  {
    id: "per-table-supabase-queries",
    name: "Individual Supabase Table Queries",
    endpoint: "supabase.from('{table}') across 100+ call sites",
    reason: "Consolidated under Supabase REST health check. Per-table probes would require RLS-aware test queries and create read load.",
    sourceFiles: ["src/pages/**", "src/services/**"],
    module: "All modules",
  },
  {
    id: "commented-send-email",
    name: "Edge Function: send-email (planned)",
    endpoint: "/functions/v1/send-email",
    reason: "Referenced only in commented code — not deployed or wired.",
    sourceFiles: ["src/pages/marketing/QuotationTracker.jsx:1498"],
    module: "Marketing",
  },
  {
    id: "static-asset-fetch",
    name: "Static Branding Asset Fetch",
    endpoint: "INDUS_LOGO_SRC / public assets",
    reason: "Same-origin static files, not an API dependency.",
    sourceFiles: ["src/utils/taxInvoicePdf.js", "src/constants/branding.js"],
    module: "Billing",
  },
  {
    id: "graphql-firebase",
    name: "GraphQL / Firebase",
    endpoint: "—",
    reason: "No GraphQL or Firebase client usage found in codebase scan.",
    sourceFiles: [],
    module: "—",
  },
];

export const DISCOVERY_SUMMARY = {
  monitorableCount: null,
  unmonitorableCount: UNMONITORABLE_APIS.length,
  consolidatedNote:
    "Duplicate endpoint references across files are merged into single monitored entries with callLocations arrays.",
};
