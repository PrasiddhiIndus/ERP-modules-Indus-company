#!/usr/bin/env bash
# Production deploy — keep this as simple/reliable as staging.
# GitHub Actions: bash scripts/deploy.sh (after git pull on the droplet).
#
# Layout:
#   REPO_DIR=/root/indus-erp     → git + API (PM2 name: indus-erp)
#   APP_DIR=/var/www/indus-erp   → nginx static (dist only)

set -euo pipefail

REPO_DIR="${REPO_DIR:-/root/indus-erp}"
APP_DIR="${APP_DIR:-/var/www/indus-erp}"
BRANCH="${BRANCH:-main}"
PM2_NAME="${PM2_NAME:-indus-erp}"
LEGACY_PM2_NAME="indus-erp-backend"
PROD_PROJECT_REF="wbyzhknaqcjqqtwopupl"
STAGING_PROJECT_REF="xjzhlbpgnpcmbdlufhwo"
EXPECTED_SUPABASE_URL="https://${PROD_PROJECT_REF}.supabase.co"
EXPECTED_CORS="https://indus-erp.in,http://localhost:5173"

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

CURRENT_URL="$(grep -E '^SUPABASE_URL=' .env.server | tail -1 | cut -d= -f2- | tr -d '[:space:]"'"'"'" || true)"
TARGET_URL="${PROD_SUPABASE_URL:-${EXPECTED_SUPABASE_URL}}"
if [ -z "${CURRENT_URL}" ] || ! echo "${CURRENT_URL}" | grep -q "${PROD_PROJECT_REF}"; then
  if echo "${TARGET_URL}" | grep -q "${STAGING_PROJECT_REF}"; then
    echo "ERROR: PROD_SUPABASE_URL secret points at staging (${STAGING_PROJECT_REF})."
    exit 1
  fi
  echo "==> Setting SUPABASE_URL in .env.server (was: '${CURRENT_URL:-<missing>}' → '${TARGET_URL}')"
  sed -i '/^SUPABASE_URL=/d' .env.server
  echo "SUPABASE_URL=${TARGET_URL}" >> .env.server
fi

CURRENT_SRK="$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env.server | tail -1 | cut -d= -f2- | tr -d '[:space:]"'"'"'" || true)"
if [ -n "${PROD_SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  if [ "${CURRENT_SRK}" != "${PROD_SUPABASE_SERVICE_ROLE_KEY}" ]; then
    echo "==> Updating SUPABASE_SERVICE_ROLE_KEY in .env.server from CI secret"
    sed -i '/^SUPABASE_SERVICE_ROLE_KEY=/d' .env.server
    echo "SUPABASE_SERVICE_ROLE_KEY=${PROD_SUPABASE_SERVICE_ROLE_KEY}" >> .env.server
  fi
elif ! echo "${CURRENT_SRK}" | grep -qE '.{40,}'; then
  echo "ERROR: SUPABASE_SERVICE_ROLE_KEY missing/invalid and PROD_SUPABASE_SERVICE_ROLE_KEY secret not set."
  exit 1
fi

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

FINAL_URL="$(grep -E '^SUPABASE_URL=' .env.server | tail -1 | cut -d= -f2- | tr -d '[:space:]"'"'"'" || true)"
if ! echo "${FINAL_URL}" | grep -q "${PROD_PROJECT_REF}"; then
  echo "ERROR: Could not confirm production Supabase project (${PROD_PROJECT_REF}) in .env.server."
  exit 1
fi

if ! grep -qE '^ETIME_AUTH_CREDENTIALS=.+' .env.server 2>/dev/null; then
  echo "WARNING: ETIME_AUTH_CREDENTIALS is missing in .env.server"
fi

echo "==> npm ci"
npm ci

echo "==> npm run build"
npm run build

if [ ! -f "${REPO_DIR}/dist/index.html" ]; then
  echo "ERROR: dist/index.html missing after build"
  exit 1
fi

mkdir -p "${APP_DIR}"
echo "==> Sync static files → ${APP_DIR}"
rsync -a --delete "${REPO_DIR}/dist/" "${APP_DIR}/"
echo "==> Frontend files are live at ${APP_DIR}"

# --- PM2: always run API from REPO_DIR (never from static APP_DIR) ---
if pm2 describe "${LEGACY_PM2_NAME}" >/dev/null 2>&1; then
  echo "==> Removing legacy ${LEGACY_PM2_NAME}"
  pm2 delete "${LEGACY_PM2_NAME}" || true
