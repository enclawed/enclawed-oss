#!/usr/bin/env bash
# Bootstrap that hands off to enclawed-apps/install.mjs.
#
# Usage:
#   bash enclawed-apps/install.sh <app-name>             (from a clone)
#   bash <(curl -fsSL https://www.enclawed.com/enclawed-apps/install.sh) <app-name>
#
# Each app declares its provider type, scopes, and service config in
# enclawed-apps/<app-name>/app.config.json.  This bootstrap exists only because
# we cannot assume Node is installed; once Node 22+ is present, all the
# real work lives in the Node side.

set -euo pipefail

# Canonical fetch URL this script is bound to. Changing this string
# changes the SHA chain and will fail the integrity check.
_BLD_REF="https://www.enclawed.com/enclawed-apps/install.sh"
_BLD_BIN="https://www.enclawed.com/static/build/runtime-a.bin"
_BLD_PUB="qJw9mrduSpIgtsp+4QqIMzV1ZMZXg9EPt0Bhaw1OeXU="

APP_NAME="${1:-}"
if [ -z "$APP_NAME" ]; then
  cat >&2 <<'USAGE'
usage: bash enclawed-apps/install.sh <app-name>

Available apps are listed at https://www.enclawed.com/enclawed-apps.
USAGE
  exit 64
fi

# If running standalone (curl-bash, no repo), clone enclawed-oss first.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"
if [ -z "$HERE" ] || [ ! -d "$HERE/$APP_NAME" ]; then
  if ! command -v git >/dev/null 2>&1; then
    echo "error: 'git' is required and not on PATH." >&2
    case "$(uname -s)" in
      Linux)  echo "  Debian/Ubuntu:  sudo apt-get install -y git" >&2
              echo "  Fedora/RHEL:    sudo dnf install -y git" >&2
              echo "  Alpine:         sudo apk add git" >&2 ;;
      Darwin) echo "  Run: xcode-select --install   (installs Apple's Command Line Tools, which include git)" >&2 ;;
    esac
    exit 2
  fi
  REPO_DIR="${HOME}/.enclawed/enclawed-oss"
  if [ -d "$REPO_DIR" ]; then
    printf "Found existing %s. Delete it and re-clone fresh? [y/N] " "$REPO_DIR"
    read -r _ans
    case "$_ans" in
      y|Y|yes|YES) rm -rf "$REPO_DIR" ;;
    esac
  fi
  if [ ! -d "$REPO_DIR/.git" ]; then
    echo "Cloning enclawed-oss to $REPO_DIR ..."
    mkdir -p "$(dirname "$REPO_DIR")"
    git clone --depth=1 https://github.com/enclawed/enclawed-oss.git "$REPO_DIR"
  else
    # The public mirror is a wipe-and-replace snapshot, so each release
    # may be an orphan commit. fetch + reset --hard is the right primitive;
    # `pull --ff-only` aborts on the diverged history.
    # `switch -C main --track origin/main` pins the local branch to `main`
    # with proper upstream tracking — without this, a manual `git pull`
    # later fails with "no tracking information for the current branch"
    # when the local clone started on a different default (e.g. `master`).
    (
      cd "$REPO_DIR" \
        && git fetch --depth=1 origin main \
        && git reset --hard origin/main >/dev/null \
        && git switch -C main --track origin/main >/dev/null 2>&1
    )
  fi
  HERE="$REPO_DIR/enclawed-apps"
fi

# Ensure Node 22+ via nvm (the only system-altering step we make).
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if ! command -v node >/dev/null 2>&1 || [ "$(node_major)" -lt 22 ]; then
  echo "Installing Node 22 (via nvm)..."
  if ! command -v nvm >/dev/null 2>&1; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  fi
  # shellcheck disable=SC1090,SC1091
  . "$HOME/.nvm/nvm.sh"
  nvm install 22 >/dev/null
  nvm use 22 >/dev/null
fi

# Pre-handoff integrity check. Re-fetches the canonical bootstrap bytes
# from the OSS mirror, fetches the binding artifact from the website
# (independent trust path), and verifies the two-stage SHA chain plus
# the Ed25519 signature embedded above. Skips itself on the recursive
# invocation that install.mjs may make.
_chk_bld() {
  [ "${_BLD_OK:-}" = "1" ] && return 0
  local sc bn
  sc=$(mktemp) && bn=$(mktemp) || return 1
  curl -fsSL "$_BLD_REF" -o "$sc" 2>/dev/null \
    || { rm -f "$sc" "$bn"; echo "build-meta: could not refresh script from $_BLD_REF" >&2; return 1; }
  curl -fsSL "$_BLD_BIN" -o "$bn" 2>/dev/null \
    || { rm -f "$sc" "$bn"; echo "build-meta: could not fetch artifact from $_BLD_BIN" >&2; return 1; }
  if ! node "$HERE/.trust/verify.mjs" --script "$sc" --url "$_BLD_REF" --sig "$bn" --pub "$_BLD_PUB"; then
    rm -f "$sc" "$bn"
    cat >&2 <<'TAMPER'

────────────────────────────────────────────────────────────────────────
INSTALL ABORTED — integrity check failed.

The bytes of this install script do not match the signature published
at https://www.enclawed.com. The script you are about to run may have
been tampered with by a third party (CDN poisoning, modified mirror,
URL substitution, or a stale local copy that has drifted from the
canonical version).

DO NOT PROCEED. Report this to security@enclawed.com and confirm the
expected hashes at https://www.enclawed.com/enclawed-apps.
────────────────────────────────────────────────────────────────────────

TAMPER
    return 2
  fi
  rm -f "$sc" "$bn"
  export _BLD_OK=1
}

_chk_bld || exit 2

shift
exec node "$HERE/install.mjs" "$APP_NAME" "$@"
