# Attic — Quarantined for Security Review

This directory holds source preserved against the possibility that the
corresponding feature is reintroduced after passing enclawed security
review. Files here are not compiled, not tested, and not shipped — but they
remain in the tree so that, if the feature returns, it returns from a known
prior state rather than being rewritten from scratch.

## Policy

A channel, provider, or plugin is reintroduced only if it satisfies the
enclawed security core (paper §3-§5):

- Signed manifest at `tested` or higher (`src/enclawed/skill-manifest.ts`)
- Capability set declared from the fixed vocabulary
  (`src/enclawed/skill-capabilities.ts`)
- Biconditional pass on its adversarial-ensemble fixture
  (`src/enclawed/biconditional.ts`)
- Compatible with the enclaved-flavor allowlist policy
  (`src/enclawed/policy.ts`)

A feature that has only "enclawed compatibility" as motivation does not
qualify. Compatibility never trumps the enclawed security core.

## Subdirectories

- `channels-pending-security-review/plugin-sdk/` — public SDK barrels
  (`src/plugin-sdk/<channel>.ts`) for channels that re-exported from
  stripped extension packages.
- `channels-pending-security-review/test-helpers/channels/` — shared test
  helpers for those channels.
- `channels-pending-security-review/src/channels/plugins/contracts/` —
  contract tests that depend on the helpers above.
- `channels-pending-security-review/src/security/` — security-audit tests
  for stripped channels.
- `channels-pending-security-review/src/{commands,media,plugins}/` —
  individual consumer tests that depend on the quarantined helpers.

## Restoration

To bring a quarantined feature back:

1. Restore the corresponding `extensions/<id>/` package (typically by
   un-stripping it from the fork or copying from upstream).
2. Move the relevant files back from `attic/channels-pending-security-review/`
   to their original paths.
3. Sign the skill / module manifest with a trust-root signer authorized for
   the declared label and verification level.
4. Run the adversarial-ensemble suite for the channel; admit at `tested`
   only if the biconditional passes on every round.
5. Re-add the channel's allowlist entry to `defaultEnclavedPolicy` if you
   intend the channel to be reachable in the enclaved flavor.
6. Remove the `attic/**` exclude from `tsconfig.json` if you have moved
   anything back, or leave it — the exclude is harmless once the file is
   no longer in `attic/`.
