#!/usr/bin/env bash
# Live choice-channel experiment: run the driver inside a private user + mount
# + network namespace that is isolated from any hardware root of trust.
#
#   bash iso.sh <pinned-enclawed-oss-dir> <out-dir> [driver args...]
#
# Isolation:
#   - /sys/class/hidraw is an empty tmpfs, so no HID device is enumerated;
#   - every /dev/hidraw* node is bind-mounted over by /dev/null;
#   - /run/user is an empty tmpfs, so no host broker socket is reachable;
#   - HOME, TMPDIR and XDG_RUNTIME_DIR are fresh throwaway directories, so no
#     bound latch is found; no ENCLAWEDER_* variable is set;
#   - tripwire.mjs (beside this script) is preloaded into EVERY node
#     process (gateway, CLI, driver) through NODE_OPTIONS; it blocks and reports
#     any open of a real /dev/hidraw*, of the real HOME's .enclawed*, or any
#     connect under /run/user/<uid>.
#   - the network namespace has only loopback, with 198.18.0.1 (RFC 2544
#     benchmark range, which web_fetch accepts on opt-in) added for the covert
#     receiver. The only path out is a Unix-socket relay to the host's Ollama.
set -euo pipefail
PIN="$(cd "$1" && pwd)"; OUT="$(mkdir -p "$2" && cd "$2" && pwd)"; shift 2
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRIPWIRE="$HERE/tripwire.mjs"
[ -f "$TRIPWIRE" ] || { echo "missing $TRIPWIRE" >&2; exit 2; }
REAL_HOME="$HOME"; REAL_UID="$(id -u)"
SB="$(mktemp -d "${TMPDIR:-/tmp}/choice-live.XXXXXX")"
mkdir -p "$SB/home" "$SB/tmp" "$SB/xdg"
SOCK="$SB/ollama.sock"

# Host side of the Ollama relay (outside the namespace).
node "$HERE/ollama-bridge.mjs" host "$SOCK" &
BRIDGE=$!
trap 'kill $BRIDGE 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do [ -S "$SOCK" ] && break; sleep 0.1; done

env -i PATH="$PATH" LANG=C.UTF-8 \
  HOME="$SB/home" TMPDIR="$SB/tmp" XDG_RUNTIME_DIR="$SB/xdg" \
  TRIPWIRE_REAL_HOME="$REAL_HOME" TRIPWIRE_REAL_UID="$REAL_UID" \
  OLLAMA_API_KEY=local-ollama \
  PIN="$PIN" OUT="$OUT" HERE="$HERE" SOCK="$SOCK" TRIPWIRE="$TRIPWIRE" \
  unshare -r -m -n bash -c '
    set -euo pipefail
    mount -t tmpfs none /sys/class/hidraw
    for n in /dev/hidraw*; do [ -e "$n" ] && mount --bind /dev/null "$n"; done
    mount -t tmpfs none /run/user
    ip link set lo up
    ip addr add 198.18.0.1/32 dev lo
    node "$HERE/ollama-bridge.mjs" ns "$SOCK" > "$OUT/bridge-ns.log" 2>&1 &
    export NODE_OPTIONS="--import $TRIPWIRE"
    exec node "$HERE/driver.mjs" "$@"
  ' driver "$@"
