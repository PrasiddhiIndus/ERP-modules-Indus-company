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

# Private repo: anonymous HTTPS fetch fails, so pin origin to the SSH deploy-key remote.
REPO_URL="${REPO_URL:-git@github.com:PrasiddhiIndus/ERP-modules-Indus-company.git}"
mkdir -p ~/.ssh && chmod 700 ~/.ssh
touch ~/.ssh/known_hosts && chmod 600 ~/.ssh/known_hosts
# Refresh GitHub host keys every run so a stale entry can never block the fetch.
ssh-keygen -R github.com >/dev/null 2>&1 || true
ssh-keyscan -t rsa,ecdsa,ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null || true
CURRENT_REMOTE="$(git remote get-url origin 2>/dev/null || true)"
case "${CURRENT_REMOTE}" in
  https://github.com/*)
    echo "==> Switching origin from public HTTPS to SSH deploy key"
    git remote set-url origin "${REPO_URL}"
    ;;
esac

if ! git ls-remote origin >/dev/null 2>&1; then
  echo "ERROR: cannot read the private repository from this server."
  echo "One-time fix:  ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N '' -C indus-erp-deploy"
  echo "               cat ~/.ssh/id_ed25519.pub"
  echo "Add that key at GitHub -> Settings -> Deploy keys (write access OFF)."
  exit 1
fi

git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git reset --hard "origin/${BRANCH}"

if [ ! -f .env.staging ]; then
  echo "ERROR: ${REPO_DIR}/.env.staging is missing (gitignored, so a fresh clone never has it)."
  echo "Create it once on this server:"
  echo "  cd ${REPO_DIR} && cp .env.staging.example .env.staging && nano .env.staging"
  echo "Set the staging VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (project xjzhlbpgnpcmbdlufhwo)."
  exit 1
fi

if [ ! -f .env.server ]; then
  echo "ERROR: ${REPO_DIR}/.env.server is missing (gitignored, so a fresh clone never has it)."
  echo "Create it once on this server:"
  echo "  cd ${REPO_DIR} && cp .env.server.example .env.server && nano .env.server"
  echo "Set SERVER_PORT=4001, staging SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, and ETIME_AUTH_CREDENTIALS."
  exit 1
fi

# Staging must opt in so the API never auto-pins to the production Supabase project.
if ! grep -qiE '^ERP_ENV[[:space:]]*=[[:space:]]*staging' .env.server 2>/dev/null; then
  echo "==> Setting ERP_ENV=staging in .env.server (keeps staging/production Supabase isolated)"
  sed -i '/^ERP_ENV=/d' .env.server
  echo "ERP_ENV=staging" >> .env.server
fi

if ! grep -q '^ETIME_AUTH_CREDENTIALS=.\+' .env.server 2>/dev/null; then
  echo "WARNING: ETIME_AUTH_CREDENTIALS is missing in .env.server — Raw Attendance Data sync will not work until set."
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