fi

PM2_CWD=""
if pm2 describe "${PM2_NAME}" >/dev/null 2>&1; then
  PM2_CWD="$(pm2 jlist 2>/dev/null | node -e "
    const name='${PM2_NAME}';
    let r=''; process.stdin.on('data',c=>r+=c); process.stdin.on('end',()=>{
      try {
        const p=JSON.parse(r||'[]').find(x=>x&&x.name===name);
        process.stdout.write((p&&p.pm2_env&&p.pm2_env.pm_cwd)||'');
      } catch(e) {}
    });
  " || true)"
  echo "==> Current PM2 ${PM2_NAME} cwd: ${PM2_CWD:-<unknown>}"
fi

if [ -z "${PM2_CWD}" ] || [ "${PM2_CWD}" != "${REPO_DIR}" ]; then
  echo "==> Recreating ${PM2_NAME} with cwd=${REPO_DIR}"
  pm2 delete "${PM2_NAME}" >/dev/null 2>&1 || true
  # Free port if old process still holds it
  API_PORT="$(grep -E '^SERVER_PORT=' .env.server 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '[:space:]"'"'"'" || true)"
  API_PORT="${API_PORT:-8787}"
  if command -v fuser >/dev/null 2>&1; then
    OLD_PID="$(fuser "${API_PORT}/tcp" 2>/dev/null | awk '{print $1}' || true)"
    if [ -n "${OLD_PID:-}" ]; then
      echo "==> Killing leftover process on :${API_PORT} (pid ${OLD_PID})"
      kill -9 "${OLD_PID}" 2>/dev/null || true
      sleep 1
    fi
  fi
  pm2 start "${REPO_DIR}/server/index.js" --name "${PM2_NAME}" --cwd "${REPO_DIR}"
else
  echo "==> Restarting ${PM2_NAME}"
  pm2 restart "${PM2_NAME}" --update-env
fi

pm2 save

API_PORT="$(grep -E '^SERVER_PORT=' .env.server 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '[:space:]"'"'"'" || true)"
API_PORT="${API_PORT:-8787}"
HEALTH_URL="http://127.0.0.1:${API_PORT}/api/health"

echo "==> Waiting for API health at ${HEALTH_URL}"
HEALTH_JSON=""
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  HEALTH_JSON="$(curl -sf --max-time 8 "${HEALTH_URL}" 2>/dev/null || true)"
  if [ -n "${HEALTH_JSON}" ]; then
    echo "==> Health OK (attempt ${attempt})"
    break
  fi
  echo "==> Health not ready (attempt ${attempt}/10)"
done

if [ -z "${HEALTH_JSON}" ]; then
  echo "WARNING: API health check failed at ${HEALTH_URL}"
  echo "         Frontend IS deployed. Check: pm2 logs ${PM2_NAME} --lines 50"
  pm2 status || true
  # Do not fail the whole deploy — staging-style: code is live even if API needs a manual restart.
  echo "==> Production frontend deploy complete (API health pending): ${APP_DIR}"
  exit 0
fi

HEALTH_PROJECT="$(printf '%s' "${HEALTH_JSON}" | node -e "
  let r=''; process.stdin.on('data',c=>r+=c); process.stdin.on('end',()=>{
    try { const v=JSON.parse(r).supabase_project; process.stdout.write(v==null?'':String(v)); } catch(e) {}
  });
")"
HEALTH_SRK="$(printf '%s' "${HEALTH_JSON}" | node -e "
  let r=''; process.stdin.on('data',c=>r+=c); process.stdin.on('end',()=>{
    try { const v=JSON.parse(r).service_role_key; process.stdout.write(v==null?'':String(v)); } catch(e) {}
  });
")"

if [ "${HEALTH_PROJECT}" != "${PROD_PROJECT_REF}" ] || [ "${HEALTH_SRK}" != "ok" ]; then
  echo "WARNING: API health credentials look wrong (project=${HEALTH_PROJECT}, srk=${HEALTH_SRK})"
  echo "         Frontend IS deployed. Fix .env.server then: pm2 restart ${PM2_NAME} --update-env"
  echo "==> Production frontend deploy complete (API credentials need attention): ${APP_DIR}"
  exit 0
fi

echo "==> Production deploy complete: ${APP_DIR}"
echo "==> Health verified: supabase_project=${HEALTH_PROJECT}, service_role_key=${HEALTH_SRK}"
