#!/usr/bin/env bash
# Regenerate the committed build output for the current HEAD -- dist/ and
# the plugin SDK's declaration output packages/plugin-sdk/dist/ -- built from
# a clean export of that commit (never from the working tree), the way every
# "build: regenerate dist for <sha> (...)" commit is made.
#
# Usage: scripts/regenerate-dist.sh [--commit] [--push] [--summary "<text>"]
#   (no flag)  build and replace ./dist, print what changed; stage and commit nothing
#   --commit   also commit dist/ as "build: regenerate dist for <sha> (<summary>)"
#              (summary defaults to HEAD's subject, cut at 160 characters)
#   --push     with --commit: push the commit to origin
#
# Refuses when anything outside the generated directories is uncommitted: the
# output must belong to a recorded commit. Local changes inside them are
# discarded (they are generated). The build (`pnpm build`, then the plugin SDK
# declarations as `pnpm tsgo` prepares them) runs in a temporary export with
# its own `pnpm install --frozen-lockfile`; a build that changes any tracked
# file outside them, or that warns [INEFFECTIVE_DYNAMIC_IMPORT], is refused.
set -euo pipefail

COMMIT=0
PUSH=0
SUMMARY=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --commit) COMMIT=1 ;;
    --push) PUSH=1 ;;
    --summary) SUMMARY="${2:?--summary needs text}"; shift ;;
    *) echo "usage: scripts/regenerate-dist.sh [--commit] [--push] [--summary \"<text>\"]" >&2; exit 2 ;;
  esac
  shift
done
if [ "$PUSH" = 1 ] && [ "$COMMIT" = 0 ]; then
  echo "--push needs --commit" >&2
  exit 2
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
GEN_DIRS=(dist packages/plugin-sdk/dist)
GEN_RE='^.. "?(dist|packages/plugin-sdk/dist)/'

OUTSIDE=$(git status --porcelain --untracked-files=normal | grep -vE "$GEN_RE" || true)
if [ -n "$OUTSIDE" ]; then
  echo "REFUSING: uncommitted changes outside ${GEN_DIRS[*]} (commit them first; the output is built from HEAD):" >&2
  echo "$OUTSIDE" | head -20 >&2
  exit 1
fi

SHA=$(git rev-parse HEAD)
SHORT=$(git rev-parse --short=9 HEAD)
SUBJECT=$(git log -1 --format=%s HEAD)
[ -n "$SUMMARY" ] || SUMMARY=$(printf '%s' "$SUBJECT" | cut -c1-160)
case "$SUBJECT" in
  "build: regenerate dist for "*)
    echo "HEAD is already a dist commit ($SHORT); nothing to regenerate for." >&2
    exit 1
    ;;
esac

WORK=$(mktemp -d "${TMPDIR:-/var/tmp}/enclawed-dist-${SHORT}.XXXXXX")
trap 'rm -rf "$WORK"' EXIT
echo "checking out $SHORT into $WORK ..."
# A shared clone checked out at HEAD (not a worktree): the build stamps the
# commit it finds with `git rev-parse HEAD` into dist (the --version line,
# build-info.json), so the export must be that very commit.
rmdir "$WORK"
git clone -q --shared --no-checkout "$ROOT" "$WORK"
git -C "$WORK" checkout -q --detach "$SHA"
(
  cd "$WORK"
  echo "installing (frozen lockfile) ..."
  pnpm install --frozen-lockfile --prefer-offline >"$WORK.install.log" 2>&1 \
    || { tail -30 "$WORK.install.log" >&2; exit 1; }
  echo "building ..."
  GIT_COMMIT="$SHA" pnpm build 2>&1 | tee "$WORK.build.log" >/dev/null \
    || { tail -40 "$WORK.build.log" >&2; exit 1; }
  echo "plugin SDK declarations ..."
  node scripts/prepare-extension-package-boundary-artifacts.mjs >>"$WORK.build.log" 2>&1 \
    || { tail -40 "$WORK.build.log" >&2; exit 1; }
  if grep -q INEFFECTIVE_DYNAMIC_IMPORT "$WORK.build.log"; then
    grep INEFFECTIVE_DYNAMIC_IMPORT "$WORK.build.log" | head -20 >&2
    echo "REFUSING: the build warns [INEFFECTIVE_DYNAMIC_IMPORT]" >&2
    exit 1
  fi
  CHANGED=$(git status --porcelain --untracked-files=normal | grep -vE "$GEN_RE" || true)
  if [ -n "$CHANGED" ]; then
    echo "REFUSING: the build changed tracked files outside ${GEN_DIRS[*]}:" >&2
    echo "$CHANGED" | head -20 >&2
    exit 1
  fi
)
rm -f "$WORK.install.log"

for d in "${GEN_DIRS[@]}"; do
  echo "replacing ./$d with the build of $SHORT ..."
  mkdir -p "$ROOT/$d"
  rsync -a --delete "$WORK/$d/" "$ROOT/$d/"
done
# Count without staging: a dry run leaves the index alone.
STAT=$(git status --porcelain --untracked-files=all -- "${GEN_DIRS[@]}" | awk '{print $1}' | sort | uniq -c | tr '\n' ' ')
echo "dist for $SHORT: ${STAT:-no change} (status code counts)"
rm -f "$WORK.build.log"

if [ "$COMMIT" = 0 ]; then
  echo "(dry run: ${GEN_DIRS[*]} replaced, nothing staged or committed; commit with --commit)"
  exit 0
fi
if [ -z "$STAT" ]; then
  echo "${GEN_DIRS[*]} already match $SHORT; nothing to commit"
  exit 0
fi
# Not scripts/committer: it stages with --force, which would add the
# gitignored build outputs (dist/build-info.json and the like).
git add -A -- "${GEN_DIRS[@]}"
FAST_COMMIT=1 git commit -q -m "build: regenerate dist for $SHORT ($SUMMARY)" --only -- "${GEN_DIRS[@]}"
git log -1 --format='committed %h %s' | cut -c1-200
if [ "$PUSH" = 1 ]; then
  git push origin HEAD
fi
