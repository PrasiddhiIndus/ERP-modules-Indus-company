#!/usr/bin/env bash
# Restore production API on the droplet when GitHub deploy fails with EADDRINUSE.
# Does NOT delete database data. Staging stays up on port 4001.
#
# Run as root:
#   bash /root/indus-erp/scripts/recover-production-api.sh
set -euo pipefail

PROD_DIR="${PROD_DIR:-/root/indus-erp}"
PROD_NAME="${PROD_NAME:-indus-erp}"
STAGING_NAME="${STAGING_NAME:-indus-erp-staging}"
PROD_PORT=8787
STAGING_PORT=4001

echo "==> Diagnosing ports"
ss -ltnp | grep -E ":${PROD_PORT}|:${STAGING_PORT}" || true
pm2 list || true

staging_cwd() {
  pm2 jlist 2>/dev/null | node -e '
    let raw=""; process.stdin.on("data", d => raw += d); process.stdin.on("end", () => {
      try {
        const list = JSON.parse(raw || "[]");
        const p = list.find(x => x && x.name === "indus-erp-staging");
        const cwd = p && p.pm2_env && p.pm2_env.pm_cwd;
        if (cwd) process.stdout.write(String(cwd));
      } catch (_) {}
    });
  ' || true
}

CWD="$(staging_cwd)"
STAGING_ENV=""
if [ -n "${CWD}" ]; then
  STAGING_ENV="${CWD}/.env.server"
elif [ -d /var/www/indus-erp-staging ]; then
  STAGING_ENV="/var/www/indus-erp-staging/.env.server"
elif [ -d /root/indus-erp-staging ]; then
  STAGING_ENV="/root/indus-erp-staging/.env.server"
fi

if [ -n "${STAGING_ENV}" ]; then
  echo "==> Pin staging API to ${STAGING_PORT} in ${STAGING_ENV}"
  mkdir -p "$(dirname "${STAGING_ENV}")"
  touch "${STAGING_ENV}"
  sed -i '/^SERVER_PORT=/d' "${STAGING_ENV}" || true
  echo "SERVER_PORT=${STAGING_PORT}" >> "${STAGING_ENV}"
  grep -qiE '^ERP_ENV=' "${STAGING_ENV}" || echo "ERP_ENV=staging" >> "${STAGING_ENV}"
  pm2 restart "${STAGING_NAME}" --update-env >/dev/null 2>&1 || true
  sleep 2
fi

echo "==> Stop production API if present"
pm2 stop "${PROD_NAME}" >/dev/null 2>&1 || true
pm2 delete "${PROD_NAME}" >/dev/null 2>&1 || true
pm2 delete indus-erp-backend >/dev/null 2>&1 || true
sleep 1

echo "==> Free ${PROD_PORT} (do not kill staging if it already moved)"
STG_PID="$(pm2 pid "${STAGING_NAME}" 2>/dev/null | tr -d '[:space:]' || true)"
if command -v fuser >/dev/null 2>&1; then
  for pid in $(fuser "${PROD_PORT}/tcp" 2>/dev/null | tr -s ' \t' '\n' | grep -E '^[0-9]+$' || true); do
    if [ -n "${STG_PID}" ] && [ "${pid}" = "${STG_PID}" ]; then
      echo "ERROR: staging still on ${PROD_PORT} after pin. Check ${STAGING_ENV}"
      exit 1
    fi
    echo "==> kill leftover PID ${pid} on ${PROD_PORT}"
    kill -TERM "${pid}" 2>/dev/null || true
  done
  sleep 1
  fuser -k "${PROD_PORT}/tcp" 2>/dev/null || true
fi

if [ ! -d "${PROD_DIR}" ]; then
  echo "ERROR: ${PROD_DIR} missing"
  exit 1
fi

if [ ! -f "${PROD_DIR}/.env.server" ]; then
  echo "ERROR: ${PROD_DIR}/.env.server missing — copy from a known-good backup, do not use the example placeholders"
  exit 1
fi

sed -i '/^SERVER_PORT=/d' "${PROD_DIR}/.env.server" || true
echo "SERVER_PORT=${PROD_PORT}" >> "${PROD_DIR}/.env.server"
sed -i '/^NODE_ENV=/d' "${PROD_DIR}/.env.server" || true
echo "NODE_ENV=production" >> "${PROD_DIR}/.env.server"
sed -i '/^ERP_ENV[[:space:]]*=[[:space:]]*staging/d' "${PROD_DIR}/.env.server" || true

echo "==> Start production API"
pm2 start "${PROD_DIR}/server/index.js" --name "${PROD_NAME}" --cwd "${PROD_DIR}" --update-env
pm2 save

ok=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  if curl -sf --max-time 8 "http://127.0.0.1:${PROD_PORT}/api/health" >/tmp/indus-health.json; then
    echo "==> Local health OK"
    cat /tmp/indus-health.json || true
    ok=1
    break
  fi
  echo "==> Health wait ${i}/10"
done

pm2 list || true
if [ "${ok}" != "1" ]; then
  echo "ERROR: production API still down"
  pm2 logs "${PROD_NAME}" --lines 40 --nostream || true
  exit 1
fi

echo "==> Public health"
curl -sf --max-time 15 https://indus-erp.in/api/health || true
echo
echo "==> Recover finished. Data is in Supabase — this only restarted Node."
