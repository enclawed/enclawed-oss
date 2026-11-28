---
title: "Release Policy"
summary: "Public release channels, version naming, and cadence"
read_when:
  - Looking for public release channel definitions
  - Looking for version naming and cadence
---

# Release Policy

Enclawed has three public release lanes:

- stable: tagged releases that publish to npm `beta` by default, or to npm `latest` when explicitly requested
- beta: prerelease tags that publish to npm `beta`
- dev: the moving head of `main`

## Publishing to npm

Publish only with `node scripts/release-npm.mjs`, from a clean `main` pushed to `origin/main`. It packs the release tarball once, runs the release checks on that file (post-bundle smoke, live-turn smoke, and consumer installs from a stand-in registry with npm 9 and npm 11), publishes that file, and then checks the real registry: the published shasum, registry metadata equal to the tarball's `package.json`, and project, global and nested installs. A plain `npm publish` from the folder is refused, because npm would upload the dependency list it read before `prepack` rewrote `package.json`, and global installs, which resolve from that metadata, would fail.

Timings (32-core host, `--check`): once the tarball is packed, the post-bundle smoke, the live-turn smoke and the consumer installs run at the same time, and the consumer installs run npm 9 and npm 11, and each one's project, global and nested global install, at the same time, each with its own HOME, prefix and npm cache. Each stage's output and result are printed whole, in the same order as before, and any failing stage still stops the release. Third-party packages come from a shared warm cache that earlier runs filled; npm verifies each one against its integrity, and the package under test always comes from the stand-in registry. Measured on 2.0.5: 675 s before (pack 116 s, post-bundle 56 s, live-turn 193 s, consumer installs 309 s), 296 s after (pack 87 s, then the three stages together in 209 s, which is the live-turn smoke's time; consumer installs 108 s). The ground-truth replay (`pnpm bench:replay`) uses one worker per core by default (`--shards N`; `--shards 1` replays in one process). Its summary, lists and `--json` output are byte-identical to a single-process replay under the same `--work-root`. On the full labels-v2 input (3,990 runs, 28,669 calls) it takes 34 s, down from 355 s.

## Release gates

Every release passes these, in order:

1. Independent adversarial review: a reviewer who did not write the change attacks the release candidate with real runs (the engine's decision and real containment). Only concrete reproductions count as findings.
2. Each confirmed escape is fixed, and its reproduction becomes a regression test that fails before the fix and passes after it.
3. The reviewer attacks the fixed commit again until three consecutive rounds find nothing. Any finding resets the count, and each clean round must try new attack ideas, not only replay earlier sets.
4. On the exact release commit: the ground-truth replay with labels-v2 (FN 0, FP 0, and per-arm rows equal to the companion paper's), `node scripts/release-npm.mjs --check`, and the Enclawed Code suite on that framework.
5. Only then publish.

Nothing that makes the companion paper's numbers worse ships.

## Version naming

- Stable release version: `YYYY.M.D`
  - Git tag: `vYYYY.M.D`
- Stable correction release version: `YYYY.M.D-N`
  - Git tag: `vYYYY.M.D-N`
- Beta prerelease version: `YYYY.M.D-beta.N`
  - Git tag: `vYYYY.M.D-beta.N`
- Do not zero-pad month or day
- `latest` means the current promoted stable npm release
- `beta` means the current beta install target
- Stable and stable correction releases publish to npm `beta` by default; release operators can target `latest` explicitly, or promote a vetted beta build later
- Every Enclawed release ships the npm package and macOS app together

## Release cadence

- Releases move beta-first
- Stable follows only after the latest beta is validated
- Detailed release procedure, approvals, credentials, and recovery notes are
  maintainer-only

## Release preflight

- Run `pnpm build && pnpm ui:build` before `pnpm release:check` so the expected
  `dist/*` release artifacts and Control UI bundle exist for the pack
  validation step
- Run `pnpm release:check` before every tagged release
- Run `pnpm check:install-bootstrap-signatures` before publishing this mirror;
  a bootstrap edited without re-signing aborts every install on that platform.
  See [Install Bootstrap Signing](/reference/install-bootstrap-signing)
- Release checks now run in a separate manual workflow:
  `Enclawed Release Checks`
- Cross-OS install and upgrade runtime validation is dispatched from the
  private caller workflow
  `enclawed/releases-private/.github/workflows/enclawed-cross-os-release-checks.yml`,
  which invokes the reusable public workflow
  `.github/workflows/enclawed-cross-os-release-checks-reusable.yml`
- This split is intentional: keep the real npm release path short,
  deterministic, and artifact-focused, while slower live checks stay in their
  own lane so they do not stall or block publish
- Release checks must be dispatched from the `main` workflow ref so the
  workflow logic and secrets stay canonical
- That workflow accepts either an existing release tag or the current full
  40-character `main` commit SHA
- In commit-SHA mode it only accepts the current `origin/main` HEAD; use a
  release tag for older release commits
- `Enclawed NPM Release` validation-only preflight also accepts the current
  full 40-character `main` commit SHA without requiring a pushed tag
- That SHA path is validation-only and cannot be promoted into a real publish
- In SHA mode the workflow synthesizes `v<package.json version>` only for the
  package metadata check; real publish still requires a real release tag
- Both workflows keep the real publish and promotion path on GitHub-hosted
  runners, while the non-mutating validation path can use the larger
  Blacksmith Linux runners
- That workflow runs
  `ENCLAWED_LIVE_TEST=1 ENCLAWED_LIVE_CACHE_TEST=1 pnpm test:live:cache`
  using both `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` workflow secrets
- npm release preflight no longer waits on the separate release checks lane
- Run `RELEASE_TAG=vYYYY.M.D node --import tsx scripts/enclawed-npm-release-check.ts`
  (or the matching beta/correction tag) before approval
- After npm publish, run
  `node --import tsx scripts/enclawed-npm-postpublish-verify.ts YYYY.M.D`
  (or the matching beta/correction version) to verify the published registry
  install path in a fresh temp prefix
- Maintainer release automation now uses preflight-then-promote:
  - real npm publish must pass a successful npm `preflight_run_id`
  - stable npm releases default to `beta`
  - stable npm publish can target `latest` explicitly via workflow input
  - token-based npm dist-tag mutation now lives in
    `enclawed/releases-private/.github/workflows/enclawed-npm-dist-tags.yml`
    for security, because `npm dist-tag add` still needs `NPM_TOKEN` while the
    public repo keeps OIDC-only publish
  - public `macOS Release` is validation-only
  - real private mac publish must pass successful private mac
    `preflight_run_id` and `validate_run_id`
  - the real publish paths promote prepared artifacts instead of rebuilding
    them again
- For stable correction releases like `YYYY.M.D-N`, the post-publish verifier
  also checks the same temp-prefix upgrade path from `YYYY.M.D` to `YYYY.M.D-N`
  so release corrections cannot silently leave older global installs on the
  base stable payload
- npm release preflight fails closed unless the tarball includes both
  `dist/control-ui/index.html` and a non-empty `dist/control-ui/assets/` payload
  so we do not ship an empty browser dashboard again
- `pnpm test:install:smoke` also enforces the npm pack `unpackedSize` budget on
  the candidate update tarball, so installer e2e catches accidental pack bloat
  before the release publish path
- If the release work touched CI planning, extension timing manifests, or
  extension test matrices, regenerate and review the planner-owned
  `checks-node-extensions` workflow matrix outputs from `.github/workflows/ci.yml`
  before approval so release notes do not describe a stale CI layout
- Stable macOS release readiness also includes the updater surfaces:
  - the GitHub release must end up with the packaged `.zip`, `.dmg`, and `.dSYM.zip`
  - `appcast.xml` on `main` must point at the new stable zip after publish
  - the packaged app must keep a non-debug bundle id, a non-empty Sparkle feed
    URL, and a `CFBundleVersion` at or above the canonical Sparkle build floor
    for that release version

## Pinned dependencies in the tarball

- `npm pack` (and therefore every publish) runs
  `node scripts/npm-shrinkwrap.mjs prepack` after the build. It rewrites the
  packed `package.json` so its runtime `dependencies` are the root package's
  plus every bundled plugin's under `dist/extensions/`, each pinned to the
  exact version in `pnpm-lock.yaml`, drops `devDependencies`, and ships an
  `npm-shrinkwrap.json` with a sha512 `integrity` for every package. npm
  verifies those hashes on install.
- The pack fails when a dependency has no exact registry version in
  `pnpm-lock.yaml`, or when any shrinkwrap entry lacks an exact version, an
  https `resolved` URL or an integrity hash. `postpack` restores
  `package.json` and removes the generated shrinkwrap. If a pack is
  interrupted, run `node scripts/npm-shrinkwrap.mjs postpack` before packing
  again.
- `pnpm release:shrinkwrap:check` validates a generated shrinkwrap in place.
- The install-time `postinstall` (`scripts/postinstall-bundled-plugins.mjs`)
  never runs `npm install`. A missing bundled plugin runtime dependency fails
  the install with the list of missing packages.
  `ENCLAWED_DISABLE_BUNDLED_PLUGIN_POSTINSTALL=1` skips the postinstall
  entirely (no pruning, no hotfixes, no completeness check); it never enables
  a download.

## NPM workflow inputs

`Enclawed NPM Release` accepts these operator-controlled inputs:

- `tag`: required release tag such as `v2026.4.2`, `v2026.4.2-1`, or
  `v2026.4.2-beta.1`; when `preflight_only=true`, it may also be the current
  full 40-character `main` commit SHA for validation-only preflight
- `preflight_only`: `true` for validation/build/package only, `false` for the
  real publish path
- `preflight_run_id`: required on the real publish path so the workflow reuses
  the prepared tarball from the successful preflight run
- `npm_dist_tag`: npm target tag for the publish path; defaults to `beta`

`Enclawed Release Checks` accepts these operator-controlled inputs:

- `ref`: existing release tag or the current full 40-character `main` commit
  SHA to validate

Rules:

- Stable and correction tags may publish to either `beta` or `latest`
- Beta prerelease tags may publish only to `beta`
- Full commit SHA input is allowed only when `preflight_only=true`
- Release checks commit-SHA mode also requires the current `origin/main` HEAD
- The real publish path must use the same `npm_dist_tag` used during preflight;
  the workflow verifies that metadata before publish continues

## Stable npm release sequence

When cutting a stable npm release:

1. Run `Enclawed NPM Release` with `preflight_only=true`
   - Before a tag exists, you may use the current full `main` commit SHA for a
     validation-only dry run of the preflight workflow
2. Choose `npm_dist_tag=beta` for the normal beta-first flow, or `latest` only
   when you intentionally want a direct stable publish
3. Run `Enclawed Release Checks` separately with the same tag or the
   full current `main` commit SHA when you want live prompt cache coverage
   - This is separate on purpose so live coverage stays available without
     recoupling long-running or flaky checks to the publish workflow
4. Save the successful `preflight_run_id`
5. Run `Enclawed NPM Release` again with `preflight_only=false`, the same
   `tag`, the same `npm_dist_tag`, and the saved `preflight_run_id`
6. If the release landed on `beta`, use the private
   `enclawed/releases-private/.github/workflows/enclawed-npm-dist-tags.yml`
   workflow to promote that stable version from `beta` to `latest`
7. If the release intentionally published directly to `latest` and `beta`
   should follow the same stable build immediately, use that same private
   workflow to point both dist-tags at the stable version, or let its scheduled
   self-healing sync move `beta` later

The dist-tag mutation lives in the private repo for security because it still
requires `NPM_TOKEN`, while the public repo keeps OIDC-only publish.

That keeps the direct publish path and the beta-first promotion path both
documented and operator-visible.

## Public references

- `.github/workflows/enclawed-npm-release.yml` (not published in the public repository)
- `.github/workflows/enclawed-release-checks.yml` (not published in the public repository)
- `.github/workflows/enclawed-cross-os-release-checks-reusable.yml` (not published in the public repository)
- [`scripts/enclawed-npm-release-check.ts`](https://github.com/enclawed/enclawed-oss/blob/main/scripts/enclawed-npm-release-check.ts)
- [`scripts/package-mac-dist.sh`](https://github.com/enclawed/enclawed-oss/blob/main/scripts/package-mac-dist.sh)
- [`scripts/make_appcast.sh`](https://github.com/enclawed/enclawed-oss/blob/main/scripts/make_appcast.sh)

Maintainers use the private release docs in
[`enclawed/maintainers/release/README.md`](https://github.com/enclawed/maintainers/blob/main/release/README.md)
for the actual runbook.
