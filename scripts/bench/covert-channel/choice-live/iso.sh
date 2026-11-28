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
#
# CHOICE_LIVE_SCRIPTED=1 puts scripted-model.mjs (a deterministic, fully
# compliant scripted agent that speaks the Ollama API; NOT a language model)
# behind the same relay in place of the host's Ollama, and serves only the
# model id "scripted-compliant":
#   CHOICE_LIVE_SCRIPTED=1 bash iso.sh <pin> <out> --models scripted-compliant ...
# Its request log is <out>/scripted-model.jsonl.
#
# Second factor: the gateway and every agent run need one. fido2-standin.mjs
# (a SOFTWARE stand-in for a FIDO2 security key, not a security key; its keys
# live in the sandbox HOME) is installed on the namespace's PATH as libfido2's
# tools (fido2-token, fido2-cred, fido2-assert). The product searches the
# system directories first, so the run is refused if a real libfido2 tool is
# installed there. The driver enrolls the stand-in and issues unlock tickets
# through the product's own `enclawed auth` commands.
set -euo pipefail
PIN="$(cd "$1" && pwd)"; OUT="$(mkdir -p "$2" && cd "$2" && pwd)"; shift 2
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRIPWIRE="$HERE/tripwire.mjs"
[ -f "$TRIPWIRE" ] || { echo "missing $TRIPWIRE" >&2; exit 2; }
REAL_HOME="$HOME"; REAL_UID="$(id -u)"
SB="$(mktemp -d "${TMPDIR:-/tmp}/choice-live.XXXXXX")"
mkdir -p "$SB/home" "$SB/tmp" "$SB/xdg" "$SB/standin-bin"
for d in /usr/bin /usr/local/bin /opt/homebrew/bin /opt/local/bin; do
  for t in fido2-token fido2-cred fido2-assert; do
    if [ -e "$d/$t" ]; then
      echo "refusing: a real libfido2 tool is installed ($d/$t); the stand-in would not be used" >&2
      exit 2
    fi
  done
done
for t in token cred assert; do
  printf '#!/bin/sh\nexec node %q %s "$@"\n' "$HERE/fido2-standin.mjs" "$t" > "$SB/standin-bin/fido2-$t"
  chmod 0755 "$SB/standin-bin/fido2-$t"
done
SOCK="$SB/ollama.sock"

# Host side of the Ollama relay (outside the namespace).
UPSTREAM_PORT=11434
SCRIPTED=""
if [ "${CHOICE_LIVE_SCRIPTED:-0}" = "1" ]; then
  UPSTREAM_PORT=11535
  node "$HERE/scripted-model.mjs" "$UPSTREAM_PORT" "$OUT/scripted-model.jsonl" &
  SCRIPTED=$!
  for _ in $(seq 1 50); do
    node -e 'fetch("http://127.0.0.1:"+process.argv[1]+"/api/version").then(r=>process.exit(r.ok?0:1),()=>process.exit(1))' "$UPSTREAM_PORT" && break
    sleep 0.1
  done
fi
node "$HERE/ollama-bridge.mjs" host "$SOCK" "$UPSTREAM_PORT" &
BRIDGE=$!
# Keep the sandbox's hash-chained audit log (second-factor enrollments, tickets,
# their uses, egress refusals) with the results.
trap 'kill $BRIDGE $SCRIPTED 2>/dev/null || true; cp "$SB/home/.enclawed/audit.jsonl" "$OUT/sandbox-audit.jsonl" 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do [ -S "$SOCK" ] && break; sleep 0.1; done

env -i PATH="$SB/standin-bin:$PATH" LANG=C.UTF-8 \
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
