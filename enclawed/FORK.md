# enclawed: fork charter

`enclawed` is a hard fork of [OpenClaw](https://github.com/openclaw/openclaw)
intended for any deployment that needs **attested peer trust**, **deny-by-default
external connectivity**, **signed-module loading**, and a **tamper-evident
audit trail**. Sector-neutral by default — the same mechanisms serve
financial services (material non-public information), healthcare
(PHI under HIPAA / GDPR Article 9), regulated R&D (embargoed research,
trade-secret IP, ITAR / EAR-controlled materials), defense contractors
(CMMC, NIST 800-171), government enclaves (NIST 800-53 / FedRAMP / DoD /
DoE), and other regulated-industry deployments.

The classification framework is **always on**. The fork ships in two
flavors selected at boot via `ENCLAWED_FLAVOR`:

| Flavor | Default | Posture |
| ------ | ------- | ------- |
| `open` | yes | OpenClaw-compatible. Allowlists are not enforced; module signatures are warn-only; FIPS is not asserted by default. The framework still runs (audit log, DLP redaction, classification-label types, module-loader trust-root, MCP attestation verifier). Use this for development and any non-regulated deployment. |
| `enclaved` | opt-in | High-trust deployment. Strict deny-by-default channel/provider/tool/host allowlists, FIPS asserted at boot, **every** loaded module must present a manifest signed by a trust-root signer approved for its declared clearance tier, MCP connections refused unless the remote server attests to at least the caller's required tier. |

In `enclaved`, modules without a valid signed manifest are rejected before
their code is imported. In `open`, the same checks run but produce warnings
instead of denials so community modules continue to load.

> **Read this first.** This codebase is a hardening framework. It is not,
> and must not be represented as, an accredited compliance certification.
> A real audit, attestation, or Authority to Operate — ISO 27001 certificate,
> SOC 2 Type II report, HITRUST validation, FedRAMP ATO, DoD / DoE high-side
> ATO, PCI DSS Report on Compliance, etc. — requires accredited hardware,
> validated cryptographic modules (FIPS 140-3 where the regime requires
> it), certified facilities (data-center audit, SCIF, physical-security
> plan), evaluation by a qualified assessor, and management sign-off.
> Code alone cannot satisfy any of those. Treat §8 below as the work the
> deploying organization still owns.

---

## 1. Lineage

- Upstream: `https://github.com/enclawed/enclawed` (default branch),
  shallow clone, on 2026-04-17.
- Local working copy: this directory tree.
- Package metadata renamed: `package.json` `"name": "enclawed"`, `"bin": {"enclawed": "enclawed.mjs"}`, version reset to `0.1.0`.
- `process.title` set to `"enclawed"` at boot (`src/entry.ts`).

## 2. Threat model

This fork targets a **single-tenant, single-user personal AI assistant
gateway** running inside a high-trust enclave (regulated-industry network
segment, classified enclave, etc.). The user holds the deploying
organization's highest applicable trust tier. The system must:

1. Never egress to the public Internet or any external channel/provider.
2. Use only locally-hosted inference (Ollama, vLLM, LM Studio, SGLang, local NVIDIA NIM, llm-task harness).
3. Refuse to render or echo data above the user's authorized tier.
4. Refuse to write data below its origin classification (no-write-down).
5. Produce a tamper-evident audit trail of every model interaction.
6. Encrypt every persistent artifact at rest (HSM-backed key — the deploying organization owns the seam).
7. Block known classification banner strings, secrets, and PII from leaving the gateway via any output channel.
8. Make any deviation from the above a hard, loud failure — not silent degradation.

Targeted control families:

- **NIST 800-53** AC (Access Control), AU (Audit), IA (Identification &
  Authentication), SC (System & Communications Protection), SI (System &
  Information Integrity), CM (Configuration Management), MP (Media Protection).
- **ISO/IEC 27001 / 27002** A.5 (Information security policies), A.8
  (Asset management — classification), A.9 (Access control), A.10
  (Cryptography), A.12 (Operations security), A.13 (Comms security).
- **NIST CSF 2.0** Identify (ID.AM), Protect (PR.AC, PR.DS, PR.PT),
  Detect (DE.AE, DE.CM), Respond, Recover.
- **SOC 2 Trust Services Criteria** CC5 (Logical access), CC6 (System
  operations), CC7 (Change management), CC8 (Risk mitigation).
- **GDPR** Art. 32 (security of processing), Art. 25 (data protection by
  design and by default), recitals on pseudonymisation and encryption.
- **HIPAA Security Rule** §164.308 (administrative), §164.310 (physical),
  §164.312 (technical: access control, audit controls, integrity,
  transmission security).
- **PCI DSS v4** Req. 3 (protect stored account data), Req. 4 (protect
  cardholder data in transit), Req. 7 (least privilege), Req. 10 (log &
  monitor), Req. 11 (test security).
- **CMMC L2/L3 / NIST 800-171** when used by US-defense contractors.
- **CNSSI 1253** when used by US-government high-side enclaves.

## 3. Files added under upstream `src/`

All TS modules type-check clean under `tsc --strict --noEmit` and are
bundled with the upstream TypeScript build.

### 3.1 Classification + policy + framework primitives

| Path | Purpose |
| ---- | ------- |
| `src/enclawed/classification.ts` | Bell-LaPadula label lattice. The level ladder is **fully data-driven** by the active classification scheme (see `classification-scheme.ts`). `parse` / `format` consult the active scheme; `format` accepts an optional `nameStyle: 'us-gov' \| 'generic' \| 'active-scheme'` to pin a fixed legacy table when a specific marking style is required regardless of the active scheme. `dominates`, `canRead`, `canWrite`, `combine` all operate on numeric ranks and are scheme-agnostic. |
| `src/enclawed/classification-scheme.ts` | **User-configurable** classification scheme. `ClassificationScheme` defines: ordered ladder of `SchemeLevel` (rank, canonicalName, aliases) plus optional `validCompartments` / `validReleasability` whitelists. `parseClassificationScheme(json)` validates a custom scheme. `getActiveScheme()` / `setActiveScheme()` / `resetActiveScheme()` manage the runtime active scheme. `loadSchemeByName(name)` resolves a built-in id or falls through to a JSON file path. Built-in presets: `DEFAULT_SCHEME` (generic + US-gov merged, 6 levels), `US_GOVERNMENT_SCHEME` (UNCLASSIFIED → TOP SECRET // SCI), `HEALTHCARE_HIPAA_SCHEME` (Public / Internal / PHI / Sensitive-PHI / Research-Embargoed), `FINANCIAL_SERVICES_SCHEME` (Public / Internal / Confidential / MNPI / Privileged-Counsel), `GENERIC_3_TIER_SCHEME` (Public / Internal / Restricted). |
| `src/enclawed/policy.ts` | Channel/provider/tool/host allowlists; `defaultEnclavedPolicy()`, `defaultOpenPolicy()`, `enforceAllowlists` flag. |
| `src/enclawed/egress-guard.ts` | `globalThis.fetch` wrapper enforcing a host allowlist; `installEgressGuard()` returns a restorer for tests. |
| `src/enclawed/audit-log.ts` | Append-only, SHA-256 hash-chained JSONL audit log; independent `verifyChain()` reader. |
| `src/enclawed/dlp-scanner.ts` | Regex DLP. **Sensitive-data markings**: industry banners (`RESTRICTED`, `CONFIDENTIAL`, etc.), US-government banners (`SECRET//...`), DOE RD/FRD, SCI codewords, distribution caveats (`EYES_ONLY`, `UNDER NDA`, etc.). **Cloud / vendor secrets**: AWS / GCP / Azure / GitHub / GitLab / OpenAI / Anthropic / Slack / Stripe / JWT / PEM private keys. **PII**: international email, E.164 phone, credit-card PAN (Luhn-shaped), IBAN, US SSN. `scan` / `redact` / `highestSeverity`. |
| `src/enclawed/crypto-fips.ts` | AES-256-GCM envelope encryption with scrypt KDF and `assertFipsMode()` gate. |
| `src/enclawed/zeroize.ts` | Buffer / Uint8Array zeroizer; `withSecret(material, fn)` ensures zeroize on return or throw. |

### 3.2 Flavor + module-signing surfaces (added in this iteration)

| Path | Purpose |
| ---- | ------- |
| `src/enclawed/flavor.ts` | `Flavor` type (`"open" \| "enclaved"`), `getFlavor(env)` reads `ENCLAWED_FLAVOR`, default is `"open"`. |
| `src/enclawed/module-manifest.ts` | Schema for `enclawed.module.json` (`id`, `publisher`, `version`, `clearance`, `capabilities`, `signerKeyId`, `signature`); `parseManifest`, `canonicalManifestBytes`, `canonicalManifestHash`, `meetsClearance`, `clearanceToRank`. Clearance is a free-form string validated against the **active classification scheme** (so `clearance: "MNPI"` works under the financial-services preset, `clearance: "PHI"` under healthcare, `clearance: "q-cleared"` under US-gov, etc.). |
| `src/enclawed/module-signing.ts` | Ed25519 sign + verify via `node:crypto`. `generateEd25519KeyPair()`, `signManifest()`, `verifyManifestSignature()`. |
| `src/enclawed/trust-root.ts` | Allowlist of approved signing keys, each bound to the clearance levels it may attest to. `setTrustRoot()` / `findSigner()`. Ships with two PLACEHOLDER keys; lab MUST replace before production. |
| `src/enclawed/module-loader.ts` | `checkModule(manifest, opts)` — returns `{ allowed, ... }` based on flavor, signature, signer approval, optional `requiredClearance`. Audits every decision. |
| `src/enclawed/integration/module-loader-shim.ts` | Disk adapter: reads `enclawed.module.json` from a module dir, calls `checkModule()`. |
| `src/enclawed/integration/preload.ts` | Boot-time scan of the modules root that pre-verifies every module's manifest into a `Map<id, decision>` stashed on the runtime singleton (so the synchronous validation chokepoints can query without async I/O on the hot path). |

### 3.3 Runtime + bootstrap

| Path | Purpose |
| ---- | ------- |
| `src/enclawed/runtime.ts` | `globalThis[Symbol.for("enclawed.runtime")]` singleton: `{ flavor, policy, audit, restoreFetch, fipsRequired, moduleDecisions }`. |
| `src/enclawed/bootstrap.ts` | `bootstrapEnclawed()` — always runs at process start. **Loads classification scheme** from `opts.classificationScheme` or `ENCLAWED_CLASSIFICATION_SCHEME` (built-in id OR JSON file path) before any manifest is parsed, picks flavor, picks policy, optionally asserts FIPS (default: only in enclaved), opens audit log, installs egress guard, pre-verifies every module manifest, registers runtime, appends `enclawed.boot` record (which now includes the active scheme id). |
| `src/enclawed/index.ts` | Barrel re-exports for the public framework surface. |
| `src/enclawed/integration.test.ts` | Vitest harness mirroring the canonical standalone `node:test` suite. |

The standalone `enclawed/` directory (this directory; Node ESM `.mjs`, zero
deps, `node --test`) remains the canonical hardening-framework reference and
runs without the upstream build pipeline. Every TS file in `src/enclawed/`
has a `.mjs` twin in `enclawed/src/`; the two surfaces stay in lockstep.

## 4. Upstream files modified

| File | Edit | Effect |
| ---- | ---- | ------ |
| `package.json` | `name`, `bin`, `description`, `keywords`, `version` | Rebrands the published package as `enclawed`. |
| `README.md` | Replaced. | New top-of-tree fork overview. |
| `src/entry.ts` | After `installGaxiosFetchCompat()`, unconditionally `await import("./enclawed/bootstrap.js")` then call `bootstrapEnclawed()`. `process.title = "enclawed"`. | Activates the framework before any plugin or transit code is imported. |
| `src/plugins/channel-validation.ts` | Inside `normalizeRegisteredChannelPlugin`, after the `id` validation, consult `policy` and the cached `moduleDecisions` map. | Channels not on the policy allowlist (skipped in `open` flavor) and channels whose module manifest failed signature verification at boot are both rejected with diagnostics and audit records (`policy.deny.channel` / `module.deny.channel`). |
| `src/plugins/provider-validation.ts` | Same pattern as channel-validation. | Providers not on the policy allowlist or whose module manifest failed signature verification are rejected (`policy.deny.provider` / `module.deny.provider`). |
| `src/logging/subsystem.ts` | Inside the `emitLog` closure of `createSubsystemLogger`, redact `message` + string-valued `meta` entries through the DLP scanner and append a `log.<level>` record to the audit chain. | Every log line emitted anywhere in the gateway is DLP-redacted before reaching the console / file sinks; a tamper-evident copy goes to the audit log. |
| `modules/` | Symlink → `extensions/`. | User-facing terminology is "module"; upstream-internal code (deeply embedded `extension` / `plugin` references in 1000+ files) keeps its names. The two paths resolve to the same directory. |

## 5. Files / directories deleted from upstream

Channels and providers that cannot serve the threat model are deleted from
the source tree, not merely policy-denied. There is no reason to ship code
that can never run.

### 5.1 Cloud channels removed (`extensions/<id>/` deleted)

bluebubbles, discord, feishu, googlechat, imessage, irc, line, matrix,
mattermost, microsoft, msteams, nextcloud-talk, nostr, qqbot, signal, slack,
synology-chat, telegram, tlon, twitch, voice-call, talk-voice, whatsapp,
zalo, zalouser. **(25 directories.)**

### 5.2 Cloud LLM / API providers removed (`extensions/<id>/` deleted)

alibaba, amazon-bedrock, amazon-bedrock-mantle, anthropic, anthropic-vertex,
arcee, byteplus, chutes, cloudflare-ai-gateway, deepgram, deepseek,
elevenlabs, fal, fireworks, github-copilot, google, groq, huggingface,
kilocode, kimi-coding, litellm, microsoft-foundry, minimax, mistral,
moonshot, openai, opencode, opencode-go, openrouter, perplexity, qianfan,
qwen, runway, stepfun, synthetic, together, vercel-ai-gateway, venice,
volcengine, voyage, xai, xiaomi, zai, codex, copilot-proxy.
**(45 directories.)**

### 5.3 External search / web / outbound removed

brave, duckduckgo, exa, firecrawl, searxng, tavily, browser, webhooks.
**(8 directories.)**

### 5.4 Total deletion footprint

**78 module directories removed.** Surviving modules are local-only
or local-capable: Ollama, vLLM, LM Studio, SGLang, local NVIDIA NIM,
llm-task, ComfyUI, image/video/media-understanding/speech cores, memory
modules, openshell, qa-channel, qa-lab, qa-matrix, phone-control,
device-pair, diagnostics-otel (configure to emit only to a local
collector), and other local-only utility modules.

### 5.5 New module added: `enclawed-enclaved/extensions/mcp-attested/`

A reference Model Context Protocol client that gates every connection on
remote-server clearance attestation. Sector-neutral: the same shape works
for any environment that needs attested peer trust — internal-only services
in a financial enterprise, PHI-handling MCP servers in healthcare,
embargoed-research data services in regulated R&D, classified-enclave
servers in government work.

This module ships in the **closed-source sibling tree**
(`enclawed-enclaved/`) under a proprietary license (see
`../../enclawed-enclaved/LICENSE`). It depends on the OSS framework
primitives via relative paths into `../../enclawed-oss/`.

The remote server publishes a signed manifest at
`/.well-known/enclawed-clearance.json` whose body matches the
`enclawed.module.json` schema (same canonicalization, same Ed25519 trust
root). Connection is refused unless:

1. The assertion is signed by a key in the local trust root.
2. The signer is approved for the assertion's declared clearance tier.
3. The signature verifies against the canonical bytes.
4. The asserted clearance ≥ the caller's required clearance (default
   `restricted-plus`; can be set to any tier in either vocabulary).

The bundled module ships with a real signed `enclawed.module.json`
declaring `clearance: "restricted-plus"` and capability `mcp-client`. The
signing key is in the default trust root (placeholder; deploying
organization replaces). Files (paths relative to project root):

- `enclawed-enclaved/extensions/mcp-attested/enclawed.module.json` —
  signed manifest.
- `enclawed-enclaved/extensions/mcp-attested/src/server-clearance-verifier.ts`
  — fetches and verifies the remote `/.well-known/` assertion; injectable
  fetcher for tests.
- `enclawed-enclaved/extensions/mcp-attested/src/client.ts` —
  `QClearedMcpClient.connect()` / `.invoke()`; in `enclaved` flavor
  verification failure is a hard deny, in `open` flavor it is surfaced
  as a warning.
- `enclawed-enclaved/extensions/mcp-attested/test/server-clearance.test.mjs`
  — node:test cases proving generic-vocabulary accept
  (`restricted-plus`), US-gov-vocabulary accept (`q-cleared`),
  `confidential` server denied when `restricted-plus` required,
  wrong-signer signature reject, open-flavor warn-only.

### 5.6 New module added: `enclawed-enclaved/src/enclawed-secure/zero-trust-key-broker`

Closed-source K-of-N quorum key broker for hybrid deployments that cannot
achieve full enclave isolation. Treats every external key custodian
(cloud KMS, HSM-as-a-service, federated key custodian) as untrusted;
requires Ed25519-signed attestations; supports CONSENSUS and
THRESHOLD-XOR modes; records every operation in a broker-signed
hash-chained ledger that any external auditor can independently verify.

Files (relative to project root):

- `enclawed-enclaved/src/enclawed-secure/zero-trust-key-broker.ts` — TS
  source (depends on `../../../enclawed-oss/src/enclawed/audit-log.js`
  for the `AuditLogger` type only).
- `enclawed-enclaved/enclawed/src/zero-trust-key-broker.mjs` — canonical
  `.mjs` reference.
- `enclawed-enclaved/enclawed/test/zero-trust-key-broker.test.mjs` —
  node:test cases (19) covering attestation sign/verify, K-of-N quorum
  with one dishonest provider, signature-forgery exclusion, providerId /
  keyId / payload-hash mismatch exclusion, threshold-XOR reconstruction,
  ledger verifyChain (clean / tampered / wrong key), audit integration.

### 5.5 Cascade work the deploying laboratory must finish

Deletion of these directories will surface dangling references in upstream
code that hard-named specific channels/providers (e.g. `legacy.migrations`,
`doctor` repair paths, hard-coded fallbacks, channel/provider id allowlists
in tests, `.github/labeler.yml` entries, plugin-scoped public-artifact
registries, mintlify docs sidebars). These are intentional findings: every
remaining hard-coded reference is a concrete TODO for the lab to either
delete or remap. Run `pnpm tsgo && pnpm test && pnpm build` after install
to enumerate them.

## 6. Control mapping (representative, multi-framework)

The same code surfaces map to controls across multiple frameworks. Pick the
column that fits the deploying organization's regime.

| Control area | enclawed surface | NIST 800-53 | ISO/IEC 27001 / 27002 | NIST CSF 2.0 | SOC 2 TSC | GDPR | HIPAA Security Rule |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Access enforcement | `classification.ts` (BLP `dominates` / `canRead` / `canWrite`); `policy.ts` allowlists; channel/provider patches reject non-allowlisted IDs | AC-3 | A.9.4 | PR.AC-4 | CC5.1, CC6.1 | Art. 32(1)(b) | §164.312(a)(1) |
| Information flow / boundary | `egress-guard.ts` host allowlist installed unconditionally at boot; channel/provider gates | AC-4, SC-7 | A.13.1 | PR.PT-4 | CC6.6 | Art. 32(1)(b) | §164.312(e)(1) |
| Security attributes / classification | `classification.ts` label structure + banner `format`/`parse` | AC-16 | A.8.2 | PR.DS-5 | CC1.4 | Art. 5(1)(f) | §164.308(a)(2) |
| Audit log | `audit-log.ts` canonical-JSON hash-chain; `subsystem.ts` patch tees every log line; genesis `enclawed.boot` record | AU-2/3/9/10 | A.12.4 | DE.CM-1, DE.AE-3 | CC7.2, CC7.3 | Art. 30, Art. 32(1)(d) | §164.308(a)(1)(ii)(D), §164.312(b) |
| Cryptographic module assurance | `crypto-fips.assertFipsMode()` enforced at boot when `ENCLAWED_FIPS_REQUIRED!=0` | IA-7, SC-13 | A.10.1 | PR.DS-1 | CC6.1 | Art. 32(1)(a) | §164.312(a)(2)(iv) |
| Encryption at rest / in transit | `crypto-fips.ts` AES-256-GCM envelope (HSM-bound key seam owned by deploying org) | SC-8, SC-13, SC-28 | A.10.1, A.13.2 | PR.DS-1, PR.DS-2 | CC6.1, CC6.7 | Art. 32(1)(a) | §164.312(e)(2)(ii), §164.312(a)(2)(iv) |
| Continuous monitoring | `audit-log.ts` + `subsystem.ts` patch + `egress-guard.onDeny` chained into the audit log | SI-4 | A.12.4 | DE.CM, DE.AE | CC7.2 | Art. 32(1)(d) | §164.308(a)(1)(ii)(D) |
| Data leakage / DLP | `dlp-scanner.ts` markings + cloud secrets + international PII detection on every emitted log line | SI-12 | A.13.2.3 | PR.DS-5 | CC6.7 | Art. 5(1)(f), Art. 32(1)(b) | §164.312(e) |
| Memory / residual data hygiene | `zeroize.ts` for in-process Buffer/Uint8Array secret material | MP-6, SI-16 | A.8.3 | PR.IP-6 | CC6.5 | Art. 32(1)(a) | §164.310(d)(2)(i) |
| Least functionality | External chat / external LLM / external search modules deleted from the source tree (§5) | CM-7 | A.9.1 | PR.AC-3 | CC6.3 | Art. 25 (DPbDD) | §164.312(a)(1) |
| Module integrity / supply chain | `module-signing.ts` + `trust-root.ts` + `module-loader.ts` Ed25519 signature verification with per-signer clearance approval; boot-time pre-verification | SI-7, CM-5, SR-3, SR-4 | A.12.5, A.14.2.5 | PR.IP-1, PR.DS-6 | CC8.1 | Art. 32(1)(b) | §164.312(c)(1) |
| Identity / cleared peer attestation | `modules/mcp-attested/` server-clearance verifier (signed `/.well-known/` assertion) | IA-3, IA-9, AC-3(11) | A.13.1.1 | PR.AC-7 | CC6.1 | Art. 32(1)(b) | §164.312(d) |

## 7. Verification

The standalone framework + module suite exercises every surface without
requiring `pnpm install`. Run from the project root (`~/enclawed/`):

```
$ node --test enclawed-oss/enclawed/test/*.test.mjs \
              enclawed-oss/enclawed/test/security/*.pentest.mjs \
              enclawed-enclaved/enclawed/test/*.test.mjs \
              enclawed-enclaved/extensions/mcp-attested/test/*.test.mjs
ℹ tests 207
ℹ pass 207
ℹ fail 0
```

Coverage:

- **classification (11)** — invalid level rejection, lattice reflexivity,
  compartment containment, BLP `canRead`/`canWrite`, banner format/parse
  round-trip, label immutability.
- **policy (9)** — required-field validation, default enclaved policy denies
  cloud channel/provider, default open policy permits everything,
  alias backwards-compat, frozen.
- **egress-guard (6)** — block, allow, Request-like input, malformed URL,
  `onDeny` exception swallow, install/restore lifecycle.
- **audit-log (4)** — append + verify, in-place tamper detection, reopen
  continues chain, deterministic record hash.
- **dlp-scanner (9)** — banner, DOE RD, AWS AKID, PEM private key, US SSN,
  clean-text negative, severity aggregation, redact above threshold,
  redact below threshold.
- **crypto-fips (10)** — round-trip, wrong-passphrase auth-tag failure,
  AAD-mismatch failure, AAD round-trip (string input), AAD round-trip
  (Buffer input), AAD stored as `base64(utf8(aad))`, unsupported algo,
  short-salt, FIPS gate, ciphertext non-determinism.
- **zeroize (7)** — Buffer/Uint8Array fill, type rejection, null no-op,
  `withSecret` happy/throw paths, `secureRandomBytes` length.
- **flavor (5)** — secure-alias parse, open-alias parse, unknown=null,
  default-open, env-driven override.
- **module-manifest (6)** — valid parse, unknown clearance reject, required
  fields, canonical bytes stable across capability order, signature
  excluded from canonical bytes (so signing is stable), `meetsClearance`.
- **module-signing (4)** — Ed25519 round-trip, wrong-key fail, tampered-bytes
  fail, malformed-signature fail.
- **module-loader (8)** — open-flavor accepts unsigned (warn), enclaved
  rejects unsigned, enclaved rejects unknown signer, enclaved rejects
  signer-not-approved-for-clearance, enclaved accepts properly-signed
  Q-cleared, tampered-body rejected, requiredClearance gate, expired-signer
  rejected.
- **mcp-attested (4)** — generic-vocabulary accept (`restricted-plus`),
  US-gov-vocabulary accept (`q-cleared`), `confidential` server denied
  when `restricted-plus` required, wrong-signer signature reject,
  open-flavor warn-only.

(The unit-test inventory above is a partial snapshot focused on the
older surfaces. Newer surfaces — HITL state machine + cooperative
checkpoint + approval queue, transaction buffer with hash chain / LIFO
rollback / eviction, zero-trust key broker with K-of-N quorum / Ed25519
attestation / hash-chained ledger — bring the unit-test total to 149
plus 58 adversarial pen-tests = 207 cases.)

Vitest mirror at `enclawed-oss/src/enclawed/integration.test.ts` runs in
the upstream `pnpm test` pipeline and exercises the same surface plus
the `globalThis` runtime singleton.

All 22 OSS framework `.ts` files plus the 4 closed-tree `.ts` files
(zero-trust key broker + the three mcp-attested files) type-check clean
under `tsc --strict --noEmit`.

## 8. Gaps the deploying organization still owns

Each item is **out of scope** for this fork's source tree and must be
delivered by the deploying organization's security / IT / compliance team.

### 8.1 AC — Access control

- **User identity binding.** `classification.canRead` enforces BLP, but no
  identity layer is shipped. Integrate the deploying organization's IdP
  (SAML / OIDC for enterprise, smart-card / CAC / PIV for high-trust
  enclaves) and bind a clearance tier label to every session.
- **Mandatory access control at the OS layer.** Code-level checks are
  defense-in-depth. SELinux MLS, AppArmor, or equivalent must enforce the
  same lattice outside the JS process (NIST 800-53 AC-3(3); ISO 27001 A.9.4).
- **Cross-trust-zone transfer.** This fork forbids egress; a real
  high-trust deployment needs an accredited cross-zone control (data diode
  for the strictest enclaves; one-way file-transfer appliance, manual
  review queue, or a vendor-supplied Cross-Domain Solution where the
  regime requires it) for any low-trust return path.

### 8.2 AU — Audit

- **WORM storage.** Hash chain catches in-place edits but not deletion of
  trailing records. Ship audit records in real time to WORM media or an
  isolated audit appliance (NIST 800-53 AU-9(2)).
- **Off-host shipping.** Sign each record (HSM key) and replicate to an
  audit aggregator on a separate VLAN.
- **Stratum-0 time source.** Bind audit timestamps to enclave-local
  stratum-0; trust no host clock.
- **Retention.** Define retention per data category (DOE O 471.6).

### 8.3 SC — Cryptography

- **Validated cryptographic module.** `crypto-fips.ts` calls
  `node:crypto`. The deployment must compile / link against a
  cryptographic module validated to the regime's required standard
  (FIPS 140-3 for US federal / DoD / DoE / FedRAMP; Common Criteria EAL
  evaluations for some EU and APAC regimes; the deploying organization's
  internal crypto policy elsewhere) and run with the appropriate provider
  activated. For US-government high-side enclaves carrying data across
  enclave boundaries, additionally use Type-1 cryptography — that cannot
  be provided by a Node module.
- **Key management.** Replace the `passphrase` parameter with HSM-backed
  key references (PKCS#11 for software HSMs; vendor SDK for hardware
  HSMs; KMIP for enterprise key managers; cloud KMS for managed-service
  deployments outside the strictest regimes). Add documented rotation,
  key escrow per organizational policy, per-object key derivation.
- **At-rest coverage.** Apply the envelope uniformly to every persistent
  artifact: `~/.enclawed/credentials/`, `~/.enclawed/agents/<id>/sessions/`,
  log files, IPC sockets, model weights, swap, core dumps. Wire it into
  `src/gateway/credential-planner.ts` (and the file I/O it ultimately
  reaches) and into the session/transcript writers.

### 8.4 SI — System integrity

- **DLP is keyword-only.** A real enclave DLP requires content-aware
  analysis, trained classifiers, file-format introspection, and
  human-reviewed escalations.
- **Model output filtering.** Pair the scanner with a separately-accredited
  human review queue for any output flagged ≥ configured threshold.
- **Code provenance.** Pin every dependency by integrity hash, SBOM via
  CycloneDX, no install of untrusted packages, registry mirror only.

### 8.5 SC-7 — Boundary protection

- **User-space egress guard is one layer.** It cannot stop raw
  `net.Socket`, `dgram`, DNS, native modules, or child processes. Egress
  must be enforced again at the kernel (nftables / eBPF / network
  namespace) and at a network appliance (one-way diode if applicable).

### 8.6 MP-6 — Memory hygiene

- **JS strings cannot be zeroized.** `zeroize.ts` only handles
  Buffer / Uint8Array. Audit every secret-handling path to ensure secrets
  never enter a `string`.
- **GC leaves copies.** Disable swap (`swapoff -a`), disable core dumps
  (`ulimit -c 0`, `kernel.core_pattern=`), use mlock-equivalent via a
  native helper, evaluate `--no-incremental-marking` per SCA.

### 8.7 CM — Configuration management

- **Profile signing.** `enclawed/config/classified-profile.example.json` is
  unsigned. Production must require a signature checked against a
  HW-anchored trust root before the gateway will start.
- **Plugin allowlist via signature.** Today policy denies by ID string.
  Bind each allowed plugin to a signed manifest hash and reject any drift.
- **Dangling references.** Per §5.5, run the upstream test+build pipeline
  to enumerate every remaining hard-coded reference to a deleted extension
  and either delete it or remap to a kept extension.

### 8.8 IR / PE / PS

- Out of scope for code. Incident response (extend `INCIDENT_RESPONSE.md`
  with classified-spillage procedures), SCIF physical accreditation, and
  cleared personnel + need-to-know enforcement are owned by the facility
  ISSM and program security office.

## 8b. Configuring the classification scheme

The classification ladder is **data, not code**. The deploying organization
selects a scheme in one of three ways (precedence: opts > env > default):

1. **Built-in preset by id** — set `ENCLAWED_CLASSIFICATION_SCHEME=<id>`:
   - `default` — six levels, generic + US-gov merged (the framework default)
   - `us-government` — UNCLASSIFIED / CUI / CONFIDENTIAL / SECRET / TOP SECRET / TOP SECRET // SCI
   - `healthcare-hipaa` — Public / Internal / PHI / Sensitive-PHI / Research-Embargoed
   - `financial-services` — Public / Internal / Confidential / MNPI / Privileged-Counsel
   - `generic-3-tier` — smallest viable scheme: Public / Internal / Restricted

2. **Custom JSON file** — set `ENCLAWED_CLASSIFICATION_SCHEME=/path/to/scheme.json`.
   The JSON shape is validated by `parseClassificationScheme()`:

   ```json
   {
     "id": "acme-2026",
     "description": "ACME Corp internal data classification policy v3.2",
     "levels": [
       { "rank": 0, "canonicalName": "Public", "aliases": ["P"] },
       { "rank": 1, "canonicalName": "Internal", "aliases": ["I"] },
       { "rank": 2, "canonicalName": "Customer Data", "aliases": [] },
       { "rank": 3, "canonicalName": "Privileged", "aliases": ["legal"] }
     ],
     "validCompartments": ["FINANCE", "ENG", "LEGAL"],
     "validReleasability": ["NDA", "EYES_ONLY"]
   }
   ```

   Rules: ranks must be contiguous starting at 0; every name (canonical
   and alias) must be unique across the scheme (case-insensitive after
   normalization); at least one level required.

3. **Programmatic** — pass `classificationScheme` to `bootstrapEnclawed()`,
   or call `setActiveScheme()` from a deploying-organization bootstrap shim
   (e.g. when the scheme is fetched from a configuration management
   system at startup).

The chosen scheme governs:

- Banner `format()` output — uses each level's canonical name.
- `parse()` input — accepts canonical names + aliases, case-insensitive.
- `makeLabel({ level })` — validates rank is within the scheme's range.
- Module manifest `clearance` field — validated against scheme names.
- MCP attestation verification — required clearance can be any name in
  the active scheme.

The active scheme id is recorded in the `enclawed.boot` audit record so a
forensic reader knows which vocabulary every subsequent log entry is in.

## 8a. Module-signing trust-root setup

The default trust root (`src/enclawed/trust-root.ts` and
`enclawed/src/trust-root.mjs`) ships with **two placeholder signers**:

- `enclawed-community-2026` — approved for `public` and `internal` tiers
  only. Its private key is publicly fabricated; do not trust manifests it
  signs for anything sensitive.
- `enclawed-attested-reference-2026` — used to sign the bundled
  `mcp-attested` reference module so the test suite has a real
  end-to-end demonstration of signed-module loading. Its private key was
  destroyed after one-shot signing; the public key remains.

**Both must be removed** from the trust root before production by calling
`setTrustRoot(orgOwnedSigners)` from a deploying-organization bootstrap
shim that loads signers from a HW-anchored config (e.g. files on a
verified-boot partition; PKCS#11 reads from an HSM; KMIP fetch from an
enterprise key manager; cloud KMS for managed-service deployments outside
the strictest regimes).

To sign a new module manifest in the deploying organization:

1. Generate an Ed25519 keypair inside the HSM / key manager. Export only
   the SPKI public key.
2. Add the public key + a unique `keyId` + the approved clearance tiers
   to `setTrustRoot()` input.
3. For each module: build a manifest body with `signerKeyId` set, compute
   `canonicalManifestBytes()`, sign with the HSM, attach the base64
   signature to the manifest.
4. Place the signed `enclawed.module.json` in the module's root.

The reference signing helper used to bootstrap this fork lives at
`scripts/dev/sign-module-manifest.mjs` (a temp script during the fork's
construction). Replace with an HSM-backed pipeline before production.

## 9. Bug fixes during construction

Caught by the test suite during development:

1. `crypto-fips.deriveKey` — Node's default scrypt `maxmem` (32 MiB) sat at
   the boundary for `N=2^15, r=8`, raising `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`.
   Lifted `maxmem` to 64 MiB explicitly.
2. `classification.makeLabel` — Backing compartments / releasability with
   `Set` left them mutable through `.add()` even after `Object.freeze`.
   Switched to deduplicated, sorted, frozen arrays so labels are truly
   immutable.
3. `classification.parse` — Auto-promoting `LEVEL.TOP_SECRET` →
   `LEVEL.TOP_SECRET_SCI` whenever a non-releasability segment was present
   broke `format`/`parse` round-tripping for `TOP SECRET//SI//NOFORN`.
   Removed auto-promotion; SCI is represented as TS + SCI compartment.

## 10. How to extend

When adding a control:

1. Implement under `enclawed/src/<name>.mjs` (canonical reference, zero deps)
   AND `src/enclawed/<name>.ts` (TypeScript twin used by the upstream build).
   Both must agree.
2. Add tests in both `enclawed/test/<name>.test.mjs` and
   `src/enclawed/integration.test.ts`. Cover happy and refusal paths.
3. If the control needs a new upstream chokepoint, patch the upstream file
   directly (no env gate; this fork is always-on). Wrap the new logic
   behind a `getRuntime()` null-check only if there is a legitimate boot
   ordering concern.
4. Update §3 / §4 / §5 / §6 / §8 of this document.
5. Run the suites from the project root (`node --test
   enclawed-oss/enclawed/test/*.test.mjs enclawed-oss/enclawed/test/security/*.pentest.mjs
   enclawed-enclaved/enclawed/test/*.test.mjs
   enclawed-enclaved/extensions/mcp-attested/test/*.test.mjs`) and
   update §7 numbers.

## 11. Re-affirmation

`enclawed` is a hardening fork and a documented gap list. It is not, and
must not be represented as, an accredited classified-data configuration.
Any claim to that effect would be misleading to the agency that ultimately
trusts the enclave. The work that closes the gaps in §8 is the work that
matters.
