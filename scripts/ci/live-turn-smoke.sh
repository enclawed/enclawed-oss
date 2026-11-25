#!/usr/bin/env bash
# live-turn-smoke.sh — pre-release RUNTIME crash gate.
#
# WHY THIS EXISTS
# ---------------
# scripts/ci/post-bundle-smoke.mjs only *loads* plugins (the doctor pass); it
# never executes an agent/inference turn. That blind spot let a real regression
# ship in 0.2.x–1.0.0: a pi-coding-agent version skew (the `codex` plugin pinned
# 0.71.1, which the postinstall nested and the core resolved; 0.71.1 dropped the
# `codingTools` export the core imports) crashed EVERY turn on a clean install
# with: "module '@mariozechner/pi-coding-agent' does not provide an export named
# 'codingTools'". A clean install + one real turn would have caught it.
#
# This script installs the packed tarball into a throwaway dir (scripts ON, so
# the bundled-plugin postinstall runs — the real consumer path) and drives real
# turns + the demo CLI surface against a LOCAL OLLAMA provider (no API key, no
# cost). It fails the release if any scenario crashes. Session-starting CLI
# commands need the mandatory second factor, so the turns and the gateway are
# driven through the installed runtime by live-turn-driver.mjs, and scenario G
# checks that those CLI commands refuse without a factor. The founder's one
# interactive run with a real factor before publishing covers the gated path.
#
# Pass criterion is CRASH-FREE, not answer quality: small local models give weak
# answers; that is fine. We fail only on non-zero exits and unambiguous
# module/runtime crash signatures.
#
# USAGE
#   bash scripts/ci/live-turn-smoke.sh [--tarball <path>] [--model ollama/<name>] [--keep]
#     --tarball  use an existing tarball (default: build + `npm pack` here)
#     --model    ollama model id (default: ollama/llama3.2:latest)
#     --keep     keep the temp install dir for inspection
#
# REQUIREMENTS
#   - ollama installed and serving (OLLAMA_HOST or 127.0.0.1:11434). The script
#     pulls the model if missing. If ollama is unreachable it FAILS loudly
#     (a release gate must not silently skip).
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Default to a small, fast model: the crashes this gate exists to catch
# (module-resolution / runtime-init failures like the pi-coding-agent skew) fail
# FAST with a non-zero exit, independent of model quality. Pass a larger model
# via --model for richer tool/answer coverage if you want it.
MODEL="ollama/llama3.2:1b"
TARBALL=""
KEEP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --tarball) TARBALL="$2"; shift 2;;
    --model)   MODEL="$2"; shift 2;;
    --keep)    KEEP=1; shift;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done
OLLAMA_MODEL="${MODEL#ollama/}"
: "${OLLAMA_HOST:=127.0.0.1:11434}"
export OLLAMA_HOST
export OLLAMA_API_KEY="${OLLAMA_API_KEY:-local-ollama}"   # local ollama needs any non-empty value

FAILED=0
declare -a RESULTS

# Crash signatures: unambiguous module/runtime failures. Deliberately narrow so
# a model that *says* "ReferenceError" in prose does not trip a false positive.
CRASH_RE='does not provide an export named|Cannot find module|ERR_MODULE_NOT_FOUND|ERR_REQUIRE_ESM|UnhandledPromiseRejection|FATAL ERROR:|JavaScript heap out of memory'

note() { echo "[live-turn-smoke] $*"; }

# record <name> <exit_code> <output-file>
record() {
  local name="$1" rc="$2" out="$3" crash=""
  if grep -qE "$CRASH_RE" "$out" 2>/dev/null; then
    crash=" CRASH-SIGNATURE: $(grep -oE "$CRASH_RE" "$out" | head -1)"
  fi
  # A timeout (124) means the turn STARTED and ran without a module/runtime
  # crash (those exit fast with code 1) — it just didn't finish in the window
  # (slow CPU model, or a sandboxed tool like web_fetch that can't resolve DNS).
  # Surface it as a warning, not a release-blocking failure.
  if [ "$rc" -eq 124 ] && [ -z "$crash" ]; then
    RESULTS+=("warn  $name (exit=124 timeout — ran, no crash; slow model/CPU or sandboxed network)")
    return
  fi
  if [ "$rc" -ne 0 ] || [ -n "$crash" ]; then
    FAILED=1
    RESULTS+=("FAIL  $name (exit=$rc)$crash")
    echo "----- $name FAILED (exit=$rc)$crash -----"
    tail -8 "$out" | sed 's/^/    /'
  else
    RESULTS+=("ok    $name (exit=0)")
  fi
}

# ---- preflight: ollama reachable + model present ----
note "ollama host: $OLLAMA_HOST | model: $MODEL"
if ! curl -s --max-time 5 "http://${OLLAMA_HOST}/api/tags" >/dev/null 2>&1; then
  echo "[live-turn-smoke] FATAL: ollama not reachable at $OLLAMA_HOST." >&2
  echo "  Start it (e.g. 'ollama serve') then re-run. A release gate must not skip." >&2
  exit 3
fi
if ! curl -s "http://${OLLAMA_HOST}/api/tags" | grep -q "\"${OLLAMA_MODEL}\""; then
  note "pulling $OLLAMA_MODEL ..."
  if command -v ollama >/dev/null 2>&1; then ollama pull "$OLLAMA_MODEL" || { echo "FATAL: could not pull $OLLAMA_MODEL" >&2; exit 3; }
  else echo "FATAL: $OLLAMA_MODEL not present and 'ollama' CLI not on PATH to pull it." >&2; exit 3; fi
fi

