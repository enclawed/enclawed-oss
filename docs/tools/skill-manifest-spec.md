---
title: "SKILL.md Manifest Specification"
summary: "Canonical reference for the SKILL.md front-matter fields, capability vocabulary, signing convention, verification levels, and proof-carrying bundle"
read_when:
  - You are designing a new skill that needs declared or higher verification
  - You are integrating with the enclawed runtime and need the manifest schema
  - You are building tooling that produces or consumes SKILL.md artefacts
  - You are submitting a skill to a marketplace that demands signed manifests
---

# SKILL.md Manifest Specification

This page is the canonical reference for the `SKILL.md` artefact format.
For a quickstart that ships an unsigned skill in five minutes, start at
[Creating Skills](/tools/creating-skills); this page is for skill authors,
runtime integrators, and marketplace operators who need the full schema.

A skill artefact is the tuple

```
Skill = (manifest M, content, signature σ)
```

where `M` is the YAML front-matter, `content` is the markdown body plus any
co-located scripts in the skill directory, and `σ` is a detached Ed25519
signature over the canonical bytes of `(M, content)`. The runtime never
elevates verification at run time: the level a manifest declares is the
highest level the runtime will ever apply to it.

## Manifest fields

The front-matter is the manifest. There are two valid forms:

1. **Quickstart form** (used by [Creating Skills](/tools/creating-skills)):
   `name` and `description` only. The runtime treats this as an
   `unverified` skill; every irreversible call goes through a
   human-in-the-loop (HITL) prompt.
2. **Full form** (this page): seven fields below, all mandatory.

### Schema

