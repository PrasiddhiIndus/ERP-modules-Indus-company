#!/usr/bin/env bash
# Production deploy (DigitalOcean). Run on the server only:
#   cd /root/indus-erp && bash scripts/deploy.sh
set -euxo pipefail

REPO_DIR="${REPO_DIR:-/root/indus-erp}"
# Must match nginx: root /var/www/indus-erp/dist;
APP_DIR="${APP_DIR:-/var/www/indus-erp/dist}"
BRANCH="${BRANCH:-main}"
PM2_NAME="${PM2_NAME:-indus-erp}"
LEGACY_PM2_NAME="indus-erp-backend"
PROD_PROJECT_REF="wbyzhknaqcjqqtwopupl"
STAGING_PROJECT_REF="xjzhlbpgnpcmbdlufhwo"
EXPECTED_SUPABASE_URL="https://${PROD_PROJECT_REF}.supabase.co"
EXPECTED_CORS="https://indus-erp.in,http://localhost:5173"

echo "==> Deploy production REPO_DIR=${REPO_DIR} APP_DIR=${APP_DIR} pm2=${PM2_NAME}"

cd "${REPO_DIR}"

git fetch origin "${BRANCH}"
git checkout -B "${BRANCH}" "origin/${BRANCH}"
git reset --hard "origin/${BRANCH}"

if [ ! -f .env.server ]; then
  if [ -f .env.server.example ]; then
    echo "==> Creating .env.server from example"
    cp .env.server.example .env.server
  else
    echo "ERROR: .env.server missing"
    exit 1
  fi
fi

# Strip staging pin
sed -i '/^ERP_ENV[[:space:]]*=[[:space:]]*staging/d' .env.server || true

CURRENT_URL="$(grep -E '^SUPABASE_URL=' .env.server | tail -1 | cut -d= -f2- | tr -d '[:space:]\"' || true)"
TARGET_URL="${PROD_SUPABASE_URL:-${EXPECTED_SUPABASE_URL}}"
if [ -z "${CURRENT_URL}" ] || ! echo "${CURRENT_URL}" | grep -q "${PROD_PROJECT_REF}"; then
  if echo "${TARGET_URL}" | grep -q "${STAGING_PROJECT_REF}"; then
    echo "ERROR: PROD_SUPABASE_URL points at staging"
    exit 1
  fi
  echo "==> Pin SUPABASE_URL -> ${TARGET_URL}"
  sed -i '/^SUPABASE_URL=/d' .env.server
  echo "SUPABASE_URL=${TARGET_URL}" >> .env.server
fi

CURRENT_SRK="$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env.server | tail -1 | cut -d= -f2- | tr -d '[:space:]\"' || true)"
if [ -n "${PROD_SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  sed -i '/^SUPABASE_SERVICE_ROLE_KEY=/d' .env.server
  echo "SUPABASE_SERVICE_ROLE_KEY=${PROD_SUPABASE_SERVICE_ROLE_KEY}" >> .env.server
elif ! echo "${CURRENT_SRK}" | grep -qE '.{40,}'; then
  echo "ERROR: SUPABASE_SERVICE_ROLE_KEY missing (set .env.server or PROD_SUPABASE_SERVICE_ROLE_KEY secret)"
  exit 1
fi

CURRENT_CORS="$(grep -E '^CORS_ORIGINS=' .env.server | tail -1 | cut -d= -f2- || true)"
if [ -z "${CURRENT_CORS}" ] || ! echo "${CURRENT_CORS}" | grep -qi 'indus-erp\.in'; then
  sed -i '/^CORS_ORIGINS=/d' .env.server
  echo "CORS_ORIGINS=${EXPECTED_CORS}" >> .env.server
fi

echo "==> npm ci"
npm ci

echo "==> npm run build"
npm run build

test -f dist/index.html

mkdir -p "${APP_DIR}"
echo "==> rsync dist -> ${APP_DIR}"
rsync -a --delete dist/ "${APP_DIR}/"
echo "==> Frontend live at ${APP_DIR}"

# Stop legacy duplicate API name
pm2 delete "${LEGACY_PM2_NAME}" >/dev/null 2>&1 || true

# Always run API from git repo cwd (not static nginx folder)
pm2 delete "${PM2_NAME}" >/dev/null 2>&1 || true
sleep 1
pm2 start "${REPO_DIR}/server/index.js" --name "${PM2_NAME}" --cwd "${REPO_DIR}"
pm2 save

API_PORT="$(grep -E '^SERVER_PORT=' .env.server 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '[:space:]\"' || true)"
API_PORT="${API_PORT:-8787}"
HEALTH_URL="http://127.0.0.1:${API_PORT}/api/health"

echo "==> Health check ${HEALTH_URL}"
ok=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  if curl -sf --max-time 8 "${HEALTH_URL}" >/tmp/indus-health.json 2>/dev/null; then
    echo "==> Health OK attempt ${i}"
    cat /tmp/indus-health.json || true
    ok=1
    break
  fi
  echo "==> Health wait ${i}/10"
done

pm2 status || true

if [ "${ok}" != "1" ]; then
  echo "WARNING: API health failed — frontend is still deployed"
  pm2 logs "${PM2_NAME}" --lines 30 --nostream || true
fi

echo "==> Production deploy finished"
