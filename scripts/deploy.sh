#!/usr/bin/env bash
# Production deploy (DigitalOcean). Run on the server only:
#   cd /root/indus-erp && bash scripts/deploy.sh
# No `-x`: tracing would expand secret assignments into deploy logs.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/root/indus-erp}"
# Must match nginx: root /var/www/indus-erp/dist;
APP_DIR="${APP_DIR:-/var/www/indus-erp/dist}"
BRANCH="${BRANCH:-main}"
PM2_NAME="${PM2_NAME:-indus-erp}"
LEGACY_PM2_NAME="indus-erp-backend"
PROD_PROJECT_REF="wbyzhknaqcjqqtwopupl"
STAGING_PROJECT_REF="xjzhlbpgnpcmbdlufhwo"
EXPECTED_SUPABASE_URL="https://${PROD_PROJECT_REF}.supabase.co"
# Production allows the live origin only — no localhost.
EXPECTED_CORS="https://indus-erp.in"

echo "==> Deploy production REPO_DIR=${REPO_DIR} APP_DIR=${APP_DIR} pm2=${PM2_NAME}"

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

# Prefer CI secret when present; otherwise keep existing .env.server value.
if [ -n "${PROD_SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "==> Writing SUPABASE_SERVICE_ROLE_KEY from PROD_SUPABASE_SERVICE_ROLE_KEY secret"
  sed -i '/^SUPABASE_SERVICE_ROLE_KEY=/d' .env.server
  echo "SUPABASE_SERVICE_ROLE_KEY=${PROD_SUPABASE_SERVICE_ROLE_KEY}" >> .env.server
fi

CURRENT_SRK="$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env.server | tail -1 | cut -d= -f2- | tr -d '[:space:]\"' || true)"

# Never seed this key from the committed .env.server.example — that template is public.

if [ -z "${CURRENT_SRK}" ] || [ "${#CURRENT_SRK}" -lt 40 ]; then
  echo "WARNING: SUPABASE_SERVICE_ROLE_KEY still missing — deploy continues; Raw Attendance Sync may 401"
  echo "         Set GitHub secret PROD_SUPABASE_SERVICE_ROLE_KEY for project ${PROD_PROJECT_REF}"
else
  # Validate key is service_role for the production project (reject staging / anon keys).
  set +e
  SRK_CHECK="$(
    CURRENT_SRK="${CURRENT_SRK}" PROD_PROJECT_REF="${PROD_PROJECT_REF}" node --input-type=module -e '
const key = String(process.env.CURRENT_SRK || "").trim();
const expected = String(process.env.PROD_PROJECT_REF || "").trim();
if (key.startsWith("sb_secret_")) {
  console.log("ok:new_secret_key");
  process.exit(0);
}
const parts = key.split(".");
if (parts.length < 2) {
  console.error("not_a_jwt");
  process.exit(2);
}
let payload;
try {
  payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
} catch {
  console.error("unreadable_jwt");
  process.exit(2);
}
if (payload?.role !== "service_role") {
  console.error(`wrong_role:${payload?.role || "none"}`);
  process.exit(3);
}
const ref = String(payload?.ref || "").trim();
if (ref && expected && ref !== expected) {
  console.error(`project_mismatch:${ref}`);
  process.exit(4);
}
console.log(`ok:${ref || "no_ref"}`);
' 2>&1
  )"
  SRK_RC=$?
  set -e
  if [ "${SRK_RC}" != "0" ]; then
    echo "WARNING: SUPABASE_SERVICE_ROLE_KEY failed validation (${SRK_CHECK}). Deploy continues."
    echo "         Fix GitHub secret PROD_SUPABASE_SERVICE_ROLE_KEY for project ${PROD_PROJECT_REF}"
  else
    echo "==> Service role key check: ${SRK_CHECK}"
  fi
