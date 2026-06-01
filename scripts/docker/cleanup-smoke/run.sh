#!/usr/bin/env bash
set -euo pipefail

cd /repo

export ENCLAWED_STATE_DIR="/tmp/enclawed-test"
export ENCLAWED_CONFIG_PATH="${ENCLAWED_STATE_DIR}/enclawed.json"

echo "==> Build"
if ! pnpm build >/tmp/enclawed-cleanup-build.log 2>&1; then
  cat /tmp/enclawed-cleanup-build.log
  exit 1
fi

echo "==> Seed state"
mkdir -p "${ENCLAWED_STATE_DIR}/credentials"
mkdir -p "${ENCLAWED_STATE_DIR}/agents/main/sessions"
echo '{}' >"${ENCLAWED_CONFIG_PATH}"
echo 'creds' >"${ENCLAWED_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${ENCLAWED_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
if ! pnpm enclawed reset --scope config+creds+sessions --yes --non-interactive >/tmp/enclawed-cleanup-reset.log 2>&1; then
  cat /tmp/enclawed-cleanup-reset.log
  exit 1
fi

test ! -f "${ENCLAWED_CONFIG_PATH}"
test ! -d "${ENCLAWED_STATE_DIR}/credentials"
test ! -d "${ENCLAWED_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${ENCLAWED_STATE_DIR}/credentials"
echo '{}' >"${ENCLAWED_CONFIG_PATH}"

echo "==> Uninstall (state only)"
if ! pnpm enclawed uninstall --state --yes --non-interactive >/tmp/enclawed-cleanup-uninstall.log 2>&1; then
  cat /tmp/enclawed-cleanup-uninstall.log
  exit 1
fi

test ! -d "${ENCLAWED_STATE_DIR}"

echo "OK"