| Field          | Type                                | Required | Description                                                  |
| -------------- | ----------------------------------- | -------- | ------------------------------------------------------------ |
| `v`            | integer (must be `1`)               | Yes      | Schema version. The runtime rejects unknown versions.        |
| `id`           | string (non-empty, snake_case)      | Yes      | Stable identifier. Replays of older versions are rejected.   |
| `label`        | object (see [Label](#label))        | Yes      | Bell-LaPadula classification of the skill content.           |
| `caps`         | array of capability tokens          | Yes      | Declared capability set. Tokens outside the vocabulary fail. |
| `signer`       | string (key id from trust root)     | Yes      | Identifier of the key that signed `σ`.                       |
| `version`      | non-negative integer                | Yes      | Monotone counter; replay protection.                         |
| `verification` | enum string (see [Levels](#levels)) | Yes      | Self-declared verification level.                            |

Unknown fields are rejected. Reserved JS prototype keys (`__proto__`,
`prototype`, `constructor`) are rejected.

### Example: full-form manifest

```yaml
---
v: 1
id: report_publisher
label:
  level: 1
  compartments: ["finance"]
  releasability: ["us"]
caps:
  - net.egress
  - fs.read
  - publish
signer: "ops-2026"
version: 3
verification: "declared"
---

# Report Publisher

Publishes the quarterly compliance report to the corporate share point.
...
```

## Label

The `label` object encodes a Bell-LaPadula classification of the skill content
itself, not of the data the skill processes. The runtime uses it to decide
whether a given operator clearance is authorised to load the skill.

| Field           | Type                | Description                                                     |
| --------------- | ------------------- | --------------------------------------------------------------- |
| `level`         | non-negative int    | Numeric clearance rank. `0` is unclassified.                    |
| `compartments`  | string array (opt.) | Need-to-know labels (e.g. `["finance"]`, `["medical"]`).        |
| `releasability` | string array (opt.) | Disclosure scope (e.g. `["us"]`, `["us", "ca", "uk"]`).         |

The clearance rule is enforced at load time: a manifest is only admitted if
the signer's `maxClearance` (from the trust root) dominates `label`.
Compartments and releasability are unioned across all enabled keys.

## Capability vocabulary {#caps}

`caps` must be a subset of the canonical vocabulary. Every token outside
this set is rejected at parse time.

| Token             | Reversible | Meaning                                                                |
| ----------------- | ---------- | ---------------------------------------------------------------------- |
| `net.egress`      | No         | Outbound network calls (HTTP, DNS, raw sockets).                       |
| `fs.read`         | Yes        | Reads of files reachable in the runtime's filesystem view.             |
| `fs.write.rev`    | Yes        | Reversible writes (rename, append-then-truncate, snapshot-friendly).   |
| `fs.write.irrev`  | No         | Irreversible writes (`unlink`, `O_TRUNC` of the only copy, `rm -rf`).  |
| `tool.invoke`     | No         | Calls into the runtime's typed tool dispatch surface.                  |
| `spawn.proc`      | No         | Process creation (forks, subprocess, shell launches).                  |
| `publish`         | No         | Outbound notifications visible to non-operator parties.                |
| `pay`             | No         | Money-movement operations.                                             |
| `mutate.schema`   | No         | Changes to long-lived schema or configuration the runtime depends on.  |

The reversible / irreversible split is load-bearing: reversible operations
flow through the runtime's transaction buffer and can be reverted at session
flush; irreversible operations always require a HITL approval (or, at
`tested` and above, the runtime's mechanically-checked admission rule).

## Verification levels {#levels}

`verification` is the single field the runtime reads to decide how strictly
to gate the skill. The four-level lattice (`unverified < declared < tested
< formal`) is monotonic: the runtime treats the level as a ceiling, never
elevates at run time, and degrades silently when evidence is missing.

| Level         | What the level claims                                                            | What the runtime relaxes |
| ------------- | -------------------------------------------------------------------------------- | ------------------------ |
| `unverified`  | Nothing. The signer is identified but the manifest's claims are not corroborated. | Nothing.                |
| `declared`    | The signer authoritatively asserts the skill stays inside `caps`.                 | HITL frequency reduced for reversible calls. |
| `tested`      | An empirical adversarial-ensemble harness has not falsified the declaration.      | Reversible calls auto-approved; irreversible calls still HITL. |
| `formal`      | A mechanically-checkable proof of capability containment ships in the bundle.    | The runtime accepts the bundle's verdict and skips re-derivation. |

`formal` requires the proof-carrying bundle described
[below](#proof-carrying-bundle); a manifest at `formal` without the bundle
is degraded to `declared` at load time.

## Canonicalisation and signing

The signature `σ` is a detached Ed25519 signature over a canonical encoding
of `(M, content)`. The canonical form is computed as follows:

1. The skill content (markdown body plus any co-located script files
   referenced by relative path) is hashed with SHA-256 to produce
   `contentSha256`.
2. The manifest object is reduced to a fixed-shape body containing the
   seven mandatory fields plus `contentSha256`. Capability and label
   arrays are sorted lexicographically.
3. The body is serialised as JSON with sorted keys, no whitespace, and
   no number coercion (`JSON.stringify`-equivalent on a frozen object).
4. The signature `σ` is Ed25519 over those canonical bytes, encoded base64.

`σ` is **never** part of the canonical bytes. The signature is included
separately (alongside the SKILL.md, in a sibling `.sig` file or in a
manifest envelope, depending on the marketplace's distribution format).

## Bootstrap re-check protocol

When the runtime loads a SKILL.md, the seven-step bootstrap sequence runs:

1. Parse the canonical JSON; reject prototype-key abuse.
2. Resolve `signer` against the trust root; reject unknown signers.
3. Verify `σ` over the canonical bytes of `(M, content)`. Reject on
   signature failure or content tampering.
4. Check `label` is dominated by `signer.maxClearance` (Bell-LaPadula).
5. Check `version` strictly exceeds any cached version for the same `id`.
   Replay attacks are rejected here.
6. Apply the signer's verification authority: if `signer` is not authorised
   for the claimed level, the level is degraded (e.g. `formal` becomes
   `declared`).
7. Return a `LoadedSkill` carrying `contentSha256` and the resolved signer
   key id; downstream gates use these for audit-log binding.

A failure at any step aborts admission. The runtime never partially loads a
skill.

## Proof-carrying bundle {#proof-carrying-bundle}

A skill at `verification: "formal"` ships, alongside SKILL.md and its
scripts, an evidence directory containing four files. The bundle producer
is `scripts/skills-formal-verify.mjs` in the open-source enclawed
distribution; the verifier is `enclawed/src/skill-formal-bundle.mjs`. Both
are Ed25519-signed via the same `module-signing` primitive used for the
manifest itself.

| File                            | Source method | Content                                                   |
| ------------------------------- | ------------- | --------------------------------------------------------- |
| `evidence/static.json`          | Method A      | Per-script effect summaries with the analyser identity.   |
| `evidence/types.proof.json`     | Method B      | Probe verdict over the schema vocabulary.                 |
| `evidence/smt.unsat.json`       | Method C      | BMC verdict at the configured bound, with `instanceHash`. |
| `evidence/manifest.attest.json` | Joint         | Signed attestation binding manifest hash to the verdict.  |

The bootstrap re-checker re-runs Methods A / B / C on the live source,
compares hashes against the cached evidence, and verifies the attestation
signature. A drift between cached and freshly-computed verdicts aborts
admission with a `method-A-cache-miss` (or `method-B`, `method-C`) reason.

A worked end-to-end example ships at `skills/_formal-demo/` in the
open-source distribution. Run

```bash
node scripts/skills-formal-verify.mjs skills/_formal-demo \
  --gen-key \
  --out /tmp/formal-demo-bundle \
  --bound 8
```

to produce all four evidence files, signed with an ephemeral key, and

```bash
node scripts/skills-formal-verify.mjs skills/_formal-demo \
  --verify /tmp/formal-demo-bundle
```

to re-discharge the verdict.

## Compatibility with the quickstart form

The two-field quickstart form is intentional: it lets a developer ship a
working skill without standing up a trust root. The runtime treats it as
`{ verification: "unverified", caps: [], signer: <empty> }` and gates every
irreversible call through HITL. The full form is required for any skill
that wants the runtime to relax HITL frequency, or for any skill submitted
to a marketplace that mandates signed manifests.

## Related

- [Creating Skills](/tools/creating-skills) — quickstart with the
  two-field form.
- [Skills](/tools/skills) — loading order, precedence, and gating.
- [Skills Config](/tools/skills-config) — `skills.*` config schema.
- [ClawHub](/tools/clawhub) — public skill registry.

## References

The schema and verification protocol are defined in two companion papers:

- *Skills as Verifiable Artifacts: A Trust Schema and a Capability
  Containment Property*. Defines the manifest schema, capability
  vocabulary, signing convention, and the four-level verification lattice.
- *Methods for Formal Verification of Agent Skills: Three Layers Toward a
  Mechanically Checkable Capability-Containment Proof*. Defines the
  proof-carrying bundle, the three verification methods, and the
  bootstrap re-check protocol expected of a runtime that admits at
  `formal`.

Both are linked from the [enclawed project page](https://www.enclawed.com/).
