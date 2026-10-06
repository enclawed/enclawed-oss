# enclawed (standalone framework reference)

This directory is the **OSS-side framework reference** for the
[enclawed](../../README.md) project: a Node ESM (`.mjs`) reimplementation
of the framework primitives that mirrors the TypeScript source under
[`../src/enclawed/`](../src/enclawed/), with **zero runtime dependencies**.
It runs under `node --test` without any package install, which keeps the
security suite cheap to exercise and trivial to audit.

For the full fork charter (deletion catalog, multi-framework control
mapping, gap list), see [`FORK.md`](FORK.md).

## Run the tests

```
# From the repository root (~/enclawed/):
node --test enclawed-oss/enclawed/test/*.test.mjs \
            enclawed-oss/enclawed/test/security/*.pentest.mjs
```

All 184 OSS-side tests (126 unit + 58 adversarial pen-tests) pass on
Node 22 in well under one second. Add the closed-tree tests (23 cases:
zero-trust key broker + mcp-attested) for the complete 207-case run;
see the [project root README](../../README.md) for that command.

Requires Node 22+ (the upstream Enclawed runtime baseline).

## Modules in this directory

Bell-LaPadula classification + configurable scheme:

- `src/classification.mjs` — label lattice, format/parse, dominates,
  canRead, canWrite, combine.
- `src/classification-scheme.mjs` — five built-in presets (default /
  us-government / healthcare-hipaa / financial-services / generic-3-tier),
  plus parser/validator for custom JSON schemes.

Policy + boundary:

- `src/policy.mjs` — deny-by-default channel/provider/tool/host
  allowlists; `defaultEnclavedPolicy()` and `defaultOpenPolicy()`.
- `src/egress-guard.mjs` — `globalThis.fetch` wrapper enforcing a host
  allowlist; `freeze:true` option to lock the property non-configurable.
- `src/flavor.mjs` — `getFlavor()` reads `ENCLAWED_FLAVOR`; default `open`.

Audit + DLP:

- `src/audit-log.mjs` — append-only, hash-chained JSONL audit log with
  concurrent-append serialization, deep payload sanitization, and
  independent `verifyChain()` reader.
- `src/dlp-scanner.mjs` — regex DLP for industry / US-gov classification
  banners, cloud / vendor secret formats, and international PII; 1 MiB
  input cap to bound ReDoS risk.
- `src/prompt-shield.mjs` — strip C0 / bidi / zero-width chars,
  neutralize role-boundary spoofing and code-fence breakouts, detect
  imperative-override jailbreak phrases.

Cryptography + secrets:

- `src/crypto-fips.mjs` — AES-256-GCM envelope with scrypt KDF;
  `assertFipsMode()` gate.
- `src/zeroize.mjs` — Buffer / Uint8Array zeroizer; `withSecret()`.

Module signing + trust:

- `src/module-manifest.mjs` — schema for `enclawed.module.json` with
  generic + US-government clearance vocabularies.
- `src/module-signing.mjs` — Ed25519 sign / verify utilities.
- `src/trust-root.mjs` — per-signer clearance approval; lockable
  post-boot.
- `src/module-loader.mjs` — `checkModule()` decision function for
  open vs enclaved flavor.

Human-in-the-loop + transactions:

- `src/hitl.mjs` — per-agent `AgentSession` (pause / resume / stop /
  checkpoint / proposeAction) and `HitlController` with event stream
  and approval queue.
- `src/transaction-buffer.mjs` — memory-bounded rollback buffer
  (default 50% of system RAM); hash-chained for tamper-evidence.

## Status

- 22 TypeScript files in `../src/enclawed/` (typecheck clean under
  `tsc --strict --noEmit`).
- 17 `.mjs` canonical reference files in `src/`.
- 184 OSS-side tests (14 unit files + 7 pen-test files), all passing.
- The framework activates unconditionally at boot via the upstream
  patches in `src/entry.ts`, `src/plugins/channel-validation.ts`,
  `src/plugins/provider-validation.ts`, and `src/logging/subsystem.ts`.
- Vitest mirror at `src/enclawed/integration.test.ts` runs in the
  upstream `pnpm test` pipeline.

## Closed-tree extensions

The zero-trust blockchained key broker, the bundled `mcp-attested`
reference module, and the reference classified-profile config live in
the sibling [`../../../enclawed-enclaved/`](../../../enclawed-enclaved/)
tree under a separate proprietary license. See its
[`README.md`](../../../enclawed-enclaved/README.md) and the project-root
[`LICENSE.md`](../../../LICENSE.md) for details.
