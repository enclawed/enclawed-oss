#!/usr/bin/env bash
# LIVE test of mandatory two-factor authentication with a REAL FIDO2 security
# key (YubiKey, Titan, ...) through REAL libfido2 tools. A person runs this with
# the key plugged in; expect several touches and PIN prompts.
#
#   scripts/auth-live-test.sh
#
# Plug in exactly ONE security key that has a PIN (fido2-token -S <dev> sets one).
# Needs libfido2's tools: Debian/Ubuntu `sudo apt install fido2-tools`,
# macOS `brew install libfido2`.
#
# All state goes to a throwaway directory; your real ~/.enclawed is never used
# (HOME, ENCLAWED_STATE_DIR, ENCLAWED_CONFIG_PATH and ENCLAWED_AUDIT_PATH all
# point inside it). The directory is kept for inspection and its path printed.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for t in fido2-token fido2-assert fido2-cred; do
  command -v "$t" >/dev/null || { echo "missing $t: install libfido2's tools (fido2-tools)" >&2; exit 2; }
done
tmp="$(mktemp -d "${TMPDIR:-/tmp}/enclawed-auth-live.XXXXXX")"
export ENCLAWED_STATE_DIR="$tmp/state"
export ENCLAWED_AUDIT_PATH="$tmp/audit.jsonl"
export ENCLAWED_CONFIG_PATH="$tmp/enclawed.json"
real_home="$HOME"
export HOME="$tmp/home"
mkdir -p "$ENCLAWED_STATE_DIR" "$HOME"
echo "throwaway state: $tmp"
echo "fido2-token -L:"; fido2-token -L
cd "$here"
status=0
"$here/node_modules/.bin/tsx" "$here/scripts/auth-live-test.ts" || status=$?
echo "audit log: $ENCLAWED_AUDIT_PATH"
HOME="$real_home"
exit "$status"
