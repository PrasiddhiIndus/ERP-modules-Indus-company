#!/usr/bin/env bash
# Copy to /root/deploy-staging.sh on the DigitalOcean droplet and chmod +x.
# GitHub Actions (deploy-staging.yml) runs this on every push to the staging branch.
#
# One-time server setup:
#   mkdir -p /var/www/staging-erp
#   git clone <repo-url> /root/indus-erp-staging && cd /root/indus-erp-staging && git checkout staging
#   cp .env.staging.example .env.staging   # fill staging Supabase keys
#   cp .env.server.example .env.server     # staging SUPABASE_URL + service_role, SERVER_PORT=4001
#   pm2 start server/index.js --name indus-erp-staging-backend --cwd /root/indus-erp-staging
#   ln -sf /etc/nginx/sites-available/staging-erp /etc/nginx/sites-enabled/staging-erp

set -euo pipefail

REPO_DIR="${REPO_DIR:-/root/indus-erp-staging}"
APP_DIR="${APP_DIR:-/var/www/staging-erp}"
BRANCH="${BRANCH:-staging}"
PM2_NAME="${PM2_NAME:-indus-erp-staging-backend}"

echo "==> Deploy staging from ${REPO_DIR} (branch ${BRANCH})"

cd "${REPO_DIR}"

git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git pull origin "${BRANCH}"

if [ ! -f .env.staging ]; then
  echo "ERROR: ${REPO_DIR}/.env.staging missing. Copy from .env.staging.example and set staging Supabase keys."
  exit 1
fi

npm ci
npm run build:staging

mkdir -p "${APP_DIR}"
rsync -a --delete "${REPO_DIR}/dist/" "${APP_DIR}/"

if pm2 describe "${PM2_NAME}" >/dev/null 2>&1; then
  pm2 restart "${PM2_NAME}" --update-env
else
  pm2 start server/index.js --name "${PM2_NAME}" --cwd "${REPO_DIR}"
fi

pm2 save

echo "==> Staging deploy complete: ${APP_DIR}"
