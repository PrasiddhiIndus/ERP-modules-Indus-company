#!/usr/bin/env bash
# Manual staging preview deploy. GitHub Actions (deploy-staging.yml) runs these same steps
# inline on every push to the staging branch, so keep the two in sync.
#
# Staging DB is retired — preview uses the production Supabase project only.
# Layout on the droplet (same host as production):
#   /var/www/indus-erp-staging   git checkout on branch `staging`
#   nginx serves /var/www/indus-erp-staging/dist  (port 3001)
#   pm2 process `indus-erp-staging` runs server/index.js from that folder (API :4001)
#
# Run on the server only:
#   bash /var/www/indus-erp-staging/scripts/deploy-staging.sh

# No `-x`: tracing would expand secret assignments into deploy logs.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/var/www/indus-erp-staging}"
BRANCH="${BRANCH:-staging}"
PM2_NAME="${PM2_NAME:-indus-erp-staging}"
REPO_URL="${REPO_URL:-git@github.com:PrasiddhiIndus/ERP-modules-Indus-company.git}"
PRODUCTION_SUPABASE_URL="${PROD_SUPABASE_URL:-https://wbyzhknaqcjqqtwopupl.supabase.co}"

echo "==> Deploy staging preview from ${REPO_DIR} (branch ${BRANCH}, production DB)"

if [ ! -d "${REPO_DIR}/.git" ]; then
  echo "ERROR: ${REPO_DIR} is not a git checkout on this droplet."
  exit 1
fi

cd "${REPO_DIR}"

# Private repo: anonymous HTTPS fetch fails, so pin origin to the SSH deploy-key remote.
mkdir -p ~/.ssh && chmod 700 ~/.ssh
touch ~/.ssh/known_hosts && chmod 600 ~/.ssh/known_hosts
# Refresh GitHub host keys every run so a stale entry can never block the fetch.
ssh-keygen -R github.com >/dev/null 2>&1 || true
ssh-keyscan -t rsa,ecdsa,ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null || true
git remote set-url origin "${REPO_URL}"

if ! git ls-remote origin >/dev/null 2>&1; then
  echo "ERROR: cannot read the private repository from this server."
  echo "One-time fix:  ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N '' -C indus-erp-deploy"
  echo "               cat ~/.ssh/id_ed25519.pub"
  echo "Add that key at GitHub -> Settings -> Deploy keys (write access OFF)."
  exit 1
fi

git fetch origin "${BRANCH}"
git reset --hard "origin/${BRANCH}"

npm ci
# Prefer a CI-built dist when present; otherwise build locally (may OOM on small droplets).
if [ -f /tmp/indus-erp-staging-build/dist-staging.tar.gz ]; then
  echo "==> Using frontend built by CI"
  rm -rf dist && mkdir -p dist
  tar -xzf /tmp/indus-erp-staging-build/dist-staging.tar.gz -C dist
  rm -rf /tmp/indus-erp-staging-build
else
  NODE_OPTIONS="--max-old-space-size=${NODE_HEAP_MB:-2048}" npm run build
fi
test -f dist/index.html

# One production DB. Drop retired ERP_ENV=staging pin; keep preview API on 4001.
if [ -f .env.server ]; then
  sed -i '/^ERP_ENV=/d' .env.server || true
  sed -i '/^SUPABASE_URL=/d' .env.server || true
  echo "SUPABASE_URL=${PRODUCTION_SUPABASE_URL}" >> .env.server
  sed -i '/^SERVER_PORT=/d' .env.server || true
  sed -i '/^PORT=/d' .env.server || true
  echo "SERVER_PORT=4001" >> .env.server
  echo "PORT=4001" >> .env.server
fi

pm2 restart "${PM2_NAME}" --update-env
pm2 save
systemctl reload nginx

echo "==> Staging preview deploy complete: ${REPO_DIR}/dist (production Supabase)"
