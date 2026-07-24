#!/usr/bin/env bash
# Production deploy. Prefer running from the repo after git pull:
#   bash scripts/deploy.sh
# GitHub Actions should invoke this in-repo script (not a stale /root/deploy.sh copy).
#
# Layout on the droplet:
#   REPO_DIR=/root/indus-erp     → git checkout + API (PM2)
#   APP_DIR=/var/www/indus-erp   → nginx static files (dist only)
#   PM2 name: indus-erp            → server/index.js with cwd=REPO_DIR
#
# Optional: SKIP_BUILD=1 and PREBUILT_DIST=/path/to/dist  (CI uploads artifact)

set -euo pipefail

REPO_DIR="${REPO_DIR:-/root/indus-erp}"
APP_DIR="${APP_DIR:-/var/www/indus-erp}"
BRANCH="${BRANCH:-main}"
# Match the live production process name (was wrongly defaulted to indus-erp-backend).
PM2_NAME="${PM2_NAME:-indus-erp}"
LEGACY_PM2_NAME="indus-erp-backend"
PROD_PROJECT_REF="wbyzhknaqcjqqtwopupl"
STAGING_PROJECT_REF="xjzhlbpgnpcmbdlufhwo"
EXPECTED_SUPABASE_URL="https://${PROD_PROJECT_REF}.supabase.co"
EXPECTED_CORS="https://indus-erp.in,http://localhost:5173"
SKIP_BUILD="${SKIP_BUILD:-0}"
PREBUILT_DIST="${PREBUILT_DIST:-}"

echo "==> Deploy production from ${REPO_DIR} (branch ${BRANCH}, pm2=${PM2_NAME})"

cd "${REPO_DIR}"

git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git pull origin "${BRANCH}"

if [ ! -f .env.server ]; then
  if [ -f .env.server.example ]; then
    echo "==> .env.server missing — creating from .env.server.example"
    cp .env.server.example .env.server
  else
    echo "ERROR: ${REPO_DIR}/.env.server missing and no .env.server.example found."
    exit 1
  fi
fi

if grep -qiE '^ERP_ENV[[:space:]]*=[[:space:]]*staging' .env.server 2>/dev/null; then
  echo "==> Removing ERP_ENV=staging from .env.server (production must not use staging)"
  sed -i '/^ERP_ENV[[:space:]]*=[[:space:]]*staging/d' .env.server
fi

# Always pin SUPABASE_URL to production (overwrite staging / wrong / missing).
CURRENT_URL="$(grep -E '^SUPABASE_URL=' .env.server | tail -1 | cut -d= -f2- | tr -d '[:space:]"'"'"'" || true)"
TARGET_URL="${PROD_SUPABASE_URL:-${EXPECTED_SUPABASE_URL}}"
if [ -z "${CURRENT_URL}" ] || ! echo "${CURRENT_URL}" | grep -q "${PROD_PROJECT_REF}"; then
  if echo "${TARGET_URL}" | grep -q "${STAGING_PROJECT_REF}"; then
    echo "ERROR: PROD_SUPABASE_URL secret points at staging (${STAGING_PROJECT_REF}). Use production project ${PROD_PROJECT_REF}."
    exit 1
  fi
  echo "==> Setting SUPABASE_URL in .env.server (was: '${CURRENT_URL:-<missing>}' → '${TARGET_URL}')"
  sed -i '/^SUPABASE_URL=/d' .env.server
  echo "SUPABASE_URL=${TARGET_URL}" >> .env.server
fi

