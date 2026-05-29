#!/usr/bin/env bash
# Snapshot the current working tree to every public mirror as a single orphan
# commit on `main`, after wiping every branch and tag on each mirror. The SAME
# snapshot commit is pushed to all mirrors, so they end up byte-identical (same
# commit SHA, same flattened single-commit history). The private remote
# (`origin`) and the local working tree / HEAD are not touched.
#
# Public mirrors = every remote whose name matches `public-*` (NOT the bare
# `public` remote — that name is reserved for the deprecated
# metereconsulting/enclawed repository, which now hosts only a redirect README
# and is no longer kept in sync with the workspace). Add another with:
#   git remote add public-<name> <url>
#
# Usage: scripts/publish-public.sh [--yes]
#   --yes  skip the interactive confirmation
#
# Requires:
#   - at least one remote named `public` or `public-*`
#   - push access to each
#
# Notes:
#   - Snapshot includes uncommitted changes and new files (anything `git add -A`
#     would stage). It respects .gitignore.
#   - GitHub-managed `refs/pull/*` refs cannot be deleted by push; left as-is.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

mapfile -t PUBLIC_REMOTES < <(git remote | grep -E '^public-.+$' | sort)
if [ "${#PUBLIC_REMOTES[@]}" -eq 0 ]; then
  echo "error: no public mirror configured (need a remote named 'public-*')" >&2
  echo "  add one with: git remote add public-<name> <url>" >&2
  exit 1
fi

# Cheap filename sanity check — flag, don't block.
SUSPECT=$(
  { git ls-files; git ls-files --others --exclude-standard; } \
    | grep -iE '(^|/)\.env($|\.[^e]|_)|\.pem$|\.key$|id_rsa|id_ed25519|\.netrc|\.p12$|\.pfx$' \
    || true
)
if [ -n "$SUSPECT" ]; then
  echo "warning: filenames that look sensitive will be included in the snapshot:" >&2
  echo "$SUSPECT" >&2
  echo >&2
fi

DIRTY=$(git status --short | wc -l | tr -d ' ')
HEAD_SHA=$(git rev-parse --short HEAD)
BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "(detached)")

echo "About to publish one identical snapshot to ${#PUBLIC_REMOTES[@]} public mirror(s):"
for r in "${PUBLIC_REMOTES[@]}"; do
  echo "  - $r  ($(git remote get-url "$r"))"
done
echo "  source branch : $BRANCH @ $HEAD_SHA"
echo "  dirty files   : $DIRTY (will be included in snapshot)"
echo "  destination   : <remote>/main (force-replace, single orphan commit)"
echo

if [ "${1:-}" != "--yes" ]; then
  read -r -p "Proceed? [y/N] " ans
  case "$ans" in
    y|Y|yes|YES) ;;
    *) echo "aborted"; exit 1 ;;
  esac
fi

# Build the orphan snapshot ONCE via plumbing — no branch switch, no working-tree
# touch, no real-index touch. The same commit object is pushed to every mirror,
# so all mirrors are byte-identical (same SHA).
SNAP_INDEX=$(mktemp -u)
trap 'rm -f "$SNAP_INDEX"' EXIT
GIT_INDEX_FILE="$SNAP_INDEX" git add -A
# Public mirrors carry no CI/automation: drop GitHub Actions workflows and the
# Dependabot config from the snapshot, so each publish does NOT re-arm Actions or
# Dependabot on the mirror. (Removed from the snapshot index only; the working
# tree and origin are untouched.)
GIT_INDEX_FILE="$SNAP_INDEX" git rm -r --cached --quiet --ignore-unmatch \
  .github/workflows .github/dependabot.yml >/dev/null 2>&1 || true
TREE=$(GIT_INDEX_FILE="$SNAP_INDEX" git write-tree)
COMMIT=$(git commit-tree "$TREE" -m "Snapshot $(date -u +%Y-%m-%d)")
echo "built snapshot commit $COMMIT (tree $TREE)"
echo

for r in "${PUBLIC_REMOTES[@]}"; do
  # Per-remote SSH key override, if configured (e.g. an org mirror with a
  # dedicated deploy key):  git config remote.<name>.identityFile <path>
  KEY=$(git config "remote.$r.identityFile" 2>/dev/null || true)
  if [ -n "$KEY" ]; then
    export GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes"
    echo "publishing to $r (key: $KEY) ..."
  else
    unset GIT_SSH_COMMAND
    echo "publishing to $r ..."
  fi
  # Wipe every branch except main (overwritten next).
  git ls-remote --heads "$r" \
    | awk '$2 != "refs/heads/main" {print $2}' \
    | sed 's|^|:|' \
    | xargs -r -n1 git push "$r"
  # Wipe every tag.
  git ls-remote --tags "$r" \
    | awk '{print $2}' \
    | sed 's|^|:|' \
    | xargs -r -n1 git push "$r"
  # Force-push the orphan commit as main.
  git push "$r" "$COMMIT:refs/heads/main" --force
  echo "  $r/main → $COMMIT"
done

echo
echo "done. all public mirrors → $COMMIT"
