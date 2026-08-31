#!/usr/bin/env bash
# Restore production API when staging is occupying port 8787.
# No nested quotes. Does not delete database data.
#
#   bash /root/indus-erp/scripts/recover-production-api.sh
set -euo pipefail

PROD_DIR=/root/indus-erp
PROD_NAME=indus-erp
STAGING_NAME=indus-erp-staging
PROD_PORT=8787
STAGING_PORT=4001

echo "==> Ports now"
ss -ltnp | grep -E ":${PROD_PORT}|:${STAGING_PORT}" || true
pm2 list || true

STAGING_PID="$(pm2 pid "${STAGING_NAME}" 2>/dev/null | tr -d '[:space:]' || true)"
STAGING_CWD=""
if [ -n "${STAGING_PID}" ] && [ "${STAGING_PID}" != "0" ] && [ -d "/proc/${STAGING_PID}/cwd" ]; then
  STAGING_CWD="$(readlink -f "/proc/${STAGING_PID}/cwd" || true)"
fi
if [ -z "${STAGING_CWD}" ] && [ -d /var/www/indus-erp-staging ]; then
  STAGING_CWD=/var/www/indus-erp-staging
fi
if [ -z "${STAGING_CWD}" ]; then
  STAGING_CWD=/root/indus-erp-staging
fi

STAGING_ENV="${STAGING_CWD}/.env.server"
echo "==> Staging cwd=${STAGING_CWD}"
echo "==> Pin ${STAGING_ENV} SERVER_PORT=${STAGING_PORT}"
mkdir -p "${STAGING_CWD}"
touch "${STAGING_ENV}"
sed -i '/^SERVER_PORT=/d' "${STAGING_ENV}" || true
sed -i '/^PORT=/d' "${STAGING_ENV}" || true
echo "SERVER_PORT=${STAGING_PORT}" >> "${STAGING_ENV}"
echo "PORT=${STAGING_PORT}" >> "${STAGING_ENV}"
grep -qiE '^ERP_ENV=' "${STAGING_ENV}" || echo "ERP_ENV=staging" >> "${STAGING_ENV}"

pm2 restart "${STAGING_NAME}" --update-env || true
sleep 3

echo "==> Ports after staging move"
ss -ltnp | grep -E ":${PROD_PORT}|:${STAGING_PORT}" || true

pm2 delete "${PROD_NAME}" >/dev/null 2>&1 || true
pm2 delete indus-erp-backend >/dev/null 2>&1 || true
sleep 1

# If 8787 is still staging, wait; if some other leftover, stop it.
STAGING_PID="$(pm2 pid "${STAGING_NAME}" 2>/dev/null | tr -d '[:space:]' || true)"
if command -v fuser >/dev/null 2>&1; then
  for pid in $(fuser "${PROD_PORT}/tcp" 2>/dev/null | tr -s ' \t' '\n' | grep -E '^[0-9]+$' || true); do
    if [ -n "${STAGING_PID}" ] && [ "${pid}" = "${STAGING_PID}" ]; then
      echo "ERROR: staging is still on ${PROD_PORT}. Check ${STAGING_ENV}"
      ss -ltnp | grep ":${PROD_PORT}" || true
      exit 1
    fi
    echo "==> Stopping leftover PID ${pid} on ${PROD_PORT}"
    kill -TERM "${pid}" 2>/dev/null || true
  done
  sleep 1
fi

if [ ! -f "${PROD_DIR}/.env.server" ]; then
  echo "ERROR: ${PROD_DIR}/.env.server missing"
  exit 1
fi
sed -i '/^SERVER_PORT=/d' "${PROD_DIR}/.env.server" || true
sed -i '/^PORT=/d' "${PROD_DIR}/.env.server" || true
echo "SERVER_PORT=${PROD_PORT}" >> "${PROD_DIR}/.env.server"
echo "PORT=${PROD_PORT}" >> "${PROD_DIR}/.env.server"
sed -i '/^NODE_ENV=/d' "${PROD_DIR}/.env.server" || true
echo "NODE_ENV=production" >> "${PROD_DIR}/.env.server"

echo "==> Start production"
pm2 start "${PROD_DIR}/server/index.js" --name "${PROD_NAME}" --cwd "${PROD_DIR}" --update-env
pm2 save

ok=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  if curl -sf --max-time 8 "http://127.0.0.1:${PROD_PORT}/api/health" >/tmp/indus-health.json; then
    echo "==> Production local health OK"
    cat /tmp/indus-health.json || true
    echo
    ok=1
    break
  fi
  echo "==> Health wait ${i}/10"
done

echo "==> Final ports / pm2"
ss -ltnp | grep -E ":${PROD_PORT}|:${STAGING_PORT}" || true
pm2 list || true

if [ "${ok}" != "1" ]; then
  echo "ERROR: production API still down"
  pm2 logs "${PROD_NAME}" --lines 30 --nostream || true
  exit 1
fi

curl -sf --max-time 15 https://indus-erp.in/api/health || true
echo
echo "==> Done. Staging should be :${STAGING_PORT}, production :${PROD_PORT}."
