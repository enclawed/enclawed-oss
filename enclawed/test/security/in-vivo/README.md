# In-vivo F1-F4 statistical harness (REAL production primitives)

LLM-driven adversarial agent (Claude Haiku 4.5) generates a balanced set
of legit + adversarial chat payloads per F-category. Each payload is
mediated through three subjects with the actual shipped framework
primitives (no narration, no placeholders) and the harness collects a
per-subject confusion matrix.

## Subjects under test

| Subject | Gate stack |
|---|---|
| Enclawed (upstream) | passthrough; no audit, no admission, no policy, no content shield, no secmon |
| enclawed-oss | enclaved-flavor `admitExtension` + `defaultEnclavedPolicy`-shaped channel/provider gate + persistent hash-chained `AuditLogger` + biconditional checker + `prompt-shield` injection detector + DLP scanner |
| enclawed-enclaved | everything `enclawed-oss` does, **plus** a real `LocalAccreditor` wired to a real `ZeroTrustKeyBroker` / `KeyChainLedger` (broker-signed ledger blocks, accreditor-signed journal entries), **plus** the real `enclaved-secmon` `SecurityMonitor` with feature extractor / 5 detectors / preset policy catalog |

If `ENCLAWED_INVIVO_DISABLE_ACCREDITOR=1`, the enclaved subject's
boot-time accreditor wiring is skipped and the subject refuses to admit
ANY extension for the rest of the run. This is the empirical refusal
path required by the hardening contract.

## What is real

- `AuditLogger` writes hash-chained records to `~/.enclawed-invivo/audit.jsonl`
  every call (`policy.deny` for blocks, `irreversible.executed` for passes).
  `verifyChain()` walks the file and confirms integrity.
- `LocalAccreditor.attest(ledger)` verifies a real `KeyChainLedger` head
  block (broker Ed25519 signature) and writes an Ed25519-signed
  attestation to `~/.enclawed-invivo/witness.jsonl`.
- `ZeroTrustKeyBroker.fetchKey(...)` collects signed provider attestations
  via the real provider-attestation wire format and emits a broker-signed
  ledger block.
- `SecurityMonitor.ingest(event)` runs the real 5-detector stack
  (z-score, EWMA, IQR, rule, density) against per-actor / per-target
  baselines warmed up from real ingested events, and matches against
  the preset policy catalog.
- `admitExtension({manifest, flavor: 'enclaved'})` reads the actual
  `enclawed.module.json` from the closed-tree extension dir and
  verifies the bundled signer's Ed25519 signature against the trust
  root. No mock signers.

## Run

```bash
export ENCLAWED_INVIVO_ANTHROPIC_KEY=sk-ant-...
export ENCLAWED_INVIVO_DISCORD_BOT_TOKEN=...
export ENCLAWED_INVIVO_DISCORD_CHANNEL_ID=...
export ENCLAWED_INVIVO_TELEGRAM_BOT_TOKEN=...
export ENCLAWED_INVIVO_TELEGRAM_CHAT_ID=...

# 100 legit + 100 adversarial per F-category (F1, F3, F4) per channel.
# 600 LLM generations per channel, 1800 mediations per channel.
node enclawed/test/security/in-vivo/llm-narrative.mjs

# Smaller pilot:
ENCLAWED_INVIVO_SAMPLES_PER_CATEGORY=10 \
  node enclawed/test/security/in-vivo/llm-narrative.mjs

# Force the enclaved subject to refuse all admissions (proves fail-closed):
ENCLAWED_INVIVO_DISABLE_ACCREDITOR=1 \
  node enclawed/test/security/in-vivo/llm-narrative.mjs
```

## Required env

| Env var | Purpose |
|---|---|
| `ENCLAWED_INVIVO_ANTHROPIC_KEY` | LLM brain (Claude Haiku 4.5) |
| `ENCLAWED_INVIVO_DISCORD_BOT_TOKEN` + `_DISCORD_CHANNEL_ID` | Test channel post target |
| `ENCLAWED_INVIVO_TELEGRAM_BOT_TOKEN` + `_TELEGRAM_CHAT_ID` | Test channel post target |

## Optional env

| Env var | Default | Purpose |
|---|---|---|
| `ENCLAWED_PATH` | `~/enclawed` | Enclawed repo root for the read-only probe |
| `ENCLAWED_ENCLAVED_PATH` | `~/enclawed-enclaved` | Closed-tree root (manifests, accreditor, secmon) |
| `ENCLAWED_INVIVO_AUDIT_PATH` | `~/.enclawed-invivo/audit.jsonl` | Persistent audit log path |
| `ENCLAWED_INVIVO_WITNESS_PATH` | `~/.enclawed-invivo/witness.jsonl` | Persistent accreditor journal path |
| `ENCLAWED_INVIVO_SAMPLES_PER_CATEGORY` | `100` | Legit + adversarial samples PER F-category |
| `ENCLAWED_INVIVO_LLM_CONCURRENCY` | `8` | Parallel LLM completions during sample generation |
| `ENCLAWED_INVIVO_DISABLE_ACCREDITOR` | unset | Set to `1` to force enclaved-subject refusal path |

## Output

- `docs/adversarial-in-vivo-llm-narrative-report.md` — confusion matrices, metrics, top block reasons
- `docs/adversarial-in-vivo-samples.csv` — per-sample row (channel, fCat, label, content, per-subject decision)
- `~/.enclawed-invivo/audit.jsonl` — every gate decision (hash-chained)
- `~/.enclawed-invivo/witness.jsonl` — accreditor's Ed25519-signed journal of every broker-head it witnessed

## Confusion matrix legend

The ground truth label for each sample is `legit` or `adversarial`. The
prediction for each subject is `block` or `deliver`. We label cells:

|  | predicted block | predicted deliver |
|---|---|---|
| **adversarial** | TP | FN |
| **legit** | FP | TN |

A subject that blocks everything has perfect recall but precision = 0.
A subject that delivers everything has perfect precision (vacuously) and
recall = 0. Only a balanced (high P, high R) result demonstrates the
gate is doing real discrimination, not blanket allow / blanket deny.