# Prefer CI secret for service role; also replace when key looks missing/short.
CURRENT_SRK="$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env.server | tail -1 | cut -d= -f2- | tr -d '[:space:]"'"'"'" || true)"
if [ -n "${PROD_SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  if [ "${CURRENT_SRK}" != "${PROD_SUPABASE_SERVICE_ROLE_KEY}" ]; then
    echo "==> Updating SUPABASE_SERVICE_ROLE_KEY in .env.server from CI secret"
    sed -i '/^SUPABASE_SERVICE_ROLE_KEY=/d' .env.server
    echo "SUPABASE_SERVICE_ROLE_KEY=${PROD_SUPABASE_SERVICE_ROLE_KEY}" >> .env.server
  fi
elif ! echo "${CURRENT_SRK}" | grep -qE '.{40,}'; then
  echo "ERROR: SUPABASE_SERVICE_ROLE_KEY missing/invalid in .env.server and PROD_SUPABASE_SERVICE_ROLE_KEY secret not set in CI."
  echo "       Add it to GitHub → Settings → Secrets → PROD_SUPABASE_SERVICE_ROLE_KEY"
  exit 1
fi

# Ensure production site is in CORS (health + startup validation depend on this).
CURRENT_CORS="$(grep -E '^CORS_ORIGINS=' .env.server | tail -1 | cut -d= -f2- || true)"
if [ -z "${CURRENT_CORS}" ] || ! echo "${CURRENT_CORS}" | grep -qi 'indus-erp\.in'; then
  echo "==> Ensuring CORS_ORIGINS includes https://indus-erp.in"
  sed -i '/^CORS_ORIGINS=/d' .env.server
  if [ -n "${CURRENT_CORS}" ] && ! echo "${CURRENT_CORS}" | grep -qi 'indus-erp\.in'; then
    echo "CORS_ORIGINS=https://indus-erp.in,${CURRENT_CORS}" >> .env.server
  else
    echo "CORS_ORIGINS=${EXPECTED_CORS}" >> .env.server
  fi
fi

# Verify final state before build/restart
FINAL_URL="$(grep -E '^SUPABASE_URL=' .env.server | tail -1 | cut -d= -f2- | tr -d '[:space:]"'"'"'" || true)"
if ! echo "${FINAL_URL}" | grep -q "${PROD_PROJECT_REF}"; then
  echo "ERROR: Could not confirm production Supabase project (${PROD_PROJECT_REF}) in .env.server."
  echo "       Current: ${FINAL_URL:-<missing>}"
  exit 1
fi
if echo "${FINAL_URL}" | grep -q "${STAGING_PROJECT_REF}"; then
  echo "ERROR: .env.server SUPABASE_URL still points at staging after fix attempt."
  exit 1
fi

if ! grep -qE '^ETIME_AUTH_CREDENTIALS=.+' .env.server 2>/dev/null; then
  echo "WARNING: ETIME_AUTH_CREDENTIALS is missing in .env.server — Raw Attendance Data sync will not work until set."
fi

npm ci

if [ "${SKIP_BUILD}" = "1" ] && [ -n "${PREBUILT_DIST}" ] && [ -d "${PREBUILT_DIST}" ] && [ -f "${PREBUILT_DIST}/index.html" ]; then
  echo "==> Using prebuilt dist from ${PREBUILT_DIST}"
  mkdir -p "${REPO_DIR}/dist"
  rsync -a --delete "${PREBUILT_DIST}/" "${REPO_DIR}/dist/"
elif [ "${SKIP_BUILD}" = "1" ] && [ -f "${REPO_DIR}/dist/index.html" ]; then
  echo "==> SKIP_BUILD=1 — keeping existing ${REPO_DIR}/dist"
else
  echo "==> Building production frontend on server"
  npm run build
fi

if [ ! -f "${REPO_DIR}/dist/index.html" ]; then
  echo "ERROR: dist/index.html missing after build — aborting before static sync."
  exit 1
fi

mkdir -p "${APP_DIR}"
# Static nginx root only — never run the API from APP_DIR.
rsync -a --delete "${REPO_DIR}/dist/" "${APP_DIR}/"

pm2_cwd_for() {
  local name="$1"
  pm2 jlist 2>/dev/null | node -e "
    const name = process.argv[1];
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { raw += c; });
    process.stdin.on('end', () => {
      try {
        const list = JSON.parse(raw || '[]');
        const p = list.find((x) => x && x.name === name);
        process.stdout.write((p && p.pm2_env && p.pm2_env.pm_cwd) || '');
      } catch (_) {
        process.stdout.write('');
      }
    });
  " "${name}" || true
}

# Drop legacy duplicate API process so port 8787 is free.
if pm2 describe "${LEGACY_PM2_NAME}" >/dev/null 2>&1; then
  echo "==> Removing legacy PM2 process ${LEGACY_PM2_NAME} (avoid port conflict)"
  pm2 delete "${LEGACY_PM2_NAME}" || true
fi