fi
# Ensure API can validate JWTs with the same anon key as the website build.
if [ -n "${VITE_SUPABASE_ANON_KEY:-}" ]; then
  sed -i '/^SUPABASE_ANON_KEY=/d' .env.server || true
  sed -i '/^VITE_SUPABASE_ANON_KEY=/d' .env.server || true
  echo "SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}" >> .env.server
  echo "VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}" >> .env.server
fi
if [ -n "${VITE_SUPABASE_URL:-}" ]; then
  sed -i '/^VITE_SUPABASE_URL=/d' .env.server || true
  echo "VITE_SUPABASE_URL=${VITE_SUPABASE_URL}" >> .env.server
fi

# Strip dev origins from production but keep any other origin the operator configured.
CURRENT_CORS="$(grep -E '^CORS_ORIGINS=' .env.server | tail -1 | cut -d= -f2- | tr -d '[:space:]\"' || true)"
CLEANED_CORS="$(printf '%s' "${CURRENT_CORS}" | tr ',' '\n' \
  | grep -v -E '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$' \
  | grep -v '^$' | paste -sd, - || true)"
if [ -z "${CLEANED_CORS}" ] || ! echo "${CLEANED_CORS}" | grep -qi 'indus-erp\.in'; then
  CLEANED_CORS="${EXPECTED_CORS}"
fi
if [ "${CLEANED_CORS}" != "${CURRENT_CORS}" ]; then
  echo "==> Pin CORS_ORIGINS -> ${CLEANED_CORS}"
  sed -i '/^CORS_ORIGINS=/d' .env.server
  echo "CORS_ORIGINS=${CLEANED_CORS}" >> .env.server
fi

# Production runtime: strict CORS, minimal /api/health, /api/debug/* returns 404.
sed -i '/^NODE_ENV=/d' .env.server || true
echo "NODE_ENV=production" >> .env.server

echo "==> npm ci"
npm ci

# CI builds the frontend on the runner and ships dist/ ahead of this script, because
# Vite exhausts this droplet's RAM and gets OOM-killed (exit 137). Building locally is
# the fallback for manual runs, with a capped heap so GC runs before the kernel steps in.
if [ -n "${PREBUILT_DIST:-}" ] && [ -f "${PREBUILT_DIST}/index.html" ]; then
  echo "==> Using prebuilt frontend from ${PREBUILT_DIST}"
  rm -rf dist
  mkdir -p dist
  rsync -a "${PREBUILT_DIST}/" dist/
else
  echo "==> npm run build"
  NODE_OPTIONS="--max-old-space-size=${NODE_HEAP_MB:-2048}" npm run build
fi

test -f dist/index.html

mkdir -p "${APP_DIR}"
echo "==> rsync dist -> ${APP_DIR}"
rsync -a --delete dist/ "${APP_DIR}/"
echo "==> Frontend live at ${APP_DIR}"
echo "==> Reminder: nginx must not long-cache index.html (see scripts/nginx-production-cache-snippet.conf)"

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
  echo "ERROR: API health failed — frontend is deployed but API is down"
  pm2 logs "${PM2_NAME}" --lines 40 --nostream || true
  exit 1
fi

SERVICE_ROLE_STATUS="$(node -e 'const j=require("/tmp/indus-health.json"); process.stdout.write(String(j.service_role_key||""))' 2>/dev/null || true)"
SERVICE_ROLE_DIAG="$(node -e 'const j=require("/tmp/indus-health.json"); process.stdout.write(String(j.service_role_diagnosis||""))' 2>/dev/null || true)"
if [ "${SERVICE_ROLE_STATUS}" != "ok" ]; then
  echo "WARNING: Production API service_role_key is '${SERVICE_ROLE_STATUS}' (diagnosis=${SERVICE_ROLE_DIAG})."
  echo "         Raw Attendance Sync may 401 until PROD_SUPABASE_SERVICE_ROLE_KEY is set and PM2 restarted."
  pm2 logs "${PM2_NAME}" --lines 20 --nostream || true
else
  echo "==> Production deploy finished (service_role_key=ok)"
fi

echo "==> Production deploy finished"