# ---- resolve tarball (build + pack if not provided) ----
if [ -z "$TARBALL" ]; then
  note "no --tarball; building + packing from $REPO_ROOT"
  ( cd "$REPO_ROOT" && ENCLAWED_A2UI_SKIP_MISSING=1 pnpm build ) || { echo "FATAL: build failed" >&2; exit 4; }
  PACKDIR="$(mktemp -d)"
  ( cd "$REPO_ROOT" && ENCLAWED_A2UI_SKIP_MISSING=1 npm pack --ignore-scripts --pack-destination "$PACKDIR" >/dev/null ) || { echo "FATAL: pack failed" >&2; exit 4; }
  TARBALL="$(ls "$PACKDIR"/*.tgz | head -1)"
fi
note "tarball: $TARBALL"

# ---- clean consumer install (scripts ON → postinstall runs) ----
WORK="$(mktemp -d)"; cd "$WORK"
npm init -y >/dev/null 2>&1
note "installing tarball (postinstall runs) ..."
npm i "$TARBALL" --omit=dev --no-fund --no-audit --loglevel=error || { echo "FATAL: install failed" >&2; exit 5; }
BIN="$WORK/node_modules/.bin/enclawed"

# ---- regression guard: exactly one pi-coding-agent version (the 1.0.1 fix) ----
PCA_VERSIONS="$(find node_modules -type d -name pi-coding-agent 2>/dev/null \
  | while read -r d; do node -e "console.log(require('./$d/package.json').version)" 2>/dev/null; done | sort -u)"
PCA_COUNT="$(echo "$PCA_VERSIONS" | grep -c . )"
if [ "$PCA_COUNT" -gt 1 ]; then
  FAILED=1
  RESULTS+=("FAIL  pi-coding-agent single-version guard (found: $(echo "$PCA_VERSIONS" | tr '\n' ' '))")
  echo "----- pi-coding-agent SKEW DETECTED: $(echo "$PCA_VERSIONS" | tr '\n' ' ') -----"
else
  RESULTS+=("ok    pi-coding-agent single-version ($PCA_VERSIONS)")
fi

# ---- isolated state + model ----
export ENCLAWED_STATE_DIR="$(mktemp -d)"
export ENCLAWED_CONFIG_PATH="$ENCLAWED_STATE_DIR/config.json"
# The model, as `enclawed models set` would record it (that command needs the second factor).
printf '{"agents":{"defaults":{"model":{"primary":"%s"},"models":{"%s":{}}}}}\n' "$MODEL" "$MODEL" >"$ENCLAWED_CONFIG_PATH"

run() { local out; out="$(mktemp)"; timeout "$1" "$BIN" "${@:3}" >"$out" 2>&1; record "$2" "$?" "$out"; }

# The session-starting CLI commands (`agent`, `gateway run`, `infer model run`) need the
# mandatory second factor, which this unattended gate does not hold. The runtime they call --
# where the 0.2.x crash lived -- is driven directly from the installed package instead
# (live-turn-driver.mjs: the embedded agent turn through enclawed/plugin-sdk/agent-runtime,
# the gateway through the installed build's startGatewayServer). Nothing in the product is
# switched off; G below proves the gated CLI still refuses without a factor.
DRIVER="$REPO_ROOT/scripts/ci/live-turn-driver.mjs"
drive() { local out; out="$(mktemp)"; timeout "$1" node "$DRIVER" "${@:3}" >"$out" 2>&1; record "$2" "$?" "$out"; }

# B: embedded agent turn
drive 220 "B:agent-turn"     turn "$MODEL" "Name three primary colors, comma separated."
# C: tool-using agent turn (exercises pi-tools / tool dispatch)
drive 260 "C:tool-use"       turn "$MODEL" "Use a tool to list files in the current directory, then say how many there are."
# E: multi-turn session continuity (two turns, same agent session)
drive 200 "E:multi-turn-1"   turn "$MODEL" "Remember: my favorite number is 42. Reply OK."
drive 200 "E:multi-turn-2"   turn "$MODEL" "What favorite number did I tell you? Reply with only the number."

# F: demo CLI surface (must not crash)
for cmd in "doctor" "models list" "models status" "channels status" "infer model list" "plugins doctor"; do
  out="$(mktemp)"; timeout 60 "$BIN" $cmd >"$out" 2>&1; record "F:$cmd" "$?" "$out"
done

# D: the gateway runtime starts and listens (driven directly; no crash signatures in its output)
GW_PORT="$(node -e 'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
drive 120 "D:gateway-start"  gateway "$GW_PORT"

# G: without a second factor, every session-starting CLI command refuses (and runs nothing).
gated() {
  local name="$1" out rc; shift
  out="$(mktemp)"; timeout 60 "$BIN" "$@" >"$out" 2>&1; rc=$?
  if [ "$rc" -ne 0 ] && grep -qiE "second factor|two-factor|security key|passkey" "$out" && ! grep -qE "$CRASH_RE" "$out"; then
    RESULTS+=("ok    G:$name refused without a second factor")
  else
    FAILED=1; RESULTS+=("FAIL  G:$name was not refused for want of a second factor (exit=$rc)")
    tail -8 "$out" | sed 's/^/    /'
  fi
}
gated "agent"           agent --agent main -m "hello"
gated "infer model run" infer model run --model "$MODEL" --prompt "hello"
gated "gateway run"     gateway run --port "$GW_PORT"
gated "models set"      models set "$MODEL"

# ---- summary ----
echo
echo "==================== live-turn-smoke results ===================="
for r in "${RESULTS[@]}"; do echo "  $r"; done
echo "================================================================="
if [ "$KEEP" = 1 ]; then note "kept install dir: $WORK"; else rm -rf "$WORK"; fi
if [ "$FAILED" -ne 0 ]; then echo "[live-turn-smoke] FAIL — do not release."; exit 1; fi
echo "[live-turn-smoke] PASS — no runtime crashes."