NEED_RECREATE=false
if pm2 describe "${PM2_NAME}" >/dev/null 2>&1; then
  CURRENT_PM2_CWD="$(pm2_cwd_for "${PM2_NAME}")"
  echo "==> Existing PM2 ${PM2_NAME} cwd: ${CURRENT_PM2_CWD:-<unknown>}"
  if [ -z "${CURRENT_PM2_CWD}" ] || [ "${CURRENT_PM2_CWD}" != "${REPO_DIR}" ]; then
    echo "==> Recreating ${PM2_NAME} so API runs from ${REPO_DIR} (not static ${APP_DIR})"
    NEED_RECREATE=true
  fi
else
  NEED_RECREATE=true
fi

if [ "${NEED_RECREATE}" = "true" ]; then
  pm2 delete "${PM2_NAME}" >/dev/null 2>&1 || true
  pm2 start "${REPO_DIR}/server/index.js" --name "${PM2_NAME}" --cwd "${REPO_DIR}"
else
  pm2 restart "${PM2_NAME}" --update-env
fi

pm2 save

echo "==> Waiting for API to start..."
API_PORT="$(grep -E '^SERVER_PORT=' .env.server 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '[:space:]"'"'"'" || true)"
API_PORT="${API_PORT:-8787}"
HEALTH_URL="http://127.0.0.1:${API_PORT}/api/health"

HEALTH_JSON=""
for attempt in 1 2 3 4 5 6 7 8; do
  sleep 3
  HEALTH_JSON="$(curl -sf --max-time 10 "${HEALTH_URL}" 2>/dev/null || true)"
  if [ -n "${HEALTH_JSON}" ]; then
    echo "==> Health OK on attempt ${attempt}"
    break
  fi
  echo "==> Health not ready (attempt ${attempt}/8)…"
done

if [ -z "${HEALTH_JSON}" ]; then
  echo "ERROR: API did not respond at ${HEALTH_URL} within ~24s."
  echo "       Check: pm2 logs ${PM2_NAME} --lines 40"
  pm2 describe "${PM2_NAME}" || true
  exit 1
fi

# Portable JSON field extract (no grep -P dependency).
json_field() {
  local json="$1"
  local field="$2"
  printf '%s' "${json}" | node -e "
    const field = process.argv[1];
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { raw += c; });
    process.stdin.on('end', () => {
      try {
        const v = JSON.parse(raw || '{}')[field];
        if (v == null) process.stdout.write('');
        else process.stdout.write(String(v));
      } catch (_) {
        process.stdout.write('');
      }
    });
  " "${field}"
}

HEALTH_PROJECT="$(json_field "${HEALTH_JSON}" supabase_project)"
HEALTH_SRK="$(json_field "${HEALTH_JSON}" service_role_key)"
HEALTH_WARNING="$(json_field "${HEALTH_JSON}" warning)"

DEPLOY_OK=true

if [ "${HEALTH_PROJECT}" != "${PROD_PROJECT_REF}" ]; then
  echo "ERROR: API supabase_project is '${HEALTH_PROJECT}' — expected '${PROD_PROJECT_REF}'."
  echo "       The .env.server SUPABASE_URL must be https://${PROD_PROJECT_REF}.supabase.co"
  DEPLOY_OK=false
fi

if [ "${HEALTH_SRK}" != "ok" ]; then
  echo "ERROR: API service_role_key is '${HEALTH_SRK}' — expected 'ok'."
  echo "       Set SUPABASE_SERVICE_ROLE_KEY in .env.server (Dashboard → Project Settings → API)."
  DEPLOY_OK=false
fi

if [ -n "${HEALTH_WARNING}" ]; then
  echo "WARNING from API: ${HEALTH_WARNING}"
  # Only fail when warning indicates real credential mismatch (already covered above).
fi

if [ "${DEPLOY_OK}" != "true" ]; then
  echo ""
  echo "DEPLOY FAILED: API started but Supabase credentials are wrong."
  echo "Fix .env.server and run: pm2 restart ${PM2_NAME} --update-env"
  exit 1
fi

echo "==> Production deploy complete: ${APP_DIR}"
echo "==> Health verified: supabase_project=${HEALTH_PROJECT}, service_role_key=${HEALTH_SRK}"
echo "==> PM2 process: ${PM2_NAME} (cwd ${REPO_DIR})"
