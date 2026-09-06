---
title: "Editions and Hardening"
summary: "Two independent axes: which code exists (edition) and how strict the posture is (ENCLAWED_FLAVOR)"
read_when:
  - Deciding whether an app may use a feature
  - Setting ENCLAWED_FLAVOR
  - Reviewing what is safe to publish to enclawed-oss
---

# Editions and Hardening

Two things get confused because one of them reuses the word "open". They
are **independent**: neither implies the other.

|            | Axis 1 — Hardening         | Axis 2 — Edition                     |
| ---------- | -------------------------- | ------------------------------------ |
| Question   | how strict is the posture? | which code exists at all?            |
| Set by     | `ENCLAWED_FLAVOR`          | which repository you installed from  |
| Values     | `enclaved` / `open`        | `enclawed-oss` / `enclawed-enclaved` |
| Licensing? | **no**                     | yes                                  |

## Axis 1 — Hardening (`ENCLAWED_FLAVOR`)

A **security posture**, nothing to do with licensing. Both settings ship
in the open build.

```
secure aliases:  enclaved, secure, classified, high-side
open aliases:    open, enclawed-compat, permissive, default
default:         open
```

It changes three things, all implemented in `enclawed-oss`:

|            | `enclaved`                                                                                                                           | `open`                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| policy     | `defaultEnclavedPolicy`: allowlists enforced, hosts limited to loopback, local model only, DOE-Q clearance, default label SECRET//RD | `defaultOpenPolicy`: allowlists not enforced, UNCLASSIFIED |
| FIPS       | required by default                                                                                                                  | not required by default                                    |
| audit path | enclaved default location                                                                                                            | open default location                                      |

`defaultClassifiedPolicy` is an alias of `defaultEnclavedPolicy` — the
older, clearer name, and the giveaway that this axis is about
classification level.

**Setting `ENCLAWED_FLAVOR=enclaved` does not require a licence and does
not pull in any proprietary code.** An app running on the open build may
choose either value.

Note that these are _defaults_. An app that passes its own `policy`,
`ENCLAWED_AUDIT_PATH` and `ENCLAWED_FIPS_REQUIRED` to
`bootstrapEnclawed` overrides all three, and the flavor then only
records the declared posture. The executive assistant does exactly this.

## Axis 2 — Edition (what is proprietary)

`enclawed-enclaved` is a superset of `enclawed-oss`. Verified
enclaved-only, tracked in the private tree and absent from the public
one:

| Path                              | What it is                                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `extensions/enclaved/` (17 of 18) | zero-trust accreditors (local, eth, local-blockchain), the egress mediator and its scramblers/sentinels, `enclaved-secmon` |
| `enclawed/src/oscal/`             | OSCAL artifact generation — component definitions, assessment results, back-matter, emit/CSV                               |
| `src/enclawed-secure/`            | FIPS mode + allowlist, FIPS crypto wrapper, zero-trust key broker                                                          |
| `packages/egress-core/`           | shared egress-control core                                                                                                 |

**`extensions/enclaved/mcp-attested` is the exception: it has been
released publicly** and lives in the open tree at
`extensions/mcp-attested/`. The private tree still keeps its copy under
`extensions/enclaved/`, so the two differ by _path_, not by licence.

Present in **both**, so an app may rely on them:

`src/enclawed/policy.ts` · `enclawed/src/flavor.mjs` ·
`src/enclawed/crypto-fips.ts` · `src/enclawed/dlp-scanner.ts` ·
`src/enclawed/hardware-root/` (guard, fleet, `enclaweder-hid`) ·
`extensions/mcp-attested/`

Note that `src/enclawed/crypto-fips.ts` **is** open. What is proprietary
is the separate `src/enclawed-secure/` layer (FIPS mode, allowlist, key
broker) — a different thing with a confusingly similar name.

## How to check, and how not to

Compare by **feature**, never by path. The private tree is a superset
whose layout does not always match: `mcp-attested` sits under
`extensions/enclaved/` there and at `extensions/mcp-attested/` in the
open tree. A path-wise diff reports it as proprietary, which is wrong.

```bash
# for each extension the private tree keeps under extensions/enclaved/,
# ask whether that FEATURE exists anywhere in the open tree
for d in $(ls extensions/enclaved/); do
  [ -e ~/enclawed-oss/extensions/"$d" ] || [ -e ~/enclawed-oss/extensions/enclaved/"$d" ] \
    && echo "public:   $d" || echo "private:  $d"
done
```

Confirm anything else the same way — by name, across the whole tree —
before calling it proprietary.

The rest of the size difference between the trees — `apps/ios`,
`apps/android`, `apps/macos`, `modules/*`, `papers/*`, `demos/*`,
`marketing/*` — is **unpublished**, not necessarily proprietary. Absence
from the public snapshot is not by itself a licensing statement.

## Rules

1. **Reference apps under `enclawed-apps/` may use only Axis-2 open
   features.** They are installed from the public checkout, so a
   proprietary import works for the maintainer and fails for everyone
   else. Enforced by `pnpm check:app-oss-only`.
2. **Apps may set either Axis-1 hardening.** The guard deliberately does
   not police `ENCLAWED_FLAVOR`; treating `enclaved` as a licensing
   signal is the exact confusion this document exists to end.
3. **Do not describe Axis 1 in licensing terms** ("enclaved features",
   "the enclaved build") when you mean the hardened posture. Say
   "hardened" or "classified posture" for Axis 1, and "the enclaved
   edition" only for Axis 2.

## Publishing caveat

`scripts/publish-public.sh` snapshots the **working tree**, including
untracked files — it reports the count as "dirty files ... will be
included in snapshot". A file that is untracked in `enclawed-oss` is
therefore still published. Before publishing, check what is about to
ride along:

```bash
git ls-files --others --exclude-standard \
  | grep -E '^(extensions/enclaved/|src/enclawed-secure/|enclawed/src/oscal/|packages/egress-core/)'
```

Anything that prints is proprietary code about to become public.
