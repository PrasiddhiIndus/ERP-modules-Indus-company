#!/usr/bin/env bash
# Copy to /root/deploy.sh on the DigitalOcean droplet and chmod +x.
# GitHub Actions (deploy.yml → main) runs this on every push to main.
# IMPORTANT: After updating this file, re-copy to server:
#   scp scripts/deploy.sh root@<server>:/root/deploy.sh
#
# One-time server setup:
#   mkdir -p /var/www/indus-erp
#   git clone <repo-url> /root/indus-erp && cd /root/indus-erp && git checkout main
#   cp .env.example .env.production   # production VITE_* (or use GH secrets at build time)
#   cp .env.server.example .env.server
#   Edit .env.server:
#     SUPABASE_URL=https://wbyzhknaqcjqqtwopupl.supabase.co
#     SUPABASE_SERVICE_ROLE_KEY=<production service_role from Dashboard → API>
#     ETIME_AUTH_CREDENTIALS=...
#     CORS_ORIGINS=https://indus-erp.in,...
#     # Do NOT set ERP_ENV=staging on production
#   pm2 start server/index.js --name indus-erp-backend --cwd /root/indus-erp

set -euo pipefail

REPO_DIR="${REPO_DIR:-/root/indus-erp}"
APP_DIR="${APP_DIR:-/var/www/indus-erp}"
BRANCH="${BRANCH:-main}"
PM2_NAME="${PM2_NAME:-indus-erp-backend}"
PROD_PROJECT_REF="wbyzhknaqcjqqtwopupl"
STAGING_PROJECT_REF="xjzhlbpgnpcmbdlufhwo"

echo "==> Deploy production from ${REPO_DIR} (branch ${BRANCH})"

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

# Auto-fix SUPABASE_URL from CI secret if missing or wrong
EXPECTED_SUPABASE_URL="https://${PROD_PROJECT_REF}.supabase.co"
CURRENT_URL="$(grep -E '^SUPABASE_URL=' .env.server | tail -1 | cut -d= -f2- | tr -d '[:space:]"'"'"'" || true)"

if [ -z "${CURRENT_URL}" ] || echo "${CURRENT_URL}" | grep -q "${STAGING_PROJECT_REF}"; then
  if [ -n "${PROD_SUPABASE_URL:-}" ]; then
    echo "==> Fixing SUPABASE_URL in .env.server (was: '${CURRENT_URL:-<missing>}')"
    sed -i '/^SUPABASE_URL=/d' .env.server
    echo "SUPABASE_URL=${PROD_SUPABASE_URL}" >> .env.server
  elif [ -z "${CURRENT_URL}" ]; then
    echo "==> SUPABASE_URL missing — adding production default"
    echo "SUPABASE_URL=${EXPECTED_SUPABASE_URL}" >> .env.server
  else
    echo "ERROR: .env.server SUPABASE_URL is staging (${STAGING_PROJECT_REF}) and PROD_SUPABASE_URL secret not set in CI."
    exit 1
  fi
fi

# Auto-fix SUPABASE_SERVICE_ROLE_KEY from CI secret if missing
if ! grep -qE '^SUPABASE_SERVICE_ROLE_KEY=.{20,}' .env.server 2>/dev/null; then
  if [ -n "${PROD_SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    echo "==> Fixing SUPABASE_SERVICE_ROLE_KEY in .env.server (was missing or invalid)"
    sed -i '/^SUPABASE_SERVICE_ROLE_KEY=/d' .env.server
    echo "SUPABASE_SERVICE_ROLE_KEY=${PROD_SUPABASE_SERVICE_ROLE_KEY}" >> .env.server
  else
    echo "ERROR: SUPABASE_SERVICE_ROLE_KEY missing in .env.server and PROD_SUPABASE_SERVICE_ROLE_KEY secret not set in CI."
    echo "       Add it to GitHub → Settings → Secrets → PROD_SUPABASE_SERVICE_ROLE_KEY"
    exit 1
  fi
fi

# Verify final state
FINAL_URL="$(grep -E '^SUPABASE_URL=' .env.server | tail -1 | cut -d= -f2- | tr -d '[:space:]"'"'"'" || true)"
if ! echo "${FINAL_URL}" | grep -q "${PROD_PROJECT_REF}"; then
  echo "WARNING: Could not confirm production Supabase project (${PROD_PROJECT_REF}) in .env.server."
  echo "         Current: ${FINAL_URL:-<missing>}"
fi

if ! grep -qE '^ETIME_AUTH_CREDENTIALS=.+' .env.server 2>/dev/null; then
  echo "WARNING: ETIME_AUTH_CREDENTIALS is missing in .env.server — Raw Attendance Data sync will not work until set."
fi

npm ci
npm run build

mkdir -p "${APP_DIR}"
rsync -a --delete "${REPO_DIR}/dist/" "${APP_DIR}/"

if pm2 describe "${PM2_NAME}" >/dev/null 2>&1; then
  pm2 restart "${PM2_NAME}" --update-env
else
  pm2 start server/index.js --name "${PM2_NAME}" --cwd "${REPO_DIR}"
fi

pm2 save

echo "==> Waiting for API to start..."
sleep 4

API_PORT="$(grep -E '^SERVER_PORT=' .env.server 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '[:space:]"'"'"'")"
API_PORT="${API_PORT:-8787}"
HEALTH_URL="http://127.0.0.1:${API_PORT}/api/health"

HEALTH_JSON="$(curl -sf --max-time 10 "${HEALTH_URL}" 2>/dev/null || true)"
if [ -z "${HEALTH_JSON}" ]; then
  echo "ERROR: API did not respond at ${HEALTH_URL} within 10s."
  echo "       Check: pm2 logs ${PM2_NAME} --lines 40"
  exit 1
fi

HEALTH_PROJECT="$(echo "${HEALTH_JSON}" | grep -oP '"supabase_project"\s*:\s*"\K[^"]+' || true)"
HEALTH_SRK="$(echo "${HEALTH_JSON}" | grep -oP '"service_role_key"\s*:\s*"\K[^"]+' || true)"
HEALTH_WARNING="$(echo "${HEALTH_JSON}" | grep -oP '"warning"\s*:\s*"\K[^"]+' || true)"

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
  DEPLOY_OK=false
fi

if [ "${DEPLOY_OK}" != "true" ]; then
  echo ""
  echo "DEPLOY FAILED: API started but Supabase credentials are wrong."
  echo "Fix .env.server and run: pm2 restart ${PM2_NAME} --update-env"
  exit 1
fi

echo "==> Production deploy complete: ${APP_DIR}"
echo "==> Health verified: supabase_project=${HEALTH_PROJECT}, service_role_key=${HEALTH_SRK}"
